/**
 * Device Capabilities
 * Describes what operations a device adapter supports
 */

export interface DeviceCapabilities {
  // Basic file operations
  readonly canRead: boolean          // Can read file content
  readonly canWrite: boolean         // Can write/create files
  readonly canDelete: boolean        // Can delete files
  readonly canRename: boolean        // Can rename files
  readonly canMkdir: boolean         // Can create directories
  readonly canList: boolean          // Can list directory contents
  readonly canStat: boolean          // Can get file stats

  // Advanced operations
  readonly canCopy: boolean          // Can copy files within same device
  readonly canMove: boolean          // Can move files within same device
  readonly canSearch: boolean        // Can search for files

  // Cross-device operations
  readonly canCopyFrom: boolean      // Can be source for cross-device copy
  readonly canCopyTo: boolean        // Can be target for cross-device copy
  readonly canMoveFrom: boolean      // Can be source for cross-device move
  readonly canMoveTo: boolean        // Can be target for cross-device move

  // Streaming (large-file transfer without full buffering)
  readonly canStream: boolean        // Supports openReadStream/openWriteStream

  // Limitations
  readonly maxFileSize?: number      // Maximum file size in bytes (undefined = unlimited)
  readonly readonlyPaths?: string[]  // Paths that are read-only
  readonly hiddenPaths?: string[]    // Paths that should be hidden
}

// Predefined capability sets for common device types

export const LOCAL_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  canMove: true,
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true,
  canStream: true,      // fs.createReadStream/WriteStream
}

export const SMB_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,        // SMB can copy within share
  canMove: true,        // SMB can move within share
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true,
  canStream: false,     // @aozp/smb2 stream support TBD → buffer fallback
}

export const SSH_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,        // SSH can copy via read/write
  canMove: true,        // SSH supports rename
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true,
  canStream: true,      // ssh2 sftp createReadStream/WriteStream
}

export const ANDROID_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,        // Via shell cp command
  canMove: true,        // Via shell mv command
  canSearch: true,      // Via find command
  canCopyFrom: true,    // Can pull files
  canCopyTo: true,      // Can push files
  canMoveFrom: true,    // Pull + delete
  canMoveTo: true,      // Push + delete source
  canStream: true,      // adbkit pull/push transfer streams
  // Some Android directories are read-only without root
  readonlyPaths: ['/system', '/vendor', '/product', '/data/app'],
}

export const IOS_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: false,       // Limited by sandbox
  canMove: false,       // Limited by sandbox
  canSearch: false,     // Not supported via AFC
  canCopyFrom: true,    // Can pull from camera roll / files
  canCopyTo: true,      // Can push to specific locations
  canMoveFrom: true,    // Pull + delete
  canMoveTo: true,      // Push + delete source
  canStream: false,     // AFC has no usable stream CLI → buffer fallback
  // AFC itself is the sandbox boundary. Do not mark `/` read-only here: doing
  // so makes every write/delete action unavailable in the UI even when AFC
  // grants access to a writable container. Unsupported paths are rejected by
  // the device and surfaced with context by iOSAdapter.
  maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB typical limit for app sandbox
}

/**
 * Helper to check if a device supports a specific operation
 */
export function hasCapability(capabilities: DeviceCapabilities, capability: keyof DeviceCapabilities): boolean {
  const value = capabilities[capability]
  return typeof value === 'boolean' ? value : false
}

/**
 * Check if cross-device copy is possible between two devices
 */
export function canCopyBetween(source: DeviceCapabilities, target: DeviceCapabilities): boolean {
  return source.canCopyFrom && target.canCopyTo
}

/**
 * Check if cross-device move is possible between two devices
 */
export function canMoveBetween(source: DeviceCapabilities, target: DeviceCapabilities): boolean {
  return source.canMoveFrom && target.canMoveTo
}

/**
 * Check if a path is read-only for a device
 */
export function isPathReadOnly(capabilities: DeviceCapabilities, path: string): boolean {
  if (!capabilities.readonlyPaths) return false
  return capabilities.readonlyPaths.some(readonlyPath =>
    path === readonlyPath || path.startsWith(readonlyPath + '/')
  )
}
