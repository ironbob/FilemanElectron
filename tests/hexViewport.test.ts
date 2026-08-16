/**
 * hexViewport 坐标换算 — 最小断言 harness（QA-2 坐标不变量）。
 * 覆盖：row↔offset↔top 恒等、钳制、可视区间覆盖与缓冲、非法输入收敛。
 */

import assert from 'node:assert/strict'
import {
  ROW_HEIGHT,
  OVERSCAN_ROWS,
  clampOffset,
  clampRow,
  offsetToRow,
  rowToOffset,
  rowTop,
  scrollTopToCenter,
  scrollTopToShow,
  visibleRowRange
} from '../src/utils/hexViewport'

// ============ row ↔ offset ↔ top 恒等 ============

for (const offset of [0, 1, 15, 16, 17, 255, 256, 1_048_576, 1_073_741_823]) {
  const row = offsetToRow(offset)
  assert.equal(row, Math.floor(offset / 16), `offset ${offset} → row`)
  assert.ok(rowToOffset(row) <= offset && offset < rowToOffset(row) + 16, `row ${row} 覆盖 offset ${offset}`)
  assert.equal(rowTop(row), row * ROW_HEIGHT, `row ${row} → top`)
}

assert.equal(offsetToRow(0), 0)
assert.equal(offsetToRow(16), 1)
assert.equal(rowToOffset(3), 48)
assert.equal(rowTop(0), 0)
assert.equal(rowTop(100), 2700)

// 参数化 bpr/rowHeight（自适应 8/16/24/32 × 25/27/29）
assert.equal(offsetToRow(31, 16), 1)
assert.equal(offsetToRow(31, 32), 0)
assert.equal(offsetToRow(31, 8), 3)
assert.equal(rowToOffset(2, 24), 48)
assert.equal(rowTop(2, 29), 58)
assert.equal(rowTop(2, 25), 50)
// 非法 bpr/行高回落默认（16 / 27）
assert.equal(offsetToRow(15, 0), 0)
assert.equal(rowToOffset(3, Number.NaN), 48)
assert.equal(rowTop(3, -5), 81)

// ============ 钳制（含非法输入收敛） ============

assert.equal(clampOffset(0, 100), 0)
assert.equal(clampOffset(99, 100), 99)
assert.equal(clampOffset(100, 100), 99)
assert.equal(clampOffset(1e12, 100), 99)
assert.equal(clampOffset(-5, 100), 0)
assert.equal(clampOffset(Number.NaN, 100), 0)
assert.equal(clampOffset(0, 0), 0) // 空文件不越界

assert.equal(clampRow(0, 10), 0)
assert.equal(clampRow(9, 10), 9)
assert.equal(clampRow(10, 10), 9)
assert.equal(clampRow(-1, 10), 0)
assert.equal(clampRow(Number.NaN, 10), 0)
assert.equal(clampRow(0, 0), 0)

// offsetToRow/rowToOffset/rowTop 的非法输入同样收敛到 0
assert.equal(offsetToRow(-1), 0)
assert.equal(offsetToRow(Number.NaN), 0)
assert.equal(rowToOffset(Number.NEGATIVE_INFINITY), 0)
assert.equal(rowTop(Number.NaN), 0)

// ============ 可视区间 ============

// 典型：scrollTop=0, 500px 视口 → 前 23 行可视（0..22），缓冲 ±OVERSCAN
const r1 = visibleRowRange(0, 500, 1_000_000)
assert.equal(r1.first, 0)
assert.equal(r1.last, Math.ceil(500 / ROW_HEIGHT) - 1)
assert.equal(r1.bufferFirst, 0) // 钳到 0
assert.equal(r1.bufferLast, r1.last + OVERSCAN_ROWS)
assert.ok(r1.bufferFirst <= r1.first && r1.last <= r1.bufferLast, '缓冲覆盖可视')

// 中段滚动
const scrollTop = 100 * ROW_HEIGHT // 行 100 顶部
const r2 = visibleRowRange(scrollTop, 500, 1_000_000)
assert.equal(r2.first, 100)
assert.equal(r2.bufferFirst, 100 - OVERSCAN_ROWS)
assert.equal(r2.bufferLast, r2.last + OVERSCAN_ROWS)

// 末尾：缓冲钳在 totalRows-1
const r3 = visibleRowRange(1e9, 500, 1000)
assert.equal(r3.last, 999)
assert.equal(r3.bufferLast, 999)
assert.ok(r3.bufferFirst <= r3.first)

// 空文件
const r4 = visibleRowRange(0, 500, 0)
assert.deepEqual(r4, { first: 0, last: 0, bufferFirst: 0, bufferLast: 0 })

// 非法 scrollTop/viewportHeight 收敛
const r5 = visibleRowRange(-50, Number.NaN, 1000)
assert.equal(r5.first, 0)

// DOM 行数有界：缓冲区间宽度 ≈ 视口行数 + 2×overscan，与 totalRows 无关
const r6 = visibleRowRange(12345, 500, 1_000_000_000)
assert.ok(r6.bufferLast - r6.bufferFirst + 1 < 100, `缓冲行数有界（实际 ${r6.bufferLast - r6.bufferFirst + 1}）`)

// ============ 跳转居中 ============

assert.equal(scrollTopToCenter(0, 500), 0) // 首行不产生负滚动
const center = scrollTopToCenter(1000, 500)
assert.equal(center, Math.max(0, 1000 * ROW_HEIGHT + ROW_HEIGHT / 2 - 250))
assert.equal(scrollTopToCenter(-1, 500), 0)

// ============ 键盘导航最小滚动 ============

// 行 10 顶部 220 ∈ [0, 500-22]，已在视口内 → -1（不滚动）
assert.equal(scrollTopToShow(10, 0, 500), -1)

// 行在视口上方 → 滚到行顶
assert.equal(scrollTopToShow(10, 300, 500), 10 * ROW_HEIGHT)

// 行在视口下方 → 行底贴视口底
assert.equal(scrollTopToShow(100, 0, 500), 101 * ROW_HEIGHT - 500)

// 边界：末行底部恰 ≤ 500 完全可见；下一行需滚出 (行底 − 视口高)
assert.equal(scrollTopToShow(Math.floor(500 / ROW_HEIGHT) - 1, 0, 500), -1)
assert.equal(scrollTopToShow(Math.floor(500 / ROW_HEIGHT), 0, 500), (Math.floor(500 / ROW_HEIGHT) + 1) * ROW_HEIGHT - 500)

// 自定义行高（29px）下的可视区间与最小滚动
assert.equal(scrollTopToShow(10, 0, 500, 29), -1)
assert.equal(scrollTopToShow(100, 0, 500, 29), 101 * 29 - 500)
const tall = visibleRowRange(0, 500, 1_000_000, OVERSCAN_ROWS, 29)
assert.equal(tall.first, 0)
assert.equal(tall.last, Math.ceil(500 / 29) - 1)

// 负 scrollTop / 非法视口高收敛
assert.equal(scrollTopToShow(10, -50, 500), -1)
assert.equal(scrollTopToShow(100, 0, Number.NaN), 101 * ROW_HEIGHT) // 视口高非法按 0 收敛

console.log('✓ hexViewport 坐标不变量测试全部通过')
