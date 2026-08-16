import type { FileInfo } from './index'
import { resolveFileKind, type FilePreviewKind } from '@shared/fileKinds'

/**
 * 打开方式的唯一决策点是 resolveFileKind（shared/fileKinds.ts 注册表）。
 * 本文件只保留预览会话类型与 MIME 工具，不再自带扩展名清单。
 */
export type PreviewType = FilePreviewKind | 'unknown'

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

/**
 * 扩展名/文件名 → 打开方式（单一注册表，见 shared/fileKinds.ts）。
 * 返回 'unknown' 时由 preview store 的内容嗅探（sniffPreviewKind）异步细化，
 * 终态兜底 hex——"Cannot preview this file type" 不再是稳态。
 */
export function getPreviewType(file: FileInfo): PreviewType {
  if (file.isDirectory) return 'unknown'
  return resolveFileKind(file.name, file.extension ?? '') ?? 'unknown'
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
