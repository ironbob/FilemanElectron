/**
 * OHOS(hdc) 输出解析（纯函数，可单测）。
 *
 * 与 AndroidAdapter 的差异：hdc 无对应 adbkit 的 SDK，全部能力走 CLI；
 * 元数据用 toybox `stat -c '%n|%F|%s|%Y|%a'` 批量获取 —— 每行**自带文件名(%n)**，
 * 因此批量 stat 中个别路径失败只是缺行，不会造成输出与入参的错位。
 */

/** `hdc list targets` 输出中的方括号状态行（如 `[Empty]`、`[I] No device...`）。 */
const HDC_INFO_LINE = /^\[[^\]]*\]/

export interface OhosStatEntry {
  /** stat 自报的路径(%n)，即调用方传入的路径形态。 */
  name: string
  kind: 'directory' | 'file' | 'symlink' | 'other'
  size: number
  /** %Y 是 epoch 秒；这里统一成毫秒，与 FileInfo.modifiedTime 消费方一致。 */
  mtimeMs: number
  /** %a 八进制字符串 → 数值 mode bits（如 '644' → 0o644 = 420）。 */
  mode: number
}

/**
 * 解析 `hdc list targets` stdout 为 connect key 列表。
 * 输出形态：首行可能是表头/信息行；无设备时输出 `[Empty]`；
 * USB key 形如 `SERIAL`，网络目标形如 `127.0.0.1:5555`。
 */
export function parseHdcListTargets(stdout: string): string[] {
  const keys: string[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    // 方括号行是 hdc 自身状态输出（[Empty]/[I].../中文提示），不是设备 key
    if (HDC_INFO_LINE.test(line)) continue
    keys.push(line)
  }
  return keys
}

/**
 * 解析批量 `stat -c '%n|%F|%s|%Y|%a'` 的 stdout。
 * 每行自报文件名，行序无关紧要；不可解析的行返回 null（调用方跳过）。
 * 注意：stat 的 %n 原样回显传入路径 —— 含 `|` 的病态文件名会被误切，
 * OHOS 场景下按可接受风险处理（与 adb 方案的同级取舍）。
 */
export function parseStatLines(stdout: string): Array<OhosStatEntry | null> {
  const results: Array<OhosStatEntry | null> = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue
    results.push(parseStatLine(line))
  }
  return results
}

/** 解析单行 `name|kind|size|mtime|mode`；不合法返回 null。 */
function parseStatLine(line: string): OhosStatEntry | null {
  // 从右侧切分：size/mtime/mode 是无 `|` 的数字，name 与 kind 可能含空格。
  // name 不 trim —— 首尾带空格的文件名合法,trim 会与 ls -A 的名字错位。
  const match = line.match(/^(.*)\|([^|]+)\|(\d+)\|(\d+)\|(\d+)$/)
  if (!match) return null
  const [, name, kindRaw, sizeStr, mtimeStr, modeStr] = match
  if (!name) return null
  const kindText = (kindRaw ?? '').trim().toLowerCase()
  // %F 取值：directory / regular file / symbolic link / character special ...
  let kind: OhosStatEntry['kind'] = 'other'
  if (kindText === 'directory') kind = 'directory'
  else if (kindText === 'regular file' || kindText === 'regular empty file') kind = 'file'
  else if (kindText.includes('symbolic link') || kindText === 'link') kind = 'symlink'
  const size = parseInt(sizeStr!, 10)
  const mtimeMs = parseInt(mtimeStr!, 10) * 1000
  const mode = parseInt(modeStr!, 8)
  if (!Number.isFinite(size) || !Number.isFinite(mtimeMs) || !Number.isFinite(mode)) return null
  return { name, kind, size, mtimeMs, mode }
}
