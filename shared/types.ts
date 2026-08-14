/**
 * 跨进程域类型单一事实源（Shared Kernel）
 *
 * main / preload / renderer 三侧此前各自手抄一份同名接口（preload.ts、
 * src/env.d.ts、electron/src/services/DeviceManager.ts、src/types/*、
 * src/stores/devices.ts），已发生过字段漂移（如 Device.rootPath 可选性
 * 不一致）。本文件是唯一声明处，三侧一律 `import type` 消费：
 * - main 侧：`import type { ... } from '@shared/types'`
 * - renderer 侧：同上（编译期擦除，不引入运行时跨进程依赖）
 * - env.d.ts（全局脚本文件）：用 `import('@shared/types').X` 类型导入形态
 *
 * 正典形状以主进程版本为准：Device.rootPath 必填、config 可选。
 */

// ============ Device Types ============

export interface DeviceConfig {
  id: string
  type: 'local' | 'android' | 'smb' | 'ssh' | 'webdav' | 'ios'
  name: string
  host?: string
  port?: number
  username?: string
  rootPath?: string
  // SMB specific
  share?: string
  domain?: string
  // WebDAV specific. The endpoint includes the protocol and optional port.
  url?: string
}

export interface Credentials {
  username?: string
  password?: string
  privateKey?: string
  domain?: string
  share?: string
}

export interface Device {
  id: string
  type: DeviceConfig['type']
  name: string
  status: 'connected' | 'disconnected' | 'connecting'
  rootPath: string
  config?: DeviceConfig
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
  model?: string
}

// ============ Device Capabilities ============

export interface DeviceCapabilities {
  readonly canRead: boolean          // Can read file content
  readonly canWrite: boolean         // Can write/create files
  readonly canDelete: boolean        // Can delete files
  readonly canRename: boolean        // Can rename files
  readonly canMkdir: boolean         // Can create directories
  readonly canList: boolean          // Can list directory contents
  readonly canStat: boolean          // Can get file stats
  readonly canCopy: boolean          // Can copy files within same device
  readonly canMove: boolean          // Can move files within same device
  readonly canSearch: boolean        // Can search for files
  readonly canCopyFrom: boolean      // Can be source for cross-device copy
  readonly canCopyTo: boolean        // Can be target for cross-device copy
  readonly canMoveFrom: boolean      // Can be source for cross-device move
  readonly canMoveTo: boolean        // Can be target for cross-device move
  readonly canStream: boolean        // Supports openReadStream/openWriteStream
  readonly canCaptureScreenshot: boolean
  readonly canArchive: boolean
  readonly canRecycle: boolean
  readonly maxFileSize?: number      // Maximum file size in bytes (undefined = unlimited)
  readonly readonlyPaths?: string[]  // Paths that are read-only
  readonly hiddenPaths?: string[]    // Paths that should be hidden
}

// ============ File System Types ============

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  modifiedTime: string
  createdTime?: string
  extension?: string
}

export interface FileStats {
  size: number
  isDirectory: boolean
  isFile: boolean
  modifiedTime: string
  createdTime: string
  mode: number
}

export interface SearchQuery {
  pattern: string
  fileTypes?: string[]
  minSize?: number
  maxSize?: number
  modifiedAfter?: string
  modifiedBefore?: string
}

// ============ Directory Compare Content Verification ============

export interface ContentVerificationPair {
  relativePath: string
  leftDeviceId: string
  leftPath: string
  leftSize: number
  rightDeviceId: string
  rightPath: string
  rightSize: number
}

export interface ContentVerificationProgress {
  sessionId: string
  taskId: string
  relativePath: string
  status: 'verifying' | 'content-equal' | 'content-different' | 'failed' | 'cancelled'
  completed: number
  total: number
  message?: string
}

// ============ File Operation Types ============

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename'
export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch' | 'batch-rename' | 'recycle' | 'restore'
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
}

// ============ Mobile Device Types ============

/** USB/网络发现的移动设备（android:serial 或 ios:udid）。 */
export interface DetectedDevice {
  id: string
  type: 'android' | 'ios'
  name: string
  model?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
}

/** 渲染层历史命名，与 DetectedDevice 同形，保留别名兼容既有引用。 */
export type DetectedMobileDevice = DetectedDevice

// ============ External Volume Types ============

/** 外接卷（挂载在本地文件系统，如 /Volumes/*）。 */
export interface DetectedVolume {
  id: string
  name: string
  mountPath: string
  isRemovable: boolean
}
