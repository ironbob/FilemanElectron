/**
 * hexCursor 字节级光标/选区模型 — 最小断言 harness。
 * 覆盖：十种移动意图的几何换算与边界钳制、翻页步长、
 * 选区规范化（无选区/正反序/闭区间长度/非法输入收敛）。
 */

import assert from 'node:assert/strict'
import { BYTES_PER_ROW } from '../src/utils/hexFormat'
import {
  cursorAfterMove,
  selectionRange,
  type CursorMoveOptions
} from '../src/utils/hexCursor'

const opt = (size: number, pageRows = 10): CursorMoveOptions => ({ size, pageRows })

// ============ 水平移动与钳制 ============

assert.equal(cursorAfterMove(5, 'left', opt(100)), 4)
assert.equal(cursorAfterMove(0, 'left', opt(100)), 0)          // 行首左移钳到 0
assert.equal(cursorAfterMove(5, 'right', opt(100)), 6)
assert.equal(cursorAfterMove(99, 'right', opt(100)), 99)       // 末字节右移钳住
assert.equal(cursorAfterMove(98, 'right', opt(100)), 99)
assert.equal(cursorAfterMove(5, 'left', opt(0)), 0)            // 空文件恒 0
assert.equal(cursorAfterMove(5, 'right', opt(0)), 0)

// ============ 垂直移动（按行 ±16） ============

assert.equal(cursorAfterMove(20, 'up', opt(100)), 4)
assert.equal(cursorAfterMove(3, 'up', opt(100)), 0)            // 首行上移钳到 0
assert.equal(cursorAfterMove(20, 'down', opt(100)), 36)
assert.equal(cursorAfterMove(90, 'down', opt(100)), 99)        // 越末行钳到末字节

// ============ 翻页（pageRows × 16） ============

assert.equal(cursorAfterMove(0, 'pageDown', opt(1000)), 10 * BYTES_PER_ROW)
assert.equal(cursorAfterMove(10 * BYTES_PER_ROW, 'pageUp', opt(1000)), 0)
assert.equal(cursorAfterMove(0, 'pageUp', opt(1000)), 0)
assert.equal(cursorAfterMove(500, 'pageDown', opt(505)), 504)  // 越界钳制
// pageRows 缺省退化为 1 行
assert.equal(cursorAfterMove(0, 'pageDown', { size: 1000 }), BYTES_PER_ROW)

// ============ 行首/行尾/文件首尾 ============

assert.equal(cursorAfterMove(0x1A2B, 'lineStart', opt(1 << 20)), 0x1A20)
assert.equal(cursorAfterMove(0x1A2B, 'lineEnd', opt(1 << 20)), 0x1A2F)
assert.equal(cursorAfterMove(0, 'lineEnd', opt(100)), 15)
assert.equal(cursorAfterMove(97, 'lineEnd', opt(100)), 99)     // 尾行不足整行 → 末字节
assert.equal(cursorAfterMove(97, 'lineStart', opt(100)), 96)
assert.equal(cursorAfterMove(12345, 'fileStart', opt(1 << 20)), 0)
assert.equal(cursorAfterMove(12345, 'fileEnd', opt(1 << 20)), (1 << 20) - 1)

// ============ bytesPerRow 参数（P1 每行字节数可配置的前向兼容） ============

assert.equal(cursorAfterMove(9, 'up', { size: 64, bytesPerRow: 8 }), 1)
assert.equal(cursorAfterMove(9, 'lineStart', { size: 64, bytesPerRow: 8 }), 8)
assert.equal(cursorAfterMove(9, 'lineEnd', { size: 64, bytesPerRow: 8 }), 15)

// ============ 非法输入收敛 ============

assert.equal(cursorAfterMove(Number.NaN, 'left', opt(100)), 0)
assert.equal(cursorAfterMove(-3, 'down', opt(100)), 13) // 非法 offset：加法后钳制，结果仍在界内

// ============ 选区规范化 ============

assert.equal(selectionRange(null, 5), null)          // 无 anchor
assert.equal(selectionRange(5, null), null)          // 无 head
assert.equal(selectionRange(5, 5), null)             // anchor === head → 无选区
assert.equal(selectionRange(Number.NaN, 7), null)    // 非法收敛为无选区

const forward = selectionRange(10, 14)
assert.ok(forward)
assert.deepEqual(forward, { start: 10, end: 14, length: 5 })   // 闭区间含两端

const backward = selectionRange(14, 10)              // 反向拖选自动规范
assert.ok(backward)
assert.deepEqual(backward, { start: 10, end: 14, length: 5 })

assert.equal(selectionRange(3, 4)?.length, 2)       // 相邻字节长度 2

console.log('✓ hexCursor 字节级光标/选区模型测试全部通过')
