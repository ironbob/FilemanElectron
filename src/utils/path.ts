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
 * Device type display names
 */
export const deviceTypeNames: Record<string, string> = {
  local: 'Local',
  android: 'Android',
  smb: 'SMB Share',
  ssh: 'SSH/SFTP',
  ios: 'iOS'
}
