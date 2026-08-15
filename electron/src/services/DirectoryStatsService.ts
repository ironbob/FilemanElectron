import { randomUUID } from 'crypto'
import type { DirectoryStatsProgress, DirectoryStatsRequest } from '@shared/types'
import { isZipVirtualPath, parseZipVirtualPath } from '@shared/zipPath'
import type { IFileSystemAdapter } from '../adapters/types'
import type { ZipEntry } from './ZipService'

const log = console

/** 设备访问窄接口：与 DeviceManager 解耦，含按需自动重连。 */
interface DeviceAdapterProvider {
  getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter>
}

interface ZipEntryProvider {
  getEntries(zipFilePath: string): Promise<ZipEntry[]>
}

interface StatsTask {
  taskId: string
  sessionId: string
  cancelled: boolean
}

const PROGRESS_EMIT_INTERVAL_MS = 100
/** 连续 stat/list 失败达到该次数即判定设备掉线，中止为 failed（而非静默给出错误总数）。 */
const MAX_CONSECUTIVE_ERRORS = 20

/**
 * 属性弹窗的递归目录统计。BFS 顺序遍历（同一时刻只有一个 adapter 请求在途，
 * 对 SMB/SSH/移动设备友好），进度推送按 ≥100ms 节流；ZIP 虚拟路径走中央目录
 * 前缀求和（纯元数据，不解压）。终态（completed/cancelled/failed）随同一推送
 * 通道返回，免去第二次 IPC 往返。
 */
export class DirectoryStatsService {
  private readonly tasks = new Map<string, StatsTask>()
  private readonly sessionTasks = new Map<string, string>()

  constructor(
    private readonly devices: DeviceAdapterProvider,
    private readonly zip: ZipEntryProvider
  ) {}

  start(request: DirectoryStatsRequest, emit: (event: DirectoryStatsProgress) => void): { taskId: string } {
    // 同一 sessionId 的旧任务（弹窗快速重开）先取消
    const runningId = this.sessionTasks.get(request.sessionId)
    if (runningId) this.cancel(runningId)

    const task: StatsTask = { taskId: randomUUID(), sessionId: request.sessionId, cancelled: false }
    this.tasks.set(task.taskId, task)
    this.sessionTasks.set(request.sessionId, task.taskId)
    log.info('[DirectoryStats] task started', { taskId: task.taskId, sessionId: task.sessionId, pathCount: request.paths.length })
    void this.run(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    task.cancelled = true
    log.info('[DirectoryStats] task cancellation requested', { taskId })
    return true
  }

  private async run(task: StatsTask, request: DirectoryStatsRequest, emit: (event: DirectoryStatsProgress) => void) {
    const totals = { fileCount: 0, directoryCount: 0, totalBytes: 0 }
    let lastEmitAt = 0
    let currentPath: string | undefined

    const maybeEmit = (force = false) => {
      const now = Date.now()
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return
      lastEmitAt = now
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: 'scanning', ...totals, currentPath })
    }

    try {
      // ZIP 虚拟路径与普通路径分流：ZIP 走中央目录求和（瞬时），普通路径入 BFS 队列
      const queue: string[] = []
      for (const p of request.paths) {
        if (task.cancelled) break
        if (isZipVirtualPath(p)) {
          const { zipFilePath, innerPath } = parseZipVirtualPath(p)
          currentPath = p
          const entries = await this.zip.getEntries(zipFilePath)
          if (task.cancelled) break
          // ZipEntry.path 无首尾斜杠；innerPath='' 表示 ZIP 根
          const prefix = innerPath ? innerPath + '/' : ''
          for (const entry of entries) {
            if (prefix && !entry.path.startsWith(prefix)) continue
            if (entry.isDirectory) totals.directoryCount++
            else { totals.fileCount++; totals.totalBytes += entry.size }
          }
          maybeEmit(true)
        } else {
          queue.push(p)
        }
      }

      if (!task.cancelled && queue.length > 0) {
        const adapter = await this.devices.getReadyAdapter(request.deviceId)

        let consecutiveErrors = 0
        while (queue.length > 0) {
          if (task.cancelled) break
          const p = queue.shift()!
          currentPath = p
          try {
            const st = await adapter.stat(p)
            if (st.isFile) {
              totals.fileCount++
              totals.totalBytes += st.size
            } else {
              totals.directoryCount++
              const children = await adapter.list(p)
              for (const child of children) queue.push(joinPosix(p, child.name))
            }
            consecutiveErrors = 0
            maybeEmit()
          } catch (error) {
            // 单个条目不可读（权限等）：跳过不中止
            consecutiveErrors++
            log.warn('[DirectoryStats] entry skipped', { path: p, message: error instanceof Error ? error.message : String(error) })
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              throw new Error(`连续 ${consecutiveErrors} 个条目访问失败，设备可能已断开`)
            }
          }
        }
      }

      lastEmitAt = 0 // 确保终态一定发出（覆盖节流窗口）
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? 'cancelled' : 'completed', ...totals })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn('[DirectoryStats] task failed', { taskId: task.taskId, message })
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? 'cancelled' : 'failed', ...totals, message })
    } finally {
      this.tasks.delete(task.taskId)
      if (this.sessionTasks.get(task.sessionId) === task.taskId) this.sessionTasks.delete(task.sessionId)
      log.info('[DirectoryStats] task finished', { taskId: task.taskId, cancelled: task.cancelled, ...totals })
    }
  }
}

/** 与各 Adapter 内的局部实现一致（模块内自带，避免仅为 3 行函数重构公共模块）。 */
function joinPosix(dir: string, name: string): string {
  if (dir === '' || dir === '/') return '/' + name
  return dir.endsWith('/') ? dir + name : dir + '/' + name
}
