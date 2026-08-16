import type { DuplicateGroup, DuplicateScanProgress, DuplicateScanRequest } from '@shared/types'
import type { IFileSystemAdapter } from '../adapters/types'
import { DirectoryWalker } from './support/DirectoryWalker'
import { hashAdapterFile, hashAdapterFileRange } from './support/fileHashing'
import { SessionTaskRegistry, type TaskHandle } from './support/SessionTaskRegistry'

const log = console

const PROGRESS_EMIT_INTERVAL_MS = 100
/** 首块预哈希字节数（同尺寸 + 同首块 4KB 极大概率同内容）。 */
const PARTIAL_HASH_BYTES = 4096
/** 终态事件携带分组上限（防超大 IPC 载荷）。 */
const MAX_GROUPS_IN_EVENT = 5000

interface Candidate {
  path: string
  size: number
  modifiedTime: string
}

interface DupeTaskState {
  cancelled: boolean
  sessionId: string
}

/**
 * DuplicateFinderService —— 重复文件查找（三阶段漏斗）。
 *
 * 阶段（越往后越贵，候选数经每阶段大幅收敛）：
 *  1. scanning      — DirectoryWalker 收集全部文件元数据，按 size 分组；
 *  2. partial-hashing — size>1 组内做 4KB 首块哈希，再分组（绝大多数不同
 *     内容在此被分离，且不读全文件）；
 *  3. full-hashing  — 幸存组做全量流式哈希，相同即确认重复。
 *
 * 设计依据：
 *  - 复用 M1 基建（Walker/Range 哈希/SessionTaskRegistry），本服务只表达
 *    「漏斗」这一领域编排（SRP）。
 *  - 进度节流 100ms；groups 只随 completed 终态下发（避免中途大数组刷屏）。
 */
export class DuplicateFinderService {
  private readonly registry = new SessionTaskRegistry()

  constructor(private readonly devices: { getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter> }) {}

  start(request: DuplicateScanRequest, emit: (event: DuplicateScanProgress) => void): { taskId: string } {
    const task = this.registry.create<DupeTaskState>(request.sessionId, { cancelled: false, sessionId: request.sessionId })
    log.info('[Dupes] task started', { taskId: task.taskId, sessionId: request.sessionId, rootPath: request.rootPath })
    void this.run(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    return this.registry.cancel(taskId)
  }

  private async run(task: TaskHandle<DupeTaskState>, request: DuplicateScanRequest, emit: (event: DuplicateScanProgress) => void) {
    const minSize = request.minSize ?? 1
    let lastEmitAt = 0
    let currentPath: string | undefined
    let fileCount = 0
    let candidateCount = 0
    let groupCount = 0
    let groups: DuplicateGroup[] = []
    let truncated = false

    const maybeEmit = (status: DuplicateScanProgress['status'], force = false) => {
      const now = Date.now()
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return
      lastEmitAt = now
      emit({ sessionId: task.sessionId, taskId: task.taskId, status, fileCount, candidateCount, groupCount, currentPath })
    }

    try {
      const adapter = await this.devices.getReadyAdapter(request.deviceId)
      const walker = new DirectoryWalker(this.devices)

      // ── 阶段 1：收集 + 尺寸分组 ──
      const bySize = new Map<number, Candidate[]>()
      await walker.walk(request.deviceId, request.rootPath, () => task.cancelled, {
        fileFilter: file => file.size >= minSize,
        onFile: file => {
          fileCount++
          currentPath = file.path
          const bucket = bySize.get(file.size)
          if (bucket) bucket.push({ path: file.path, size: file.size, modifiedTime: file.modifiedTime })
          else bySize.set(file.size, [{ path: file.path, size: file.size, modifiedTime: file.modifiedTime }])
          maybeEmit('scanning')
        }
      })
      if (task.cancelled) throw new CancelledError()

      const sizeGroups = Array.from(bySize.values()).filter(bucket => bucket.length > 1)
      candidateCount = sizeGroups.reduce((sum, bucket) => sum + bucket.length, 0)
      log.info('[Dupes] phase1 done', { fileCount, candidateCount, sizeGroups: sizeGroups.length })

      // ── 阶段 2：4KB 首块哈希再分组 ──
      const byPartial = new Map<string, Candidate[]>()
      for (const bucket of sizeGroups) {
        for (const candidate of bucket) {
          if (task.cancelled) throw new CancelledError()
          currentPath = candidate.path
          try {
            const partial = await hashAdapterFileRange(adapter, candidate.path, candidate.size, PARTIAL_HASH_BYTES, {
              isCancelled: () => task.cancelled
            })
            const key = `${candidate.size}:${partial}`
            const partialBucket = byPartial.get(key)
            if (partialBucket) partialBucket.push(candidate)
            else byPartial.set(key, [candidate])
          } catch (error) {
            // 单文件读失败（权限等）：跳过该候选
            log.warn('[Dupes] partial hash failed, skipping', { path: candidate.path, message: error instanceof Error ? error.message : String(error) })
          }
          maybeEmit('partial-hashing')
        }
      }

      const partialGroups = Array.from(byPartial.values()).filter(bucket => bucket.length > 1)
      candidateCount = partialGroups.reduce((sum, bucket) => sum + bucket.length, 0)
      log.info('[Dupes] phase2 done', { candidateCount, partialGroups: partialGroups.length })

      // ── 阶段 3：全量哈希确认 ──
      const byFull = new Map<string, Candidate[]>()
      for (const bucket of partialGroups) {
        for (const candidate of bucket) {
          if (task.cancelled) throw new CancelledError()
          currentPath = candidate.path
          try {
            const hex = await hashAdapterFile(adapter, candidate.path, candidate.size, {
              isCancelled: () => task.cancelled
            })
            const fullBucket = byFull.get(hex)
            if (fullBucket) fullBucket.push(candidate)
            else byFull.set(hex, [candidate])
          } catch (error) {
            log.warn('[Dupes] full hash failed, skipping', { path: candidate.path, message: error instanceof Error ? error.message : String(error) })
          }
          maybeEmit('full-hashing')
        }
      }

      groups = Array.from(byFull.entries())
        .filter(([, files]) => files.length > 1)
        .map(([hash, files]) => ({
          hash,
          size: files[0].size,
          files: files.map(f => ({ path: f.path, size: f.size, modifiedTime: f.modifiedTime }))
        }))
        .sort((a, b) => b.files.length * b.size - a.files.length * a.size) // 浪费空间降序
      groupCount = groups.length
      truncated = groups.length > MAX_GROUPS_IN_EVENT
      if (truncated) groups = groups.slice(0, MAX_GROUPS_IN_EVENT)

      lastEmitAt = 0 // 终态必达
      emit({
        sessionId: task.sessionId, taskId: task.taskId, status: 'completed',
        fileCount, candidateCount, groupCount, currentPath, groups, truncated
      })
    } catch (error) {
      const cancelled = task.cancelled || error instanceof CancelledError
      const message = error instanceof Error ? error.message : String(error)
      log.warn('[Dupes] task ended', { taskId: task.taskId, cancelled, message })
      lastEmitAt = 0
      emit({
        sessionId: task.sessionId, taskId: task.taskId,
        status: cancelled ? 'cancelled' : 'failed',
        fileCount, candidateCount, groupCount, currentPath, message: cancelled ? undefined : message
      })
    } finally {
      this.registry.finish(task)
      log.info('[Dupes] task finished', { taskId: task.taskId, cancelled: task.cancelled, fileCount, groupCount })
    }
  }
}

class CancelledError extends Error {
  constructor() {
    super('cancelled by request')
  }
}
