/**
 * Path utilities for converting between internal format (deviceId + path)
 * and URI format for display
 *
 * URI Format: device://<deviceId>/<path>
 * Examples:
 *   device://local/Users/wtb/Documents
 *   device://android-abc123/sdcard/DCIM
 *   device://smb-nas-01/backup/data
 */

import { t } from '@/i18n'
import { isZipVirtualPath, zipVirtualParent } from '@shared/zipPath'

/**
 * Convert deviceId + path to URI format for display
 */
export function toURI(deviceId: string, path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path
  return `device://${deviceId}${normalizedPath}`
}

/**
 * Parse URI to extract deviceId and path
 */
export function fromURI(uri: string): { deviceId: string; path: string } | null {
  const match = uri.match(/^device:\/\/([^/]+)(\/.*)?$/)
  if (!match) {
    return null
  }

  return {
    deviceId: match[1],
    path: match[2] || '/'
  }
}

/**
 * Check if a string is a valid device URI
 */
export function isDeviceURI(uri: string): boolean {
  return /^device:\/\/[^/]+(\/.*)?$/.test(uri)
}

/**
 * Get device type from deviceId
 * DeviceId format: <type>-<uniqueId> or just <type> for local
 */
export function getDeviceTypeFromId(deviceId: string): string {
  if (deviceId === 'local') {
    return 'local'
  }

  // Extract type from deviceId (e.g., "smb-nas-01" -> "smb")
  const parts = deviceId.split('-')
  return parts[0] || 'unknown'
}

/**
 * Get display name for a device path
 * Returns a human-readable path like "NAS > backup > data"
 */
export function getDisplayPath(deviceName: string, path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) {
    return deviceName
  }
  return `${deviceName} > ${parts.join(' > ')}`
}

/**
 * Get a short display name for breadcrumb
 */
export function getBreadcrumbName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : '/'
}

/**
 * Join path segments safely
 */
export function joinPath(...segments: string[]): string {
  const parts: string[] = []

  for (const segment of segments) {
    if (!segment) continue

    const normalized = segment.split('/').filter(Boolean)
    parts.push(...normalized)
  }

  return '/' + parts.join('/')
}

/**
 * Get parent directory path
 */
export function getParentPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) {
    return '/'
  }
  parts.pop()
  return parts.length === 0 ? '/' : '/' + parts.join('/')
}

/**
 * 面板路径的「上一级」（goUp 语义，ZIP 虚拟路径感知）：
 * - 普通路径 → getParentPath（'/' 自身兜底 '/'，终止条件 paneParentPath(p) === p）
 * - ZIP 虚拟路径（"<zip>::<inner>"）→ zipVirtualParent（inner 非根去末段，
 *   已在 ZIP 根则退到 ZIP 文件所在的文件系统父目录）
 */
export function paneParentPath(p: string): string {
  return isZipVirtualPath(p) ? zipVirtualParent(p) : getParentPath(p)
}

/**
 * Get file/directory name from path
 */
export function getBaseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : '/'
}

/**
 * Get file extension from path
 */
export function getExtension(path: string): string {
  const name = getBaseName(path)
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0 ? name.substring(dotIndex).toLowerCase() : ''
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

/**
 * Compute the POSIX relative path from a directory to a target
 * (e.g. toRelativePath('/a/b', '/a/b/c/d.txt') === 'c/d.txt';
 *       toRelativePath('/a/b', '/a/x.txt')        === '../x.txt').
 *
 * 写脚本/配置引用另一面板文件时极常用。仅做词法分段计算，不触碰文件系统，
 * 也不解析符号链接（与 readlink -m 的词法语义一致）。
 */
export function toRelativePath(fromDir: string, targetPath: string): string {
  const fromParts = fromDir.split('/').filter(Boolean)
  const targetParts = targetPath.split('/').filter(Boolean)

  // 公共前缀
  let common = 0
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common++
  }

  const upSegments = fromParts.length - common
  const downSegments = targetParts.slice(common)
  const relative = [...Array(upSegments).fill('..'), ...downSegments]
  return relative.length > 0 ? relative.join('/') : '.'
}

/**
 * Encode a POSIX absolute path as a file:// URI（空格等保留字符百分号转义）。
 */
export function toFileUri(posixPath: string): string {
  return 'file://' + posixPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

/**
 * Device type icons mapping (for UI)
 */
export const deviceTypeIcons: Record<string, string> = {
  local: '💻',
  android: '📱',
  smb: '🗄️',
  ssh: '🔐',
  ios: '📱'
}

/**
 * 设备类型显示名（按当前界面语言解析；调用点包在 computed/函数内保持响应式）。
 */
export function deviceTypeName(type: string): string {
  switch (type) {
    case 'local': return t('devices.type.local')
    case 'android': return t('devices.type.android')
    case 'ohos': return t('devices.type.ohos')
    case 'smb': return t('devices.type.smb')
    case 'ssh': return t('devices.type.ssh')
    case 'webdav': return t('devices.type.webdav')
    case 'ios': return t('devices.type.ios')
    default: return type
  }
}
