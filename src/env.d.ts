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
type FileStats = import('@shared/types').FileStats
type SearchQuery = import('@shared/types').SearchQuery
type ContentVerificationPair = import('@shared/types').ContentVerificationPair
type ContentVerificationProgress = import('@shared/types').ContentVerificationProgress
type DirectoryStatsRequest = import('@shared/types').DirectoryStatsRequest
type DirectoryStatsProgress = import('@shared/types').DirectoryStatsProgress
type MediaInfoSummary = import('@shared/types').MediaInfoSummary
type DeviceConfig = import('@shared/types').DeviceConfig
type Credentials = import('@shared/types').Credentials
type Device = import('@shared/types').Device
type DetectedMobileDevice = import('@shared/types').DetectedMobileDevice
type DetectedVolume = import('@shared/types').DetectedVolume
type DeviceCapabilities = import('@shared/types').DeviceCapabilities

// ============ Window API ============

interface Window {
  fileman: {
    // System
    getHomeDir: () => Promise<string>

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
    startNativeDrag: (sourcePaths: string[]) => void

    // File Operations Queue
    getFileOperationQueue: () => Promise<FileOperationTask[]>
    getFileOperationHistory: () => Promise<FileOperationTask[]>
    createFileOperation: (params: CreateTaskParams) => Promise<FileOperationTask>
    cancelFileOperation: (taskId: string) => void
    retryFileOperation: (taskId: string) => Promise<FileOperationTask | null>
    clearFileOperationHistory: () => void

    // File browser metadata, ZIP actions and capability-gated mobile capture
    getFileMetadata: (deviceId: string, filePath: string) => Promise<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>
    setFileTags: (deviceId: string, filePath: string, tags: string[]) => Promise<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>
    findFilesByTags: (tags: string[]) => Promise<Array<{ deviceId: string; path: string; tags: string[]; updatedAt: number }>>
    createArchive: (deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string) => Promise<{ path: string }>
    extractArchive: (deviceId: string, archivePath: string, targetDirectory: string) => Promise<{ count: number }>
    captureMobileScreenshot: (deviceId: string, targetDirectory: string) => Promise<{ path: string }>

    // File Operations Events
    onFileOperationAdded: (callback: (task: FileOperationTask) => void) => () => void
    onFileOperationUpdated: (callback: (task: FileOperationTask) => void) => () => void

    // System Integration
    showInFolder: (path: string) => void
    // Open a local directory in the system Terminal (macOS only; rejects on other platforms).
    openInTerminal: (path: string) => Promise<void>

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
