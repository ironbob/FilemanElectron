// 跨进程文件操作类型正典在 @shared/types，此处 re-export 兼容既有引用。
export type {
  ConflictStrategy,
  FileOperationType,
  FileOperationStatus,
  DeviceCapabilities,
  FileOperationItemResult,
  FileOperationProgress,
  FileOperationTask,
  CreateTaskParams,
} from '@shared/types'

/** Serialized into DataTransfer for file drags that stay inside the app. */
export interface InternalFileDragPayload {
  paneId: string
  deviceId: string
  files: string[]
}
