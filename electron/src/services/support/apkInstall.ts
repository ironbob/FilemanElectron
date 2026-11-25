/**
 * APK 安装的纯函数（无 electron / adbkit / apkreader / i18n 依赖，便于
 * node 直接测试；进程与 adb 编排见 ApkInstallService）。
 *
 *  - 远端临时路径带随机串：adbkit 自带 install() 固定写
 *    /data/local/tmp/<basename>，并发同名互相覆盖。
 *  - 失败码只映射到 i18n 键名，文案由服务层按当前语言 t(key)。
 */
import { shellQuote } from '../../adapters/shellQuote'

export type PmInstallResult =
  | { ok: true }
  | { ok: false; code: string; detail?: string }

/** 推送到设备的临时路径（/data/local/tmp 对 shell 用户可写，安装后一律删除）。 */
export function remoteTempPath(randomPart: string): string {
  return `/data/local/tmp/fileman-${randomPart}.apk`
}

/**
 * 设备内拷贝。手机上的 APK（/sdcard 等 FUSE 存储）不能直接 pm install：
 * Android 11+ 的 system_server 无权读取 FUSE 文件（avc: denied），须先落到
 * /data/local/tmp，再走与本机推送相同的安装链路。
 */
export function copyOnDeviceCommand(sourcePath: string, targetPath: string): string {
  return `cp ${shellQuote(sourcePath)} ${shellQuote(targetPath)}`
}

/**
 * 设备端安装命令：`-r` 覆盖旧版并保留数据，`-t` 允许 testOnly 包（PRD R2）。
 * 以字符串下发并经 POSIX 单引号转义——手机上的 APK 路径含空格 / 引号也不会被拆词。
 */
export function pmInstallCommand(pathOnDevice: string): string {
  return `pm install -r -t ${shellQuote(pathOnDevice)}`
}

// 真机的失败行可能是 `Failure [CODE]`，也可能带说明：`Failure [CODE: detail…]`
const FAILURE_RE = /Failure\s+\[([A-Za-z0-9_]+)\s*(?::\s*([\s\S]*?))?\]/

/**
 * 解析 `pm install` 输出：`Success` 成功；`Failure [CODE]` / `Failure [CODE: 说明]`
 * 取方括号里的码（说明放入 detail）；包管理器直接抛异常（无 Failure 行）时，
 * 无法解析的 APK 归为解析失败，其余取首条有信息量的行（跳过「Exception occurred…」
 * 标题与堆栈）作为码，让未知失败至少带上设备原话。
 */
export function parsePmInstallOutput(text: string): PmInstallResult {
  const out = String(text)
  if (/^\s*Success\s*$/m.test(out)) return { ok: true }
  const failure = FAILURE_RE.exec(out)
  if (failure) {
    const detail = failure[2]?.trim()
    return detail ? { ok: false, code: failure[1], detail } : { ok: false, code: failure[1] }
  }
  if (/Failed to parse APK file/.test(out)) return { ok: false, code: 'INSTALL_PARSE_FAILED_EXCEPTION' }
  const firstLine = out
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l && !/^Exception occurred while executing/.test(l) && !/^\s*at\s/.test(l))
  if (firstLine) return { ok: false, code: firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine }
  return { ok: false, code: 'UNKNOWN' }
}

export interface InstallFailureMessage {
  key: string
  params?: Record<string, string>
}

const FAILURE_KEYS: Record<string, string> = {
  INSTALL_FAILED_UPDATE_INCOMPATIBLE: 'errors.main.apkInstallSignatureMismatch',
  INSTALL_FAILED_VERSION_DOWNGRADE: 'errors.main.apkInstallDowngrade',
  INSTALL_FAILED_INSUFFICIENT_STORAGE: 'errors.main.apkInstallStorage',
  INSTALL_FAILED_NO_MATCHING_ABIS: 'errors.main.apkInstallAbi',
  INSTALL_FAILED_OLDER_SDK: 'errors.main.apkInstallOlderSdk',
  INSTALL_FAILED_MIN_SDK: 'errors.main.apkInstallNewerSdk',
  INSTALL_FAILED_NEWER_SDK: 'errors.main.apkInstallNewerSdk',
  INSTALL_FAILED_INVALID_APK: 'errors.main.apkInstallInvalid',
  INSTALL_FAILED_TEST_ONLY: 'errors.main.apkInstallTestOnly'
}

/** 失败码 → i18n 键（常见码有专属文案与建议，未知码原样附带）。 */
export function installFailureKey(code: string): InstallFailureMessage {
  const key = FAILURE_KEYS[code]
  if (key) return { key }
  if (code.startsWith('INSTALL_PARSE_FAILED')) return { key: 'errors.main.apkInstallInvalid' }
  return { key: 'errors.main.apkInstallFailed', params: { code } }
}

/** 可安装目标 = adb 设备列表里 device / unauthorized 两类（offline 等不进列表）。 */
export function pickInstallTargets(devices: Array<{ id: string; type: string }>): string[] {
  return devices.filter(d => d.type === 'device' || d.type === 'unauthorized').map(d => d.id)
}
