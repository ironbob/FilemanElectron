import type { FileInfo } from './index'
import { isImageFile } from '@/utils/fileTypes'

export type PreviewType = 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'hex' | 'unknown'

// Text preview types
export type TextRenderMode = 'source' | 'rendered'
export type TextFileType = 'markdown' | 'json' | 'xml' | 'html' | 'code' | 'plaintext'
export type ImageFitMode = 'contain' | 'cover' | 'actual'

/** Max bytes for an in-app image preview (enforced by the preview store + image browser). */
export const IMAGE_PREVIEW_SIZE_LIMIT = 50 * 1024 * 1024

/**
 * 预览 tab 的会话数据（挂在主 Tab.preview 上，见 types/index.ts）。
 * 仅保存身份信息：内容由各 Preview*Content 组件自行按需加载。
 */
export interface PreviewTab {
  id: string
  file: FileInfo
  deviceId: string
  type: PreviewType
  /** 初始定位行号（grep 命中跳入预览用；1 基）。 */
  initialLine?: number
  /** 强制内容类型（右键「以十六进制查看」等显式入口用，覆盖扩展名推断）。 */
  forceType?: PreviewType
  /** 图片集合（文件夹右键预览）：当前 file 始终等于 files[index]，步进只换 index。 */
  files?: FileInfo[]
  index?: number
  /** 集合去重键：`${deviceId}:${folderPath}:${'flat'|'recursive'}`；重复打开复用 tab。 */
  collectionKey?: string
}

/**
 * Space-Quick-Look session（Finder Quick Look 等价物）：单文件瞬态预览，
 * 不进 preview tab 系统。files 是打开瞬间按可见顺序排列的快照，
 * ↑↓ 只换 index（clamp 不循环），关闭后选中停留在最后浏览项。
 */
export interface QuickLookSession {
  paneId: string
  deviceId: string
  files: FileInfo[]
  index: number
}

export interface MediaMetadata {
  duration?: number
  width?: number
  height?: number
  bitrate?: number
  codec?: string
  sampleRate?: number
  channels?: number
  fileSize: number
  fileName: string
}

export function getPreviewType(file: FileInfo): PreviewType {
  if (file.isDirectory) return 'unknown'

  const ext = file.extension?.toLowerCase().replace('.', '') || ''

  const videoExts = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'rmvb', '3gp', 'ts', 'mts', 'm2ts'])
  const audioExts = new Set(['mp3', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'alac', 'ape', 'aiff', 'amr', 'wav', 'opus'])
  const textExts = new Set([
    'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'log', 'csv',
    'js', 'jsx', 'ts', 'tsx', 'vue', 'html', 'htm', 'css', 'scss', 'sass',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'sql', 'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'lua',
    'ini', 'conf', 'cfg', 'toml', 'env', 'gitignore', 'dockerfile',
    'm', 'mm', 'pl', 'pm', 'asm', 's', 'dart', 'fs', 'hs', 'ml', 'erl'
  ])

  const zipExts = new Set(['zip', 'jar', 'war', 'ear', 'apk', 'ipa', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'cbz'])

  // 显式 opt-in 的二进制扩展名 → hex 视图（unknown 兜底不变，避免误重分类）
  const hexExts = new Set(['bin', 'iso', 'img', 'dylib', 'so', 'exe', 'dll', 'dat', 'o', 'a', 'class', 'wasm'])

  if (isImageFile(ext)) return 'image'
  if (videoExts.has(ext)) return 'video'
  if (audioExts.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (zipExts.has(ext)) return 'zip'
  if (hexExts.has(ext)) return 'hex'
  if (textExts.has(ext)) return 'text'

  return 'unknown'
}

export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    // Videos
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.3gp': 'video/3gpp',
    '.ts': 'video/mp2t',
    // Audio
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.wma': 'audio/x-ms-wma',
    '.opus': 'audio/opus',
    // Documents
    '.pdf': 'application/pdf',
  }
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
}

export function getTextFileType(ext: string): TextFileType {
  const normalizedExt = ext.toLowerCase().replace('.', '')

  if (['md', 'markdown'].includes(normalizedExt)) return 'markdown'
  if (normalizedExt === 'json') return 'json'
  if (normalizedExt === 'xml') return 'xml'
  if (['html', 'htm'].includes(normalizedExt)) return 'html'

  const codeExts = new Set([
    'js', 'jsx', 'ts', 'tsx', 'vue', 'css', 'scss', 'sass',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'sql', 'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'lua',
    'm', 'mm', 'pl', 'pm', 'asm', 's', 'dart', 'fs', 'hs', 'ml', 'erl',
    'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'dockerfile'
  ])
  if (codeExts.has(normalizedExt)) return 'code'

  return 'plaintext'
}

export function canRenderTextFile(ext: string): boolean {
  const fileType = getTextFileType(ext)
  return ['markdown', 'json', 'xml', 'html'].includes(fileType)
}

export function getLanguageFromExtension(ext: string): string {
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'vue': 'vue',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'markdown': 'markdown',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'sql': 'sql',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'scala': 'scala',
    'lua': 'lua',
    'm': 'objective-c',
    'mm': 'objective-cpp',
    'pl': 'perl',
    'pm': 'perl',
    'asm': 'assembly',
    's': 'assembly',
    'dart': 'dart',
    'fs': 'fsharp',
    'hs': 'haskell',
    'ml': 'ocaml',
    'erl': 'erlang',
    'toml': 'ini',
    'ini': 'ini',
    'conf': 'ini',
    'cfg': 'ini',
    'env': 'plaintext',
    'gitignore': 'plaintext',
    'dockerfile': 'dockerfile',
    'log': 'plaintext',
    'txt': 'plaintext',
    'csv': 'plaintext',
  }
  return langMap[ext.toLowerCase().replace('.', '')] || 'plaintext'
}
