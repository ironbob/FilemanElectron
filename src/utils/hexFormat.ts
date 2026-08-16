/**
 * Hex 视图行格式化（纯函数，可单测）。
 * 每行 16 字节：8 位十六进制偏移 + 16 组两位 hex + ASCII 列。
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

/** 把一段字节切为 hex 行（不足 16 字节的尾行原样）。 */
export function bytesToHexRows(bytes: Uint8Array, startOffset = 0): HexRow[] {
  const rows: HexRow[] = []
  for (let base = 0; base < bytes.length; base += BYTES_PER_ROW) {
    const slice = bytes.subarray(base, base + BYTES_PER_ROW)
    rows.push({
      offset: startOffset + base,
      hex: Array.from(slice, formatByte),
      ascii: Array.from(slice, asciiChar).join('')
    })
  }
  return rows
}

/** 依据 file size 推断行数（虚拟化总高）。 */
export function rowCountForSize(size: number): number {
  return Math.ceil(size / BYTES_PER_ROW)
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

// ── Data Inspector 字节解读（纯函数，DataView 语义） ────────────────────────

export interface InspectorEntry {
  /** 展示名（含端序标注）。 */
  label: string
  /** 解读值（字符串形态，含符号）。 */
  value: string
}

const signed8 = (byte: number): number => (byte >= 0x80 ? byte - 0x100 : byte)

/**
 * 解读 bytes 自 offset 起的各类型数值（int8/16/32/64、float32/64 × LE/BE）。
 * 不变量：行尾字节不足类型宽度时跳过该条目（不伪造）；数值与 DataView
 * 同位读数逐位一致。bytes 视为不可变。
 */
export function interpretAt(bytes: Uint8Array, offset: number): InspectorEntry[] {
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0
  if (safeOffset >= bytes.length) return []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const available = bytes.length - safeOffset
  const entries: InspectorEntry[] = []

  if (available >= 1) {
    const byte = bytes[safeOffset]
    entries.push({ label: 'int8', value: String(signed8(byte)) })
    entries.push({ label: 'uint8', value: String(byte) })
  }
  if (available >= 2) {
    entries.push({ label: 'int16 LE', value: String(view.getInt16(safeOffset, true)) })
    entries.push({ label: 'int16 BE', value: String(view.getInt16(safeOffset, false)) })
    entries.push({ label: 'uint16 LE', value: String(view.getUint16(safeOffset, true)) })
    entries.push({ label: 'uint16 BE', value: String(view.getUint16(safeOffset, false)) })
  }
  if (available >= 4) {
    entries.push({ label: 'int32 LE', value: String(view.getInt32(safeOffset, true)) })
    entries.push({ label: 'int32 BE', value: String(view.getInt32(safeOffset, false)) })
    entries.push({ label: 'uint32 LE', value: String(view.getUint32(safeOffset, true)) })
    entries.push({ label: 'uint32 BE', value: String(view.getUint32(safeOffset, false)) })
    entries.push({ label: 'float32 LE', value: String(view.getFloat32(safeOffset, true)) })
    entries.push({ label: 'float32 BE', value: String(view.getFloat32(safeOffset, false)) })
  }
  if (available >= 8) {
    entries.push({ label: 'int64 LE', value: view.getBigInt64(safeOffset, true).toString() })
    entries.push({ label: 'int64 BE', value: view.getBigInt64(safeOffset, false).toString() })
    entries.push({ label: 'float64 LE', value: String(view.getFloat64(safeOffset, true)) })
    entries.push({ label: 'float64 BE', value: String(view.getFloat64(safeOffset, false)) })
  }
  return entries
}
