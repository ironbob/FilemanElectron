import { BrowserWindow } from 'electron'
import type { IFileSystemAdapter } from '../adapters/types'

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

export class FileOperationManager {
  private queue: FileOperationTask[] = []
  private history: FileOperationTask[] = []
  private currentTask: FileOperationTask | null = null
  private isRunning = false
  private cancelled = false
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private mainWindow: BrowserWindow | null = null
  private maxHistorySize = 100

  registerAdapter(deviceId: string, adapter: IFileSystemAdapter): void {
    this.adapters.set(deviceId, adapter)
  }

  unregisterAdapter(deviceId: string): void {
    this.adapters.delete(deviceId)
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private notifyTaskUpdate(task: FileOperationTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('file-operation:updated', task)
    }
  }

  private notifyTaskAdded(task: FileOperationTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('file-operation:added', task)
    }
  }

  async addTask(params: CreateTaskParams): Promise<FileOperationTask> {
    const task: FileOperationTask = {
      id: generateTaskId(),
      type: params.type,
      sourceDeviceId: params.sourceDeviceId,
      sourcePaths: params.sourcePaths,
      targetDeviceId: params.targetDeviceId,
      targetPath: params.targetPath,
      newName: params.newName,
      status: 'pending',
      progress: {
        currentFile: '',
        currentFileIndex: 0,
        totalFiles: params.sourcePaths.length,
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0,
        itemResults: []
      },
      createdAt: Date.now()
    }

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
      console.error('Task execution error:', error)
    } finally {
      this.isRunning = false
      const completedTask = this.currentTask
      this.currentTask = null
      if (completedTask) {
        this.addToHistory(completedTask)
      }
      this.processQueue()
    }
  }

  private async executeTask(task: FileOperationTask): Promise<void> {
    task.status = 'running'
    task.startedAt = Date.now()
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
        task.status = 'cancelled'
      } else {
        task.status = 'completed'
      }
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
    }

    task.completedAt = Date.now()
    this.notifyTaskUpdate(task)
  }

  private async executeCopy(task: FileOperationTask): Promise<void> {
    const sourceAdapter = this.adapters.get(task.sourceDeviceId)
    if (!sourceAdapter) {
      throw new Error(`Source adapter not found: ${task.sourceDeviceId}`)
    }

    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId
    const targetAdapter = this.adapters.get(targetDeviceId)
    if (!targetAdapter) {
      throw new Error(`Target adapter not found: ${targetDeviceId}`)
    }

    const targetPath = task.targetPath || '/'
    let totalBytes = 0
    let bytesTransferred = 0

    // Calculate total size
    for (const sourcePath of task.sourcePaths) {
      try {
        const stat = await sourceAdapter.stat(sourcePath)
        totalBytes += stat.size
      } catch {
        // Ignore errors for size calculation
      }
    }

    task.progress.totalBytes = totalBytes

    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return

      const sourcePath = task.sourcePaths[i]
      const fileName = sourcePath.split('/').pop() || ''
      const finalTargetPath = `${targetPath}/${fileName}`

      task.progress.currentFile = fileName
      task.progress.currentFileIndex = i
      this.notifyTaskUpdate(task)

      const itemResult: FileOperationItemResult = {
        sourcePath,
        targetPath: finalTargetPath,
        status: 'success'
      }

      try {
        const startTime = Date.now()

        // Check if target exists
        const exists = await targetAdapter.exists(finalTargetPath)
        if (exists) {
          itemResult.status = 'skipped'
          task.progress.itemResults.push(itemResult)
          continue
        }

        // Read from source and write to target
        const content = await sourceAdapter.readFile(sourcePath)
        await targetAdapter.writeFile(finalTargetPath, content)

        const elapsed = Date.now() - startTime
        bytesTransferred += content.length
        task.progress.bytesTransferred = bytesTransferred
        task.progress.speed = elapsed > 0 ? (content.length / elapsed) * 1000 : 0
        itemResult.bytesProcessed = content.length

        task.progress.itemResults.push(itemResult)
      } catch (error) {
        itemResult.status = 'failed'
        itemResult.error = error instanceof Error ? error.message : String(error)
        task.progress.itemResults.push(itemResult)
        // Continue with other files instead of failing entire task
      }
    }

    task.progress.currentFileIndex = task.sourcePaths.length
  }

  private async executeMove(task: FileOperationTask): Promise<void> {
    const sourceAdapter = this.adapters.get(task.sourceDeviceId)
    if (!sourceAdapter) {
      throw new Error(`Source adapter not found: ${task.sourceDeviceId}`)
    }

    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId
    const targetAdapter = this.adapters.get(targetDeviceId)
    if (!targetAdapter) {
      throw new Error(`Target adapter not found: ${targetDeviceId}`)
    }

    const targetPath = task.targetPath || '/'
    let totalBytes = 0
    let bytesTransferred = 0

    // Calculate total size
    for (const sourcePath of task.sourcePaths) {
      try {
        const stat = await sourceAdapter.stat(sourcePath)
        totalBytes += stat.size
      } catch {
        // Ignore
      }
    }

    task.progress.totalBytes = totalBytes

    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return

      const sourcePath = task.sourcePaths[i]
      const fileName = sourcePath.split('/').pop() || ''
      const finalTargetPath = `${targetPath}/${fileName}`

      task.progress.currentFile = fileName
      task.progress.currentFileIndex = i
      this.notifyTaskUpdate(task)

      const itemResult: FileOperationItemResult = {
        sourcePath,
        targetPath: finalTargetPath,
        status: 'success'
      }

      try {
        const startTime = Date.now()

        // Check if target exists
        const exists = await targetAdapter.exists(finalTargetPath)
        if (exists) {
          itemResult.status = 'skipped'
          task.progress.itemResults.push(itemResult)
          continue
        }

        if (task.sourceDeviceId === targetDeviceId) {
          // Same device - use rename/move
          await sourceAdapter.rename(sourcePath, finalTargetPath)
        } else {
          // Cross-device - copy then delete
          const content = await sourceAdapter.readFile(sourcePath)
          await targetAdapter.writeFile(finalTargetPath, content)
          await sourceAdapter.delete(sourcePath)
          bytesTransferred += content.length
          task.progress.bytesTransferred = bytesTransferred
        }

        const elapsed = Date.now() - startTime
        task.progress.speed = elapsed > 0 ? (bytesTransferred / elapsed) * 1000 : 0
        itemResult.bytesProcessed = bytesTransferred

        task.progress.itemResults.push(itemResult)
      } catch (error) {
        itemResult.status = 'failed'
        itemResult.error = error instanceof Error ? error.message : String(error)
        task.progress.itemResults.push(itemResult)
      }
    }

    task.progress.currentFileIndex = task.sourcePaths.length
  }

  private async executeDelete(task: FileOperationTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    }

    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return

      const sourcePath = task.sourcePaths[i]
      const fileName = sourcePath.split('/').pop() || ''

      task.progress.currentFile = fileName
      task.progress.currentFileIndex = i
      this.notifyTaskUpdate(task)

      const itemResult: FileOperationItemResult = {
        sourcePath,
        status: 'success'
      }

      try {
        await adapter.delete(sourcePath)
        task.progress.itemResults.push(itemResult)
      } catch (error) {
        itemResult.status = 'failed'
        itemResult.error = error instanceof Error ? error.message : String(error)
        task.progress.itemResults.push(itemResult)
      }
    }

    task.progress.currentFileIndex = task.sourcePaths.length
  }

  private async executeRename(task: FileOperationTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    }

    if (task.sourcePaths.length === 0 || !task.newName) {
      throw new Error('Invalid rename parameters')
    }

    const sourcePath = task.sourcePaths[0]
    const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
    const targetPath = `${dir}/${task.newName}`

    task.progress.currentFile = task.newName
    task.progress.currentFileIndex = 0
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const itemResult: FileOperationItemResult = {
      sourcePath,
      targetPath,
      status: 'success'
    }

    try {
      await adapter.rename(sourcePath, targetPath)
      task.progress.itemResults.push(itemResult)
    } catch (error) {
      itemResult.status = 'failed'
      itemResult.error = error instanceof Error ? error.message : String(error)
      task.progress.itemResults.push(itemResult)
      throw error
    }

    task.progress.currentFileIndex = 1
  }

  private async executeMkdir(task: FileOperationTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    }

    const targetPath = task.targetPath || '/'

    task.progress.currentFile = targetPath.split('/').pop() || ''
    task.progress.currentFileIndex = 0
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const itemResult: FileOperationItemResult = {
      sourcePath: '',
      targetPath,
      status: 'success'
    }

    try {
      await adapter.mkdir(targetPath)
      task.progress.itemResults.push(itemResult)
    } catch (error) {
      itemResult.status = 'failed'
      itemResult.error = error instanceof Error ? error.message : String(error)
      task.progress.itemResults.push(itemResult)
      throw error
    }

    task.progress.currentFileIndex = 1
  }

  private async executeTouch(task: FileOperationTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    }

    const targetPath = task.targetPath || '/'

    task.progress.currentFile = targetPath.split('/').pop() || ''
    task.progress.currentFileIndex = 0
    task.progress.totalFiles = 1
    this.notifyTaskUpdate(task)

    const itemResult: FileOperationItemResult = {
      sourcePath: '',
      targetPath,
      status: 'success'
    }

    try {
      await adapter.writeFile(targetPath, Buffer.from(''))
      task.progress.itemResults.push(itemResult)
    } catch (error) {
      itemResult.status = 'failed'
      itemResult.error = error instanceof Error ? error.message : String(error)
      task.progress.itemResults.push(itemResult)
      throw error
    }

    task.progress.currentFileIndex = 1
  }

  cancelTask(taskId: string): void {
    if (this.currentTask?.id === taskId) {
      this.cancelled = true
    } else {
      this.queue = this.queue.filter(t => t.id !== taskId)
      // Remove from history if exists
      const historyIndex = this.history.findIndex(t => t.id === taskId)
      if (historyIndex > -1) {
        this.history[historyIndex].status = 'cancelled'
      }
    }
  }

  async retryTask(taskId: string): Promise<FileOperationTask | null> {
    const historyTask = this.history.find(t => t.id === taskId)
    if (!historyTask) return null

    // Create new task with same parameters
    const newTask = await this.addTask({
      type: historyTask.type,
      sourceDeviceId: historyTask.sourceDeviceId,
      sourcePaths: historyTask.sourcePaths,
      targetDeviceId: historyTask.targetDeviceId,
      targetPath: historyTask.targetPath,
      newName: historyTask.newName
    })

    // Remove old task from history
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

  private addToHistory(task: FileOperationTask): void {
    this.history.unshift(task)
    // Keep history size limited
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize)
    }
  }
}
