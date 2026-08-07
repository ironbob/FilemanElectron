export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch'
export type FileOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Device capabilities - describes what operations a device supports
 */
export interface DeviceCapabilities {
  // Basic file operations
  readonly canRead: boolean
  readonly canWrite: boolean
  readonly canDelete: boolean
  readonly canRename: boolean
  readonly canMkdir: boolean
  readonly canList: boolean
  readonly canStat: boolean

  // Advanced operations
  readonly canCopy: boolean
  readonly canMove: boolean
  readonly canSearch: boolean

  // Cross-device operations
  readonly canCopyFrom: boolean
  readonly canCopyTo: boolean
  readonly canMoveFrom: boolean
  readonly canMoveTo: boolean

  // Limitations
  readonly maxFileSize?: number
  readonly readonlyPaths?: string[]
  readonly hiddenPaths?: string[]
}

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
}
