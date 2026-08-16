import { randomUUID } from 'crypto'
import type { Readable } from 'stream'
import type { IFileSystemAdapter } from '../adapters/types'
import { hashAdapterFile } from './support/fileHashing'
import { t } from '../i18n'

const log = console

export interface ContentVerificationPair {
  relativePath: string
  leftDeviceId: string
  leftPath: string
  leftSize: number
  rightDeviceId: string
  rightPath: string
  rightSize: number
}

export interface ContentVerificationRequest {
  sessionId: string
  pairs: ContentVerificationPair[]
}

export interface ContentVerificationProgress {
  sessionId: string
  taskId: string
  relativePath: string
  status: 'verifying' | 'content-equal' | 'content-different' | 'failed' | 'cancelled'
  completed: number
  total: number
  message?: string
}

interface DeviceAdapterProvider {
  getAdapter(deviceId: string): IFileSystemAdapter | undefined
}

interface VerificationTask {
  taskId: string
  sessionId: string
  cancelled: boolean
  streams: Set<Readable>
}

/**
 * Main-process content verifier. The renderer only receives result metadata;
 * file bytes remain in the adapter/main-process boundary.
 */
export class ContentVerificationService {
  private readonly tasks = new Map<string, VerificationTask>()
  private readonly sessionTasks = new Map<string, string>()

  constructor(private readonly devices: DeviceAdapterProvider) {}

  start(request: ContentVerificationRequest, emit: (event: ContentVerificationProgress) => void) {
    const runningId = this.sessionTasks.get(request.sessionId)
    if (runningId) this.cancel(runningId)

    const task: VerificationTask = {
      taskId: randomUUID(), sessionId: request.sessionId, cancelled: false, streams: new Set()
    }
    this.tasks.set(task.taskId, task)
    this.sessionTasks.set(request.sessionId, task.taskId)
    log.info('[ContentVerification] task started', { taskId: task.taskId, sessionId: task.sessionId, pairCount: request.pairs.length })
    void this.run(task, request.pairs, emit)
    return { taskId: task.taskId, total: request.pairs.length }
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    task.cancelled = true
    log.info('[ContentVerification] task cancellation requested', { taskId })
    task.streams.forEach(stream => stream.destroy(new Error('Verification cancelled')))
    return true
  }

  private async run(task: VerificationTask, pairs: ContentVerificationPair[], emit: (event: ContentVerificationProgress) => void) {
    let completed = 0
    try {
      for (const pair of pairs) {
        if (task.cancelled) {
          emit(this.event(task, pair.relativePath, 'cancelled', completed, pairs.length))
          continue
        }
        emit(this.event(task, pair.relativePath, 'verifying', completed, pairs.length))
        try {
          if (pair.leftSize !== pair.rightSize) {
            completed++
            emit(this.event(task, pair.relativePath, 'content-different', completed, pairs.length, '文件大小不同'))
            continue
          }
          const [leftHash, rightHash] = await Promise.all([
            this.hashFile(task, pair.leftDeviceId, pair.leftPath, pair.leftSize),
            this.hashFile(task, pair.rightDeviceId, pair.rightPath, pair.rightSize)
          ])
          if (task.cancelled) {
            emit(this.event(task, pair.relativePath, 'cancelled', completed, pairs.length))
            continue
          }
          completed++
          emit(this.event(task, pair.relativePath, leftHash === rightHash ? 'content-equal' : 'content-different', completed, pairs.length))
        } catch (error) {
          if (task.cancelled) {
            emit(this.event(task, pair.relativePath, 'cancelled', completed, pairs.length))
            continue
          }
          completed++
          const message = error instanceof Error ? error.message : '内容校验失败'
          log.warn('[ContentVerification] pair failed', { relativePath: pair.relativePath, message })
          emit(this.event(task, pair.relativePath, 'failed', completed, pairs.length, message))
        }
      }
    } finally {
      this.tasks.delete(task.taskId)
      if (this.sessionTasks.get(task.sessionId) === task.taskId) this.sessionTasks.delete(task.sessionId)
      log.info('[ContentVerification] task finished', { taskId: task.taskId, cancelled: task.cancelled, completed, total: pairs.length })
    }
  }

  private event(
    task: VerificationTask,
    relativePath: string,
    status: ContentVerificationProgress['status'],
    completed: number,
    total: number,
    message?: string
  ): ContentVerificationProgress {
    return { sessionId: task.sessionId, taskId: task.taskId, relativePath, status, completed, total, message }
  }

  private async hashFile(task: VerificationTask, deviceId: string, filePath: string, size: number): Promise<string> {
    const adapter = this.devices.getAdapter(deviceId)
    if (!adapter || !adapter.isConnected()) throw new Error(t('errors.main.verifyDeviceNotConnected'))
    // 哈希实现泛化至 support/fileHashing（checksum/重复查找共用），此处保留
    // 原有取消语义：isCancelled 抛错 + task.streams 登记以便 cancel 时 destroy。
    return hashAdapterFile(adapter, filePath, size, {
      algo: 'sha256',
      isCancelled: () => task.cancelled,
      onStream: stream => {
        task.streams.add(stream)
        return () => task.streams.delete(stream)
      },
    })
  }
}
