import { BrowserWindow } from 'electron'
import type { IFileSystemAdapter } from '../adapters/types'
import { StreamTransfer, CancelledError } from './StreamTransfer'

/**
 * L05 · FileOperationManager (application service / orchestrator)
 *
 * 传输队列与任务生命周期编排。本次改造点:
 *  - 流式传输(StreamTransfer)替代整文件读缓冲 —— 大文件不 OOM。
 *  - 目录递归拷贝/移动(此前只处理单文件,拷文件夹会失败)。
 *  - 中途取消(粒度到单文件内,基于 shouldCancel 轮询)。
 *  - 失败/取消不残留目标端半成品(StreamTransfer 负责);移动仅在成功后删源(R5)。
 *
 * 设计依据:
 *  - SRP —— 只编排队列/任务/策略选择;字节管道交给 StreamTransfer。
 *  - DIP —— 依赖 IFileSystemAdapter 端口,不依赖具体适配器。
 *  - OCP —— 按 capability(canStream)选流式/缓冲策略,不改适配器。
 */

export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch'
export type FileOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface FileOperationItemResult {
  sourcePath: string
  targetPath?: string
  status: 'success' | 'skipped' | 'failed'
  error?: string
  bytesProcessed?: number
}

export interface FileOperationProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  speed: number
  itemResults: FileOperationItemResult[]
}

export interface FileOperationTask {
  id: string
  type: FileOperationType
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
  status: FileOperationStatus
  progress: FileOperationProgress
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface CreateTaskParams {
  type: FileOperationType
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * D01 · TransferTask (aggregate root)
 *
 * 传输任务的一致性边界与状态机。富化自原本的贫血数据类 ——
 * 状态转移/进度记账由任务自身负责(Tell-Don't-Ask),FileOperationManager 只编排。
 *
 * 经 IPC 发送时只携带数据字段(方法在原型上,结构化克隆不传),渲染层得到纯数据。
 */
class TransferTask implements FileOperationTask {
  id: string
  type: FileOperationType
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
  status: FileOperationStatus
  progress: FileOperationProgress
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string

  constructor(params: CreateTaskParams) {
    this.id = generateTaskId()
    this.type = params.type
    this.sourceDeviceId = params.sourceDeviceId
    this.sourcePaths = params.sourcePaths
    this.targetDeviceId = params.targetDeviceId
    this.targetPath = params.targetPath
    this.newName = params.newName
    this.status = 'pending'
    this.progress = {
      currentFile: '',
      currentFileIndex: 0,
      totalFiles: params.sourcePaths.length,
      bytesTransferred: 0,
      totalBytes: 0,
      speed: 0,
      itemResults: []
    }
    this.createdAt = Date.now()
  }

  markRunning(): void {
    this.status = 'running'
    this.startedAt = Date.now()
  }

  setTotals(bytes: number, files: number): void {
    this.progress.totalBytes = bytes
    this.progress.totalFiles = files
  }

  addBytes(n: number): void {
    this.progress.bytesTransferred += n
  }

  setCurrentFile(name: string, index: number): void {
    this.progress.currentFile = name
    this.progress.currentFileIndex = index
  }

  recordItem(item: FileOperationItemResult): void {
    this.progress.itemResults.push(item)
  }

  complete(): void {
    this.status = 'completed'
    this.completedAt = Date.now()
  }

  fail(error: string): void {
    this.status = 'failed'
    this.error = error
    this.completedAt = Date.now()
  }

  markCancelled(): void {
    this.status = 'cancelled'
    this.completedAt = Date.now()
  }
}

export class FileOperationManager {
  private queue: TransferTask[] = []
  private history: TransferTask[] = []
  private currentTask: TransferTask | null = null
  private isRunning = false
  private cancelled = false
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private mainWindow: BrowserWindow | null = null
  private maxHistorySize = 100
  private lastProgressNotifyAt = 0
  private completionWaiters = new Map<string, (task: FileOperationTask) => void>()

  registerAdapter(deviceId: string, adapter: IFileSystemAdapter): void {
    this.adapters.set(deviceId, adapter)
  }

  unregisterAdapter(deviceId: string): void {
    this.adapters.delete(deviceId)
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private notifyTaskUpdate(task: TransferTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('file-operation:updated', task)
    }
  }

  private notifyTaskAdded(task: TransferTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('file-operation:added', task)
    }
  }

  /** 节流(≥100ms)推送进度,避免大文件逐块刷屏 IPC。 */
  private notifyProgress(task: TransferTask, force = false): void {
    const now = Date.now()
    if (force || now - this.lastProgressNotifyAt >= 100) {
      this.lastProgressNotifyAt = now
      this.notifyTaskUpdate(task)
    }
  }

  async addTask(params: CreateTaskParams): Promise<FileOperationTask> {
    const task = new TransferTask(params)
    this.queue.push(task)
    this.notifyTaskAdded(task)
    this.processQueue()
    return task
  }

  private async processQueue(): Promise<void> {
    if (this.isRunning || this.queue.length === 0) return

    this.isRunning = true
    this.currentTask = this.queue.shift()!

    try {
      await this.executeTask(this.currentTask)
    } catch (error) {
      console.error('[FileOperationManager] task execution error:', error)
    } finally {
      this.isRunning = false
      const completedTask = this.currentTask
      this.currentTask = null
      if (completedTask) {
        this.addToHistory(completedTask)
        this.resolveCompletion(completedTask)
      }
      this.processQueue()
    }
  }

  private async executeTask(task: TransferTask): Promise<void> {
    task.markRunning()
    this.notifyTaskUpdate(task)
    this.cancelled = false

    try {
      switch (task.type) {
        case 'copy':
          await this.executeCopy(task)
          break
        case 'move':
          await this.executeMove(task)
          break
        case 'delete':
          await this.executeDelete(task)
          break
        case 'rename':
          await this.executeRename(task)
          break
        case 'mkdir':
          await this.executeMkdir(task)
          break
        case 'touch':
          await this.executeTouch(task)
          break
      }

      if (this.cancelled) {
        task.markCancelled()
      } else {
        task.complete()
      }
    } catch (error) {
      task.fail(error instanceof Error ? error.message : String(error))
    }

    this.notifyTaskUpdate(task)
  }

  // ============ 跨设备/同设备 拷贝 ============

  private async executeCopy(task: TransferTask): Promise<void> {
    const { source, target, targetPath } = this.resolveEndpoints(task)

    // 先走一遍统计总量(含目录递归),用于进度分母。
    const { bytes, files } = await this.computeTotals(source, task.sourcePaths)
    task.setTotals(bytes, files)

    let fileCounter = 0
    for (const sourcePath of task.sourcePaths) {
      if (this.cancelled) return
      try {
        await this.copyPath(task, source, sourcePath, target, targetPath, () => fileCounter++, false)
      } catch (error) {
        if (error instanceof CancelledError) return
        throw error
      }
    }
  }

  private async executeMove(task: TransferTask): Promise<void> {
    const sourceDeviceId = task.sourceDeviceId
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId
    const source = this.adapters.get(sourceDeviceId)
    const target = this.adapters.get(targetDeviceId)
    if (!source || !target) {
      throw new Error(`Adapter not found: ${!source ? sourceDeviceId : targetDeviceId}`)
    }
    const targetPath = task.targetPath || '/'

    // 同设备移动:直接 rename(文件/目录通用,最快)。
    if (sourceDeviceId === targetDeviceId) {
      for (const sourcePath of task.sourcePaths) {
        if (this.cancelled) return
        const name = posixBaseName(sourcePath)
        const dst = joinPosix(targetPath, name)
        task.setCurrentFile(name, 0)
        this.notifyTaskUpdate(task)
        const item: FileOperationItemResult = { sourcePath, targetPath: dst, status: 'success' }
        try {
          await source.rename(sourcePath, dst)
        } catch (error) {
          item.status = 'failed'
          item.error = error instanceof Error ? error.message : String(error)
        }
        task.recordItem(item)
      }
      return
    }

    // 跨设备移动:拷贝 + 成功后删源(R5:失败绝不删源)。
    const { bytes, files } = await this.computeTotals(source, task.sourcePaths)
    task.setTotals(bytes, files)

    let fileCounter = 0
    for (const sourcePath of task.sourcePaths) {
      if (this.cancelled) return
      try {
        await this.copyPath(task, source, sourcePath, target, targetPath, () => fileCounter++, true)
      } catch (error) {
        if (error instanceof CancelledError) return
        throw error
      }
    }
  }

  /** 拷贝一个顶层路径(文件或目录树)。move=true 时,成功的项删源。 */
  private async copyPath(
    task: TransferTask,
    source: IFileSystemAdapter,
    sourcePath: string,
    target: IFileSystemAdapter,
    targetDir: string,
    nextIndex: () => number,
    move: boolean
  ): Promise<boolean> {
    let isDir = false
    try {
      isDir = (await source.stat(sourcePath)).isDirectory
    } catch {
      // 取不到属性 → 按失败记录,跳过。
      task.recordItem({ sourcePath, status: 'failed', error: '无法读取源路径属性' })
      return false
    }

    const name = posixBaseName(sourcePath)
    const dst = joinPosix(targetDir, name)

    if (isDir) {
      return this.copyTree(task, source, sourcePath, target, dst, nextIndex, move)
    } else {
      return this.copyFile(task, source, sourcePath, target, dst, nextIndex, move)
    }
  }

  /** 递归拷贝目录树。move 且全成功时删源目录。 */
  private async copyTree(
    task: TransferTask,
    source: IFileSystemAdapter,
    srcDir: string,
    target: IFileSystemAdapter,
    dstDir: string,
    nextIndex: () => number,
    move: boolean
  ): Promise<boolean> {
    // 确保目标目录存在。只有“已存在且本身为目录”才可继续；不能把权限或
    // 同名文件错误吞掉后继续移动源目录。
    try {
      if (await target.exists(dstDir)) {
        const targetStat = await target.stat(dstDir)
        if (!targetStat.isDirectory) throw new Error(`目标路径不是目录: ${dstDir}`)
      } else {
        await target.mkdir(dstDir)
      }
    } catch (error) {
      task.recordItem({ sourcePath: srcDir, targetPath: dstDir, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      return false
    }

    let entries: Awaited<ReturnType<IFileSystemAdapter['list']>> = []
    try {
      entries = await source.list(srcDir)
    } catch (error) {
      task.recordItem({ sourcePath: srcDir, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      return false
    }

    let copiedCompletely = true
    for (const entry of entries) {
      if (this.cancelled) return false
      const childSrc = joinPosix(srcDir, entry.name)
      const childDst = joinPosix(dstDir, entry.name)
      try {
        let copied: boolean
        if (entry.isDirectory) {
          copied = await this.copyTree(task, source, childSrc, target, childDst, nextIndex, move)
        } else {
          copied = await this.copyFile(task, source, childSrc, target, childDst, nextIndex, move)
        }
        copiedCompletely = copiedCompletely && copied
      } catch (error) {
        if (error instanceof CancelledError) return false
        copiedCompletely = false
      }
    }

    // R5:移动目录时，仅当整个子树均完成且未取消才删源目录。
    if (move && copiedCompletely && !this.cancelled) {
      try {
        await source.delete(srcDir)
      } catch (error) {
        console.warn(`[FileOperationManager] failed to remove moved source dir ${srcDir}:`, error)
        return false
      }
    }
    return copiedCompletely
  }

  /** 拷贝单个文件(流式优先,缓冲回退)。move=true 时成功/跳过后删源。 */
  private async copyFile(
    task: TransferTask,
    source: IFileSystemAdapter,
    srcPath: string,
    target: IFileSystemAdapter,
    dstPath: string,
    nextIndex: () => number,
    move: boolean
  ): Promise<boolean> {
    const name = posixBaseName(srcPath)
    const index = nextIndex()
    task.setCurrentFile(name, index)
    this.notifyProgress(task, true)

    const item: FileOperationItemResult = { sourcePath: srcPath, targetPath: dstPath, status: 'success' }

    try {
      // 目标已存在:跳过(覆盖询问留作后续增强,见需求 §12.1 假设3)。
      if (await target.exists(dstPath)) {
        item.status = 'skipped'
        task.recordItem(item)
        // 冲突策略为 skip 时必须保留源文件；不能把“目标已存在”当成已验证的
        // 同一内容，否则移动会造成数据丢失。
        return false
      }

      const startBytes = task.progress.bytesTransferred
      const startTime = Date.now()

      const bytes = await StreamTransfer.transferFile(source, srcPath, target, dstPath, {
        onProgress: (b) => {
          task.progress.bytesTransferred = startBytes + b
          this.updateSpeed(task, startBytes, startTime)
          this.notifyProgress(task)
        },
        shouldCancel: () => this.cancelled
      })

      item.bytesProcessed = bytes
      task.recordItem(item)

      // R5:移动仅在成功后删源。
      if (move) {
        await source.delete(srcPath)
      }
      return true
    } catch (error) {
      if (error instanceof CancelledError) {
        // 中断当前文件;由上层根据 this.cancelled 标记任务为 cancelled。
        throw error
      }
      item.status = 'failed'
      item.error = error instanceof Error ? error.message : String(error)
      task.recordItem(item)
      // 继续其它文件(与既有行为一致)。
      return false
    }
  }

  private updateSpeed(task: TransferTask, startBytes: number, startTime: number): void {
    const elapsed = Date.now() - startTime
    const delta = task.progress.bytesTransferred - startBytes
    task.progress.speed = elapsed > 0 ? (delta / elapsed) * 1000 : 0
  }

  /** 统计总量(含目录递归)。 */
  private async computeTotals(
    source: IFileSystemAdapter,
    paths: string[]
  ): Promise<{ bytes: number; files: number }> {
    let bytes = 0
    let files = 0
    const walk = async (p: string): Promise<void> => {
      try {
        const st = await source.stat(p)
        if (st.isFile) {
          bytes += st.size
          files++
          return
        }
        const entries = await source.list(p)
        for (const e of entries) {
          await walk(joinPosix(p, e.name))
        }
      } catch {
        /* 不可访问的路径跳过 */
      }
    }
    for (const p of paths) {
      await walk(p)
    }
    return { bytes, files }
  }

  private resolveEndpoints(task: TransferTask): {
    source: IFileSystemAdapter
    target: IFileSystemAdapter
    targetPath: string
  } {
    const source = this.adapters.get(task.sourceDeviceId)
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId
    const target = this.adapters.get(targetDeviceId)
    if (!source) throw new Error(`Source adapter not found: ${task.sourceDeviceId}`)
    if (!target) throw new Error(`Target adapter not found: ${targetDeviceId}`)
    return { source, target, targetPath: task.targetPath || '/' }
  }

  // ============ 单设备操作 ============

  private async executeDelete(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)

    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return
      const sourcePath = task.sourcePaths[i]
      task.setCurrentFile(posixBaseName(sourcePath), i)
      this.notifyTaskUpdate(task)

      const item: FileOperationItemResult = { sourcePath, status: 'success' }
      try {
        await adapter.delete(sourcePath)
      } catch (error) {
        item.status = 'failed'
        item.error = error instanceof Error ? error.message : String(error)
      }
      task.recordItem(item)
    }
  }

  private async executeRename(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    if (task.sourcePaths.length === 0 || !task.newName) throw new Error('Invalid rename parameters')

    const sourcePath = task.sourcePaths[0]
    const dir = posixDirname(sourcePath)
    const targetPath = joinPosix(dir, task.newName)
    task.setCurrentFile(task.newName, 0)
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const item: FileOperationItemResult = { sourcePath, targetPath, status: 'success' }
    try {
      await adapter.rename(sourcePath, targetPath)
    } catch (error) {
      item.status = 'failed'
      item.error = error instanceof Error ? error.message : String(error)
      task.recordItem(item)
      throw error
    }
    task.recordItem(item)
  }

  private async executeMkdir(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    const targetPath = task.targetPath || '/'
    task.setCurrentFile(posixBaseName(targetPath), 0)
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const item: FileOperationItemResult = { sourcePath: '', targetPath, status: 'success' }
    try {
      await adapter.mkdir(targetPath)
    } catch (error) {
      item.status = 'failed'
      item.error = error instanceof Error ? error.message : String(error)
      task.recordItem(item)
      throw error
    }
    task.recordItem(item)
  }

  private async executeTouch(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    const targetPath = task.targetPath || '/'
    task.setCurrentFile(posixBaseName(targetPath), 0)
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const item: FileOperationItemResult = { sourcePath: '', targetPath, status: 'success' }
    try {
      await adapter.writeFile(targetPath, Buffer.from(''))
    } catch (error) {
      item.status = 'failed'
      item.error = error instanceof Error ? error.message : String(error)
      task.recordItem(item)
      throw error
    }
    task.recordItem(item)
  }

  // ============ 队列管理 ============

  cancelTask(taskId: string): void {
    if (this.currentTask?.id === taskId) {
      this.cancelled = true
    } else {
      const queuedTask = this.queue.find(t => t.id === taskId)
      this.queue = this.queue.filter(t => t.id !== taskId)
      if (queuedTask) {
        queuedTask.markCancelled()
        this.addToHistory(queuedTask)
        this.notifyTaskUpdate(queuedTask)
        this.resolveCompletion(queuedTask)
        return
      }
      const historyIndex = this.history.findIndex(t => t.id === taskId)
      if (historyIndex > -1) {
        this.history[historyIndex].status = 'cancelled'
      }
    }
  }

  async retryTask(taskId: string): Promise<FileOperationTask | null> {
    const historyTask = this.history.find(t => t.id === taskId)
    if (!historyTask) return null
    const newTask = await this.addTask({
      type: historyTask.type,
      sourceDeviceId: historyTask.sourceDeviceId,
      sourcePaths: historyTask.sourcePaths,
      targetDeviceId: historyTask.targetDeviceId,
      targetPath: historyTask.targetPath,
      newName: historyTask.newName
    })
    this.history = this.history.filter(t => t.id !== taskId)
    return newTask
  }

  getQueue(): FileOperationTask[] {
    return [...this.queue]
  }

  getHistory(): FileOperationTask[] {
    return [...this.history]
  }

  getCurrentTask(): FileOperationTask | null {
    return this.currentTask
  }

  getAllTasks(): FileOperationTask[] {
    const current = this.currentTask ? [this.currentTask] : []
    return [...current, ...this.queue]
  }

  clearHistory(): void {
    this.history = []
  }

  /** 兼容旧 IPC：仍通过同一队列执行并等待完成，避免绕过取消、验证与清理。 */
  async addTaskAndWait(params: CreateTaskParams): Promise<FileOperationTask> {
    const task = await this.addTask(params)
    return this.waitForCompletion(task.id)
  }

  private waitForCompletion(taskId: string): Promise<FileOperationTask> {
    const completed = this.history.find(task => task.id === taskId)
    if (completed) return Promise.resolve(completed)
    return new Promise(resolve => this.completionWaiters.set(taskId, resolve))
  }

  private resolveCompletion(task: FileOperationTask): void {
    const resolve = this.completionWaiters.get(task.id)
    if (resolve) {
      this.completionWaiters.delete(task.id)
      resolve(task)
    }
  }

  private addToHistory(task: TransferTask): void {
    this.history.unshift(task)
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize)
    }
  }
}

// ============ POSIX 路径工具(目标侧统一用 /,macOS/Android/SSH/iOS/SMB 均兼容) ============

function joinPosix(dir: string, name: string): string {
  if (dir.endsWith('/')) return dir + name
  return dir === '' ? `/${name}` : `${dir}/${name}`
}

function posixBaseName(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

function posixDirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx === -1) return ''
  if (idx === 0) return '/'
  return trimmed.slice(0, idx)
}
