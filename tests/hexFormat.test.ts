/**
 * hex 视图行格式化 — 最小断言 harness（M4 验证）。
 */

import assert from 'node:assert/strict'
import { bytesToHexRows, formatOffset, formatByte, asciiChar, rowCountForSize, BYTES_PER_ROW, parseOffsetInput, interpretSelection, crc32, type InspectorGroup } from '../src/utils/hexFormat'

assert.equal(formatOffset(0), '00000000')
assert.equal(formatOffset(255), '000000ff')
assert.equal(formatOffset(4294967295), 'ffffffff')

assert.equal(formatByte(0), '00')
assert.equal(formatByte(10), '0a')
assert.equal(formatByte(255), 'ff')

assert.equal(asciiChar(0x41), 'A')
assert.equal(asciiChar(0x30), '0')
assert.equal(asciiChar(0x00), '.')   // NUL
assert.equal(asciiChar(0x1f), '.')   // 控制字符
assert.equal(asciiChar(0x7f), '.')   // DEL
assert.equal(asciiChar(0x80), '.')   // 非 ASCII
assert.equal(asciiChar(0x20), ' ')   // 空格可打印

// "AB\n\0C" → 41 42 0a 00 43 | "AB..C"
const rows = bytesToHexRows(new Uint8Array([0x41, 0x42, 0x0a, 0x00, 0x43]), 16)
assert.equal(rows.length, 1)
assert.equal(rows[0].offset, 16)
assert.deepEqual(rows[0].hex, ['41', '42', '0a', '00', '43'])
assert.equal(rows[0].ascii, 'AB..C')

// 完整 16 字节 + 尾行不足
const full = new Uint8Array(BYTES_PER_ROW + 3)
full.fill(0x20)
const rows2 = bytesToHexRows(full, 0)
assert.equal(rows2.length, 2)
assert.equal(rows2[0].hex.length, BYTES_PER_ROW)
assert.equal(rows2[1].hex.length, 3)
assert.equal(rows2[1].offset, BYTES_PER_ROW)
assert.equal(rows2[0].ascii.length, BYTES_PER_ROW)

// 参数化每行字节数（自适应 8/24/32）
const wide = new Uint8Array(32).fill(0x41)
assert.equal(bytesToHexRows(wide, 0, 32).length, 1)
assert.equal(bytesToHexRows(wide, 0, 32)[0].hex.length, 32)
assert.equal(bytesToHexRows(wide, 0, 24).length, 2)
assert.equal(bytesToHexRows(wide, 0, 24)[1].offset, 24)
assert.equal(bytesToHexRows(wide, 0, 8).length, 4)
// 非法 bpr 回落默认 16
assert.equal(bytesToHexRows(wide, 0, 0).length, 2)

// 行数推算
assert.equal(rowCountForSize(0), 0)
assert.equal(rowCountForSize(1), 1)
assert.equal(rowCountForSize(16), 1)
assert.equal(rowCountForSize(17), 2)
assert.equal(rowCountForSize(1024 * 1024), 65536)
assert.equal(rowCountForSize(1024 * 1024, 32), 32768)
assert.equal(rowCountForSize(1024 * 1024, 8), 131072)

// UTF-8 多字节字符在 ASCII 列显示为 .（按字节处理，不误解码）
const utf8 = new TextEncoder().encode('中')
const rows3 = bytesToHexRows(utf8, 0)
assert.equal(rows3[0].ascii, '...')


// ============ parseOffsetInput（跳转解析） ============

// 三种合法形态（绝对）
assert.deepEqual(parseOffsetInput('0x1A2B', 10000), { ok: true, offset: 0x1A2B, clamped: false, relative: false })
assert.deepEqual(parseOffsetInput('1A2B', 10000), { ok: true, offset: 0x1A2B, clamped: false, relative: false }) // 纯 hex 含字母
assert.deepEqual(parseOffsetInput('6667', 10000), { ok: true, offset: 6667, clamped: false, relative: false })  // 十进制
assert.deepEqual(parseOffsetInput(' 0x10 ', 10000), { ok: true, offset: 16, clamped: false, relative: false })  // 容错空白
assert.deepEqual(parseOffsetInput('0X10', 10000), { ok: true, offset: 16, clamped: false, relative: false })    // 大写 X

// 歧义消解：纯数字按十进制（'10'=10 而非 16）
assert.deepEqual(parseOffsetInput('10', 10000), { ok: true, offset: 10, clamped: false, relative: false })
// 'ff' 纯字母 hex
assert.deepEqual(parseOffsetInput('ff', 10000), { ok: true, offset: 255, clamped: false, relative: false })

// 越界钳制
assert.deepEqual(parseOffsetInput('999999', 100), { ok: true, offset: 99, clamped: true, relative: false })
assert.deepEqual(parseOffsetInput('0x64', 100), { ok: true, offset: 99, clamped: true, relative: false })

// 相对偏移（+0x20 / -16，相对 baseOffset）
assert.deepEqual(parseOffsetInput('+0x20', 1000, 0x10), { ok: true, offset: 0x30, clamped: false, relative: true })
assert.deepEqual(parseOffsetInput('-16', 1000, 100), { ok: true, offset: 84, clamped: false, relative: true })
assert.deepEqual(parseOffsetInput('+1A', 1000, 0x20), { ok: true, offset: 0x3a, clamped: false, relative: true }) // 纯 hex 含字母
assert.deepEqual(parseOffsetInput('+10', 1000, 5), { ok: true, offset: 15, clamped: false, relative: true })      // 纯数字十进制
// 相对越界钳制（负向到 0 / 正向到末尾）
assert.deepEqual(parseOffsetInput('-0x20', 1000, 0x10), { ok: true, offset: 0, clamped: true, relative: true })
assert.deepEqual(parseOffsetInput('+0x20', 100, 90), { ok: true, offset: 99, clamped: true, relative: true })
// base 缺省按 0
assert.deepEqual(parseOffsetInput('+20', 1000), { ok: true, offset: 20, clamped: false, relative: true })

// 非法输入（不抛异常）
assert.equal(parseOffsetInput('', 100).ok, false)
assert.equal(parseOffsetInput('   ', 100).ok, false)
assert.equal(parseOffsetInput('0x', 100).ok, false)          // 0x 后无数
assert.equal(parseOffsetInput('0xZZ', 100).ok, false)
assert.equal(parseOffsetInput('12g4', 100).ok, false)        // 混非法字符
assert.equal(parseOffsetInput('1 2', 100).ok, false)
assert.equal(parseOffsetInput('++20', 100).ok, false)
assert.equal(parseOffsetInput('+-20', 100).ok, false)
assert.equal(parseOffsetInput('+0x', 100).ok, false)
assert.equal(parseOffsetInput('12345678901234567', 100).ok, false) // >16 位

// ============ interpretSelection（按选区长度分组的 Inspector） ============

// 分组展平辅助（label → value）
function flatEntries(groups: InspectorGroup[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const group of groups) for (const entry of group.entries) map.set(entry.label, entry.value)
  return map
}
function groupTitles(groups: InspectorGroup[]): string[] {
  return groups.map(g => g.title)
}

// 已知字节序列："Hello, Hex View!\n" + 0x00 0xff（19 字节）
const win = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 72, 101, 120, 32, 86, 105, 101, 119, 33, 10, 0, 255])
const view = new DataView(win.buffer, win.byteOffset, win.byteLength)

// 1 字节选区：Int8/UInt8/ASCII/位视图，无 16/32/64 位与 CRC
{
  const groups = interpretSelection(win.subarray(0, 1))
  const map = flatEntries(groups)
  assert.equal(map.get('Int8'), '72')
  assert.equal(map.get('UInt8'), '72')
  assert.equal(map.get('Bit 视图'), '01001000')
  assert.equal(map.get('ASCII'), 'H')
  assert.ok(!map.has('Int16 LE') && !map.has('CRC32'), '1B 只展示 8 位类型')
}

// 1 字节选区：0xff → Int8 = -1、非可打印字符标注码点
{
  const groups = interpretSelection(win.subarray(18, 19))
  const map = flatEntries(groups)
  assert.equal(map.get('Int8'), '-1')
  assert.equal(map.get('UInt8'), '255')
  assert.equal(map.get('ASCII'), '· (0xff)')
}

// 2 字节选区：Int16/UInt16 × LE·BE + Int8×2，无 CRC/浮点
{
  const groups = interpretSelection(win.subarray(0, 2)) // 'He' = 0x48 0x65
  const map = flatEntries(groups)
  const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  assert.equal(map.get('Int16 LE'), grouped(view.getInt16(0, true)))   // 0x6548 = 25,928
  assert.equal(map.get('Int16 BE'), grouped(view.getInt16(0, false)))
  assert.equal(map.get('UInt16 LE'), grouped(view.getUint16(0, true)))
  assert.equal(map.get('Int8 ×2'), '72 101')
  assert.ok(!map.has('Float32 LE') && !map.has('CRC32'), '2B 无浮点/CRC')
}

// 4 字节选区：Int32/UInt32/Float32 × LE·BE + CRC32 + 文本
{
  const groups = interpretSelection(win.subarray(0, 4)) // 'Hell'
  const map = flatEntries(groups)
  assert.equal(map.get('Int32 LE'), String(view.getInt32(0, true)).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
  assert.equal(map.get('UInt32 BE'), '1,214,606,444')  // 0x48656c6c 千分位
  assert.equal(map.get('Float32 LE'), String(view.getFloat32(0, true)))
  assert.equal(map.get('ASCII'), 'Hell')
  assert.ok(map.has('CRC32'), '4B 有 CRC32')
}

// 8 字节选区：Int64/Float64（BigInt）+ DataView 逐位一致
{
  const buf = new ArrayBuffer(8)
  new DataView(buf).setFloat64(0, 3.141592653589793, true)
  const groups = interpretSelection(new Uint8Array(buf))
  const map = flatEntries(groups)
  assert.equal(map.get('Float64 LE'), '3.141592653589793')
  assert.equal(map.get('Int64 LE'), '4,614,256,656,552,045,848')  // π 位模式 BigInt（千分位分组）
}

// NaN/Infinity 位模式标注
{
  const buf = new ArrayBuffer(4)
  new DataView(buf).setFloat32(0, Number.NaN, true)
  const groups = interpretSelection(new Uint8Array(buf))
  const map = flatEntries(groups)
  assert.equal(map.get('Float32 LE'), 'NaN (0x7fc00000)')
  new DataView(buf).setFloat32(0, Number.POSITIVE_INFINITY, true)
  assert.equal(flatEntries(interpretSelection(new Uint8Array(buf))).get('Float32 LE'), 'Infinity (0x7f800000)')
}

// Unix 时间戳（合理区间才出现）
{
  const ts = new Uint8Array(4)
  new DataView(ts.buffer).setUint32(0, 1_700_000_000, true) // 2023-11-14
  const map = flatEntries(interpretSelection(ts))
  assert.equal(map.get('Unix 时间戳 (s)'), '2023-11-14 22:13:20 UTC')
  const far = new Uint8Array(4)
  new DataView(far.buffer).setUint32(0, 4_250_000_000, true) // 超出 2100 截止线 → 不显示
  assert.ok(!flatEntries(interpretSelection(far)).has('Unix 时间戳 (s)'))
}

// 非精确宽度（3B / >8B）→ Overview + 文本预览；truncated 省略 CRC
{
  const three = interpretSelection(win.subarray(0, 3))
  assert.deepEqual(groupTitles(three), ['Overview', 'Text / Character'])
  const map3 = flatEntries(three)
  assert.equal(map3.get('长度'), '3 B')
  assert.equal(map3.get('前 8 字节'), '48 65 6c')
  assert.equal(map3.get('ASCII'), 'Hel')

  const big = interpretSelection(win.subarray(0, 19))
  const mapBig = flatEntries(big)
  assert.equal(mapBig.get('长度'), '19 B')
  assert.equal(mapBig.get('前 8 字节'), '48 65 6c 6c 6f 2c 20 48')
  assert.ok(mapBig.has('CRC32'), '未截断的大选区保留 CRC')
  const truncated = interpretSelection(win.subarray(0, 19), { truncated: true })
  assert.ok(!flatEntries(truncated).has('CRC32'), '截断时省略 CRC（避免伪值）')
}

// 空选区 → 空分组
assert.deepEqual(interpretSelection(new Uint8Array(0)), [])

// ============ crc32（IEEE，与 zlib/binascii 一致） ============

assert.equal(crc32(new Uint8Array(0)), 0)
assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926)  // 标准校验向量
// 自洽性：同输入同输出；前缀不同的输入 CRC 不同
assert.equal(crc32(win.subarray(0, 4)), crc32(win.subarray(0, 4)))
assert.notEqual(crc32(win.subarray(0, 4)), crc32(win.subarray(0, 5)))

console.log('✓ hexFormat 跳转解析 + 分组 Inspector + CRC32 测试全部通过')
