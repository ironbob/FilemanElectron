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
  type: 'local' | 'android' | 'ohos' | 'smb' | 'ssh' | 'webdav' | 'ios'
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
  /** 支持内容搜索（grep）：exec 通道或流式回退可用。 */
  readonly canGrepContent: boolean
  /** 支持符号链接（创建/读取目标/lstat）。 */
  readonly canSymlink: boolean
  /** 支持 chmod（可含递归）。 */
  readonly canChmod: boolean
  /** 支持 chown（uid/gid）。 */
  readonly canChown: boolean
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
  /** Unix mode bits when the backing filesystem exposes them. */
  mode?: number
  extension?: string
  /** 符号链接标记（链接自身，非目标）。 */
  isSymlink?: boolean
  /** 链接目标原始字符串（可能是相对路径）。 */
  symlinkTarget?: string
}

/**
 * 独立「简介」窗口在主、渲染进程之间传递的只读打开快照。
 * 窗口上下文仅存于主进程，并按创建它的 webContents 返回；不会出现在 URL 中。
 */
export interface FileInfoWindowContext {
  deviceId: string
  deviceType: DeviceConfig['type']
  deviceName: string
  files: FileInfo[]
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

// ============ Directory Stats (属性弹窗递归统计) ============

export interface DirectoryStatsRequest {
  sessionId: string          // 渲染端生成，每次弹窗实例一个；重开弹窗自动取消旧任务
  deviceId: string
  paths: string[]            // 可含 ZIP 虚拟路径（"<zipFilePath>::<innerPath>"）
}

export interface DirectoryStatsProgress {
  sessionId: string
  taskId: string
  status: 'scanning' | 'completed' | 'cancelled' | 'failed'
  fileCount: number          // 已扫到的文件数
  directoryCount: number     // 已扫到的目录数
  totalBytes: number         // 文件大小累计
  currentPath?: string
  message?: string           // failed 时的错误摘要
}

// ============ Media Info (属性弹窗多媒体元数据) ============

/** MediaInfoLib 提取结果的归一化摘要（数值字段已收敛为 number） */
export interface MediaInfoSummary {
  format?: string            // 容器格式（MPEG-4 / MPEG Audio / Matroska …）
  durationSeconds?: number
  overallBitrate?: number    // bps
  video?: {
    codec?: string           // AVC / HEVC / VP9 …
    width?: number
    height?: number
    frameRate?: number
    bitrate?: number         // bps
    bitDepth?: number
  }
  audio?: {
    codec?: string           // AAC / MPEG Audio / Opus …
    sampleRate?: number      // Hz
    channels?: number
    bitrate?: number         // bps
  }
}

// ============ File Operation Types ============

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename'
export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch' | 'batch-rename' | 'recycle' | 'restore' | 'archive' | 'image-convert'
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
  convert?: ImageConvertSpec
  /** archive 任务：输出格式（zip 流式 fflate / 7z 走捆绑 7zz，仅本地）。 */
  format?: 'zip' | '7z'
  /** 7z 加密口令（连同文件名加密 -mhe=on）。 */
  password?: string
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
  convert?: ImageConvertSpec
  format?: 'zip' | '7z'
  password?: string
}

// ============ Mobile Device Types ============

/** USB/网络发现的移动设备（android:serial / ohos:connectKey / ios:udid）。 */
export interface DetectedDevice {
  id: string
  type: 'android' | 'ohos' | 'ios'
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

// ============ Directory Watch (自动刷新) ============

/** 目录内容变化推送（watch:changed）。renderer 端做 diff 守卫后再决定刷新。 */
export interface WatchChangeEvent {
  deviceId: string
  dirPath: string
}

// ============ Open-With (LaunchServices 适用应用) ============

/** 「打开方式」候选应用（HostShellService.getOpenWithApps 产物，按目标文件查询）。 */
export interface OpenWithApp {
  id: string          // 稳定标识（.app 包绝对路径）
  name: string        // 展示名（bundle 目录名去掉 .app）
  bundlePath: string  // .app 包绝对路径
  isDefault?: boolean // 是否为该文件类型的系统默认应用（排序置顶）
}

// ============ Git Status (只读徽标, 仅本地) ============

/** 单条 git status 记录（porcelain v1 XY + 仓库根相对路径已转绝对路径）。 */
export interface GitStatusEntry {
  /** 绝对路径（repoRoot + 仓库根相对路径）。 */
  path: string
  /** 暂存区状态字母（X）。 */
  x: string
  /** 工作区状态字母（Y）。 */
  y: string
  /** 重命名来源（R 状态时为仓库根相对原路径）。 */
  renamedFrom?: string
}

/** 一个本地目录的 git 状态快照（只读）。 */
export interface GitDirectoryStatus {
  isRepo: boolean
  /** 仓库根绝对路径（isRepo 时必有，renderer 据此判定前缀归属）。 */
  repoRoot?: string
  branch?: string
  ahead?: number
  behind?: number
  entries: GitStatusEntry[]
}

// ============ Checksum (哈希校验) ============

export type ChecksumAlgo = 'md5' | 'sha1' | 'sha256'

export interface ChecksumItem {
  deviceId: string
  path: string
  name: string
  size: number
}

export interface ChecksumRequest {
  /** 渲染端生成；同 session 重开自动取消旧任务（弹窗快速重开）。 */
  sessionId: string
  algo: ChecksumAlgo
  /** 1 项 = 单文件哈希；2 项 = 逐字节对比（跨设备亦可）。 */
  items: ChecksumItem[]
}

export interface ChecksumProgress {
  sessionId: string
  taskId: string
  status: 'hashing' | 'completed' | 'cancelled' | 'failed'
  /** 当前正在哈希的项序号（0 基）。 */
  index: number
  total: number
  bytesProcessed: number
  totalBytes: number
  /** completed 时按 items 顺序给出的哈希结果。 */
  results?: Array<{ hex: string | null; error?: string }>
  /** 两项对比结论（completed 且两项都有 hex 时给出）。 */
  match?: boolean
  message?: string
}

// ============ Duplicate Finder (重复文件查找) ============

export interface DuplicateScanRequest {
  sessionId: string
  deviceId: string
  rootPath: string
  /** 小于该字节数的文件直接跳过（默认 1 = 只跳过空文件）。 */
  minSize?: number
}

export interface DuplicateGroupFile {
  path: string
  size: number
  modifiedTime: string
}

export interface DuplicateGroup {
  /** 分组键（全量哈希 hex）。 */
  hash: string
  size: number
  files: DuplicateGroupFile[]
}

export interface DuplicateScanProgress {
  sessionId: string
  taskId: string
  status: 'scanning' | 'partial-hashing' | 'full-hashing' | 'completed' | 'cancelled' | 'failed'
  fileCount: number
  /** 尚在候选（同尺寸组内）的文件数。 */
  candidateCount: number
  groupCount: number
  currentPath?: string
  /** 仅 completed 终态事件携带（≤5000 组 + truncated 标志）。 */
  groups?: DuplicateGroup[]
  truncated?: boolean
  message?: string
}

// ============ Grep (内容搜索) ============

export interface GrepRequest {
  sessionId: string
  deviceId: string
  rootPath: string
  pattern: string
  isRegex?: boolean
  caseSensitive?: boolean
  /** 仅搜索匹配这些 glob 的文件（如 "*.ts"）。 */
  includeGlob?: string
  /** 排除匹配这些 glob 的文件（如 "*.log"）。 */
  excludeGlob?: string
  /** 结果上限（默认 10000，超出置 truncated）。 */
  maxResults?: number
}

export interface GrepMatch {
  /** 绝对路径（远程为该设备的路径形态）。 */
  path: string
  line: number
  column?: number
  /** 命中行文本（截断至 ~400 字符）。 */
  lineText: string
  matchStart?: number
  matchEnd?: number
}

export interface GrepProgress {
  sessionId: string
  taskId: string
  status: 'searching' | 'completed' | 'cancelled' | 'failed'
  matchCount: number
  currentPath?: string
  /** 批量命中的增量集合（流式分批推送）。 */
  matches: GrepMatch[]
  truncated?: boolean
  message?: string
}

// ============ Space Analysis (目录空间分析 treemap) ============

export interface SpaceEntry {
  name: string
  path: string
  size: number
  fileCount: number
  directoryCount: number
}

export interface SpaceAnalysisRequest {
  sessionId: string
  deviceId: string
  rootPath: string
}

export interface SpaceAnalysisProgress {
  sessionId: string
  taskId: string
  status: 'scanning' | 'completed' | 'cancelled' | 'failed'
  fileCount: number
  directoryCount: number
  totalBytes: number
  currentPath?: string
  /** 仅 completed 终态事件携带（顶层条目 + 总量）。 */
  entries?: SpaceEntry[]
  message?: string
}

// ============ Read Chunk (hex 预览等分块读取) ============

export interface ReadChunkResult {
  /** 本块 base64（实际读取字节数 = base64 解码长度）。 */
  base64: string
  bytesRead: number
  fileSize: number
}

// ============ Hex Save（hex 编辑保存：编辑日志净效果片段） ============
// 传输量 ∝ 编辑量（非文件大小）；main 端按序流式生成临时文件后原子
// rename 覆盖源文件（P0 仅本机设备）。

/** 保存片段：base = 复制源文件区间；edit = 写入编辑字节（base64）。 */
export type HexSavePiece =
  | { kind: 'base'; start: number; length: number }
  | { kind: 'edit'; base64: string }

export interface SaveHexFileResult {
  /** 新文件总字节数（= 保存时逻辑文档大小）。 */
  bytesWritten: number
}

// ============ Image Edit（图片预览编辑：裁剪/压缩/批量） ============
// 值对象组（ROLE-D01）+ 批量进度事件（ROLE-D02）。
// 仅 local 设备；处理在主进程 ImageEditService（sharp，SIPS 格式先经
// ImageDecodeService 解码）。坐标约定见 EditCrop。

/** 源图像素坐标系下的裁剪矩形（相对 referenceWidth 空间，服务端等比换算）。 */
export interface EditCrop {
  x: number
  y: number
  width: number
  height: number
  /**
   * rect 所处坐标空间的图像宽度 = 用户在预览中看到的 naturalWidth。
   * 服务端解码后的实际宽度可能不同（SIPS 上限 8192），按
   * decodedWidth / referenceWidth 等比缩放 rect，保证裁的是用户看到的同一区域。
   */
  referenceWidth: number
}

/** 压缩参数。quality 仅对有损格式（jpeg/webp）生效；png 无损重编码忽略。 */
export interface EditCompressParams {
  /** 1-100 */
  quality: number
  /** 最长边上限（px）；仅缩小不放大；不限制传 undefined */
  maxEdge?: number
  /** 输出格式：keep=保持输入（SIPS 输入映射为 jpeg） */
  format: 'keep' | 'jpeg' | 'webp' | 'png'
}

/** 保存策略：覆盖原图（temp+rename 原子替换）或另存副本（冲突自动 -1 递增）。 */
export interface EditSaveSpec {
  mode: 'overwrite' | 'copy'
  /** copy 模式文件名后缀（默认 _edited）；与 name 二选一，name 优先 */
  suffix?: string
  /**
   * copy 模式完整文件名（不含扩展名）——保存 Sheet「存储为」输入。
   * 不含路径分隔符；设置后忽略 suffix。
   */
  name?: string
  /** copy 模式输出目录（绝对路径）；缺省 = 原图所在目录 */
  dir?: string
  /** 输出格式覆盖（与 CompressParams.format 二选一生效处：以此为准，缺省用 params） */
  format?: 'jpeg' | 'webp' | 'png'
}

/** 标注层（透明 PNG，与原图等比）；坐标空间宽 = referenceWidth（与 EditCrop 同机制）。 */
export interface EditAnnotate {
  /** base64 PNG（无 data: 前缀），高度按图像纵横比生成 */
  overlayBase64: string
  referenceWidth: number
}

export interface EditOps {
  crop?: EditCrop
  compress?: EditCompressParams
  /** 标注烘焙；与 crop 互斥（UI 保证不同时发送，service 端防御） */
  annotate?: EditAnnotate
}

export interface EditEstimateResult {
  estimatedBytes: number
  format: 'jpeg' | 'webp' | 'png'
  width: number
  height: number
}

export interface EditApplyResult {
  writtenPath: string
  bytes: number
}

export interface ImageEditItemResult {
  sourcePath: string
  targetPath?: string
  status: 'success' | 'failed' | 'skipped'
  error?: string
}

/** 批量执行事实事件（领域事件）：进度节流 100ms，终态必发。 */
export interface ImageEditBatchProgress {
  taskId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  index: number
  total: number
  currentFile: string
  itemResults: ImageEditItemResult[]
}

export interface ImageEditBatchRequest {
  items: string[]
  ops: EditOps
  save: EditSaveSpec
}

/**
 * 图片批量转换任务参数（image-convert 任务；引擎 = ImageEditService.apply 的
 * compress 通道，含 SIPS heic 解码与原子写）。仅本地设备。
 */
export interface ImageConvertSpec {
  format: 'jpeg' | 'png' | 'webp'
  /** 1-100；png 无损忽略（缺省 85，与编辑器一致） */
  quality?: number
  /** 最长边上限 px（仅缩小不放大；缺省不缩放） */
  maxEdge?: number
  mode: 'copy' | 'overwrite'
  /** copy 模式输出目录（绝对路径；缺省 = 原图所在目录） */
  dir?: string
  /** copy 模式文件名后缀 */
  suffix?: string
}

/** macOS 扩展属性条目（「显示简介 ▸ 扩展属性」；仅本机设备）。 */
export interface XattrEntry {
  name: string
  /** 值的字节数（十六进制转储计得） */
  sizeBytes: number
  /** 可打印文本预览（二进制值无此字段） */
  textPreview?: string
  /** com.apple.quarantine —— 隔离标记，UI 高亮 + 专用移除入口 */
  isQuarantine: boolean
}

// ── 系统剪贴板内容（「从剪贴板新建文件」） ──────────────────────────────────

/** 系统剪贴板可保存内容的判定结果；files 优先于 image 优先于 text（防 Finder 复制误判）。 */
export type ClipboardContentKind = 'text' | 'image' | 'files' | 'none'

/**
 * 轻量探测结果（只含元数据与预览片段，永不含全量数据）：
 * 渲染层菜单可见性/预览的依据；writeFile 前须另调 readClipboardData 取全量。
 */
export interface ClipboardProbe {
  kind: ClipboardContentKind
  /** kind='files' 时的文件引用数。 */
  fileCount?: number
  /** 内容字节数（text 按 UTF-8，image 按 PNG 重编码）。 */
  byteSize?: number
  /** kind='text'：前 200 字符预览。 */
  previewText?: string
  /** kind='text'：预览是否截断自更长文本。 */
  truncated?: boolean
  /** kind='image'：320px 宽缩略图的 data:image/png;base64 URL。 */
  previewDataUrl?: string
  /** kind='image'：原图像素尺寸（新建对话框元信息行用，非缩略图尺寸）。 */
  imageWidth?: number
  imageHeight?: number
  /** 超限（text >10MB / image >20MB）：菜单项 disabled 的依据。 */
  tooLarge?: boolean
}

/** 写入瞬间的全量读取结果；判定顺序与 probe 一致，内容已变（或超限）返回 none。 */
export type ClipboardData =
  | { kind: 'text'; text: string }
  | { kind: 'image'; base64: string }
  | { kind: 'none' }
