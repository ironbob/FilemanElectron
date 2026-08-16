import assert from 'node:assert/strict'
import { resolveOutputPath, extensionForFormat } from '../electron/src/services/support/imageEditNaming'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

test('extensionForFormat：jpeg→jpg，webp/png 原样', () => {
  assert.equal(extensionForFormat('jpeg'), 'jpg')
  assert.equal(extensionForFormat('webp'), 'webp')
  assert.equal(extensionForFormat('png'), 'png')
})

test('overwrite 模式返回原路径', () => {
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/photo.jpg', mode: 'overwrite', format: 'jpeg', exists: () => false }),
    '/a/b/photo.jpg'
  )
})

test('copy 模式：后缀 + 格式扩展名（jpg→webp 换扩展名）', () => {
  const taken = new Set<string>()
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/photo.jpg', mode: 'copy', format: 'webp', suffix: '_edited', exists: p => taken.has(p) }),
    '/a/b/photo_edited.webp'
  )
})

test('copy 冲突 -1 递增，绝不返回已存在路径（IFC-6 不变量）', () => {
  const taken = new Set(['/a/b/photo_edited.webp', '/a/b/photo_edited-1.webp'])
  const out = resolveOutputPath({ sourcePath: '/a/b/photo.jpg', mode: 'copy', format: 'webp', suffix: '_edited', exists: p => taken.has(p) })
  assert.equal(out, '/a/b/photo_edited-2.webp')
  assert.ok(!taken.has(out))
})

test('无后缀冲突：默认 _edited', () => {
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/x.png', mode: 'copy', format: 'png', exists: () => false }),
    '/a/x_edited.png'
  )
})

test('候选耗尽（100 次）抛错', () => {
  const taken = (_p: string) => true
  assert.throws(() => resolveOutputPath({ sourcePath: '/a/x.png', mode: 'copy', format: 'png', exists: taken }), /唯一输出文件名/)
})

console.log(`\nimageEditNaming: ${passed} tests passed`)
