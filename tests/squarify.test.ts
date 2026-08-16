/**
 * squarified treemap 布局 — 最小断言 harness（M4 验证）。
 * 覆盖：面积守恒、无重叠、全覆盖、确定性、空/零值输入。
 */

import assert from 'node:assert/strict'
import { squarify } from '../src/components/treemap/squarify'

const W = 1000
const H = 600

// ============ 面积守恒 ============

const items = [
  { key: 'node_modules', value: 5000 },
  { key: 'src', value: 1500 },
  { key: 'docs', value: 800 },
  { key: 'dist', value: 400 },
  { key: 'tests', value: 200 },
  { key: '.git', value: 100 }
]
const rects = squarify(items, W, H)
assert.equal(rects.length, 6)

const totalArea = W * H
const rectArea = rects.reduce((sum, r) => sum + r.w * r.h, 0)
assert.ok(Math.abs(rectArea - totalArea) / totalArea < 1e-9, `面积守恒：${rectArea} ≈ ${totalArea}`)

// 单块面积与值成正比
const byKey = new Map(rects.map(r => [r.key, r]))
const sum = items.reduce((s, i) => s + i.value, 0)
for (const item of items) {
  const expected = (item.value / sum) * totalArea
  const actual = byKey.get(item.key)!.w * byKey.get(item.key)!.h
  assert.ok(Math.abs(actual - expected) / expected < 1e-9, `${item.key} 面积与值成正比`)
}

// ============ 无重叠 + 在界内 ============

for (let i = 0; i < rects.length; i++) {
  const a = rects[i]
  assert.ok(a.x >= -1e-6 && a.y >= -1e-6 && a.x + a.w <= W + 1e-6 && a.y + a.h <= H + 1e-6, `${a.key} 在界内`)
  for (let j = i + 1; j < rects.length; j++) {
    const b = rects[j]
    const overlap = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 &&
      a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6
    assert.ok(!overlap, `${a.key} 与 ${b.key} 不重叠`)
  }
}

// ============ 确定性 ============

assert.deepEqual(squarify(items, W, H), rects)
// 输入乱序结果一致（内部排序保证）
assert.deepEqual(squarify([...items].reverse(), W, H).map(r => r.key), rects.map(r => r.key))

// ============ 边界输入 ============

assert.deepEqual(squarify([], W, H), [])
assert.deepEqual(squarify([{ key: 'a', value: 0 }], W, H), []) // 零值过滤
assert.deepEqual(squarify([{ key: 'a', value: Number.NaN }], W, H), [])
assert.deepEqual(squarify(items, 0, H), [])
// 单项铺满
const single = squarify([{ key: 'only', value: 42 }], W, H)
assert.equal(single.length, 1)
assert.ok(Math.abs(single[0].w - W) < 1e-6 && Math.abs(single[0].h - H) < 1e-6)

// ============ 大小悬殊（最大块贴边占大头） ============

const skewed = squarify([
  { key: 'big', value: 10000 },
  { key: 's1', value: 1 },
  { key: 's2', value: 1 }
], W, H)
const big = skewed.find(r => r.key === 'big')!
assert.ok(big.w * big.h > 0.8 * W * H, '悬殊输入下最大块占 ≥80%')

console.log('✓ squarify 布局测试全部通过')
