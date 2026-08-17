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
  FileInfoWindowContext,
  SearchQuery,
  ContentVerificationPair,
  ContentVerificationProgress,
  DirectoryStatsRequest,
  DirectoryStatsProgress,
  WatchChangeEvent,
  OpenWithApp,
  GitDirectoryStatus,
  ChecksumRequest,
  ChecksumProgress,
  DuplicateScanRequest,
  DuplicateScanProgress,
  GrepRequest,
  GrepProgress,
  SpaceAnalysisRequest,
  SpaceAnalysisProgress,
  ReadChunkResult,
  HexSavePiece,
  SaveHexFileResult,
  MediaInfoSummary,
  FileOperationTask,
  CreateTaskParams,
  DetectedMobileDevice,
  DetectedVolume,
  EditCompressParams,
  EditOps,
  EditSaveSpec,
  EditEstimateResult,
  EditApplyResult,
  ImageEditBatchRequest,
  ImageEditBatchProgress,
} from '@shared/types'

const filemanAPI = {
  // ============ System ============
  getHomeDir: () => ipcRenderer.invoke(CH.invoke.systemGetHomeDir),
  /** 原生目录选择（保存 Sheet「位置」行）；取消返回 null。 */
  pickDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke(CH.invoke.systemPickDirectory, defaultPath),

  // ============ Windows ============
  openFileInfoWindow: (context: FileInfoWindowContext): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.fileInfoWindowOpen, context),
  getFileInfoWindowContext: (): Promise<FileInfoWindowContext> =>
    ipcRenderer.invoke(CH.invoke.fileInfoWindowGetContext),

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

  // ============ Directory Stats (属性弹窗递归统计) ============
  startDirectoryStats: (request: DirectoryStatsRequest) =>
    ipcRenderer.invoke(CH.invoke.fsDirStatsStart, request) as Promise<{ taskId: string }>,
  cancelDirectoryStats: (taskId: string) =>
    ipcRenderer.invoke(CH.invoke.fsDirStatsCancel, taskId) as Promise<boolean>,

  // ============ Media Info (属性弹窗多媒体元数据) ============
  getMediaInfo: (deviceId: string, filePath: string): Promise<MediaInfoSummary | null> =>
    ipcRenderer.invoke(CH.invoke.fsMediaInfo, deviceId, filePath),

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
  onDirectoryStatsProgress: (callback: (progress: DirectoryStatsProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DirectoryStatsProgress) => callback(progress)
    ipcRenderer.on(CH.push.dirStatsProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.dirStatsProgress, handler)
  },
  onWatchChanged: (callback: (event: WatchChangeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, change: WatchChangeEvent) => callback(change)
    ipcRenderer.on(CH.push.watchChanged, handler)
    return () => ipcRenderer.removeListener(CH.push.watchChanged, handler)
  },

  // ============ Directory Watch (自动刷新) ============
  watchSubscribe: (deviceId: string, dirPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.invoke.watchSubscribe, deviceId, dirPath),
  watchUnsubscribe: (deviceId: string, dirPath: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.watchUnsubscribe, deviceId, dirPath),

  // ============ Git Status (只读徽标, 仅本地) ============
  getGitStatus: (deviceId: string, dirPath: string): Promise<GitDirectoryStatus> =>
    ipcRenderer.invoke(CH.invoke.gitStatus, deviceId, dirPath),

  // ============ Checksum (哈希校验) ============
  startChecksum: (request: ChecksumRequest): Promise<{ taskId: string }> =>
    ipcRenderer.invoke(CH.invoke.checksumStart, request),
  cancelChecksum: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.checksumCancel, taskId),
  onChecksumProgress: (callback: (progress: ChecksumProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ChecksumProgress) => callback(progress)
    ipcRenderer.on(CH.push.checksumProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.checksumProgress, handler)
  },

  // ============ Duplicate Finder (重复文件查找) ============
  startDuplicateScan: (request: DuplicateScanRequest): Promise<{ taskId: string }> =>
    ipcRenderer.invoke(CH.invoke.dupesStart, request),
  cancelDuplicateScan: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.dupesCancel, taskId),
  onDuplicateScanProgress: (callback: (progress: DuplicateScanProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DuplicateScanProgress) => callback(progress)
    ipcRenderer.on(CH.push.dupesProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.dupesProgress, handler)
  },

  // ============ Grep (内容搜索) ============
  startGrep: (request: GrepRequest): Promise<{ taskId: string }> =>
    ipcRenderer.invoke(CH.invoke.grepStart, request),
  cancelGrep: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.grepCancel, taskId),
  onGrepProgress: (callback: (progress: GrepProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: GrepProgress) => callback(progress)
    ipcRenderer.on(CH.push.grepProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.grepProgress, handler)
  },

  // ============ Symlink / Permission (M5) ============
  createSymlink: (deviceId: string, targetPath: string, linkPath: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.fsSymlink, deviceId, targetPath, linkPath),
  readSymlink: (deviceId: string, linkPath: string): Promise<string> =>
    ipcRenderer.invoke(CH.invoke.fsReadlink, deviceId, linkPath),
  chmod: (deviceId: string, targetPath: string, mode: number, recursive: boolean): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.fsChmod, deviceId, targetPath, mode, recursive),
  chown: (deviceId: string, targetPath: string, uid: number, gid: number): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.fsChown, deviceId, targetPath, uid, gid),

  // ============ Read Chunk (hex 预览分块读取) ============
  readChunk: (deviceId: string, path: string, offset: number, length: number): Promise<ReadChunkResult> =>
    ipcRenderer.invoke(CH.invoke.fsReadChunk, deviceId, path, offset, length),

  // ============ Hex Save (hex 编辑保存：片段流式原子写，仅本机设备) ============
  saveHexFile: (deviceId: string, path: string, pieces: HexSavePiece[]): Promise<SaveHexFileResult> =>
    ipcRenderer.invoke(CH.invoke.fsSaveHexFile, deviceId, path, pieces),

  // ============ Space Analysis (空间分析 treemap) ============
  startSpaceAnalysis: (request: SpaceAnalysisRequest): Promise<{ taskId: string }> =>
    ipcRenderer.invoke(CH.invoke.spaceStart, request),
  cancelSpaceAnalysis: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.spaceCancel, taskId),
  onSpaceAnalysisProgress: (callback: (progress: SpaceAnalysisProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: SpaceAnalysisProgress) => callback(progress)
    ipcRenderer.on(CH.push.spaceProgress, handler)
    return () => ipcRenderer.removeListener(CH.push.spaceProgress, handler)
  },

  // ============ Shell Operations ============
  showInFolder: (path: string) => {
    shell.showItemInFolder(path)
  },
  // Open a local directory in the system Terminal (macOS: Terminal.app via osascript).
  openInTerminal: (path: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.shellOpenInTerminal, path),
  // Open a local file/directory with a chosen app (macOS: open -a).
  openWith: (appPath: string, targetPath: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.shellOpenWith, appPath, targetPath),
  // Detect installed developer apps (memoized in main; VS Code / iTerm / …).
  detectOpenWithApps: (): Promise<OpenWithApp[]> =>
    ipcRenderer.invoke(CH.invoke.shellDetectOpenWithApps),
  openDefault: (path: string): Promise<void> =>
    ipcRenderer.invoke(CH.invoke.shellOpenDefault, path),


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
  setFileOperationQueuePaused: (paused: boolean): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.fileOperationSetQueuePaused, paused),
  getFileOperationQueuePaused: (): Promise<boolean> =>
    ipcRenderer.invoke(CH.invoke.fileOperationGetQueuePaused),

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
  // 截屏到内存(先展示、后保存):返回 base64 + mime,不落盘。
  captureMobileScreen: (deviceId: string): Promise<{ base64: string; mime: 'image/png' | 'image/jpeg' }> =>
    ipcRenderer.invoke(CH.invoke.mobileCaptureScreen, deviceId),
  // 原生「另存为」对话框;取消返回 null。
  showSaveFileDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> =>
    ipcRenderer.invoke(CH.invoke.systemSaveFileDialog, options),

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

  // ============ Image Edit（仅 local；裁剪/压缩/批量） ============
  imageEdit: {
    estimate: (filePath: string, params: EditCompressParams): Promise<EditEstimateResult> =>
      ipcRenderer.invoke(CH.invoke.imageEditEstimate, filePath, params),
    apply: (filePath: string, ops: EditOps, save: EditSaveSpec): Promise<EditApplyResult> =>
      ipcRenderer.invoke(CH.invoke.imageEditApply, filePath, ops, save),
    batchStart: (request: ImageEditBatchRequest): Promise<{ taskId: string }> =>
      ipcRenderer.invoke(CH.invoke.imageEditBatchStart, request),
    batchCancel: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke(CH.invoke.imageEditBatchCancel, taskId),
    onBatchProgress: (callback: (progress: ImageEditBatchProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ImageEditBatchProgress) => callback(progress)
      ipcRenderer.on(CH.push.imageEditBatchProgress, handler)
      return () => ipcRenderer.removeListener(CH.push.imageEditBatchProgress, handler)
    },
  },

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
