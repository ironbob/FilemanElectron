import type { SpaceAnalysisProgress, SpaceAnalysisRequest, SpaceEntry } from '@shared/types'
import { DirectoryWalker } from './support/DirectoryWalker'
import { SessionTaskRegistry, type TaskHandle } from './support/SessionTaskRegistry'

const log = console

const PROGRESS_EMIT_INTERVAL_MS = 100

interface SpaceTaskState {
  cancelled: boolean
}

/**
 * SpaceAnalyzerService —— 目录空间分析（treemap 数据源）。
 *
 * 策略：对 root 的每个顶层条目分别走一次 DirectoryWalker 聚合
 * （文件=直接条目；目录=递归子树总量），entries 只随 completed 终态
 * 下发。不扩展 DirectoryStatsService 的推送契约（FileInfoDialog 依赖
 * 现有 100ms 节流形态，per-entry 数组塞进节流事件会膨胀载荷）。
 *
 * 设计依据：SRP（只聚合不下结论）、复用 M1 Walker（含 symlink 防环）。
 */
export class SpaceAnalyzerService {
  private readonly registry = new SessionTaskRegistry()

  constructor(private readonly devices: ConstructorParameters<typeof DirectoryWalker>[0]) {}

  start(request: SpaceAnalysisRequest, emit: (event: SpaceAnalysisProgress) => void): { taskId: string } {
    const task = this.registry.create<SpaceTaskState>(request.sessionId, { cancelled: false })
    log.info('[Space] task started', { taskId: task.taskId, rootPath: request.rootPath })
    void this.run(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    return this.registry.cancel(taskId)
  }

  private async run(task: TaskHandle<SpaceTaskState>, request: SpaceAnalysisRequest, emit: (event: SpaceAnalysisProgress) => void) {
    const walker = new DirectoryWalker(this.devices)
    const totals = { fileCount: 0, directoryCount: 0, totalBytes: 0 }
    const entries: SpaceEntry[] = []
    let lastEmitAt = 0
    let currentPath: string | undefined

    const maybeEmit = (force = false) => {
      const now = Date.now()
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return
      lastEmitAt = now
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: 'scanning', ...totals, currentPath })
    }

    try {
      // 顶层条目列表（复用 walker 的 getReadyAdapter）
      const adapter = await this.devices.getReadyAdapter(request.deviceId)
      const children = await adapter.list(request.rootPath)
      if (task.cancelled) throw new CancelledError()

      for (const child of children) {
        if (task.cancelled) throw new CancelledError()
        currentPath = child.path
        if (child.isDirectory) {
          const result = await walker.walk(request.deviceId, child.path, () => task.cancelled, {
            onDirectory: () => { currentPath = child.path }
          })
          totals.fileCount += result.fileCount
          totals.directoryCount += result.directoryCount + 1 // 计入顶层目录自身
          totals.totalBytes += result.totalBytes
          entries.push({
            name: child.name,
            path: child.path,
            size: result.totalBytes,
            fileCount: result.fileCount,
            directoryCount: result.directoryCount
          })
        } else {
          totals.fileCount++
          totals.totalBytes += child.size
          entries.push({ name: child.name, path: child.path, size: child.size, fileCount: 1, directoryCount: 0 })
        }
        maybeEmit()
      }

      lastEmitAt = 0 // 终态必达
      emit({
        sessionId: task.sessionId, taskId: task.taskId,
        status: task.cancelled ? 'cancelled' : 'completed',
        ...totals, currentPath,
        entries: [...entries].sort((a, b) => b.size - a.size)
      })
    } catch (error) {
      const cancelled = task.cancelled || error instanceof CancelledError
      const message = error instanceof Error ? error.message : String(error)
      log.warn('[Space] task ended', { taskId: task.taskId, cancelled, message })
      lastEmitAt = 0
      emit({
        sessionId: task.sessionId, taskId: task.taskId,
        status: cancelled ? 'cancelled' : 'failed',
        ...totals, currentPath, message: cancelled ? undefined : message
      })
    } finally {
      this.registry.finish(task)
      log.info('[Space] task finished', { taskId: task.taskId, cancelled: task.cancelled, ...totals })
    }
  }
}

class CancelledError extends Error {
  constructor() {
    super('cancelled by request')
  }
}
