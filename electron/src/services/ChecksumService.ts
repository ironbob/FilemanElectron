import type { ChecksumProgress, ChecksumRequest } from '@shared/types'
import type { IFileSystemAdapter } from '../adapters/types'
import { SessionTaskRegistry, type TaskHandle } from './support/SessionTaskRegistry'
import { hashAdapterFile } from './support/fileHashing'

const log = console

/** 进度推送节流间隔（与 DirectoryStatsService 一致）。 */
const PROGRESS_EMIT_INTERVAL_MS = 100

interface ChecksumTaskState {
  streams: Set<{ destroy: (error?: Error) => void }>
}

/**
 * ChecksumService —— 文件哈希校验（md5/sha1/sha256，支持跨设备两项对比）。
 *
 * 设计依据：
 *  - 复用 M1 共享基建：SessionTaskRegistry（任务登记/取消）+ hashAdapterFile
 *    （流式哈希/缓冲回退），不重写遍历或哈希逻辑（DRY）。
 *  - 逐项顺序执行（单请求在途，SMB/SSH 友好）；字节进度经 onBytes 回调
 *    累计，终态事件携带 results + match 结论（免第二次 IPC 往返）。
 */
export class ChecksumService {
  private readonly registry = new SessionTaskRegistry()

  constructor(private readonly devices: { getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter> }) {}

  start(request: ChecksumRequest, emit: (event: ChecksumProgress) => void): { taskId: string } {
    const task = this.registry.create<ChecksumTaskState>(request.sessionId, { streams: new Set() })
    log.info('[Checksum] task started', { taskId: task.taskId, sessionId: request.sessionId, items: request.items.length, algo: request.algo })
    void this.run(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    return this.registry.cancel(taskId)
  }

  private async run(task: TaskHandle<ChecksumTaskState>, request: ChecksumRequest, emit: (event: ChecksumProgress) => void) {
    const totalBytes = request.items.reduce((sum, item) => sum + item.size, 0)
    const results: Array<{ hex: string | null; error?: string }> = []
    let bytesBase = 0 // 已完成项的字节累计基线
    let lastEmitAt = 0
    let message: string | undefined

    const maybeEmit = (force = false) => {
      const now = Date.now()
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return
      lastEmitAt = now
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: 'hashing',
        index: results.length,
        total: request.items.length,
        bytesProcessed: bytesBase,
        totalBytes
      })
    }

    try {
      // index 循环（tsconfig.node 无 downlevelIteration，entries() 直迭代会 TS2802）
      for (let index = 0; index < request.items.length; index++) {
        const item = request.items[index]
        if (task.cancelled) break
        bytesBase = request.items.slice(0, index).reduce((sum, it) => sum + it.size, 0)
        let itemBytes = 0
        try {
          const adapter = await this.devices.getReadyAdapter(item.deviceId)
          const hex = await hashAdapterFile(adapter, item.path, item.size, {
            algo: request.algo,
            isCancelled: () => task.cancelled,
            onBytes: bytes => {
              itemBytes = bytes
              emit({
                sessionId: task.sessionId,
                taskId: task.taskId,
                status: 'hashing',
                index,
                total: request.items.length,
                bytesProcessed: bytesBase + itemBytes,
                totalBytes
              })
            },
            onStream: stream => {
              task.state.streams.add(stream)
              return () => task.state.streams.delete(stream)
            }
          })
          results.push({ hex })
        } catch (error) {
          if (task.cancelled) break
          const errorMessage = error instanceof Error ? error.message : String(error)
          results.push({ hex: null, error: errorMessage })
          log.warn('[Checksum] item failed', { path: item.path, message: errorMessage })
        }
      }

      // match 结论：两项且都成功才给
      let match: boolean | undefined
      if (results.length === 2 && results[0].hex && results[1].hex) {
        match = results[0].hex === results[1].hex
      }

      lastEmitAt = 0 // 终态必达（覆盖节流窗口）
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: task.cancelled ? 'cancelled' : 'completed',
        index: results.length,
        total: request.items.length,
        bytesProcessed: task.cancelled ? bytesBase : totalBytes,
        totalBytes,
        results,
        match
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
      log.warn('[Checksum] task failed', { taskId: task.taskId, message })
      lastEmitAt = 0
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: 'failed',
        index: results.length,
        total: request.items.length,
        bytesProcessed: bytesBase,
        totalBytes,
        results,
        message
      })
    } finally {
      this.registry.finish(task)
      log.info('[Checksum] task finished', { taskId: task.taskId, cancelled: task.cancelled, completed: results.length })
    }
  }
}
