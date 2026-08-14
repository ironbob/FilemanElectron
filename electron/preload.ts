import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import { CH } from './src/ipc/channels'

// 域类型正典在 @shared/types（跨进程单一事实源），此处仅 import type 消费
// （编译期擦除，preload 不引入运行时跨进程依赖）。通道名一律经 CH 常量引用。
import type {
  DeviceConfig,
  Credentials,
  Device,
  DeviceCapabilities,
  FileInfo,
  SearchQuery,
  ContentVerificationPair,
  ContentVerificationProgress,
  FileOperationTask,
  CreateTaskParams,
  DetectedMobileDevice,
  DetectedVolume,
} from '@shared/types'

const filemanAPI = {
  // ============ System ============
  getHomeDir: () => ipcRenderer.invoke(CH.invoke.systemGetHomeDir),

  // ============ Config ============
  getConfig: () => ipcRenderer.invoke(CH.invoke.configGet),
  saveConfig: (config: unknown) => ipcRenderer.invoke(CH.invoke.configSave, config),

  // ============ Device Management ============
  getDevices: () => ipcRenderer.invoke(CH.invoke.deviceList),
  addDevice: (config: DeviceConfig, credentials?: Credentials) =>
    ipcRenderer.invoke(CH.invoke.deviceAdd, config, credentials),
  updateDevice: (deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials) =>
    ipcRenderer.invoke(CH.invoke.deviceUpdate, deviceId, config, credentials),
  removeDevice: (deviceId: string) => ipcRenderer.invoke(CH.invoke.deviceRemove, deviceId),
  connectDevice: (deviceId: string) => ipcRenderer.invoke(CH.invoke.deviceConnect, deviceId),
  disconnectDevice: (deviceId: string) => ipcRenderer.invoke(CH.invoke.deviceDisconnect, deviceId),
  pairDevice: (deviceId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(CH.invoke.devicePair, deviceId),
  hasCredentials: (deviceId: string) => ipcRenderer.invoke(CH.invoke.deviceHasCredentials, deviceId),
  getDeviceCapabilities: (deviceId: string): Promise<DeviceCapabilities> =>
    ipcRenderer.invoke(CH.invoke.deviceGetCapabilities, deviceId),
  canTransferBetween: (sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move'): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.deviceCanTransferBetween, sourceDeviceId, targetDeviceId, operation),

  // ============ File System Operations (all require deviceId) ============
  listFiles: (deviceId: string, path: string) => ipcRenderer.invoke(CH.invoke.fsList, deviceId, path),
  getStats: (deviceId: string, path: string) => ipcRenderer.invoke(CH.invoke.fsStat, deviceId, path),
  exists: (deviceId: string, path: string) => ipcRenderer.invoke(CH.invoke.fsExists, deviceId, path),
  mkdir: (deviceId: string, path: string) => ipcRenderer.invoke(CH.invoke.fsMkdir, deviceId, path),
  delete: (deviceId: string, path: string) => ipcRenderer.invoke(CH.invoke.fsDelete, deviceId, path),
  rename: (deviceId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke(CH.invoke.fsRename, deviceId, oldPath, newPath),
  readFile: (deviceId: string, path: string): Promise<string> =>
    ipcRenderer.invoke(CH.invoke.fsReadFile, deviceId, path),
  writeFile: (deviceId: string, path: string, data: string) =>
    ipcRenderer.invoke(CH.invoke.fsWriteFile, deviceId, path, data),
  copy: (deviceId: string, srcPath: string, dstPath: string) =>
    ipcRenderer.invoke(CH.invoke.fsCopy, deviceId, srcPath, dstPath),
  search: (deviceId: string, path: string, query: SearchQuery) =>
    ipcRenderer.invoke(CH.invoke.fsSearch, deviceId, path, query),

  // ============ Directory Compare Content Verification ============
  startContentVerification: (request: { sessionId: string; pairs: ContentVerificationPair[] }) =>
    ipcRenderer.invoke(CH.invoke.compareVerifyStart, request) as Promise<{ taskId: string; total: number }>,
  cancelContentVerification: (taskId: string) =>
    ipcRenderer.invoke(CH.invoke.compareVerifyCancel, taskId) as Promise<boolean>,

  // ============ Cross-Device Operations ============
  copyBetweenDevices: (
    srcDeviceId: string,
    srcPaths: string[],
    dstDeviceId: string,
    dstPath: string
  ) => ipcRenderer.invoke(CH.invoke.fsCopyBetween, srcDeviceId, srcPaths, dstDeviceId, dstPath),
  moveBetweenDevices: (
    srcDeviceId: string,
    srcPaths: string[],
    dstDeviceId: string,
    dstPath: string
  ) => ipcRenderer.invoke(CH.invoke.fsMoveBetween, srcDeviceId, srcPaths, dstDeviceId, dstPath),

  // ============ Native Finder Drag & Drop ============
  // Resolve paths inside preload, where Electron's webUtils can safely bridge
  // a native File object without depending on the deprecated File.path field.
  importExternalFiles: (
    files: File[],
    targetDeviceId: string,
    targetPath: string
  ): Promise<FileOperationTask> => {
    const sourcePaths = files
      .map(file => webUtils.getPathForFile(file))
      .filter((filePath): filePath is string => filePath.length > 0)
    return ipcRenderer.invoke(CH.invoke.fsImportExternal, sourcePaths, targetDeviceId, targetPath)
  },
  startNativeDrag: (sourcePaths: string[]): void => {
    ipcRenderer.send(CH.send.dragStartNative, sourcePaths)
  },

  // ============ Events ============
  onDeviceChange: (callback: (devices: Device[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, devices: Device[]) => callback(devices)
    ipcRenderer.on(CH.push.deviceChanged, handler)
    return () => ipcRenderer.removeListener(CH.push.deviceChanged, handler)
  },
  onTransferProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress)
    ipcRenderer.on(CH.push.transferProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.transferProgress, handler)
  },
  onContentVerificationProgress: (callback: (progress: ContentVerificationProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ContentVerificationProgress) => callback(progress)
    ipcRenderer.on(CH.push.compareVerificationProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.compareVerificationProgress, handler)
  },

  // ============ Shell Operations ============
  showInFolder: (path: string) => {
    shell.showItemInFolder(path)
  },
  // Open a local directory in the system Terminal (macOS: Terminal.app via osascript).
  openInTerminal: (path: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.shellOpenInTerminal, path),

  // ============ File Operations ============
  createFileOperation: (params: CreateTaskParams) =>
    ipcRenderer.invoke(CH.invoke.fileOperationCreate, params),
  cancelFileOperation: (taskId: string) =>
    ipcRenderer.invoke(CH.invoke.fileOperationCancel, taskId),
  retryFileOperation: (taskId: string) =>
    ipcRenderer.invoke(CH.invoke.fileOperationRetry, taskId),
  getFileOperationQueue: () =>
    ipcRenderer.invoke(CH.invoke.fileOperationGetQueue),
  getFileOperationHistory: () =>
    ipcRenderer.invoke(CH.invoke.fileOperationGetHistory),
  clearFileOperationHistory: () =>
    ipcRenderer.invoke(CH.invoke.fileOperationClearHistory),

  // ============ File Browser Metadata / Archive / Mobile Capture ============
  getFileMetadata: (deviceId: string, filePath: string) =>
    ipcRenderer.invoke(CH.invoke.fileMetadataGet, deviceId, filePath),
  setFileTags: (deviceId: string, filePath: string, tags: string[]) =>
    ipcRenderer.invoke(CH.invoke.fileMetadataSetTags, deviceId, filePath, tags),
  findFilesByTags: (tags: string[]) => ipcRenderer.invoke(CH.invoke.fileMetadataFindByTags, tags),
  createArchive: (deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string) =>
    ipcRenderer.invoke(CH.invoke.archiveCreate, deviceId, sourcePaths, targetDirectory, archiveName),
  extractArchive: (deviceId: string, archivePath: string, targetDirectory: string) =>
    ipcRenderer.invoke(CH.invoke.archiveExtract, deviceId, archivePath, targetDirectory),
  captureMobileScreenshot: (deviceId: string, targetDirectory: string) =>
    ipcRenderer.invoke(CH.invoke.mobileCaptureScreenshot, deviceId, targetDirectory),

  // ============ File Operation Events ============
  onFileOperationAdded: (callback: (task: FileOperationTask) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: FileOperationTask) => callback(task)
    ipcRenderer.on(CH.push.fileOperationAdded, handler)
    return () => ipcRenderer.removeListener(CH.push.fileOperationAdded, handler)
  },
  onFileOperationUpdated: (callback: (task: FileOperationTask) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: FileOperationTask) => callback(task)
    ipcRenderer.on(CH.push.fileOperationUpdated, handler)
    return () => ipcRenderer.removeListener(CH.push.fileOperationUpdated, handler)
  },

  // ============ Mobile Device Operations ============
  startMobileScan: () => ipcRenderer.invoke(CH.invoke.mobileStartScan),
  stopMobileScan: () => ipcRenderer.invoke(CH.invoke.mobileStopScan),
  scanMobileDevicesNow: (): Promise<DetectedMobileDevice[]> =>
    ipcRenderer.invoke(CH.invoke.mobileScanNow),
  rememberDevice: (deviceId: string) =>
    ipcRenderer.invoke(CH.invoke.mobileRememberDevice, deviceId),
  forgetDevice: (deviceId: string) =>
    ipcRenderer.invoke(CH.invoke.mobileForgetDevice, deviceId),
  checkLibimobiledevice: (): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.mobileCheckLibimobiledevice),

  // ============ Mobile Device Events ============
  onMobileDevicesChanged: (callback: (devices: DetectedMobileDevice[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, devices: DetectedMobileDevice[]) => {
      console.log('[Preload] mobile:devicesChanged event received:', devices.length, devices)
      callback(devices)
    }
    ipcRenderer.on(CH.push.mobileDevicesChanged, handler)
    console.log('[Preload] Registered listener for mobile:devicesChanged')
    return () => ipcRenderer.removeListener(CH.push.mobileDevicesChanged, handler)
  },

  // ============ Thumbnail Operations ============
  thumbnail: {
    get: (deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') =>
      ipcRenderer.invoke(CH.invoke.thumbnailGet, deviceId, filePath, size, mtime, thumbnailSize),
    clearCache: () => ipcRenderer.invoke(CH.invoke.thumbnailClearCache),
    getCacheSize: () => ipcRenderer.invoke(CH.invoke.thumbnailGetCacheSize),
  },

  // ============ Native Image Decode (HEIC/RAW → JPEG via macOS sips) ============
  decodeNativeImage: (deviceId: string, filePath: string, opts?: { maxDim?: number }) =>
    ipcRenderer.invoke(CH.invoke.imageDecodeNative, deviceId, filePath, opts) as Promise<{
      buffer: string
      mime: string
    }>,

  // ============ ZIP browsing (lazy – no full extraction) ============
  zip: {
    /**
     * List immediate children of `internalPath` inside the ZIP file at `zipFilePath`.
     * Pass internalPath='' for the ZIP root.
     * Returns metadata only – no decompression.
     */
    listDirectory: (zipFilePath: string, internalPath: string) =>
      ipcRenderer.invoke(CH.invoke.zipList, zipFilePath, internalPath),
    /**
     * Read and decompress a single entry from a ZIP file.
     * Returns the file content as a base64 string.
     */
    readEntry: (zipFilePath: string, entryPath: string): Promise<string> =>
      ipcRenderer.invoke(CH.invoke.zipReadEntry, zipFilePath, entryPath),
  },

  // ============ External Volumes (mounted on local filesystem) ============
  volumes: {
    /** Snapshot of currently mounted external volumes. */
    list: (): Promise<DetectedVolume[]> => ipcRenderer.invoke(CH.invoke.volumesList),
    /** Subscribe to volume mount/unmount changes. Returns an unsubscribe function. */
    onChanged: (callback: (volumes: DetectedVolume[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, volumes: DetectedVolume[]) => {
        console.log('[Preload] volumes:changed event received:', volumes.length)
        callback(volumes)
      }
      ipcRenderer.on(CH.push.volumesChanged, handler)
      return () => ipcRenderer.removeListener(CH.push.volumesChanged, handler)
    },
  },
}

contextBridge.exposeInMainWorld('fileman', filemanAPI)
