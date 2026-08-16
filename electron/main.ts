import { app, BrowserWindow, ipcMain, nativeImage, screen } from 'electron'
import os from 'os'
import path, { join } from 'path'
import fs from 'fs-extra'
import { ConfigService } from './src/services/ConfigService'
import { CredentialService } from './src/services/CredentialService'
import { DeviceManager, type Device, type DeviceConfig, type Credentials, type DetectedDevice } from './src/services/DeviceManager'
import { FileOperationManager, type FileOperationTask, type CreateTaskParams } from './src/services/FileOperationManager'
import { ThumbnailService } from './src/services/ThumbnailService'
import { ImageDecodeService } from './src/services/ImageDecodeService'
import { ZipService } from './src/services/ZipService'
import { VolumeScanner } from './src/services/VolumeScanner'
import { HostShellService } from './src/services/HostShellService'
import { FileMetadataService } from './src/services/FileMetadataService'
import { ArchiveService } from './src/services/ArchiveService'
import { MobileScreenshotService } from './src/services/MobileScreenshotService'
import { ContentVerificationService, type ContentVerificationRequest } from './src/services/ContentVerificationService'
import { DirectoryStatsService } from './src/services/DirectoryStatsService'
import { MediaInfoService } from './src/services/MediaInfoService'
import { WatchService } from './src/services/WatchService'
import { GitStatusService } from './src/services/GitStatusService'
import { ChecksumService } from './src/services/ChecksumService'
import { DuplicateFinderService } from './src/services/DuplicateFinderService'
import { GrepService } from './src/services/GrepService'
import { SpaceAnalyzerService } from './src/services/SpaceAnalyzerService'
import { DirectoryWalker } from './src/services/support/DirectoryWalker'
import type { ChecksumRequest, DuplicateScanRequest, GrepRequest, SpaceAnalysisRequest, ReadChunkResult } from '@shared/types'
import { CH } from './src/ipc/channels'
import { isZipVirtualPath, parseZipVirtualPath } from '@shared/zipPath'
import type { DirectoryStatsRequest } from '@shared/types'

const isDev = !app.isPackaged
const log = console

let mainWindow: BrowserWindow | null = null
const configService = new ConfigService()
const credentialService = new CredentialService()
const deviceManager = new DeviceManager(configService, credentialService)
const fileOperationManager = new FileOperationManager()
const thumbnailService = new ThumbnailService()
const imageDecodeService = new ImageDecodeService(deviceManager)
const zipService = new ZipService()
const volumeScanner = new VolumeScanner({ scanInterval: 4000 })
const hostShellService = new HostShellService()
const fileMetadataService = new FileMetadataService(configService)
const archiveService = new ArchiveService(deviceManager)
const mobileScreenshotService = new MobileScreenshotService(deviceManager)
const contentVerificationService = new ContentVerificationService(deviceManager)
const directoryStatsService = new DirectoryStatsService(deviceManager, zipService)
const mediaInfoService = new MediaInfoService()
const gitStatusService = new GitStatusService()
const checksumService = new ChecksumService(deviceManager)
const duplicateFinderService = new DuplicateFinderService(deviceManager)
const grepService = new GrepService(deviceManager)
const spaceAnalyzerService = new SpaceAnalyzerService(deviceManager)
// 目录监听（自动刷新推送源）。emit 由组合根注入（服务不持有 webContents）；
// 轮询循环随首个远程订阅按需启停，无需 whenReady 显式启动。
// 窗口失焦时跳过远程轮询（减少无谓的 SSH/SMB 流量）。
const watchService = new WatchService(deviceManager, {
  emit: event => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CH.push.watchChanged, event)
    }
  },
  shouldSkipRemotePoll: () => mainWindow !== null && !mainWindow.isFocused()
})

// ZIP 虚拟路径协议（"<zipFilePath>::<innerPath>"）的解析/构造统一在
// @shared/zipPath（main 与 renderer 共用的单一事实源），此处不再本地实现。

const localAdapter = deviceManager.getAdapter('local')
if (localAdapter) {
  fileOperationManager.registerAdapter('local', localAdapter)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: Math.round(screen.getPrimaryDisplay().workAreaSize.width * 0.7),
    height: Math.round(screen.getPrimaryDisplay().workAreaSize.height * 0.7),
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Set main window for file operation manager
  fileOperationManager.setMainWindow(mainWindow)

  // Push current mobile device state once the renderer is ready,
  // because the scanner may have already run before the window existed.
  mainWindow.webContents.on('did-finish-load', () => {
    const currentMobileDevices = deviceManager.getDetectedMobileDevices()
    if (currentMobileDevices.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Main] Pushing initial mobile devices to renderer:', currentMobileDevices.length)
      mainWindow.webContents.send(CH.push.mobileDevicesChanged, currentMobileDevices)
    }

    // Push current external volumes state as well (scanner may have run early).
    const currentVolumes = volumeScanner.getVolumes()
    if (currentVolumes.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Main] Pushing initial volumes to renderer:', currentVolumes.length)
      mainWindow.webContents.send(CH.push.volumesChanged, currentVolumes)
    }
  })

  if (isDev) {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173'
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============ System IPC Handlers ============

ipcMain.handle(CH.invoke.systemGetHomeDir, () => {
  return os.homedir()
})

// ============ Host Shell Integration IPC Handlers ============
// 「在终端中打开」：spawn 系统终端（macOS=osascript Terminal.app）。
// 「在 Finder 中显示」不走此 handler —— 它复用 preload 的 shell.showItemInFolder
// （Electron 安全同步 API，已被 preview/TaskItem 在用）。两者机制不同，故分离。

ipcMain.handle(CH.invoke.shellOpenInTerminal, async (_, dirPath: string): Promise<void> => {
  return hostShellService.openInTerminal(dirPath)
})
ipcMain.handle(CH.invoke.shellOpenWith, async (_, appPath: string, targetPath: string): Promise<void> => {
  return hostShellService.openWith(appPath, targetPath)
})
ipcMain.handle(CH.invoke.shellDetectOpenWithApps, () => {
  return hostShellService.detectDevApps()
})

// ============ Directory Watch IPC Handlers ============
// 自动刷新订阅：FileList 挂载/路径切换时订阅，卸载/切换时退订（引用计数）。

ipcMain.handle(CH.invoke.watchSubscribe, (_, deviceId: string, dirPath: string) => {
  return watchService.subscribe(deviceId, dirPath)
})

ipcMain.handle(CH.invoke.watchUnsubscribe, (_, deviceId: string, dirPath: string) => {
  watchService.unsubscribe(deviceId, dirPath)
})

// ============ Git Status IPC Handlers ============
// 只读徽标查询：仅本地设备（git 是宿主工具链概念，远程无意义）。

ipcMain.handle(CH.invoke.gitStatus, (_, deviceId: string, dirPath: string) => {
  if (deviceId !== 'local') {
    return { isRepo: false, entries: [] }
  }
  return gitStatusService.getStatus(dirPath)
})

// ============ Checksum IPC Handlers ============

ipcMain.handle(CH.invoke.checksumStart, (event, request: ChecksumRequest) => {
  return checksumService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.checksumProgress, progress)
  })
})

ipcMain.handle(CH.invoke.checksumCancel, (_, taskId: string) => {
  return checksumService.cancel(taskId)
})

// ============ Duplicate Finder IPC Handlers ============

ipcMain.handle(CH.invoke.dupesStart, (event, request: DuplicateScanRequest) => {
  return duplicateFinderService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.dupesProgress, progress)
  })
})

ipcMain.handle(CH.invoke.dupesCancel, (_, taskId: string) => {
  return duplicateFinderService.cancel(taskId)
})

// ============ Grep IPC Handlers ============

ipcMain.handle(CH.invoke.grepStart, (event, request: GrepRequest) => {
  return grepService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.grepProgress, progress)
  })
})

ipcMain.handle(CH.invoke.grepCancel, (_, taskId: string) => {
  return grepService.cancel(taskId)
})

// ============ Symlink / Permission IPC Handlers ============
// 能力门控（canSymlink/canChmod/canChown）；递归 chmod 由 main 用
// DirectoryWalker 编排，adapter 只负责单路径应用。

ipcMain.handle(CH.invoke.fsSymlink, async (_, deviceId: string, targetPath: string, linkPath: string): Promise<void> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canSymlink || !adapter.symlink) {
    throw new Error('该设备不支持创建符号链接')
  }
  return adapter.symlink(targetPath, linkPath)
})

ipcMain.handle(CH.invoke.fsReadlink, async (_, deviceId: string, linkPath: string): Promise<string> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canSymlink || !adapter.readlink) {
    throw new Error('该设备不支持读取符号链接')
  }
  return adapter.readlink(linkPath)
})

ipcMain.handle(CH.invoke.fsChmod, async (_, deviceId: string, targetPath: string, mode: number, recursive: boolean): Promise<void> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canChmod || !adapter.chmod) {
    throw new Error('该设备不支持修改权限')
  }
  if (!recursive) return adapter.chmod(targetPath, mode)
  // 目录递归：walk + 逐项应用（含根；symlink 目录不跟随）
  await adapter.chmod(targetPath, mode)
  const stat = await adapter.stat(targetPath)
  if (!stat.isDirectory) return
  const walker = new DirectoryWalker(deviceManager)
  await walker.walk(deviceId, targetPath, () => false, {
    onFile: async file => { await adapter.chmod!(file.path, mode) },
    onDirectory: async dir => { await adapter.chmod!(dir.path, mode) }
  })
})

ipcMain.handle(CH.invoke.fsChown, async (_, deviceId: string, targetPath: string, uid: number, gid: number): Promise<void> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canChown || !adapter.chown) {
    throw new Error('该设备不支持修改属主')
  }
  return adapter.chown(targetPath, uid, gid)
})

// ============ Space Analysis IPC Handlers ============

ipcMain.handle(CH.invoke.spaceStart, (event, request: SpaceAnalysisRequest) => {
  return spaceAnalyzerService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.spaceProgress, progress)
  })
})

ipcMain.handle(CH.invoke.spaceCancel, (_, taskId: string) => {
  return spaceAnalyzerService.cancel(taskId)
})

// ============ Read Chunk IPC Handlers ============
// hex 预览等的分块读取：本地走 fs.createReadStream 区间；canStream 远程走
// openReadStream 丢弃前缀；非流式设备 readFile 后 slice（32MB 守卫）。

ipcMain.handle(CH.invoke.fsReadChunk, async (_, deviceId: string, path: string, offset: number, length: number): Promise<ReadChunkResult> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  const st = await adapter.stat(path)
  const fileSize = st.size
  const start = Math.max(0, Math.min(Math.floor(offset), fileSize))
  const end = Math.min(start + Math.max(1, Math.floor(length)), fileSize)
  if (end <= start) return { base64: '', bytesRead: 0, fileSize }

  if (adapter.type === 'local') {
    const stream = fs.createReadStream(path, { start, end: end - 1 })
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const buffer = Buffer.concat(chunks)
    return { base64: buffer.toString('base64'), bytesRead: buffer.length, fileSize }
  }

  const capabilities = adapter.getCapabilities()
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(path)
    const chunks: Buffer[] = []
    let received = 0
    let skipped = 0
    for await (const chunkRaw of stream) {
      const chunk = chunkRaw as Buffer
      if (skipped < start) {
        const need = start - skipped
        if (chunk.length <= need) {
          skipped += chunk.length
          continue
        }
        const tail = chunk.subarray(need)
        skipped = start
        const take = Math.min(tail.length, end - start - received)
        chunks.push(tail.subarray(0, take))
        received += take
      } else if (received < end - start) {
        const take = Math.min(chunk.length, end - start - received)
        chunks.push(chunk.subarray(0, take))
        received += take
      }
      if (received >= end - start) {
        stream.destroy()
        break
      }
    }
    const buffer = Buffer.concat(chunks)
    return { base64: buffer.toString('base64'), bytesRead: buffer.length, fileSize }
  }

  // 非流式回退：整读后 slice（守卫 32MB，与 fileHashing 一致）
  if (fileSize > 32 * 1024 * 1024) {
    throw new Error('该设备不支持流式读取，无法分块读取超过 32 MB 的文件')
  }
  const full = await adapter.readFile(path)
  const slice = full.subarray(start, end)
  return { base64: slice.toString('base64'), bytesRead: slice.length, fileSize }
})

// ============ Config IPC Handlers ============

ipcMain.handle(CH.invoke.configGet, () => configService.getConfig())
ipcMain.handle(CH.invoke.configSave, (_, config) => configService.saveConfig(config))

// ============ Device Management IPC Handlers ============

ipcMain.handle(CH.invoke.deviceList, (): Device[] => {
  return deviceManager.getDevices()
})

ipcMain.handle(CH.invoke.deviceAdd, async (_, config: DeviceConfig, credentials?: Credentials): Promise<Device> => {
  // Remote adapters are intentionally created only on connection. Registering
  // one here made every newly-added SMB/SSH device fail before it could connect.
  return deviceManager.addDevice(config, credentials)
})

ipcMain.handle(CH.invoke.deviceUpdate, async (_, deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials): Promise<void> => {
  return deviceManager.updateDevice(deviceId, config, credentials)
})

ipcMain.handle(CH.invoke.deviceRemove, async (_, deviceId: string): Promise<void> => {
  fileOperationManager.unregisterAdapter(deviceId)
  return deviceManager.unregisterDevice(deviceId)
})

ipcMain.handle(CH.invoke.deviceConnect, async (_, deviceId: string): Promise<void> => {
  await deviceManager.connectDevice(deviceId)
  // Register adapter after connection
  const adapter = deviceManager.getAdapter(deviceId)
  if (adapter) {
    fileOperationManager.registerAdapter(deviceId, adapter)
  }
})

ipcMain.handle(CH.invoke.deviceDisconnect, async (_, deviceId: string): Promise<void> => {
  fileOperationManager.unregisterAdapter(deviceId)
  return deviceManager.disconnectDevice(deviceId)
})

ipcMain.handle(CH.invoke.deviceHasCredentials, (_, deviceId: string): boolean => {
  return credentialService.has(deviceId)
})

ipcMain.handle(CH.invoke.deviceGetCapabilities, (_, deviceId: string) => {
  return deviceManager.getCapabilities(deviceId)
})

ipcMain.handle(CH.invoke.deviceCanTransferBetween, (_, sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move'): boolean => {
  return deviceManager.canTransferBetween(sourceDeviceId, targetDeviceId, operation)
})

// 发起 iOS 配对(完整生命周期:发起 → 设备端信任 → 校验,见 iOSAdapter.pairIosDevice)
ipcMain.handle(CH.invoke.devicePair, async (_, deviceId: string): Promise<{ success: boolean; error?: string }> => {
  return deviceManager.pairDevice(deviceId)
})

// ============ File System IPC Handlers (with deviceId routing) ============

ipcMain.handle(CH.invoke.fsList, async (_, deviceId: string, path: string) => {
  return deviceManager.listFiles(deviceId, path)
})

ipcMain.handle(CH.invoke.fsStat, async (_, deviceId: string, path: string) => {
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const entries = await zipService.getEntries(zipFilePath)
    const entry = entries.find(e => e.path === innerPath || e.path === innerPath.replace(/\/$/, ''))
    if (!entry) throw new Error(`ZIP entry not found: ${innerPath}`)
    return {
      name: entry.name,
      path,
      isDirectory: entry.isDirectory,
      isFile: !entry.isDirectory,
      size: entry.size,
      modifiedTime: entry.modifiedTime,
      extension: entry.isDirectory ? undefined : entry.name.includes('.') ? '.' + entry.name.split('.').pop()!.toLowerCase() : undefined,
    }
  }
  return deviceManager.getStats(deviceId, path)
})

ipcMain.handle(CH.invoke.fsExists, async (_, deviceId: string, path: string) => {
  return deviceManager.exists(deviceId, path)
})

ipcMain.handle(CH.invoke.fsMkdir, async (_, deviceId: string, path: string) => {
  return deviceManager.mkdir(deviceId, path)
})

ipcMain.handle(CH.invoke.fsDelete, async (_, deviceId: string, path: string) => {
  return deviceManager.delete(deviceId, path)
})

ipcMain.handle(CH.invoke.fsRename, async (_, deviceId: string, oldPath: string, newPath: string) => {
  return deviceManager.rename(deviceId, oldPath, newPath)
})

ipcMain.handle(CH.invoke.fsReadFile, async (_, deviceId: string, path: string) => {
  // Virtual ZIP path: extract entry on demand
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const buffer = await zipService.readEntry(zipFilePath, innerPath)
    return buffer.toString('base64')
  }
  const buffer = await deviceManager.readFile(deviceId, path)
  return buffer.toString('base64')
})

// ============ Directory compare content verification ============
// Content bytes are consumed only in Main. Renderer receives progress/result metadata.
ipcMain.handle(CH.invoke.compareVerifyStart, (event, request: ContentVerificationRequest) => {
  log.info('[DirectoryCompareIPC] verification requested', { sessionId: request.sessionId, pairCount: request.pairs.length })
  return contentVerificationService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.compareVerificationProgress, progress)
  })
})

ipcMain.handle(CH.invoke.compareVerifyCancel, (_, taskId: string) => {
  log.info('[DirectoryCompareIPC] verification cancellation requested', { taskId })
  return contentVerificationService.cancel(taskId)
})

// ============ Directory stats (属性弹窗递归统计) ============
ipcMain.handle(CH.invoke.fsDirStatsStart, (event, request: DirectoryStatsRequest) => {
  return directoryStatsService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.dirStatsProgress, progress)
  })
})

ipcMain.handle(CH.invoke.fsDirStatsCancel, (_, taskId: string) => {
  return directoryStatsService.cancel(taskId)
})

// ============ Media info (属性弹窗多媒体元数据，本期仅本地) ============
ipcMain.handle(CH.invoke.fsMediaInfo, (_, deviceId: string, filePath: string) => {
  return mediaInfoService.analyze(deviceId, filePath)
})

// ============ ZIP browsing IPC Handlers ============

ipcMain.handle(CH.invoke.zipList, async (_, zipFilePath: string, internalPath: string) => {
  try {
    const entries = await zipService.listDirectory(zipFilePath, internalPath)
    console.log(`[zip:list] ${zipFilePath} :: "${internalPath}" → ${entries.length} entries`)
    return entries
  } catch (err) {
    console.error('[zip:list] Error:', err)
    throw err
  }
})

ipcMain.handle(CH.invoke.zipReadEntry, async (_, zipFilePath: string, entryPath: string) => {
  const buffer = await zipService.readEntry(zipFilePath, entryPath)
  return buffer.toString('base64')
})

ipcMain.handle(CH.invoke.fsWriteFile, async (_, deviceId: string, path: string, data: string) => {
  const buffer = Buffer.from(data, 'base64')
  return deviceManager.writeFile(deviceId, path, buffer)
})

ipcMain.handle(CH.invoke.fsCopy, async (_, deviceId: string, srcPath: string, dstPath: string) => {
  return deviceManager.copy(deviceId, srcPath, dstPath)
})

ipcMain.handle(CH.invoke.fsSearch, async (_, deviceId: string, path: string, query) => {
  return deviceManager.search(deviceId, path, query)
})

// ============ File Browser Metadata / Archive / Capture ============

ipcMain.handle(CH.invoke.fileMetadataGet, (_, deviceId: string, filePath: string) =>
  fileMetadataService.get(deviceId, filePath)
)

ipcMain.handle(CH.invoke.fileMetadataSetTags, (_, deviceId: string, filePath: string, tags: string[]) =>
  fileMetadataService.setTags(deviceId, filePath, tags)
)

ipcMain.handle(CH.invoke.fileMetadataFindByTags, (_, tags: string[]) => fileMetadataService.findByTags(tags))

ipcMain.handle(CH.invoke.archiveCreate, (_, deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string) =>
  archiveService.createZip(deviceId, sourcePaths, targetDirectory, archiveName)
)

ipcMain.handle(CH.invoke.archiveExtract, (_, deviceId: string, archivePath: string, targetDirectory: string) =>
  archiveService.extractZip(deviceId, archivePath, targetDirectory)
)

ipcMain.handle(CH.invoke.mobileCaptureScreenshot, (_, deviceId: string, targetDirectory: string) =>
  mobileScreenshotService.captureToDirectory(deviceId, targetDirectory)
)

// ============ Cross-Device Operations ============

ipcMain.handle(CH.invoke.fsCopyBetween, async (
  _,
  srcDeviceId: string,
  srcPaths: string[],
  dstDeviceId: string,
  dstPath: string
) => {
  await fileOperationManager.addTaskAndWait({
    type: 'copy',
    sourceDeviceId: srcDeviceId,
    sourcePaths: srcPaths,
    targetDeviceId: dstDeviceId,
    targetPath: dstPath
  })
})

ipcMain.handle(CH.invoke.fsMoveBetween, async (
  _,
  srcDeviceId: string,
  srcPaths: string[],
  dstDeviceId: string,
  dstPath: string
) => {
  await fileOperationManager.addTaskAndWait({
    type: 'move',
    sourceDeviceId: srcDeviceId,
    sourcePaths: srcPaths,
    targetDeviceId: dstDeviceId,
    targetPath: dstPath
  })
})

// ============ Native Finder Drag & Drop ============

/**
 * Receives files dropped from Finder (or another local macOS app) and queues a
 * regular cross-device copy from the local adapter. This intentionally shares
 * FileOperationManager with every other transfer, so folders, SMB, and mobile
 * targets keep their existing recursive-copy and progress semantics.
 */
ipcMain.handle(CH.invoke.fsImportExternal, async (
  _,
  sourcePaths: unknown,
  targetDeviceId: string,
  targetPath: string
): Promise<FileOperationTask> => {
  if (!Array.isArray(sourcePaths)) {
    throw new Error('拖入内容无效。')
  }

  const validSourcePaths = (await Promise.all(sourcePaths
    .filter((sourcePath): sourcePath is string => typeof sourcePath === 'string' && path.isAbsolute(sourcePath))
    .map(async sourcePath => (await fs.pathExists(sourcePath)) ? sourcePath : null)))
    .filter((sourcePath): sourcePath is string => sourcePath !== null)

  if (validSourcePaths.length === 0) {
    throw new Error('未找到可导入的本地文件或文件夹。')
  }

  return fileOperationManager.addTask({
    type: 'copy',
    sourceDeviceId: 'local',
    sourcePaths: validSourcePaths,
    targetDeviceId,
    targetPath
  })
})

// A non-empty icon is mandatory for native drags on macOS. Keep the icon
// self-contained so it works in both development and packaged builds.
const NATIVE_DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLvkAAAAABJRU5ErkJggg=='
)

/** Start a native macOS drag for local files so Finder can receive them. */
ipcMain.on(CH.send.dragStartNative, (event, sourcePaths: unknown) => {
  if (!Array.isArray(sourcePaths)) {
    console.warn('[DnD][main] dragStartNative rejected: payload is not an array', { sourcePaths })
    return
  }
  const files = sourcePaths.filter(
    (sourcePath): sourcePath is string => typeof sourcePath === 'string' && path.isAbsolute(sourcePath) && fs.existsSync(sourcePath)
  )
  console.info('[DnD][main] dragStartNative', {
    received: sourcePaths.length,
    accepted: files.length,
    rejected: sourcePaths.filter(p => !files.includes(p as string))
  })
  if (files.length === 0) return

  try {
    event.sender.startDrag({ files, icon: NATIVE_DRAG_ICON })
    console.info('[DnD][main] startDrag invoked', { fileCount: files.length })
  } catch (error) {
    console.error('[DnD][main] startDrag failed', { files, error })
  }
})

// ============ File Operation IPC Handlers ============

ipcMain.handle(CH.invoke.fileOperationCreate, async (_, params: CreateTaskParams): Promise<FileOperationTask> => {
  return fileOperationManager.addTask(params)
})

ipcMain.handle(CH.invoke.fileOperationCancel, async (_, taskId: string): Promise<void> => {
  fileOperationManager.cancelTask(taskId)
})

ipcMain.handle(CH.invoke.fileOperationRetry, async (_, taskId: string): Promise<FileOperationTask | null> => {
  return fileOperationManager.retryTask(taskId)
})

ipcMain.handle(CH.invoke.fileOperationGetQueue, async (): Promise<FileOperationTask[]> => {
  return fileOperationManager.getAllTasks()
})

ipcMain.handle(CH.invoke.fileOperationGetHistory, async (): Promise<FileOperationTask[]> => {
  return fileOperationManager.getHistory()
})

ipcMain.handle(CH.invoke.fileOperationClearHistory, async (): Promise<void> => {
  fileOperationManager.clearHistory()
})

// ============ Mobile Device IPC Handlers ============

/**
 * Start mobile device scanning
 */
ipcMain.handle(CH.invoke.mobileStartScan, () => {
  deviceManager.startMobileDeviceScan()
})

ipcMain.handle(CH.invoke.mobileStopScan, () => {
  deviceManager.stopMobileDeviceScan()
})

ipcMain.handle(CH.invoke.mobileScanNow, async (): Promise<DetectedDevice[]> => {
  return deviceManager.scanMobileDevicesNow()
})

ipcMain.handle(CH.invoke.mobileRememberDevice, async (_, deviceId: string): Promise<void> => {
  await deviceManager.rememberMobileDevice(deviceId)
  notifyRenderer()
})

ipcMain.handle(CH.invoke.mobileForgetDevice, async (_, deviceId: string): Promise<void> => {
  await deviceManager.forgetMobileDevice(deviceId)
  notifyRenderer()
})

// 注：已删除 3 个死通道（mobile:getAutoConnectDevices / getDetectedDevices /
// getDeviceInfo）——preload 无对应方法、renderer 无调用；设备状态经
// device:list 拉取 + mobile:devicesChanged 推送获取。清单见 channels.ts。

ipcMain.handle(CH.invoke.mobileCheckLibimobiledevice, async (): Promise<boolean> => {
  return deviceManager.isLibimobiledeviceInstalled()
})

// ============ Device Change Notifications ============

// Notify renderer when devices change
function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.deviceChanged, deviceManager.getDevices())
  }
}

deviceManager.onDeviceChange((devices) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.deviceChanged, devices)

    // Also send mobile devices change notification
    const mobileDevices = deviceManager.getDetectedMobileDevices()
    console.log('[Main] Sending mobile:devicesChanged, devices:', mobileDevices.length)
    mainWindow.webContents.send(CH.push.mobileDevicesChanged, mobileDevices)
  }

  // Update file operation manager adapters
  devices.forEach(device => {
    if (device.status === 'connected') {
      const adapter = deviceManager.getAdapter(device.id)
      if (adapter) {
        fileOperationManager.registerAdapter(device.id, adapter)
      }
    }
  })
})

// ============ Thumbnail IPC Handlers ============

ipcMain.handle(CH.invoke.thumbnailGet, async (_, deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') => {
  return thumbnailService.getThumbnail(
    deviceId,
    filePath,
    size,
    mtime,
    thumbnailSize,
    (devId, path) => deviceManager.readFile(devId, path)
  )
})

ipcMain.handle(CH.invoke.thumbnailClearCache, async () => {
  await thumbnailService.clearCache()
})

ipcMain.handle(CH.invoke.thumbnailGetCacheSize, async () => {
  return thumbnailService.getCacheSize()
})

// ============ Native Image Decode IPC Handlers ============
// HEIC/HEIF + camera RAW → JPEG raster via macOS `sips`. Used by the image
// browser for formats Chromium cannot render. Returns base64 (matches fs:readFile).

ipcMain.handle(CH.invoke.imageDecodeNative, async (
  _,
  deviceId: string,
  filePath: string,
  opts?: { maxDim?: number }
) => {
  const result = await imageDecodeService.decodeToRaster(deviceId, filePath, opts)
  return result // { buffer: string(base64), mime: 'image/jpeg' }
})

// ============ External Volumes IPC Handlers ============

/**
 * 已挂载的外接卷列表（快照）。首次拉取用；后续变化由 volumes:changed 推送。
 */
ipcMain.handle(CH.invoke.volumesList, () => {
  return volumeScanner.getVolumes()
})

/**
 * 扫描到卷变化（挂载/弹出）→ 推送给渲染进程。
 * 与 mobile:devicesChanged 同构。
 */
volumeScanner.onVolumeChange((volumes) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.volumesChanged, volumes)
  }
})

// ============ App Lifecycle ============

app.whenReady().then(() => {
  createWindow()
  // 启动移动设备扫描与外接卷扫描（与 VolumeScanner 同模式：由组合根显式启动，
  // DeviceManager 构造函数不再有生命周期副作用）
  deviceManager.startMobileDeviceScan()
  volumeScanner.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
