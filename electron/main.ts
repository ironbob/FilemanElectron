import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen } from 'electron'
import os from 'os'
import path, { basename, dirname, join } from 'path'
import fs from 'fs-extra'
import { ConfigService } from './src/services/ConfigService'
import { CredentialService } from './src/services/CredentialService'
import { DeviceManager, type Device, type DeviceConfig, type Credentials, type DetectedDevice } from './src/services/DeviceManager'
import { FileOperationManager, type FileOperationTask, type CreateTaskParams } from './src/services/FileOperationManager'
import { ThumbnailService } from './src/services/ThumbnailService'
import { ImageDecodeService } from './src/services/ImageDecodeService'
import { ZipService, type ZipEntry } from './src/services/ZipService'
import { VolumeScanner } from './src/services/VolumeScanner'
import { HostShellService } from './src/services/HostShellService'
import { SystemClipboardService } from './src/services/SystemClipboardService'
import { FileMetadataService } from './src/services/FileMetadataService'
import { ArchiveService } from './src/services/ArchiveService'
import { MobileScreenshotService } from './src/services/MobileScreenshotService'
import { ContentVerificationService, type ContentVerificationRequest } from './src/services/ContentVerificationService'
import { DirectoryStatsService } from './src/services/DirectoryStatsService'
import { MediaInfoService } from './src/services/MediaInfoService'
import { WatchService } from './src/services/WatchService'
import { GitStatusService } from './src/services/GitStatusService'
import { ChecksumService } from './src/services/ChecksumService'
import { ImageEditService } from './src/services/ImageEditService'
import { DuplicateFinderService } from './src/services/DuplicateFinderService'
import { GrepService } from './src/services/GrepService'
import { SpaceAnalyzerService } from './src/services/SpaceAnalyzerService'
import { DirectoryWalker } from './src/services/support/DirectoryWalker'
import type { ChecksumRequest, DuplicateScanRequest, GrepRequest, SpaceAnalysisRequest, ReadChunkResult, HexSavePiece, SaveHexFileResult, FileInfoWindowContext, EditCompressParams, EditOps, EditSaveSpec, ImageEditBatchRequest } from '@shared/types'
import { CH } from './src/ipc/channels'
import { setMainLocale, t } from './src/i18n'
import { isZipVirtualPath, parseZipVirtualPath } from '@shared/zipPath'
import type { DirectoryStatsRequest, OpenWithApp } from '@shared/types'

const isDev = !app.isPackaged
const log = console

// 真实 App 端到端验证/自动化的会话隔离钩子：指定 FILEMAN_USER_DATA_DIR 时把
// userData（localStorage 持久化标签、配置、凭据）整体指到独立目录，避免驱动
// 到真实用户数据。必须在任何服务实例化（ConfigService 等）与 app ready 之前
// 生效——下方 HOME 环境变量与 --user-data-dir 开关在 macOS 上都隔离不了
// Electron 的 userData 路径（实测）。
if (process.env.FILEMAN_USER_DATA_DIR) {
  app.setPath('userData', process.env.FILEMAN_USER_DATA_DIR)
}

let mainWindow: BrowserWindow | null = null
const fileInfoWindowContexts = new Map<number, FileInfoWindowContext>()
const configService = new ConfigService()
// 主进程语言随配置初始化（config:save 时刷新）；throw/窗口标题按当前语言产出
setMainLocale(configService.get('settings').locale)
const credentialService = new CredentialService()
const deviceManager = new DeviceManager(configService, credentialService)
const fileOperationManager = new FileOperationManager()
const thumbnailService = new ThumbnailService()
const imageDecodeService = new ImageDecodeService(deviceManager)
const imageEditService = new ImageEditService(imageDecodeService)
const zipService = new ZipService()
const volumeScanner = new VolumeScanner({ scanInterval: 4000 })
const hostShellService = new HostShellService()
const systemClipboardService = new SystemClipboardService()
const fileMetadataService = new FileMetadataService(configService)
const archiveService = new ArchiveService(deviceManager)
fileOperationManager.setArchiveService(archiveService)
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

/**
 * 创建 Finder 风格的非模态「简介」窗口。
 *
 * 打开快照保存在主进程、以 webContents.id 为键，避免将远程路径与文件元数据
 * 放到 URL；属性窗口也只能读取属于自己的上下文。
 */
function createFileInfoWindow(parent: BrowserWindow | null, context: FileInfoWindowContext): void {
  const isSingle = context.files.length === 1
  const title = isSingle
    ? t('main.infoWindowTitle', { name: context.files[0].name })
    : t('main.infoWindowTitleMulti', { count: context.files.length })
  const infoWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 460,
    minHeight: 440,
    title,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: false,
    show: false,
    backgroundColor: '#f5f5f7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  fileInfoWindowContexts.set(infoWindow.webContents.id, context)
  infoWindow.once('ready-to-show', () => infoWindow.show())
  infoWindow.on('closed', () => fileInfoWindowContexts.delete(infoWindow.webContents.id))

  if (isDev) {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173'
    const separator = devServerUrl.includes('?') ? '&' : '?'
    void infoWindow.loadURL(`${devServerUrl}${separator}file-info-window=1`)
  } else {
    void infoWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { 'file-info-window': '1' } })
  }
}

// ============ System IPC Handlers ============

ipcMain.handle(CH.invoke.systemGetHomeDir, () => {
  return os.homedir()
})

// 系统剪贴板文件引用读写：应用内复制本地文件 → Finder ⌘V；
// Finder 复制 → 应用内 ⌘V（读到的本地路径由渲染层走既有 local→目标 复制链路）。
// 失败不抛错：写返回 false、读返回 []，渲染层静默降级回应用内剪贴板。
ipcMain.handle(CH.invoke.systemWriteFileClipboard, async (_, paths: string[]): Promise<boolean> => {
  return systemClipboardService.writeLocalFiles(paths)
})

ipcMain.handle(CH.invoke.systemReadFileClipboard, async (): Promise<string[]> => {
  return systemClipboardService.readLocalFiles()
})

// cut 粘贴消费后清系统板：源文件已移走，残留 file 引用再粘（本应用或 Finder）会悬空
ipcMain.handle(CH.invoke.systemClearFileClipboard, async (): Promise<boolean> => {
  return systemClipboardService.clearFileClipboard()
})

// 图片数据写系统剪贴板（设备截屏「拷贝」）：失败返回 false，渲染层提示不中断弹层
ipcMain.handle(CH.invoke.systemWriteImageClipboard, (_, base64: string, mime: string): boolean => {
  return systemClipboardService.writeImage(base64, mime)
})

ipcMain.handle(CH.invoke.fileInfoWindowOpen, (event, context: FileInfoWindowContext): void => {
  if (!context || !Array.isArray(context.files) || context.files.length === 0) {
    throw new Error(t('errors.main.fileInfoNoSelection'))
  }
  const parent = BrowserWindow.fromWebContents(event.sender)
  createFileInfoWindow(parent, context)
})

ipcMain.handle(CH.invoke.fileInfoWindowGetContext, event => {
  const context = fileInfoWindowContexts.get(event.sender.id)
  if (!context) throw new Error(t('errors.main.fileInfoNoContext'))
  return context
})

// ============ Host Shell Integration IPC Handlers ============
// 「在终端中打开」：spawn 系统终端（macOS=osascript Terminal.app）。
// 「在 Finder 中显示」同样必须走 handler：sandboxed preload 的 electron 模块
// 不含 shell，preload 直调 shell.showItemInFolder 会静默抛错（右键菜单无效的根因）。

ipcMain.handle(CH.invoke.shellShowInFolder, (_, targetPath: string): void => {
  return hostShellService.showInFolder(targetPath)
})
ipcMain.handle(CH.invoke.shellOpenInTerminal, async (_, dirPath: string): Promise<void> => {
  return hostShellService.openInTerminal(dirPath)
})
ipcMain.handle(CH.invoke.shellOpenWith, async (_, appPath: string, targetPath: string): Promise<void> => {
  return hostShellService.openWith(appPath, targetPath)
})
ipcMain.handle(CH.invoke.shellOpenDefault, async (_, targetPath: string): Promise<void> => {
  return hostShellService.openDefault(targetPath)
})
// 「打开方式」应用列表：按目标文件查 LaunchServices（含适用性判定与默认应用）
ipcMain.handle(CH.invoke.shellGetOpenWithApps, async (_, targetPath: string): Promise<OpenWithApp[]> => {
  return hostShellService.getOpenWithApps(targetPath)
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
    throw new Error(t('errors.main.symlinkUnsupported'))
  }
  return adapter.symlink(targetPath, linkPath)
})

ipcMain.handle(CH.invoke.fsReadlink, async (_, deviceId: string, linkPath: string): Promise<string> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canSymlink || !adapter.readlink) {
    throw new Error(t('errors.main.readlinkUnsupported'))
  }
  return adapter.readlink(linkPath)
})

ipcMain.handle(CH.invoke.fsChmod, async (_, deviceId: string, targetPath: string, mode: number, recursive: boolean): Promise<void> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (!adapter.getCapabilities().canChmod || !adapter.chmod) {
    throw new Error(t('errors.main.chmodUnsupported'))
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
    throw new Error(t('errors.main.chownUnsupported'))
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
  // Virtual ZIP path: no stream — extract the entry into memory, then slice
  // (32MB guard, same semantics as the non-streaming fallback below).
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const entry = findZipEntry(await zipService.getEntries(zipFilePath), innerPath)
    if (!entry) throw new Error(`ZIP entry not found: ${innerPath}`)
    if (entry.size > 32 * 1024 * 1024) {
      throw new Error(t('errors.main.readChunkStreamUnsupported'))
    }
    const buffer = await zipService.readEntry(zipFilePath, innerPath)
    const start = Math.max(0, Math.min(Math.floor(offset), entry.size))
    const end = Math.min(start + Math.max(1, Math.floor(length)), entry.size)
    const slice = end > start ? buffer.subarray(start, end) : Buffer.alloc(0)
    return { base64: slice.toString('base64'), bytesRead: slice.length, fileSize: entry.size }
  }
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
    throw new Error(t('errors.main.readChunkStreamUnsupported'))
  }
  const full = await adapter.readFile(path)
  const slice = full.subarray(start, end)
  return { base64: slice.toString('base64'), bytesRead: slice.length, fileSize }
})

// ============ Hex Save IPC Handler（编辑片段 → 临时文件 → 原子 rename） ============
// 片段序 = 编辑日志净效果（renderer 端 journal.describe(0, logicalSize)）；
// base 片段按区间流式搬运源字节，edit 片段写入编辑字节；写完经 rename
// 原子覆盖，源文件在成功前不可变。P0 仅本机设备（远程原子写语义后续扩展）。

ipcMain.handle(CH.invoke.fsSaveHexFile, async (_, deviceId: string, path: string, pieces: HexSavePiece[]): Promise<SaveHexFileResult> => {
  const adapter = await deviceManager.getReadyAdapter(deviceId)
  if (adapter.type !== 'local') {
    throw new Error(t('errors.main.hexSaveUnsupported'))
  }
  const st = await adapter.stat(path)
  let bytesWritten = 0
  for (const piece of pieces) {
    if (piece.kind === 'base') {
      if (piece.start < 0 || piece.length < 0 || piece.start + piece.length > st.size) {
        throw new Error(t('errors.main.hexSavePieceOutOfBounds', { start: piece.start, length: piece.length, size: st.size }))
      }
      bytesWritten += piece.length
    } else {
      bytesWritten += Buffer.from(piece.base64, 'base64').length
    }
  }

  const tempPath = join(dirname(path), `.${basename(path)}.hexsave-${process.pid}-${Date.now()}.tmp`)
  const out = fs.createWriteStream(tempPath, { mode: st.mode })
  try {
    await new Promise<void>((resolve, reject) => {
      out.on('error', reject)
      void (async () => {
        // 背压感知写入：write 返回 false 时等待 drain
        const write = (chunk: Buffer): Promise<void> | void =>
          out.write(chunk) ? undefined : new Promise<void>(onDrain => out.once('drain', () => onDrain()))
        for (const piece of pieces) {
          if (piece.kind === 'edit') {
            await write(Buffer.from(piece.base64, 'base64'))
            continue
          }
          if (piece.length === 0) continue
          const src = fs.createReadStream(path, { start: piece.start, end: piece.start + piece.length - 1 })
          src.on('error', reject)
          for await (const chunkRaw of src) {
            await write(chunkRaw as Buffer)
          }
        }
        out.end()
        out.on('finish', () => resolve())
      })().catch(reject)
    })
    await fs.promises.rename(tempPath, path)
    return { bytesWritten }
  } catch (error) {
    out.destroy()
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
    throw error instanceof Error
      ? new Error(t('errors.main.hexSaveFailed', { message: error.message }))
      : new Error(t('errors.main.hexSaveFailedNoDetail'))
  }
})

// ============ Config IPC Handlers ============

ipcMain.handle(CH.invoke.configGet, () => configService.getConfig())
ipcMain.handle(CH.invoke.configSave, (_, config) => {
  configService.saveConfig(config)
  // 语言切换后主进程报错文案即时跟随
  setMainLocale(configService.get('settings').locale)
})

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

/** 按 innerPath 查 ZIP 条目（容错尾 '/'，与 parseZipVirtualPath 归一化一致）。 */
function findZipEntry(entries: ZipEntry[], innerPath: string): ZipEntry | undefined {
  const normalized = innerPath.replace(/\/+$/, '')
  return entries.find(e => e.path === normalized)
}

ipcMain.handle(CH.invoke.fsList, async (_, deviceId: string, path: string) => {
  return deviceManager.listFiles(deviceId, path)
})

ipcMain.handle(CH.invoke.fsStat, async (_, deviceId: string, path: string) => {
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const entry = findZipEntry(await zipService.getEntries(zipFilePath), innerPath)
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
  // Virtual ZIP path: host file must exist locally, then look up the entry
  if (isZipVirtualPath(path)) {
    try {
      const { zipFilePath, innerPath } = parseZipVirtualPath(path)
      if (!fs.existsSync(zipFilePath)) return false
      if (!innerPath) return true
      return findZipEntry(await zipService.getEntries(zipFilePath), innerPath) !== undefined
    } catch {
      return false
    }
  }
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

// 压缩走任务队列（右侧任务抽屉可见进度/可取消）；zip 名冲突自动「副本」重命名。
ipcMain.handle(CH.invoke.archiveCreate, (_, deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string) =>
  fileOperationManager.addTask({
    type: 'archive',
    sourceDeviceId: deviceId,
    sourcePaths,
    targetDeviceId: deviceId,
    targetPath: targetDirectory,
    newName: archiveName
  })
)

ipcMain.handle(CH.invoke.archiveExtract, (_, deviceId: string, archivePath: string, targetDirectory: string) =>
  archiveService.extractZip(deviceId, archivePath, targetDirectory)
)

ipcMain.handle(CH.invoke.mobileCaptureScreenshot, (_, deviceId: string, targetDirectory: string) =>
  mobileScreenshotService.captureToDirectory(deviceId, targetDirectory)
)

// 截屏到内存(先展示、后保存):返回 base64 + mime,不落盘。
ipcMain.handle(CH.invoke.mobileCaptureScreen, async (_, deviceId: string) => {
  const shot = await mobileScreenshotService.capture(deviceId)
  return { base64: shot.data.toString('base64'), mime: shot.mime }
})

// 原生「另存为」对话框:渲染层拿到目标路径后经 fs:writeFile 写入 local 设备。
ipcMain.handle(CH.invoke.systemSaveFileDialog, async (event, options: {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showSaveDialog(win, { defaultPath: options.defaultPath, filters: options.filters })
    : await dialog.showSaveDialog({ defaultPath: options.defaultPath, filters: options.filters })
  return result.canceled || !result.filePath ? null : result.filePath
})

// 原生目录选择（图片保存 Sheet「位置」行）：取消返回 null。
ipcMain.handle(CH.invoke.systemPickDirectory, async (event, defaultPath?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath })
    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], defaultPath })
  return result.canceled || !result.filePaths?.length ? null : result.filePaths[0]
})

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
    throw new Error(t('errors.main.dragInvalidPayload'))
  }

  const validSourcePaths = (await Promise.all(sourcePaths
    .filter((sourcePath): sourcePath is string => typeof sourcePath === 'string' && path.isAbsolute(sourcePath))
    .map(async sourcePath => (await fs.pathExists(sourcePath)) ? sourcePath : null)))
    .filter((sourcePath): sourcePath is string => sourcePath !== null)

  if (validSourcePaths.length === 0) {
    throw new Error(t('errors.main.dragNoImportableFiles'))
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
ipcMain.on(CH.send.dragStartNative, (event, sourcePaths: unknown, iconDataUrl?: unknown) => {
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

  // Renderer 生成的 Finder 式拖拽图标（canvas PNG dataURL）；解码失败回退 1×1 兜底图
  const customIcon =
    typeof iconDataUrl === 'string' && iconDataUrl.startsWith('data:image/')
      ? nativeImage.createFromDataURL(iconDataUrl)
      : nativeImage.createEmpty()
  const icon = customIcon.isEmpty() ? NATIVE_DRAG_ICON : customIcon

  try {
    event.sender.startDrag({ files, icon })
    console.info('[DnD][main] startDrag invoked', { fileCount: files.length, customIcon: !customIcon.isEmpty() })
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

ipcMain.handle(CH.invoke.fileOperationSetQueuePaused, async (_, paused: boolean): Promise<boolean> => {
  return fileOperationManager.setQueuePaused(paused)
})

ipcMain.handle(CH.invoke.fileOperationGetQueuePaused, async (): Promise<boolean> => {
  return fileOperationManager.isQueuePaused()
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
    // Virtual ZIP path: feed the service the extracted entry bytes (image
    // thumbnails then work as-is; video frames return early inside the service).
    (devId, path) => {
      if (isZipVirtualPath(path)) {
        const { zipFilePath, innerPath } = parseZipVirtualPath(path)
        return zipService.readEntry(zipFilePath, innerPath)
      }
      return deviceManager.readFile(devId, path)
    }
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

// ============ Image Edit IPC Handlers ============
// 单图编辑（预估/执行）为同步 invoke；批量为 start/cancel + 推送事件
// （ChecksumService 模式）。仅 local：路径即本机绝对路径。

ipcMain.handle(CH.invoke.imageEditEstimate, (_, filePath: string, params: EditCompressParams) => {
  return imageEditService.estimate(filePath, params)
})

ipcMain.handle(CH.invoke.imageEditApply, (_, filePath: string, ops: EditOps, save: EditSaveSpec) => {
  return imageEditService.apply(filePath, ops, save)
})

ipcMain.handle(CH.invoke.imageEditBatchStart, (event, request: ImageEditBatchRequest) => {
  return imageEditService.start(request, progress => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.imageEditBatchProgress, progress)
  })
})

ipcMain.handle(CH.invoke.imageEditBatchCancel, (_, taskId: string) => {
  return imageEditService.cancel(taskId)
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

// ── 应用菜单（⌘W 放行给渲染层）────────────────────────────────────────────
// 不设置菜单时 macOS 使用 Electron 默认菜单，其中 Window▸Close(⌘W) 的菜单
// 加速器先于页面 keydown 被消费，标签栏的 ⌘W（关标签，never-empty 规则在
// tabs store）永远收不到。这里显式构建菜单并去掉 close role：
// - editMenu 必须保留（macOS 输入框 ⌘C/⌘V 依赖其加速器）
// - windowMenu 手工构造（Minimize/Zoom，不含 Close）
// - ⌘T/⌘1-9/⇧⌘[ ] 不在默认菜单中，设置后同样不受影响
Menu.setApplicationMenu(Menu.buildFromTemplate([
  { role: 'appMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' }
    ]
  }
]))

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
