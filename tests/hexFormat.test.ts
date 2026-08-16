/**
 * hex 视图行格式化 — 最小断言 harness（M4 验证）。
 */

import assert from 'node:assert/strict'
import { bytesToHexRows, formatOffset, formatByte, asciiChar, rowCountForSize, BYTES_PER_ROW, parseOffsetInput, interpretAt } from '../src/utils/hexFormat'

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

// 行数推算
assert.equal(rowCountForSize(0), 0)
assert.equal(rowCountForSize(1), 1)
assert.equal(rowCountForSize(16), 1)
assert.equal(rowCountForSize(17), 2)
assert.equal(rowCountForSize(1024 * 1024), 65536)

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

// ============ interpretAt（DataView 对照） ============

// 已知字节序列："Hello, Hex View!\n" + 0x00 0xff（19 字节）
const win = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 72, 101, 120, 32, 86, 105, 101, 119, 33, 10, 0, 255])

const entries = interpretAt(win, 0)
const byLabel = new Map(entries.map(e => [e.label, e.value]))

// 与 Node DataView 逐位一致
{
  const view = new DataView(win.buffer, win.byteOffset, win.byteLength)
  assert.equal(byLabel.get('int8'), '72')
  assert.equal(byLabel.get('uint8'), '72')
  assert.equal(byLabel.get('int16 LE'), String(view.getInt16(0, true)))
  assert.equal(byLabel.get('int16 BE'), String(view.getInt16(0, false)))
  assert.equal(byLabel.get('uint32 BE'), String(view.getUint32(0, false)))   // 'Hell' 0x48656c6c
  assert.equal(byLabel.get('uint32 BE'), '1214606444')
  assert.equal(byLabel.get('int32 LE'), String(view.getInt32(0, true)))
  assert.equal(byLabel.get('float32 LE'), String(view.getFloat32(0, true)))
  assert.equal(byLabel.get('float64 LE'), String(view.getFloat64(0, true)))
  assert.equal(byLabel.get('int64 BE'), view.getBigInt64(0, false).toString())
}

// 符号处理：末尾 0xff → int8 = -1
{
  const tail = interpretAt(win, 18) // 0xff
  const map = new Map(tail.map(e => [e.label, e.value]))
  assert.equal(map.get('int8'), '-1')
  assert.equal(map.get('uint8'), '255')
  // 仅 1 字节可用 → 16/32/64 位条目全部跳过
  assert.equal(tail.length, 2)
}

// 部分宽度：offset 15 起恰 4 字节可用（33,10,0,255）→ 32 位在、64 位跳过
{
  const partial = interpretAt(win, 15)
  const labels = partial.map(e => e.label)
  assert.ok(labels.includes('int8') && labels.includes('int16 LE'))
  assert.ok(labels.includes('int32 LE'), '恰 4 字节 → 32 位可用')
  assert.ok(!labels.includes('int64 LE'), '不足 8 字节跳过 64 位')
  const map = new Map(partial.map(e => [e.label, e.value]))
  assert.equal(map.get('int16 BE'), String(new DataView(win.buffer, win.byteOffset, win.byteLength).getInt16(15, false)))
}
// offset 17 起仅 2 字节（0x00,0xff）→ 32/64 位全跳过
{
  const two = interpretAt(win, 17)
  const labels2 = two.map(e => e.label)
  assert.ok(labels2.includes('int16 LE'))
  assert.ok(!labels2.includes('int32 LE') && !labels2.includes('float64 LE'), '不足宽度跳过')
}

// 边界：offset 越界 → 空数组；非法 offset 收敛
assert.deepEqual(interpretAt(win, 100), [])
assert.deepEqual(interpretAt(win, -1).length > 0, true) // 负数收敛到 0
assert.equal(interpretAt(win, Number.NaN).length > 0, true)

// float64 精确值对照（独立缓冲避免子数组偏移干扰）
{
  const buf = new ArrayBuffer(8)
  new DataView(buf).setFloat64(0, 3.141592653589793, true)
  const f64 = interpretAt(new Uint8Array(buf), 0)
  assert.equal(new Map(f64.map(e => [e.label, e.value])).get('float64 LE'), '3.141592653589793')
}

console.log('✓ hexFormat 跳转解析 + Inspector 解读测试全部通过')
