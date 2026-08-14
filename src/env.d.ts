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

// ============ File System Types ============

interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  modifiedTime: string
  createdTime?: string
  extension?: string
}

interface FileStats {
  size: number
  isDirectory: boolean
  isFile: boolean
  modifiedTime: string
  createdTime: string
  mode: number
}

interface SearchQuery {
  pattern: string
  fileTypes?: string[]
  minSize?: number
  maxSize?: number
  modifiedAfter?: string
  modifiedBefore?: string
}

interface ContentVerificationPair {
  relativePath: string
  leftDeviceId: string
  leftPath: string
  leftSize: number
  rightDeviceId: string
  rightPath: string
  rightSize: number
}

interface ContentVerificationProgress {
  sessionId: string
  taskId: string
  relativePath: string
  status: 'verifying' | 'content-equal' | 'content-different' | 'failed' | 'cancelled'
  completed: number
  total: number
  message?: string
}

// ============ Device Types ============

interface DeviceConfig {
  id: string
  type: 'local' | 'android' | 'smb' | 'ssh' | 'webdav' | 'ios'
  name: string
  host?: string
  port?: number
  username?: string
  rootPath?: string
  share?: string
  domain?: string
  url?: string
}

interface Credentials {
  username?: string
  password?: string
  privateKey?: string
  domain?: string
  share?: string
}

interface Device {
  id: string
  type: 'local' | 'android' | 'smb' | 'ssh' | 'webdav' | 'ios'
  name: string
  status: 'connected' | 'disconnected' | 'connecting'
  rootPath: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
  model?: string
}

// Mobile Device Types
interface DetectedMobileDevice {
  id: string
  type: 'android' | 'ios'
  name: string
  model?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
}

// External Volume Types (mounted on the local filesystem, e.g. /Volumes/*)
interface DetectedVolume {
  id: string
  name: string
  mountPath: string
  isRemovable: boolean
}

// ============ Device Capabilities ============

interface DeviceCapabilities {
  readonly canRead: boolean
  readonly canWrite: boolean
  readonly canDelete: boolean
  readonly canRename: boolean
  readonly canMkdir: boolean
  readonly canList: boolean
  readonly canStat: boolean
  readonly canCopy: boolean
  readonly canMove: boolean
  readonly canSearch: boolean
  readonly canCopyFrom: boolean
  readonly canCopyTo: boolean
  readonly canMoveFrom: boolean
  readonly canMoveTo: boolean
  readonly canStream: boolean
  readonly canCaptureScreenshot: boolean
  readonly canArchive: boolean
  readonly canRecycle: boolean
  readonly maxFileSize?: number
  readonly readonlyPaths?: string[]
  readonly hiddenPaths?: string[]
}

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

// ============ File Operation Types ============

type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch' | 'batch-rename' | 'recycle' | 'restore'
type FileOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
type FileOperationItemStatus = 'success' | 'skipped' | 'failed'

interface FileOperationItemResult {
  sourcePath: string
  targetPath?: string
  status: FileOperationItemStatus
  error?: string
  bytesProcessed?: number
}

interface FileOperationProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  speed: number
  itemResults: FileOperationItemResult[]
}

interface FileOperationTask {
  id: string
  type: FileOperationType
  status: FileOperationStatus
  sourcePaths: string[]
  sourceDeviceId: string
  targetPath?: string
  targetDeviceId?: string
  newName?: string
  progress: FileOperationProgress
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

interface CreateTaskParams {
  type: FileOperationType
  sourcePaths: string[]
  sourceDeviceId: string
  targetPath?: string
  targetDeviceId?: string
  newName?: string
  conflictStrategy?: 'skip' | 'overwrite' | 'rename'
  renameItems?: Array<{ sourcePath: string; newName: string }>
  restoreItems?: Array<{ trashPath: string; originalPath: string }>
}
