import { app, BrowserWindow, ipcMain } from 'electron'
import os from 'os'
import { join } from 'path'
import { ConfigService } from './src/services/ConfigService'
import { CredentialService } from './src/services/CredentialService'
import { DeviceManager, type Device, type DeviceConfig, type Credentials, type DetectedDevice } from './src/services/DeviceManager'
import { FileOperationManager, type FileOperationTask, type CreateTaskParams } from './src/services/FileOperationManager'
import { ThumbnailService } from './src/services/ThumbnailService'
import { ImageDecodeService } from './src/services/ImageDecodeService'
import { ZipService } from './src/services/ZipService'
import { VolumeScanner } from './src/services/VolumeScanner'
import { HostShellService } from './src/services/HostShellService'

const isDev = !app.isPackaged

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

/** Separator used for virtual ZIP paths: "<zipFilePath>::<innerPath>" */
const ZIP_PATH_SEP = '::'

function isZipVirtualPath(p: string): boolean {
  return p.includes(ZIP_PATH_SEP)
}

function parseZipVirtualPath(p: string): { zipFilePath: string; innerPath: string } {
  const idx = p.indexOf(ZIP_PATH_SEP)
  return { zipFilePath: p.slice(0, idx), innerPath: p.slice(idx + 2) }
}

const localAdapter = deviceManager.getAdapter('local')
if (localAdapter) {
  fileOperationManager.registerAdapter('local', localAdapter)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
      mainWindow.webContents.send('mobile:devicesChanged', currentMobileDevices)
    }

    // Push current external volumes state as well (scanner may have run early).
    const currentVolumes = volumeScanner.getVolumes()
    if (currentVolumes.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Main] Pushing initial volumes to renderer:', currentVolumes.length)
      mainWindow.webContents.send('volumes:changed', currentVolumes)
    }
  })

  mainWindow.webContents.openDevTools({ mode: 'right' })

  if (isDev) {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173'
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============ System IPC Handlers ============

ipcMain.handle('system:getHomeDir', () => {
  return os.homedir()
})

// ============ Host Shell Integration IPC Handlers ============
// 「在终端中打开」：spawn 系统终端（macOS=osascript Terminal.app）。
// 「在 Finder 中显示」不走此 handler —— 它复用 preload 的 shell.showItemInFolder
// （Electron 安全同步 API，已被 preview/TaskItem 在用）。两者机制不同，故分离。

ipcMain.handle('shell:openInTerminal', async (_, dirPath: string): Promise<void> => {
  return hostShellService.openInTerminal(dirPath)
})

// ============ Config IPC Handlers ============

ipcMain.handle('config:get', () => configService.getConfig())
ipcMain.handle('config:save', (_, config) => configService.saveConfig(config))

// ============ Device Management IPC Handlers ============

ipcMain.handle('device:list', (): Device[] => {
  return deviceManager.getDevices()
})

ipcMain.handle('device:add', async (_, config: DeviceConfig, credentials?: Credentials): Promise<Device> => {
  const device = await deviceManager.addDevice(config, credentials)
  // Register adapter for file operations
  const adapter = deviceManager.getAdapter(device.id)
  if (adapter) {
    fileOperationManager.registerAdapter(device.id, adapter)
  }
  return device
})

ipcMain.handle('device:update', async (_, deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials): Promise<void> => {
  return deviceManager.updateDevice(deviceId, config, credentials)
})

ipcMain.handle('device:remove', async (_, deviceId: string): Promise<void> => {
  fileOperationManager.unregisterAdapter(deviceId)
  return deviceManager.unregisterDevice(deviceId)
})

ipcMain.handle('device:connect', async (_, deviceId: string): Promise<void> => {
  await deviceManager.connectDevice(deviceId)
  // Register adapter after connection
  const adapter = deviceManager.getAdapter(deviceId)
  if (adapter) {
    fileOperationManager.registerAdapter(deviceId, adapter)
  }
})

ipcMain.handle('device:disconnect', async (_, deviceId: string): Promise<void> => {
  fileOperationManager.unregisterAdapter(deviceId)
  return deviceManager.disconnectDevice(deviceId)
})

ipcMain.handle('device:hasCredentials', (_, deviceId: string): boolean => {
  return credentialService.has(deviceId)
})

ipcMain.handle('device:getCapabilities', (_, deviceId: string) => {
  return deviceManager.getCapabilities(deviceId)
})

ipcMain.handle('device:canTransferBetween', (_, sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move'): boolean => {
  return deviceManager.canTransferBetween(sourceDeviceId, targetDeviceId, operation)
})

// ============ File System IPC Handlers (with deviceId routing) ============

ipcMain.handle('fs:list', async (_, deviceId: string, path: string) => {
  return deviceManager.listFiles(deviceId, path)
})

ipcMain.handle('fs:stat', async (_, deviceId: string, path: string) => {
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

ipcMain.handle('fs:exists', async (_, deviceId: string, path: string) => {
  return deviceManager.exists(deviceId, path)
})

ipcMain.handle('fs:mkdir', async (_, deviceId: string, path: string) => {
  return deviceManager.mkdir(deviceId, path)
})

ipcMain.handle('fs:delete', async (_, deviceId: string, path: string) => {
  return deviceManager.delete(deviceId, path)
})

ipcMain.handle('fs:rename', async (_, deviceId: string, oldPath: string, newPath: string) => {
  return deviceManager.rename(deviceId, oldPath, newPath)
})

ipcMain.handle('fs:readFile', async (_, deviceId: string, path: string) => {
  // Virtual ZIP path: extract entry on demand
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const buffer = await zipService.readEntry(zipFilePath, innerPath)
    return buffer.toString('base64')
  }
  const buffer = await deviceManager.readFile(deviceId, path)
  return buffer.toString('base64')
})

// ============ ZIP browsing IPC Handlers ============

ipcMain.handle('zip:list', async (_, zipFilePath: string, internalPath: string) => {
  try {
    const entries = await zipService.listDirectory(zipFilePath, internalPath)
    console.log(`[zip:list] ${zipFilePath} :: "${internalPath}" → ${entries.length} entries`)
    return entries
  } catch (err) {
    console.error('[zip:list] Error:', err)
    throw err
  }
})

ipcMain.handle('zip:readEntry', async (_, zipFilePath: string, entryPath: string) => {
  const buffer = await zipService.readEntry(zipFilePath, entryPath)
  return buffer.toString('base64')
})

ipcMain.handle('fs:writeFile', async (_, deviceId: string, path: string, data: string) => {
  const buffer = Buffer.from(data, 'base64')
  return deviceManager.writeFile(deviceId, path, buffer)
})

ipcMain.handle('fs:copy', async (_, deviceId: string, srcPath: string, dstPath: string) => {
  return deviceManager.copy(deviceId, srcPath, dstPath)
})

ipcMain.handle('fs:search', async (_, deviceId: string, path: string, query) => {
  return deviceManager.search(deviceId, path, query)
})

// ============ Cross-Device Operations ============

ipcMain.handle('fs:copyBetween', async (
  _,
  srcDeviceId: string,
  srcPaths: string[],
  dstDeviceId: string,
  dstPath: string
) => {
  // For cross-device copy, we need to read from source and write to destination
  for (const srcPath of srcPaths) {
    const buffer = await deviceManager.readFile(srcDeviceId, srcPath)
    const fileName = srcPath.split('/').pop() || 'file'
    const targetPath = join(dstPath, fileName)
    await deviceManager.writeFile(dstDeviceId, targetPath, buffer)
  }
})

ipcMain.handle('fs:moveBetween', async (
  _,
  srcDeviceId: string,
  srcPaths: string[],
  dstDeviceId: string,
  dstPath: string
) => {
  // For cross-device move: copy then delete source
  for (const srcPath of srcPaths) {
    const buffer = await deviceManager.readFile(srcDeviceId, srcPath)
    const fileName = srcPath.split('/').pop() || 'file'
    const targetPath = join(dstPath, fileName)
    await deviceManager.writeFile(dstDeviceId, targetPath, buffer)
    await deviceManager.delete(srcDeviceId, srcPath)
  }
})

// ============ File Operation IPC Handlers ============

ipcMain.handle('file-operation:create', async (_, params: CreateTaskParams): Promise<FileOperationTask> => {
  return fileOperationManager.addTask(params)
})

ipcMain.handle('file-operation:cancel', async (_, taskId: string): Promise<void> => {
  fileOperationManager.cancelTask(taskId)
})

ipcMain.handle('file-operation:retry', async (_, taskId: string): Promise<FileOperationTask | null> => {
  return fileOperationManager.retryTask(taskId)
})

ipcMain.handle('file-operation:getQueue', async (): Promise<FileOperationTask[]> => {
  return fileOperationManager.getAllTasks()
})

ipcMain.handle('file-operation:getHistory', async (): Promise<FileOperationTask[]> => {
  return fileOperationManager.getHistory()
})

ipcMain.handle('file-operation:clearHistory', async (): Promise<void> => {
  fileOperationManager.clearHistory()
})

// ============ Mobile Device IPC Handlers ============

/**
 * Start mobile device scanning
 */
ipcMain.handle('mobile:startScan', () => {
  deviceManager.startMobileDeviceScan()
})

ipcMain.handle('mobile:stopScan', () => {
  deviceManager.stopMobileDeviceScan()
})

ipcMain.handle('mobile:scanNow', async (): Promise<DetectedDevice[]> => {
  return deviceManager.scanMobileDevicesNow()
})

ipcMain.handle('mobile:rememberDevice', async (_, deviceId: string): Promise<void> => {
  await deviceManager.rememberMobileDevice(deviceId)
  notifyRenderer()
})

ipcMain.handle('mobile:forgetDevice', async (_, deviceId: string): Promise<void> => {
  await deviceManager.forgetMobileDevice(deviceId)
  notifyRenderer()
})

ipcMain.handle('mobile:getAutoConnectDevices', async (): Promise<string[]> => {
  return deviceManager.getAutoConnectDevices()
})

ipcMain.handle('mobile:checkLibimobiledevice', async (): Promise<boolean> => {
  return deviceManager.isLibimobiledeviceInstalled()
})

ipcMain.handle('mobile:getDetectedDevices', (): DetectedDevice[] => {
  return deviceManager.getDetectedMobileDevices()
})

ipcMain.handle('mobile:getDeviceInfo', async (_, deviceId: string): Promise<DetectedDevice | undefined> => {
  return deviceManager.getDetectedMobileDevice(deviceId)
})

// ============ Device Change Notifications ============

// Notify renderer when devices change
function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device:changed', deviceManager.getDevices())
  }
}

deviceManager.onDeviceChange((devices) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device:changed', devices)

    // Also send mobile devices change notification
    const mobileDevices = deviceManager.getDetectedMobileDevices()
    console.log('[Main] Sending mobile:devicesChanged, devices:', mobileDevices.length)
    mainWindow.webContents.send('mobile:devicesChanged', mobileDevices)
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

ipcMain.handle('thumbnail:get', async (_, deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') => {
  return thumbnailService.getThumbnail(
    deviceId,
    filePath,
    size,
    mtime,
    thumbnailSize,
    (devId, path) => deviceManager.readFile(devId, path)
  )
})

ipcMain.handle('thumbnail:clearCache', async () => {
  await thumbnailService.clearCache()
})

ipcMain.handle('thumbnail:getCacheSize', async () => {
  return thumbnailService.getCacheSize()
})

// ============ Native Image Decode IPC Handlers ============
// HEIC/HEIF + camera RAW → JPEG raster via macOS `sips`. Used by the image
// browser for formats Chromium cannot render. Returns base64 (matches fs:readFile).

ipcMain.handle('image:decodeNative', async (
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
ipcMain.handle('volumes:list', () => {
  return volumeScanner.getVolumes()
})

/**
 * 扫描到卷变化（挂载/弹出）→ 推送给渲染进程。
 * 与 mobile:devicesChanged 同构。
 */
volumeScanner.onVolumeChange((volumes) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('volumes:changed', volumes)
  }
})

// ============ App Lifecycle ============

app.whenReady().then(() => {
  createWindow()
  // 启动外接卷扫描（窗口创建后开始轮询）
  volumeScanner.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
