/**
 * Device Capabilities
 * Describes what operations a device adapter supports
 */

// 接口正典声明在 @shared/types（跨进程单一事实源），此处 re-export 兼容
// 既有 `from './capabilities'` 引用。
export type { DeviceCapabilities } from '@shared/types'
import type { DeviceCapabilities } from '@shared/types'

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
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // 捆绑 ripgrep / $PATH rg
  canSymlink: true,     // fs.symlink/readlink/lstat
  canChmod: true,       // fs.chmod（+ 递归遍历）
  canChown: true,       // fs.chown
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
  canStream: true,      // @marsaud/smb2 createReadStream/createWriteStream
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // 流式逐行扫描回退（无 exec 通道）
  canSymlink: false,    // SMB 协议无 symlink 语义
  canChmod: false,
  canChown: false,
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
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // client.exec 远端 grep
  canSymlink: true,     // sftp symlink/readlink/lstat
  canChmod: true,       // sftp chmod / exec chmod -R
  canChown: true,       // sftp chown
}

export const WEBDAV_CAPABILITIES: DeviceCapabilities = {
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
  canStream: true,
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // 流式逐行扫描回退（无 exec 通道）
  canSymlink: false,    // SMB 协议无 symlink 语义
  canChmod: false,
  canChown: false,
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
  canCaptureScreenshot: true,
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // adb shell 远端 grep (toybox)
  canSymlink: false,    // adb shell ln -s 权限受限，v1 不开
  canChmod: true,       // adb shell chmod（runShell）
  canChown: false,
  // Some Android directories are read-only without root
  readonlyPaths: ['/system', '/vendor', '/product', '/data/app'],
}

export const OHOS_CAPABILITIES: DeviceCapabilities = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,        // Via shell cp -r
  canMove: true,        // Via shell mv
  canSearch: true,      // Via find -name
  canCopyFrom: true,    // hdc file recv
  canCopyTo: true,      // hdc file send
  canMoveFrom: true,    // recv + delete
  canMoveTo: true,      // send + delete source
  canStream: false,     // hdc file recv/send 无流式 → buffer fallback(iOS 同姿态)
  canCaptureScreenshot: true,  // hdc shell snapshot_display + file recv
  canArchive: true,
  canRecycle: true,
  canGrepContent: true, // hdc shell 远端 grep (toybox)
  canSymlink: false,    // hdc shell ln -s 权限受限，v1 不开
  canChmod: true,       // hdc shell chmod
  canChown: false,
  readonlyPaths: ['/system', '/vendor'],
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
  canCaptureScreenshot: true,  // idevicescreenshot (libimobiledevice CLI)
  canArchive: true,
  canRecycle: true,
  canGrepContent: false, // AFC 无 exec 通道且无流式（buffer 上限 32MB）
  canSymlink: false,
  canChmod: false,
  canChown: false,
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

/**
 * 未连接远程设备的能力兜底（此前内联在 DeviceManager.getCapabilities 里，
 * 与能力声明分居两处）。允许 UI 在连接前展示能力；连接后由具体适配器的
 * capability 覆盖。行为与原内联版本逐字段一致（canStream 恒 false）。
 */
export function DEFAULT_REMOTE_CAPABILITIES(deviceType: 'android' | 'ohos' | 'smb' | 'ssh' | 'webdav' | 'ios'): DeviceCapabilities {
  return {
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
    canStream: false, // 连接后由具体适配器的 capability 覆盖
    canCaptureScreenshot: deviceType === 'android' || deviceType === 'ohos' || deviceType === 'ios',
    canArchive: true,
    canRecycle: true,
    canGrepContent: deviceType !== 'ios', // 连接后由具体适配器覆盖
    canSymlink: deviceType === 'ssh',     // 连接后由具体适配器覆盖
    canChmod: deviceType === 'ssh' || deviceType === 'android' || deviceType === 'ohos',
    canChown: deviceType === 'ssh',
  }
}
