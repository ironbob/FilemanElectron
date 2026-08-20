import { BrowserWindow, shell } from 'electron'
import type { IFileSystemAdapter } from '../adapters/types'
import { StreamTransfer, CancelledError } from './StreamTransfer'
import { ArchiveService } from './ArchiveService'
import type { SevenZipService } from './SevenZipService'
import type { ImageEditService } from './ImageEditService'
import type { ImageConvertSpec } from '@shared/types'
import { CH } from '../ipc/channels'
import { t } from '../i18n'
const log = console

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

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename'
export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch' | 'batch-rename' | 'recycle' | 'restore' | 'archive' | 'image-convert'
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
  conflictStrategy?: ConflictStrategy
  renameItems?: Array<{ sourcePath: string; newName: string }>
  restoreItems?: Array<{ trashPath: string; originalPath: string }>
  convert?: ImageConvertSpec
  /** archive 任务：输出格式（zip 流式 fflate / 7z 走捆绑 7zz，仅本地）。 */
  format?: 'zip' | '7z'
  /** 7z 加密口令（连同文件名加密 -mhe=on）。 */
  password?: string
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
  conflictStrategy?: ConflictStrategy
  renameItems?: Array<{ sourcePath: string; newName: string }>
  restoreItems?: Array<{ trashPath: string; originalPath: string }>
  convert?: ImageConvertSpec
  format?: 'zip' | '7z'
  password?: string
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
  conflictStrategy?: ConflictStrategy
  renameItems?: Array<{ sourcePath: string; newName: string }>
  restoreItems?: Array<{ trashPath: string; originalPath: string }>
  convert?: ImageConvertSpec
  format?: 'zip' | '7z'
  password?: string

  constructor(params: CreateTaskParams) {
    this.id = generateTaskId()
    this.type = params.type
    this.sourceDeviceId = params.sourceDeviceId
    this.sourcePaths = params.sourcePaths
    this.targetDeviceId = params.targetDeviceId
    this.targetPath = params.targetPath
    this.newName = params.newName
    this.conflictStrategy = params.conflictStrategy ?? 'skip'
    this.renameItems = params.renameItems
    this.restoreItems = params.restoreItems
    this.convert = params.convert
    this.format = params.format
    this.password = params.password
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
  /** 队列挂起：当前任务照常跑完，不再派发下一个 pending（抽屉「暂停队列」）。 */
  private queuePaused = false
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private mainWindow: BrowserWindow | null = null
  private maxHistorySize = 100
  private lastProgressNotifyAt = 0
  private completionWaiters = new Map<string, (task: FileOperationTask) => void>()
  /** 压缩执行器（组合根注入；archive 任务的实际打包容逻辑在 ArchiveService）。 */
  private archiveService: ArchiveService | null = null
  /** 7z 执行器（组合根注入；format='7z' 的 archive 任务由 SevenZipService 打包）。 */
  private sevenZipService: SevenZipService | null = null
  /** 图片转换执行器（组合根注入；image-convert 任务的编解码逻辑在 ImageEditService）。 */
  private imageEditService: ImageEditService | null = null

  registerAdapter(deviceId: string, adapter: IFileSystemAdapter): void {
    this.adapters.set(deviceId, adapter)
  }

  unregisterAdapter(deviceId: string): void {
    this.adapters.delete(deviceId)
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  setArchiveService(archiveService: ArchiveService): void {
    this.archiveService = archiveService
  }

  setSevenZipService(sevenZipService: SevenZipService): void {
    this.sevenZipService = sevenZipService
  }

  setImageEditService(imageEditService: ImageEditService): void {
    this.imageEditService = imageEditService
  }

  private notifyTaskUpdate(task: TransferTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CH.push.fileOperationUpdated, task)
    }
  }

  private notifyTaskAdded(task: TransferTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CH.push.fileOperationAdded, task)
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
    log.info('[FileOperationManager] task queued', { taskId: task.id, type: task.type, sourceDeviceId: task.sourceDeviceId })
    this.processQueue()
    return task
  }

  private async processQueue(): Promise<void> {
    if (this.isRunning || this.queuePaused || this.queue.length === 0) return

    this.isRunning = true
    this.currentTask = this.queue.shift()!

    try {
      await this.executeTask(this.currentTask)
    } catch (error) {
      log.error('[FileOperationManager] task execution error:', error)
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
        case 'batch-rename':
          await this.executeBatchRename(task)
          break
        case 'recycle':
          await this.executeRecycle(task)
          break
        case 'restore':
          await this.executeRestore(task)
          break
        case 'archive':
          await this.executeArchive(task)
          break
        case 'image-convert':
          await this.executeImageConvert(task)
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
        const dst = await this.resolveTargetPath(target, joinPosix(targetPath, name), task.conflictStrategy ?? 'skip')
        task.setCurrentFile(name, 0)
        this.notifyTaskUpdate(task)
        const item: FileOperationItemResult = { sourcePath, targetPath: dst, status: 'success' }
        try {
          if (await target.exists(dst) && task.conflictStrategy === 'overwrite') await target.delete(dst)
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
      task.recordItem({ sourcePath, status: 'failed', error: t('errors.main.statSourceFailed') })
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
        if (!targetStat.isDirectory) throw new Error(t('errors.main.targetNotDirectory', { path: dstDir }))
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
      const resolvedDestination = await this.resolveTargetPath(target, dstPath, task.conflictStrategy ?? 'skip')
      // Skip retains source data. Overwrite and rename are resolved before transfer.
      if (resolvedDestination === null) {
        item.status = 'skipped'
        task.recordItem(item)
        return false
      }
      item.targetPath = resolvedDestination

      const startBytes = task.progress.bytesTransferred
      const startTime = Date.now()

      const bytes = await StreamTransfer.transferFile(source, srcPath, target, resolvedDestination, {
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

  /** Returns null for skip, otherwise a writable conflict-free destination. */
  private async resolveTargetPath(
    target: IFileSystemAdapter,
    destination: string,
    strategy: ConflictStrategy
  ): Promise<string | null> {
    if (!(await target.exists(destination))) return destination
    if (strategy === 'skip') return null
    if (strategy === 'overwrite') {
      await target.delete(destination)
      return destination
    }
    // Finder 副本命名：a.txt → a 副本.txt → a 副本 2.txt（词表后缀词按语言取 副本/copy）。
    const extensionIndex = posixBaseName(destination).lastIndexOf('.')
    const parent = destination.slice(0, Math.max(0, destination.length - posixBaseName(destination).length)).replace(/\/$/, '') || '/'
    const name = posixBaseName(destination)
    const stem = extensionIndex > 0 ? name.slice(0, extensionIndex) : name
    const extension = extensionIndex > 0 ? name.slice(extensionIndex) : ''
    const duplicateWord = t('tasks.duplicateWord')
    for (let suffix = 1; suffix < 10_000; suffix++) {
      const label = suffix === 1 ? `${stem} ${duplicateWord}` : `${stem} ${duplicateWord} ${suffix}`
      const candidate = joinPosix(parent, `${label}${extension}`)
      if (!(await target.exists(candidate))) return candidate
    }
    throw new Error(t('errors.main.conflictNameExhausted', { path: destination }))
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

  // ============ 压缩成 ZIP ============

  /**
   * archive 任务：源 → 同设备目标目录下的一个压缩包。
   * targetPath 为目标目录，newName 为压缩包名（渲染层按 Finder 规则生成：
   * 单选「a.txt → a.zip」，多选「Archive.zip」）。
   * format='7z' 时走捆绑 7zz（仅本地，可选密码连文件名加密）；默认 zip 走
   * ArchiveService（流式写临时文件后 rename，取消/失败不留半成品）。
   */
  private async executeArchive(task: TransferTask): Promise<void> {
    if (!this.archiveService) throw new Error('ArchiveService not configured')
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)

    const targetDir = task.targetPath || '/'
    const ext = task.format === '7z' ? '.7z' : '.zip'
    const rawName = task.newName || `Archive${ext}`
    const safeName = rawName.toLowerCase().endsWith(ext) ? rawName : `${rawName}${ext}`
    const zipPath = await this.resolveTargetPath(adapter, joinPosix(targetDir, safeName), 'rename')
    // rename 策略不返回 null；守卫仅为收窄类型。
    if (zipPath === null) throw new Error(`Destination conflict: ${safeName}`)

    const { bytes, files } = await this.computeTotals(adapter, task.sourcePaths)
    task.setTotals(bytes, files)

    if (task.format === '7z') {
      await this.executeArchive7z(task, zipPath, safeName)
      return
    }

    let fileIndex = 0
    try {
      await this.archiveService.runCreateZip(adapter, task.sourcePaths, zipPath, {
        onFileRead: (name, readBytes) => {
          task.setCurrentFile(name, fileIndex++)
          task.addBytes(readBytes)
          this.notifyProgress(task)
        },
        onCompressing: () => {
          // 打包/写盘阶段：进度条停在读取完成处，当前文件切到压缩包名。
          task.setCurrentFile(safeName, task.progress.totalFiles)
          this.notifyProgress(task, true)
        },
        shouldCancel: () => this.cancelled
      })
    } catch (error) {
      if (error instanceof CancelledError) return
      throw error
    }

    for (const sourcePath of task.sourcePaths) {
      task.recordItem({ sourcePath, targetPath: zipPath, status: 'success' })
    }
  }

  /** 7z 分支：捆绑 7zz 打包（仅本地）；-bb1 逐文件行驱动进度。 */
  private async executeArchive7z(task: TransferTask, zipPath: string, safeName: string): Promise<void> {
    if (!this.sevenZipService) throw new Error('SevenZipService not configured')
    if (task.sourceDeviceId !== 'local') throw new Error(t('errors.main.sevenZipLocalOnly'))
    if (!(await this.sevenZipService.isAvailable())) throw new Error(t('errors.main.sevenZipUnavailable'))

    let fileIndex = 0
    try {
      await this.sevenZipService.create7z(task.sourcePaths, zipPath, { password: task.password }, {
        onFileRead: (name, readBytes) => {
          task.setCurrentFile(name, fileIndex++)
          task.addBytes(readBytes)
          this.notifyProgress(task)
        },
        shouldCancel: () => this.cancelled
      })
    } catch (error) {
      if (error instanceof CancelledError) return
      throw error
    }

    for (const sourcePath of task.sourcePaths) {
      task.recordItem({ sourcePath, targetPath: zipPath, status: 'success' })
    }
    log.info('[FileOperationManager] 7z archive created', { zipPath, safeName })
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

  private async executeBatchRename(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    const items = task.renameItems ?? []
    if (items.length === 0) throw new Error(t('errors.main.batchRenameNoItems'))
    task.progress.totalFiles = items.length
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const parent = item.sourcePath.slice(0, item.sourcePath.lastIndexOf('/')) || '/'
      const destination = joinPosix(parent, item.newName)
      task.setCurrentFile(item.newName, index)
      const result: FileOperationItemResult = { sourcePath: item.sourcePath, targetPath: destination, status: 'success' }
      try {
        if (await adapter.exists(destination)) throw new Error(t('errors.main.batchRenameTargetExists', { name: item.newName }))
        await adapter.rename(item.sourcePath, destination)
      } catch (error) {
        result.status = 'failed'
        result.error = error instanceof Error ? error.message : String(error)
      }
      task.recordItem(result)
      this.notifyTaskUpdate(task)
    }
  }

  // ============ 图片批量转换 ============

  /**
   * image-convert 任务：本地图片批量转格式/缩放。引擎 = ImageEditService.apply
   * （SIPS heic 解码 + 原子写：overwrite = 临时文件替换，copy = 唯一副本名）。
   * 进度按文件数（转换耗时与源字节数不成比例，不做字节进度）；
   * 单项失败记录后继续（与 batch-rename 一致）。
   */
  private async executeImageConvert(task: TransferTask): Promise<void> {
    if (!this.imageEditService) throw new Error('ImageEditService not configured')
    if (task.sourceDeviceId !== 'local') throw new Error(t('errors.main.imageConvertLocalOnly'))
    const spec = task.convert
    if (!spec) throw new Error('Invalid image-convert parameters')

    task.progress.totalFiles = task.sourcePaths.length
    for (let index = 0; index < task.sourcePaths.length; index++) {
      if (this.cancelled) return
      const sourcePath = task.sourcePaths[index]
      task.setCurrentFile(posixBaseName(sourcePath), index)
      this.notifyTaskUpdate(task)

      const result: FileOperationItemResult = { sourcePath, status: 'success' }
      try {
        const applied = await this.imageEditService.apply(
          sourcePath,
          { compress: { format: spec.format, quality: spec.quality ?? 85, maxEdge: spec.maxEdge } },
          { mode: spec.mode, dir: spec.dir, suffix: spec.suffix, format: spec.format }
        )
        result.targetPath = applied.writtenPath
        result.bytesProcessed = applied.bytes
      } catch (error) {
        result.status = 'failed'
        result.error = error instanceof Error ? error.message : String(error)
      }
      task.recordItem(result)
      this.notifyTaskUpdate(task)
    }
  }

  /** Local uses the platform trash; remote/mobile adapters use a same-parent hidden bin. */
  private async executeRecycle(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    task.progress.totalFiles = task.sourcePaths.length
    for (let index = 0; index < task.sourcePaths.length; index++) {
      const sourcePath = task.sourcePaths[index]
      const result: FileOperationItemResult = { sourcePath, status: 'success' }
      task.setCurrentFile(posixBaseName(sourcePath), index)
      try {
        if (task.sourceDeviceId === 'local') {
          await shell.trashItem(sourcePath)
        } else {
          const parent = posixDirname(sourcePath)
          const trashDirectory = joinPosix(joinPosix(parent, '.fileman-recycle-bin'), task.id)
          await adapter.mkdir(trashDirectory)
          const trashPath = await this.resolveTargetPath(adapter, joinPosix(trashDirectory, posixBaseName(sourcePath)), 'rename')
          if (!trashPath) throw new Error(t('errors.main.recyclePathFailed'))
          await adapter.rename(sourcePath, trashPath)
          result.targetPath = trashPath
        }
      } catch (error) {
        result.status = 'failed'
        result.error = error instanceof Error ? error.message : String(error)
      }
      task.recordItem(result)
      this.notifyTaskUpdate(task)
    }
  }

  private async executeRestore(task: TransferTask): Promise<void> {
    const adapter = this.adapters.get(task.sourceDeviceId)
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`)
    const items = task.restoreItems ?? []
    if (items.length === 0) throw new Error(t('errors.main.restoreMissingOriginalPaths'))
    task.progress.totalFiles = items.length
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const result: FileOperationItemResult = { sourcePath: item.trashPath, targetPath: item.originalPath, status: 'success' }
      task.setCurrentFile(posixBaseName(item.originalPath), index)
      try {
        if (await adapter.exists(item.originalPath)) throw new Error(t('errors.main.restoreTargetExists', { path: item.originalPath }))
        await adapter.rename(item.trashPath, item.originalPath)
      } catch (error) {
        result.status = 'failed'
        result.error = error instanceof Error ? error.message : String(error)
      }
      task.recordItem(result)
      this.notifyTaskUpdate(task)
    }
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

  /** 暂停/恢复队列派发（不中断当前任务）。恢复时若空闲则立即续跑。 */
  setQueuePaused(paused: boolean): boolean {
    this.queuePaused = paused
    if (!paused) this.processQueue()
    return this.queuePaused
  }

  isQueuePaused(): boolean {
    return this.queuePaused
  }

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
      newName: historyTask.newName,
      // 重建必须携带完整参数，否则 batch-rename/restore/convert 的重试必失败
      conflictStrategy: historyTask.conflictStrategy,
      renameItems: historyTask.renameItems,
      restoreItems: historyTask.restoreItems,
      convert: historyTask.convert,
      format: historyTask.format,
      password: historyTask.password
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
