// 跨进程域类型正典在 @shared/types，此处 re-export 兼容既有 `from '@/types'` 引用。
// 仅 renderer 专属类型（Tab/Pane/Compare 会话等）保留本地声明。
export type { FileInfo, Device, DeviceConfig, DetectedMobileDevice, ContentVerificationPair } from '@shared/types'
import type { FileInfo } from '@shared/types'
import type { PreviewTab } from './preview'

export interface Tab {
  id: string
  title: string
  /** 工具页标题的词表键（AppTabBar 渲染时翻译，语言切换即时生效）。 */
  titleKey?: string
  /** titleKey 的插值参数。 */
  titleParams?: Record<string, string>
  /** 本地显示别名（双击标签设置；仅显示层，不参与同名消歧，不改磁盘文件名）。 */
  titleAlias?: string
  /** 固定标签：锁定标签栏左侧、图标紧凑形态；「关闭其他/右侧」跳过。 */
  pinned?: boolean
  panes: Pane[]
  activePaneId: string
  /** When set, this tab renders a directory compare view instead of file panes */
  compareSession?: DirCompareSession
  /** When set, this tab renders a file diff view */
  fileDiffSession?: FileDiffSession
  /** When set, this tab renders a file preview view instead of file panes */
  preview?: PreviewTab
  /** When set, this tab renders a duplicate-finder tool view */
  dupesSession?: DuplicateSession
  /** When set, this tab renders a grep content-search view */
  grepSession?: GrepSession
  /** When set, this tab renders a space-analysis treemap view */
  spaceSession?: SpaceSession
}

/** 重复文件查找会话（瞬态工具页，重启即弃）。 */
export interface DuplicateSession {
  id: string
  deviceId: string
  rootPath: string
  minSize: number
}

/** 内容搜索会话（瞬态工具页）。 */
export interface GrepSession {
  id: string
  deviceId: string
  rootPath: string
  pattern: string
  isRegex: boolean
  caseSensitive: boolean
  includeGlob?: string
  excludeGlob?: string
}

/** 空间分析会话（瞬态工具页）。 */
export interface SpaceSession {
  id: string
  deviceId: string
  rootPath: string
}

export interface Column {
  path: string
  selectedPath?: string
}

/** 面板目录加载失败信息（瞬态，不持久化；FileList 判定写入，tab 栏据此打 ⚠）。 */
export interface PaneLoadError {
  /** 原始错误消息（展示用）。 */
  message: string
  /** true = 路径已确认不存在（exists 检查为 false）；false = 瞬态/未知失败。 */
  pathMissing: boolean
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
  /** 目录加载错误状态；null/undefined = 正常。瞬态字段，持久化时剥离。 */
  loadError?: PaneLoadError | null
}

export interface AppConfig {
  devices: DeviceConfig[]
  favorites: Favorite[]
  settings: AppSettings
}

export interface Favorite {
  deviceId: string
  path: string
  name: string
}

/** 颜色标记（Finder 式彩色标签）：color 为色板 key（'red'…'teal'），见 @/utils/colorTags。 */
export interface ColorTag {
  deviceId: string
  path: string
  color: string
}

export interface AppSettings {
  defaultView: 'list' | 'grid' | 'columns'
  showHiddenFiles: boolean
  /** 在列表视图中显示 Unix rwx 权限列。 */
  showPermissions: boolean
  confirmDelete: boolean
  /** 目录变化自动刷新（fs.watch / 远程轮询；关闭后依赖手动 Cmd+R）。 */
  autoRefresh?: boolean
  /**
   * 界面语言。刻意不设默认值：主进程据此产出本地化报错，渲染层 bootstrap
   * 走 localStorage；未显式选择过的用户不应在无关开关持久化时被钉死语言。
   */
  locale?: import('@shared/locales').AppLocale
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

export interface ContentVerificationRequest {
  sessionId: string
  pairs: ContentVerificationPair[]
}

// ContentVerificationPair / ContentVerificationProgress 正典在 @shared/types
//（上方已 re-export；此处 Progress 与正典字面量联合完全同集，直接复用）。
export type { ContentVerificationProgress } from '@shared/types'

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
