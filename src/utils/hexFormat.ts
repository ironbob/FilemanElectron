/**
 * Hex 视图行格式化（纯函数，可单测）。
 * 每行字节数可参数化（默认 16，视图层按宽度自适应 8/16/24/32）：
 * 8 位十六进制偏移 + N 组两位 hex + ASCII 列；每 8 字节为一视觉组。
 */

export const BYTES_PER_ROW = 16

/** 行偏移 → 8 位十六进制（hexdump 惯例）。 */
export function formatOffset(offset: number): string {
  return offset.toString(16).padStart(8, '0')
}

/** 单字节 → 两位十六进制。 */
export function formatByte(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

/** 可打印 ASCII（0x20-0x7E）显示原字符，其余显示 `.`。 */
export function asciiChar(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

export interface HexRow {
  /** 行首字节偏移。 */
  offset: number
  /** 十六进制列（长度 = 本行字节数，补齐在渲染层做）。 */
  hex: string[]
  /** ASCII 列（与 hex 等长）。 */
  ascii: string
}

/** 把一段字节切为 hex 行（不足每行字节数的尾行原样）。 */
export function bytesToHexRows(bytes: Uint8Array, startOffset = 0, bytesPerRow = BYTES_PER_ROW): HexRow[] {
  const bpr = Number.isFinite(bytesPerRow) && bytesPerRow > 0 ? Math.floor(bytesPerRow) : BYTES_PER_ROW
  const rows: HexRow[] = []
  for (let base = 0; base < bytes.length; base += bpr) {
    const slice = bytes.subarray(base, base + bpr)
    rows.push({
      offset: startOffset + base,
      hex: Array.from(slice, formatByte),
      ascii: Array.from(slice, asciiChar).join('')
    })
  }
  return rows
}

/** 依据 file size 推断行数（虚拟化总高）。 */
export function rowCountForSize(size: number, bytesPerRow = BYTES_PER_ROW): number {
  const bpr = Number.isFinite(bytesPerRow) && bytesPerRow > 0 ? Math.floor(bytesPerRow) : BYTES_PER_ROW
  return Math.ceil(size / bpr)
}

// ── 偏移跳转输入解析（纯函数） ────────────────────────────────────────────────

export type OffsetParseResult =
  | { ok: true; offset: number; clamped: boolean; relative: boolean }
  | { ok: false; error: string }

/**
 * 解析跳转偏移输入：
 *   绝对：'0x1A2B'（显式 hex）/ '1A2B'（纯 hex 且含字母）/ '6667'（十进制）
 *   相对：'+0x20' / '-16'（相对 baseOffset，十进制/hex 规则同上）
 * 越界钳至 [0, size-1] 并置 clamped；非法输入返回 ok:false（不抛异常）。
 * 空串/超长（>16 位）/含非进制字符均非法。
 */
export function parseOffsetInput(text: string, size: number, baseOffset = 0): OffsetParseResult {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: '请输入偏移（0x1A2B / 1234 / +0x20）' }
  }
  if (trimmed.length > 20) {
    return { ok: false, error: '输入过长（数字部分 ≤16 位）' }
  }
  const relativeMatch = /^([+-])(.+)$/.exec(trimmed)
  const relative = relativeMatch !== null
  const body = relative ? relativeMatch[2] : trimmed
  const sign = relative && relativeMatch[1] === '-' ? -1 : 1
  if (body.replace(/^0[xX]/, '').length > 16) {
    return { ok: false, error: '输入过长（数字部分 ≤16 位）' }
  }
  let value: number
  if (/^0[xX][0-9a-fA-F]+$/.test(body)) {
    value = parseInt(body.slice(2), 16)
  } else if (/^[0-9a-fA-F]+$/.test(body) && /[a-fA-F]/.test(body)) {
    // 纯十六进制字符且含字母 → 按 hex（避免 '10' 被误判为 hex 的歧义）
    value = parseInt(body, 16)
  } else if (/^[0-9]+$/.test(body)) {
    value = parseInt(body, 10)
  } else {
    return { ok: false, error: '无法识别（支持 0x1A2B / 1A2B / 6667 / +0x20 / -16）' }
  }
  if (!Number.isFinite(value)) {
    return { ok: false, error: '数值超界' }
  }
  const base = relative && Number.isFinite(baseOffset) && baseOffset > 0 ? baseOffset : 0
  let offset = relative ? base + sign * value : value
  let clamped = false
  if (offset < 0) {
    offset = 0
    clamped = true
  }
  if (offset >= size) {
    offset = Math.max(size - 1, 0)
    clamped = true
  }
  return { ok: true, offset, clamped, relative }
}

// ── Data Inspector 选区解读（纯函数，DataView 语义） ───────────────────────

export interface InspectorEntry {
  /** 展示名（含端序标注）。 */
  label: string
  /** 解读值（字符串形态，含符号）。 */
  value: string
}

export interface InspectorGroup {
  /** 分组标题（Integer / Floating Point / Text / Checksum / …）。 */
  title: string
  entries: InspectorEntry[]
}

const signed8 = (byte: number): number => (byte >= 0x80 ? byte - 0x100 : byte)

/** 千分位分组（负号不参与分组；BigInt 手工分组）。 */
function groupDigits(text: string): string {
  const negative = text.startsWith('-')
  const body = negative ? text.slice(1) : text
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

const formatInt = (value: number | bigint): string =>
  typeof value === 'bigint' ? groupDigits(value.toString()) : groupDigits(String(value))

/** float 解读：NaN/±Infinity 标注位模式（如 `NaN (0x7fc00000)`），其余原样。 */
function formatFloat(value: number, bitsHex: string): string {
  if (Number.isNaN(value)) return `NaN (${bitsHex})`
  if (!Number.isFinite(value)) return `${value < 0 ? '-' : ''}Infinity (${bitsHex})`
  return String(value)
}

/** Unix 时间戳合理性区间（1970-01-01 ~ 2100-01-01，秒/毫秒各判一档）。 */
function formatUnixTimestamp(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 4_102_444_800) return null
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return null
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`
}

// ── CRC-32（IEEE 802.3，查表法；与 zlib/python binascii.crc32 一致） ────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * 按选区长度解读（分组列表，只展示与长度精确匹配的高价值类型）：
 *   1B → Int8/UInt8/ASCII/位视图；2B → Int16·UInt16×LE·BE/Int8×2/ASCII；
 *   4B → Int32·UInt32/Float32/CRC32/时间戳；8B → Int64/Float64/CRC32/时间戳；
 *   其他长度（3/5/…/N>8）→ Overview（长度/CRC32/前 8 字节）+ 文本预览。
 * truncated=true（超长选区只截取前缀）时省略 CRC32（避免伪值）。
 * 不变量：数值与 DataView 同位读数逐位一致；bytes 视为不可变。
 */
export function interpretSelection(bytes: Uint8Array, options?: { truncated?: boolean }): InspectorGroup[] {
  if (bytes.length === 0) return []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const len = bytes.length
  const groups: InspectorGroup[] = []

  const push = (title: string, entries: InspectorEntry[]): void => {
    if (entries.length > 0) groups.push({ title, entries })
  }
  const textEntries = (limit: number): InspectorEntry[] => [
    { label: 'ASCII', value: Array.from(bytes.subarray(0, limit), asciiChar).join('') }
  ]

  if (len === 1) {
    const byte = bytes[0]
    push('Integer', [
      { label: 'Int8', value: formatInt(signed8(byte)) },
      { label: 'UInt8', value: formatInt(byte) }
    ])
    push('Text / Character', [
      { label: 'ASCII', value: asciiChar(byte) === '.' ? `· (0x${formatByte(byte)})` : asciiChar(byte) },
      { label: 'Bit 视图', value: byte.toString(2).padStart(8, '0') }
    ])
    return groups
  }

  if (len === 2) {
    push('Integer', [
      { label: 'Int16 LE', value: formatInt(view.getInt16(0, true)) },
      { label: 'Int16 BE', value: formatInt(view.getInt16(0, false)) },
      { label: 'UInt16 LE', value: formatInt(view.getUint16(0, true)) },
      { label: 'UInt16 BE', value: formatInt(view.getUint16(0, false)) },
      { label: 'Int8 ×2', value: `${signed8(bytes[0])} ${signed8(bytes[1])}` }
    ])
    push('Text / Character', textEntries(2))
    return groups
  }

  if (len === 4) {
    push('Integer', [
      { label: 'Int32 LE', value: formatInt(view.getInt32(0, true)) },
      { label: 'Int32 BE', value: formatInt(view.getInt32(0, false)) },
      { label: 'UInt32 LE', value: formatInt(view.getUint32(0, true)) },
      { label: 'UInt32 BE', value: formatInt(view.getUint32(0, false)) }
    ])
    push('Floating Point', [
      { label: 'Float32 LE', value: formatFloat(view.getFloat32(0, true), `0x${view.getUint32(0, true).toString(16).padStart(8, '0')}`) },
      { label: 'Float32 BE', value: formatFloat(view.getFloat32(0, false), `0x${view.getUint32(0, false).toString(16).padStart(8, '0')}`) }
    ])
    push('Text / Character', textEntries(4))
    if (!options?.truncated) push('Checksum', [{ label: 'CRC32', value: `0x${crc32(bytes).toString(16).padStart(8, '0')}` }])
    const ts = formatUnixTimestamp(view.getUint32(0, true))
    if (ts) push('Date / Timestamp', [{ label: 'Unix 时间戳 (s)', value: ts }])
    return groups
  }

  if (len === 8) {
    push('Integer', [
      { label: 'Int64 LE', value: formatInt(view.getBigInt64(0, true)) },
      { label: 'Int64 BE', value: formatInt(view.getBigInt64(0, false)) }
    ])
    push('Floating Point', [
      { label: 'Float64 LE', value: formatFloat(view.getFloat64(0, true), `0x${view.getBigUint64(0, true).toString(16).padStart(16, '0')}`) },
      { label: 'Float64 BE', value: formatFloat(view.getFloat64(0, false), `0x${view.getBigUint64(0, false).toString(16).padStart(16, '0')}`) }
    ])
    push('Text / Character', textEntries(8))
    if (!options?.truncated) push('Checksum', [{ label: 'CRC32', value: `0x${crc32(bytes).toString(16).padStart(8, '0')}` }])
    const ms = view.getBigInt64(0, true)
    if (ms >= 0n && ms <= 4_102_444_800_000n) {
      const ts = formatUnixTimestamp(Number(ms) / 1000)
      if (ts) push('Date / Timestamp', [{ label: 'Unix 时间戳 (ms)', value: ts }])
    }
    return groups
  }

  // 非精确宽度（3/5/6/7/N>8）→ 概览：长度 + CRC32 + 前 8 字节 hex + 文本预览
  const previewLen = Math.min(8, len)
  const overview: InspectorEntry[] = [
    { label: '长度', value: `${formatInt(len)} B` },
    { label: '前 8 字节', value: Array.from(bytes.subarray(0, previewLen), formatByte).join(' ') }
  ]
  if (!options?.truncated) overview.push({ label: 'CRC32', value: `0x${crc32(bytes).toString(16).padStart(8, '0')}` })
  push('Overview', overview)
  push('Text / Character', textEntries(Math.min(16, len)))
  return groups
}
