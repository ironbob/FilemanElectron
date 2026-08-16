import assert from 'node:assert/strict'
import { buildRenameItems } from '../src/utils/batchRenamePattern'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const files = [
  { path: '/tmp/IMG_001.jpg', name: 'IMG_001.jpg' },
  { path: '/tmp/IMG_002.jpg', name: 'IMG_002.jpg' },
  { path: '/tmp/IMG_003.png', name: 'IMG_003.png' }
]

// ── 前缀 ──────────────────────────────────────────────────────────────────────
test('前缀：扩展名保持', () => {
  const { items, conflicts } = buildRenameItems(files, { prefix: 'Trip_' })
  assert.deepEqual(conflicts, [])
  assert.equal(items[0].newName, 'Trip_IMG_001.jpg')
  assert.equal(items[2].newName, 'Trip_IMG_003.png')
})

// ── 序号 ──────────────────────────────────────────────────────────────────────
test('仅序号：start/step/pad 补零，扩展名保持', () => {
  const { items, conflicts } = buildRenameItems(files, { sequence: { start: 5, step: 10, pad: 3 } })
  assert.deepEqual(conflicts, [])
  assert.equal(items[0].newName, '005.jpg')
  assert.equal(items[1].newName, '015.jpg')
  assert.equal(items[2].newName, '025.png')
})

test('序号 + 前缀：序号追加在尾部（照片重排场景）', () => {
  const { items } = buildRenameItems(files, { prefix: 'Tokyo_', sequence: { start: 1, step: 1, pad: 2 } })
  assert.equal(items[0].newName, 'Tokyo_IMG_001_01.jpg')
})

// ── 查找替换 ──────────────────────────────────────────────────────────────────
test('查找替换：全部出现替换，扩展名保持', () => {
  const { items } = buildRenameItems(
    [{ path: '/a/x_photo_x.jpg', name: 'x_photo_x.jpg' }],
    { find: 'x', replace: 'y' }
  )
  assert.equal(items[0].newName, 'y_photo_y.jpg')
})

// ── 冲突检测（IFC-5 不变量：conflicts 非空禁提交） ─────────────────────────────
test('规则产生重名 → conflicts 标注全部当事源路径', () => {
  const dup = [
    { path: '/a/p1.jpg', name: 'p1.jpg' },
    { path: '/b/p1.jpg', name: 'p1.jpg' }
  ]
  const { conflicts } = buildRenameItems(dup, { sequence: { start: 1, step: 1, pad: 0 } })
  // 不同目录的两个同名文件在仅序号下不冲突（各自 1/2）；构造真实冲突：
  const real = buildRenameItems(
    [
      { path: '/a/a1.jpg', name: 'a1.jpg' },
      { path: '/a/a2.jpg', name: 'a2.jpg' }
    ],
    { find: 'a1', replace: 'a2' } // a1.jpg → a2.jpg 与既有 a2.jpg 撞名
  )
  assert.ok(real.conflicts.includes('/a/a1.jpg'))
  assert.ok(real.conflicts.includes('/a/a2.jpg'))
  assert.deepEqual(conflicts, [])
})

test('无规则 → 原样返回无冲突', () => {
  const { items, conflicts } = buildRenameItems(files, {})
  assert.equal(items[0].newName, 'IMG_001.jpg')
  assert.deepEqual(conflicts, [])
})

test('改名前后无变化的项不计冲突', () => {
  const same = buildRenameItems(
    [
      { path: '/a/1.jpg', name: '1.jpg' },
      { path: '/a2/1.jpg', name: '1.jpg' }
    ],
    { sequence: { start: 1, step: 0, pad: 0 } } // 两者新名均等于原名 → 未变化项跳过冲突登记
  )
  assert.deepEqual(same.conflicts, [])
})

console.log(`\nbatchRenamePattern: ${passed} tests passed`)
