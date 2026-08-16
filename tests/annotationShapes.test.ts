import assert from 'node:assert/strict'
import { shapeBBox, textFontSize, ANNO_COLORS, ANNO_WIDTHS, type AnnoShape } from '../src/utils/annotationShapes'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const style = { color: '#FF3B30', strokeWidth: 4 }

test('arrow bbox：反向拖拽取 min/abs', () => {
  const bbox = shapeBBox({ kind: 'arrow', x1: 100, y1: 80, x2: 40, y2: 120, ...style, id: 1 })
  assert.equal(bbox.x, 40)
  assert.equal(bbox.y, 80)
  assert.equal(bbox.width, 60)
  assert.equal(bbox.height, 40)
})

test('rect bbox 原样返回；ellipse bbox = 中心±半径', () => {
  const r = shapeBBox({ kind: 'rect', x: 10, y: 20, width: 30, height: 40, ...style, id: 1 })
  assert.deepEqual([r.x, r.y, r.width, r.height], [10, 20, 30, 40])
  const e = shapeBBox({ kind: 'ellipse', cx: 50, cy: 60, rx: 20, ry: 10, ...style, id: 1 })
  assert.deepEqual([e.x, e.y, e.width, e.height], [30, 50, 40, 20])
})

test('freehand bbox：多点极值', () => {
  const bbox = shapeBBox({ kind: 'freehand', points: [{ x: 5, y: 100 }, { x: 50, y: 20 }, { x: 30, y: 60 }], ...style, id: 1 })
  assert.equal(bbox.x, 5)
  assert.equal(bbox.y, 20)
  assert.equal(bbox.width, 45)
  assert.equal(bbox.height, 80)
})

test('text bbox：字号与近似宽度', () => {
  const bbox = shapeBBox({ kind: 'text', x: 10, y: 100, text: 'abcd', ...style, id: 1 })
  const size = textFontSize(4)
  assert.equal(bbox.height, size * 1.2)
  assert.ok(bbox.width > 0)
})

test('textFontSize：粗细档位映射且下限 14', () => {
  assert.equal(textFontSize(2), 14) // 2*4=8 → 下限 14
  assert.equal(textFontSize(8), 32)
})

test('预设：7 色 + 3 档粗细', () => {
  assert.equal(ANNO_COLORS.length, 7)
  assert.deepEqual([...ANNO_WIDTHS], [2, 4, 8])
})

console.log(`\nannotationShapes: ${passed} tests passed`)
