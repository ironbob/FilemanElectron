/**
 * Hex 查找模式解析与块内匹配（纯函数，可单测）。
 *
 * 模式（nibble 级通配）：
 *   '48 6?'  → [{hi:4,lo:8},{hi:6,lo:null}]   '4?' 匹配高 4 位为 4 的任意字节
 *   '??'     → [{hi:null,lo:null}]            整字节通配（匹配任意字节）
 *   文本模式 → TextEncoder UTF-8 字节（固定 hi/lo，无通配）
 *
 * 不变量：解析失败返回 { error }（不抛异常）；匹配函数对非法偏移/长度
 * 返回空结果；匹配为非重叠语义（上次命中之后继续扫描）。
 */

/** 单字节模式：hi/lo 为 null 表示对应半字节通配。 */
export interface NibblePattern {
  hi: number | null
  lo: number | null
}

export type PatternParseResult = { pattern: NibblePattern[] } | { error: string }

/** 解析 Hex 查找输入：空白分隔的偶数位串，'?' 可出现在任一半字节位。 */
export function parseHexPattern(text: string): PatternParseResult {
  const compact = text.replace(/\s+/g, '')
  if (compact.length === 0) {
    return { error: '请输入查找内容（如 48 65 或 4? ??）' }
  }
  if (compact.length % 2 !== 0) {
    return { error: '十六进制位数须为偶数（? 为半字节通配）' }
  }
  if (!/^[0-9a-fA-F?]+$/.test(compact)) {
    return { error: '非法字符（仅支持 0-9 A-F ? 与空白分隔）' }
  }
  const pattern: NibblePattern[] = []
  for (let i = 0; i < compact.length; i += 2) {
    pattern.push({
      hi: nibbleValue(compact[i]),
      lo: nibbleValue(compact[i + 1])
    })
  }
  return { pattern }
}

function nibbleValue(char: string): number | null {
  return char === '?' ? null : Number.parseInt(char, 16)
}

/** 文本 → UTF-8 字节模式（无通配）。空文本返回 error。 */
export function textToPattern(text: string): PatternParseResult {
  if (text.length === 0) {
    return { error: '请输入查找文本' }
  }
  const bytes = new TextEncoder().encode(text)
  return { pattern: Array.from(bytes, b => ({ hi: b >> 4, lo: b & 0xf })) }
}

function byteMatches(byte: number, unit: NibblePattern): boolean {
  if (unit.hi !== null && byte >> 4 !== unit.hi) return false
  if (unit.lo !== null && (byte & 0xf) !== unit.lo) return false
  return true
}

/** data 自 from 起是否匹配 pattern（越界一律 false）。 */
export function matchAt(data: Uint8Array, from: number, pattern: NibblePattern[]): boolean {
  if (from < 0 || from + pattern.length > data.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (!byteMatches(data[from + i], pattern[i])) return false
  }
  return true
}

/**
 * 块内扫描全部非重叠匹配，返回匹配起始的绝对偏移。
 * absoluteStart = data[0] 对应的文档偏移；minStart 排除重叠区已报过的
 * 匹配（跨块扫描时块尾/块首重叠去重）。
 */
export function findMatchesInChunk(
  data: Uint8Array,
  pattern: NibblePattern[],
  absoluteStart: number,
  minStart = 0
): number[] {
  const found: number[] = []
  const end = data.length - pattern.length
  let i = Math.max(0, minStart - absoluteStart)
  while (i <= end) {
    if (matchAt(data, i, pattern)) {
      found.push(absoluteStart + i)
      i += pattern.length  // 非重叠推进
    } else {
      i++
    }
  }
  return found
}
