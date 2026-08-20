/// <reference types="vite/client" />

// Polyfilled APIs (Chrome 130-131) not yet in TypeScript's lib — used by pdfjs-dist v5.
interface Uint8Array {
  toHex(): string
  toBase64(options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }): string
}
interface Uint8ArrayConstructor {
  fromBase64(str: string, options?: { alphabet?: 'base64' | 'base64url' }): Uint8Array
}
interface Map<K, V> {
  getOrInsertComputed(key: K, compute: (key: K) => V): V
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vue-virtual-scroller' {
  import type { DefineComponent } from 'vue'
  export const RecycleScroller: DefineComponent<any, any, any>
  export const DynamicScroller: DefineComponent<any, any, any>
  export const DynamicScrollerItem: DefineComponent<any, any, any>
}

// ============ 跨进程域类型（正典在 shared/types.ts） ============
// 本文件是全局脚本声明（不能顶部 import，否则全局声明失效），因此用
// import() 类型导入形态别名到全局作用域，供下方 Window['fileman'] 引用。

type FileInfo = import('@shared/types').FileInfo
type FileInfoWindowContext = import('@shared/types').FileInfoWindowContext
type FileStats = import('@shared/types').FileStats
type SearchQuery = import('@shared/types').SearchQuery
type ContentVerificationPair = import('@shared/types').ContentVerificationPair
type ContentVerificationProgress = import('@shared/types').ContentVerificationProgress
type DirectoryStatsRequest = import('@shared/types').DirectoryStatsRequest
type DirectoryStatsProgress = import('@shared/types').DirectoryStatsProgress
type WatchChangeEvent = import('@shared/types').WatchChangeEvent
type OpenWithApp = import('@shared/types').OpenWithApp
type GitDirectoryStatus = import('@shared/types').GitDirectoryStatus
type ChecksumRequest = import('@shared/types').ChecksumRequest
type ChecksumProgress = import('@shared/types').ChecksumProgress
type DuplicateScanRequest = import('@shared/types').DuplicateScanRequest
type DuplicateScanProgress = import('@shared/types').DuplicateScanProgress
type DuplicateGroup = import('@shared/types').DuplicateGroup
type GrepRequest = import('@shared/types').GrepRequest
type GrepProgress = import('@shared/types').GrepProgress
type GrepMatch = import('@shared/types').GrepMatch
type SpaceAnalysisRequest = import('@shared/types').SpaceAnalysisRequest
type SpaceAnalysisProgress = import('@shared/types').SpaceAnalysisProgress
type ReadChunkResult = import('@shared/types').ReadChunkResult
type HexSavePiece = import('@shared/types').HexSavePiece
type SaveHexFileResult = import('@shared/types').SaveHexFileResult
type MediaInfoSummary = import('@shared/types').MediaInfoSummary
type DeviceConfig = import('@shared/types').DeviceConfig
type Credentials = import('@shared/types').Credentials
type Device = import('@shared/types').Device
type DetectedMobileDevice = import('@shared/types').DetectedMobileDevice
type DetectedVolume = import('@shared/types').DetectedVolume
type DeviceCapabilities = import('@shared/types').DeviceCapabilities
type ClipboardProbe = import('@shared/types').ClipboardProbe
type ClipboardData = import('@shared/types').ClipboardData

// ============ Window API ============

interface Window {
  fileman: {
    // System
    getHomeDir: () => Promise<string>
    /** 原生目录选择（保存 Sheet「位置」行）；取消返回 null。 */
    pickDirectory: (defaultPath?: string) => Promise<string | null>
    /** 本地文件路径写入系统剪贴板（Finder 可 ⌘V）；失败返回 false（静默降级）。 */
    writeFileClipboard: (paths: string[]) => Promise<boolean>
    /** 读系统剪贴板中的文件引用（Finder 复制的文件）；无/失败返回 []。 */
    readFileClipboard: () => Promise<string[]>
    /** 清空系统剪贴板文件引用（cut 消费后防悬空）；失败返回 false。 */
    clearFileClipboard: () => Promise<boolean>
    /** 图片数据（base64，PNG/JPEG）写系统剪贴板，任何应用可 ⌘V；失败返回 false。 */
    writeImageClipboard: (base64: string, mime: string) => Promise<boolean>
    /** 探测系统剪贴板可保存内容（文本/图片，只回元数据+预览）；失败降级 {kind:'none'}。 */
    probeClipboardContent: () => Promise<ClipboardProbe>
    /** 写入瞬间全量读剪贴板（判定顺序与 probe 一致）；内容已变/超限返回 {kind:'none'}。 */
    readClipboardData: () => Promise<ClipboardData>
    openFileInfoWindow: (context: FileInfoWindowContext) => Promise<void>
    getFileInfoWindowContext: () => Promise<FileInfoWindowContext>

    // Config
    getConfig: () => Promise<unknown>
    saveConfig: (config: unknown) => Promise<void>

    // Device Management
    getDevices: () => Promise<Device[]>
    addDevice: (config: DeviceConfig, credentials?: Credentials) => Promise<Device>
    updateDevice: (deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials) => Promise<void>
    removeDevice: (deviceId: string) => Promise<void>
    connectDevice: (deviceId: string) => Promise<void>
    disconnectDevice: (deviceId: string) => Promise<void>
    pairDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>
    hasCredentials: (deviceId: string) => Promise<boolean>
    getDeviceCapabilities: (deviceId: string) => Promise<DeviceCapabilities>
    canTransferBetween: (sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move') => Promise<boolean>

    // File System Operations (all require deviceId)
    listFiles: (deviceId: string, path: string) => Promise<FileInfo[]>
    getStats: (deviceId: string, path: string) => Promise<FileStats>
    exists: (deviceId: string, path: string) => Promise<boolean>
    mkdir: (deviceId: string, path: string) => Promise<void>
    delete: (deviceId: string, path: string) => Promise<void>
    rename: (deviceId: string, oldPath: string, newPath: string) => Promise<void>
    readFile: (deviceId: string, path: string) => Promise<string> // Returns base64 encoded string
    writeFile: (deviceId: string, path: string, data: string) => Promise<void> // data is base64 encoded
    copy: (deviceId: string, srcPath: string, dstPath: string) => Promise<void>
    search: (deviceId: string, path: string, query: SearchQuery) => Promise<FileInfo[]>

    // Directory compare content verification — progress contains no file bytes.
    startContentVerification: (request: { sessionId: string; pairs: ContentVerificationPair[] }) => Promise<{ taskId: string; total: number }>
    cancelContentVerification: (taskId: string) => Promise<boolean>

    // Directory stats (属性弹窗递归统计) — progress 终态即为结果
    startDirectoryStats: (request: DirectoryStatsRequest) => Promise<{ taskId: string }>
    cancelDirectoryStats: (taskId: string) => Promise<boolean>

    // Directory watch (自动刷新) — 订阅变化推送；renderer 端 diff 守卫后再刷新
    watchSubscribe: (deviceId: string, dirPath: string) => Promise<{ ok: boolean }>
    watchUnsubscribe: (deviceId: string, dirPath: string) => Promise<void>
    onWatchChanged: (callback: (event: WatchChangeEvent) => void) => () => void

    // Git status (只读徽标；非本地设备或非仓库返回 isRepo:false)
    getGitStatus: (deviceId: string, dirPath: string) => Promise<GitDirectoryStatus>

    // Checksum (哈希校验；1 项单哈希 / 2 项跨设备对比；终态携带 results+match)
    startChecksum: (request: ChecksumRequest) => Promise<{ taskId: string }>
    cancelChecksum: (taskId: string) => Promise<boolean>
    onChecksumProgress: (callback: (progress: ChecksumProgress) => void) => () => void

    // Duplicate finder (重复文件查找；groups 只随 completed 终态携带)
    startDuplicateScan: (request: DuplicateScanRequest) => Promise<{ taskId: string }>
    cancelDuplicateScan: (taskId: string) => Promise<boolean>
    onDuplicateScanProgress: (callback: (progress: DuplicateScanProgress) => void) => () => void

    // Grep (内容搜索；matches 增量批量推送；iOS 不支持)
    startGrep: (request: GrepRequest) => Promise<{ taskId: string }>
    cancelGrep: (taskId: string) => Promise<boolean>
    onGrepProgress: (callback: (progress: GrepProgress) => void) => () => void

    // Symlink / permission (能力门控；递归 chmod 由 main 编排)
    createSymlink: (deviceId: string, targetPath: string, linkPath: string) => Promise<void>
    readSymlink: (deviceId: string, linkPath: string) => Promise<string>
    chmod: (deviceId: string, targetPath: string, mode: number, recursive: boolean) => Promise<void>
    chown: (deviceId: string, targetPath: string, uid: number, gid: number) => Promise<void>
    /** macOS 扩展属性（仅本机设备；二进制值只读展示）。 */
    listXattrs: (deviceId: string, path: string) => Promise<import('@shared/types').XattrEntry[]>
    removeXattr: (deviceId: string, path: string, name: string, recursive: boolean) => Promise<void>
    setXattr: (deviceId: string, path: string, name: string, value: string) => Promise<void>

    // Read chunk (分块读取；hex 预览用；本地/流式远程支持区间，非流式整读 slice)
    readChunk: (deviceId: string, path: string, offset: number, length: number) => Promise<ReadChunkResult>

    // Hex save (hex 编辑保存；片段 = 编辑日志净效果，传输量 ∝ 编辑量；仅本机设备)
    saveHexFile: (deviceId: string, path: string, pieces: HexSavePiece[]) => Promise<SaveHexFileResult>

    // Space analysis (空间分析 treemap；entries 只随 completed 终态携带)
    startSpaceAnalysis: (request: SpaceAnalysisRequest) => Promise<{ taskId: string }>
    cancelSpaceAnalysis: (taskId: string) => Promise<boolean>
    onSpaceAnalysisProgress: (callback: (progress: SpaceAnalysisProgress) => void) => () => void

    // Media info (属性弹窗多媒体元数据；非媒体或远程文件返回 null)
    getMediaInfo: (deviceId: string, filePath: string) => Promise<MediaInfoSummary | null>

    // Cross-Device Operations
    copyBetweenDevices: (
      srcDeviceId: string,
      srcPaths: string[],
      dstDeviceId: string,
      dstPath: string
    ) => Promise<void>
    moveBetweenDevices: (
      srcDeviceId: string,
      srcPaths: string[],
      dstDeviceId: string,
      dstPath: string
    ) => Promise<void>

    // Native Finder drag & drop. External files always originate from local
    // disk, then use the normal transfer queue for the chosen target device.
    importExternalFiles: (
      files: File[],
      targetDeviceId: string,
      targetPath: string
    ) => Promise<FileOperationTask>
    startNativeDrag: (sourcePaths: string[], iconDataUrl?: string) => void
    /** 真实 preload 桥接才为 true；e2e mock（Proxy 兜底返回函数）必须 === true 严格判定。 */
    supportsNativeDrag: boolean

    // File Operations Queue
    getFileOperationQueue: () => Promise<FileOperationTask[]>
    getFileOperationHistory: () => Promise<FileOperationTask[]>
    createFileOperation: (params: CreateTaskParams) => Promise<FileOperationTask>
    cancelFileOperation: (taskId: string) => void
    retryFileOperation: (taskId: string) => Promise<FileOperationTask | null>
    clearFileOperationHistory: () => void
    setFileOperationQueuePaused: (paused: boolean) => Promise<boolean>
    getFileOperationQueuePaused: () => Promise<boolean>

    // File browser metadata, ZIP actions and capability-gated mobile capture
    getFileMetadata: (deviceId: string, filePath: string) => Promise<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>
    setFileTags: (deviceId: string, filePath: string, tags: string[]) => Promise<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>
    findFilesByTags: (tags: string[]) => Promise<Array<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>>
    createArchive: (deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string, format?: 'zip' | '7z', password?: string) => Promise<FileOperationTask>
    extractArchive: (deviceId: string, archivePath: string, targetDirectory: string, password?: string) => Promise<{ count: number }>
    /** 7zz 可用性（7Z 创建入口与 7z/rar 解压门控）。 */
    getArchiveToolInfo: () => Promise<{ sevenZip: boolean }>
    /** 图片批量转换（image-convert 任务，仅本地；引擎 = ImageEditService）。 */
    createImageConvert: (deviceId: string, sourcePaths: string[], convert: import('@shared/types').ImageConvertSpec) => Promise<FileOperationTask>
    captureMobileScreenshot: (deviceId: string, targetDirectory: string) => Promise<{ path: string }>
    /** 截屏到内存(先展示、后保存):返回 base64 + mime,不落盘。 */
    captureMobileScreen: (deviceId: string) => Promise<{ base64: string; mime: 'image/png' | 'image/jpeg' }>
    /** 原生「另存为」对话框;用户取消返回 null。 */
    showSaveFileDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>

    // File Operations Events
    onFileOperationAdded: (callback: (task: FileOperationTask) => void) => () => void
    onFileOperationUpdated: (callback: (task: FileOperationTask) => void) => () => void

    // System Integration
    // Reveal in Finder（主进程 shell.showItemInFolder 中转；目标不存在不报错）
    showInFolder: (path: string) => Promise<void>
    // Open a local directory in the system Terminal (macOS only; rejects on other platforms).
    openInTerminal: (path: string) => Promise<void>
    // Open a local file/directory with a chosen app (macOS: open -a).
    openWith: (appPath: string, targetPath: string) => Promise<void>
    openDefault: (path: string) => Promise<void>
    // Apps registered in LaunchServices as able to open the target file
    // (macOS only; memoized per extension in main; default app flagged).
    getOpenWithApps: (targetPath: string) => Promise<OpenWithApp[]>

    // Events
    onDeviceChange: (callback: (devices: Device[]) => void) => () => void
    onTransferProgress: (callback: (progress: unknown) => void) => () => void
    onContentVerificationProgress: (callback: (progress: ContentVerificationProgress) => void) => () => void
    onDirectoryStatsProgress: (callback: (progress: DirectoryStatsProgress) => void) => () => void

    // Mobile Device Operations
    startMobileScan: () => Promise<void>
    stopMobileScan: () => Promise<void>
    scanMobileDevicesNow: () => Promise<DetectedMobileDevice[]>
    rememberDevice: (deviceId: string) => Promise<void>
    forgetDevice: (deviceId: string) => Promise<void>
    checkLibimobiledevice: () => Promise<boolean>

    // Mobile Device Events
    onMobileDevicesChanged: (callback: (devices: DetectedMobileDevice[]) => void) => () => void

    // Thumbnail Operations
    thumbnail: {
      get: (
        deviceId: string,
        filePath: string,
        size: number,
        mtime: string,
        thumbnailSize: 'small' | 'large'
      ) => Promise<{ cacheKey: string; thumbnailBase64: string } | null>
      clearCache: () => Promise<void>
      getCacheSize: () => Promise<number>
    }

    // Native image decode — HEIC/HEIF + camera RAW → base64 JPEG via macOS sips.
    // Used by the image browser for formats Chromium cannot render.
    decodeNativeImage: (
      deviceId: string,
      filePath: string,
      opts?: { maxDim?: number }
    ) => Promise<{ buffer: string; mime: string }>

    // 图片编辑（仅 local；裁剪/压缩/批量）
    imageEdit: {
      estimate: (
        filePath: string,
        params: import('@shared/types').EditCompressParams
      ) => Promise<import('@shared/types').EditEstimateResult>
      apply: (
        filePath: string,
        ops: import('@shared/types').EditOps,
        save: import('@shared/types').EditSaveSpec
      ) => Promise<import('@shared/types').EditApplyResult>
      batchStart: (
        request: import('@shared/types').ImageEditBatchRequest
      ) => Promise<{ taskId: string }>
      batchCancel: (taskId: string) => Promise<boolean>
      onBatchProgress: (
        callback: (progress: import('@shared/types').ImageEditBatchProgress) => void
      ) => () => void
    }

    // ZIP archive browsing (lazy – no full extraction)
    zip: {
      /** List immediate children of internalPath inside the ZIP (internalPath='' = root). */
      listDirectory: (
        zipFilePath: string,
        internalPath: string
      ) => Promise<Array<{
        name: string
        path: string
        isDirectory: boolean
        size: number
        compressedSize: number
        modifiedTime: string
        localHeaderOffset: number
        compressionMethod: number
      }>>
      /** Read and decompress a single ZIP entry. Returns base64-encoded bytes. */
      readEntry: (zipFilePath: string, entryPath: string) => Promise<string>
    }

    // External Volumes (mounted on local filesystem)
    volumes: {
      /** Snapshot of currently mounted external volumes. */
      list: () => Promise<DetectedVolume[]>
      /** Subscribe to volume mount/unmount changes. Returns an unsubscribe function. */
      onChanged: (callback: (volumes: DetectedVolume[]) => void) => () => void
    }
  }
}

// ============ File Operation Types（正典在 shared/types.ts） ============

type FileOperationType = import('@shared/types').FileOperationType
type FileOperationStatus = import('@shared/types').FileOperationStatus
type FileOperationItemResult = import('@shared/types').FileOperationItemResult
type FileOperationProgress = import('@shared/types').FileOperationProgress
type FileOperationTask = import('@shared/types').FileOperationTask
type CreateTaskParams = import('@shared/types').CreateTaskParams
