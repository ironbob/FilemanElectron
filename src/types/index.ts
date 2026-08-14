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

export interface Device {
  id: string
  type: 'local' | 'android' | 'smb' | 'ssh' | 'webdav' | 'ios'
  name: string
  status: 'connected' | 'disconnected' | 'connecting'
  rootPath?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
  model?: string
}

// Mobile device types
export interface DetectedMobileDevice {
  id: string
  type: 'android' | 'ios'
  name: string
  model?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
}

export interface Tab {
  id: string
  title: string
  panes: Pane[]
  activePaneId: string
  /** When set, this tab renders a directory compare view instead of file panes */
  compareSession?: DirCompareSession
  /** When set, this tab renders a file diff view */
  fileDiffSession?: FileDiffSession
}

export interface Column {
  path: string
  selectedPath?: string
}

export interface Pane {
  id: string
  deviceId: string
  path: string
  history: string[]
  historyIndex: number
  viewMode: 'list' | 'grid' | 'columns'
  selectedFiles: string[]
  columns?: Column[]
  /** Grid icon size (only applies when viewMode === 'grid'). */
  gridSize?: 'xlarge' | 'large' | 'medium' | 'small'
}

export interface AppConfig {
  devices: DeviceConfig[]
  favorites: Favorite[]
  settings: AppSettings
}

export interface DeviceConfig {
  id: string
  type: string
  name: string
  host?: string
  port?: number
  username?: string
  password?: string
  url?: string
}

export interface Favorite {
  deviceId: string
  path: string
  name: string
}

export interface AppSettings {
  defaultView: 'list' | 'grid' | 'columns'
  showHiddenFiles: boolean
  confirmDelete: boolean
}

// ── Directory Compare Types ──────────────────────────────────────────────────

export type CompareRule = 'name' | 'size' | 'timestamp'

export type CompareStatus =
  | 'metadata-equal'
  | 'content-equal'
  | 'different'
  | 'left-newer'
  | 'right-newer'
  | 'left-only'
  | 'right-only'
  | 'type-mismatch'
  | 'verifying'
  | 'verification-failed'
  | 'uncomparable'

export type VerificationStatus =
  | 'not-requested'
  | 'queued'
  | 'verifying'
  | 'content-equal'
  | 'content-different'
  | 'failed'
  | 'cancelled'

export interface CompareSideError {
  side: 'left' | 'right'
  deviceId: string
  path: string
  message: string
}

export interface VerificationState {
  status: VerificationStatus
  taskId?: string
  message?: string
}

export interface CompareEntry {
  /** Full relative path from compare root (unique key in the tree) */
  relativePath: string
  name: string
  status: CompareStatus
  left?: FileInfo
  right?: FileInfo
  isDirectory: boolean
  expanded: boolean
  depth: number
  children?: CompareEntry[]
  verification?: VerificationState
  error?: CompareSideError
}

export interface DirCompareFilter {
  showEqual: boolean
  showDifferent: boolean
  showLeftOnly: boolean
  showRightOnly: boolean
}

export interface DirCompareSession {
  id: string
  leftDeviceId: string
  leftRootPath: string
  /** v1: same as leftDeviceId (cross-device is v2) */
  rightDeviceId: string
  rightRootPath: string
  rule: CompareRule
  filter: DirCompareFilter
}

export interface FileDiffSession {
  id: string
  /** Display name of the file */
  fileName: string
  /** The compare status that triggered this diff (carried from CompareEntry) */
  status: CompareStatus
  leftDeviceId: string
  /** Undefined when the file only exists on the right side */
  left?: FileInfo
  rightDeviceId: string
  /** Undefined when the file only exists on the left side */
  right?: FileInfo
}

export interface ContentVerificationPair {
  relativePath: string
  leftDeviceId: string
  leftPath: string
  leftSize: number
  rightDeviceId: string
  rightPath: string
  rightSize: number
}

export interface ContentVerificationRequest {
  sessionId: string
  pairs: ContentVerificationPair[]
}

export interface ContentVerificationProgress {
  sessionId: string
  taskId: string
  relativePath: string
  status: Exclude<VerificationStatus, 'not-requested' | 'queued'>
  completed: number
  total: number
  message?: string
}

export type CopyDirection = 'left-to-right' | 'right-to-left'
export type CopyConflictStrategy = 'ask' | 'skip' | 'overwrite' | 'rename'

export interface DirCompareCopyPlanItem {
  relativePath: string
  sourceDeviceId: string
  sourcePath: string
  targetDeviceId: string
  targetDirectory: string
  isDirectory: boolean
}

export interface DirCompareCopyPlan {
  revision: number
  direction: CopyDirection
  items: DirCompareCopyPlanItem[]
  blockedItems: string[]
  strategy: CopyConflictStrategy
}

export * from './preview'
