import assert from 'node:assert/strict'
import { displayedToSourceRect, sourceToDisplayedRect, clampSourceRect, applyAspectLock, displayedImageRect } from '../src/utils/cropGeometry'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

// ── contain：letterbox 修正 ────────────────────────────────────────────────────
test('contain 纵向 letterbox：显示矩形偏移正确映射回源像素', () => {
  // 容器 1000x600（更宽），图像 4000x2000 → 等比 0.25 → 显示 1000x500，上下留白 50
  const layout = { containerWidth: 1000, containerHeight: 600, naturalWidth: 4000, naturalHeight: 2000, fitMode: 'contain' as const }
  const img = displayedImageRect(layout)
  assert.equal(Math.round(img.x), 0)
  assert.equal(Math.round(img.y), 50)
  assert.equal(Math.round(img.width), 1000)
  // 选显示 (0,50)-(1000,550) 即整图 → 源 (0,0,4000,2000)
  const src = displayedToSourceRect({ x: 0, y: 50, width: 1000, height: 500 }, layout)
  assert.equal(src.x, 0)
  assert.equal(src.y, 0)
  assert.equal(src.width, 4000)
  assert.equal(src.height, 2000)
})

test('contain 横向 letterbox：左右留白', () => {
  // 容器 500x1000（更高），图像 4000x2000 → 等比 0.25 → 显示 500x250，上下留白 375
  const layout = { containerWidth: 500, containerHeight: 1000, naturalWidth: 4000, naturalHeight: 2000, fitMode: 'contain' as const }
  const img = displayedImageRect(layout)
  assert.equal(Math.round(img.y), 375)
  assert.equal(Math.round(img.width), 500)
  // 中心区域映射
  const src = displayedToSourceRect({ x: 125, y: 500, width: 250, height: 250 }, layout)
  assert.equal(src.x, 1000)
  assert.equal(src.width, 2000)
})

// ── cover：溢出裁切 ───────────────────────────────────────────────────────────
test('cover 可见窗口：越界显示坐标 clamp 到图像域', () => {
  // 容器 1000x500，图像 2000x2000 → cover 放大至 1000x1000，顶部 -250
  const layout = { containerWidth: 1000, containerHeight: 500, naturalWidth: 2000, naturalHeight: 2000, fitMode: 'cover' as const }
  const img = displayedImageRect(layout)
  assert.equal(Math.round(img.y), -250)
  // 容器全域 (0,0,1000,500) → 源 (0,500,2000,1000)
  const src = displayedToSourceRect({ x: 0, y: 0, width: 1000, height: 500 }, layout)
  assert.equal(src.x, 0)
  assert.equal(src.y, 500)
  assert.equal(src.width, 2000)
  assert.equal(src.height, 1000)
})

// ── actual + 缩放 ────────────────────────────────────────────────────────────
test('actual 放大 2x：反算比例正确', () => {
  const layout = { containerWidth: 2000, containerHeight: 2000, naturalWidth: 500, naturalHeight: 400, fitMode: 'actual' as const, scale: 2 }
  // 显示 1000x800，起点 (500,600)
  const src = displayedToSourceRect({ x: 500, y: 600, width: 500, height: 400 }, layout)
  assert.equal(src.x, 0)
  assert.equal(src.y, 0)
  assert.equal(src.width, 250)
  assert.equal(src.height, 200)
})

// ── displayedRect 实测覆盖（transform 场景） ──────────────────────────────────
test('displayedRect 覆盖优先于 fitMode 推导', () => {
  const layout = {
    containerWidth: 1000, containerHeight: 800,
    naturalWidth: 1000, naturalHeight: 800,
    fitMode: 'contain' as const,
    displayedRect: { x: 100, y: 50, width: 800, height: 640 }
  }
  const src = displayedToSourceRect({ x: 100, y: 50, width: 400, height: 320 }, layout)
  assert.equal(src.x, 0)
  assert.equal(src.y, 0)
  assert.equal(src.width, 500)
  assert.equal(src.height, 400)
})

// ── clamp 与最小 1px ─────────────────────────────────────────────────────────
test('clampSourceRect：越界与零尺寸修正', () => {
  const r = clampSourceRect({ x: -10, y: 1990, width: 99999, height: 0 }, 2000, 2000)
  assert.equal(r.x, 0)
  assert.equal(r.y, 1990)
  assert.equal(r.width, 2000) // 受 x=0 侧边界约束
  assert.equal(r.height, 1)   // 受 y=1990 底边约束（最小 1px）
})

// ── 往返误差 ≤ 1px（IFC-4 不变量） ────────────────────────────────────────────
test('往返映射误差 ≤ 1px', () => {
  const layout = { containerWidth: 777, containerHeight: 555, naturalWidth: 4000, naturalHeight: 3000, fitMode: 'contain' as const }
  const display = { x: 100, y: 200, width: 300, height: 200 }
  const src = displayedToSourceRect(display, layout)
  const back = sourceToDisplayedRect(src, layout)
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    assert.ok(Math.abs(back[key] - display[key]) <= 1, `${key} 往返误差 ${back[key] - display[key]}`)
  }
})

// ── 比例锁 ───────────────────────────────────────────────────────────────────
test('applyAspectLock：中心保持、取较小维度约束', () => {
  const locked = applyAspectLock({ x: 0, y: 0, width: 200, height: 100 }, 1)
  assert.equal(Math.round(locked.width), 100)
  assert.equal(Math.round(locked.height), 100)
  assert.equal(Math.round(locked.x), 50) // 中心保持
  assert.deepEqual(applyAspectLock({ x: 0, y: 0, width: 100, height: 50 }, null), { x: 0, y: 0, width: 100, height: 50 })
})

console.log(`\ncropGeometry: ${passed} tests passed`)
