/**
 * 相对路径 / file URI / 列表 diff 纯函数 — 最小断言 harness（M1 验证）
 *
 * 仓库无测试框架；本文件经 esbuild 打包后以 node 运行（见 package.json
 * test:relative-path）。不被应用代码引用，不进生产 bundle。
 *
 * 覆盖：toRelativePath 词法分段语义（下行/上行/混合/同目录/根）、
 * toFileUri 保留字符转义、listingDiffers 签名守卫。
 */

import assert from 'node:assert/strict'
import { toRelativePath, toFileUri } from '../src/utils/path'
import { listingDiffers } from '../src/utils/listingDiff'
import type { FileInfo } from '../shared/types'

// ============ toRelativePath ============

// 下行（目标在 fromDir 之下）
assert.equal(toRelativePath('/a/b', '/a/b/c/d.txt'), 'c/d.txt')
// 上行（目标在 fromDir 之上）
assert.equal(toRelativePath('/a/b', '/a/x.txt'), '../x.txt')
// 混合（先上行再下行）
assert.equal(toRelativePath('/a/b/c', '/a/x/y.txt'), '../../x/y.txt')
// 同一目录
assert.equal(toRelativePath('/a/b', '/a/b/x.txt'), 'x.txt')
// 完全相同 → '.'
assert.equal(toRelativePath('/a/b', '/a/b'), '.')
// 根目录出发
assert.equal(toRelativePath('/', '/Users/x'), 'Users/x')
// 目标是根
assert.equal(toRelativePath('/a/b', '/'), '../..')
// 尾斜杠容错
assert.equal(toRelativePath('/a/b/', '/a/b/c.txt'), 'c.txt')
// 空格与中文不转义（POSIX 词法路径原样保留）
assert.equal(toRelativePath('/a/我的 目录', '/a/我的 目录/文 件.txt'), '文 件.txt')

// ============ toFileUri ============

assert.equal(toFileUri('/Users/wtb/a b.txt'), 'file:///Users/wtb/a%20b.txt')
assert.equal(toFileUri('/a/文档#c.txt'), 'file:///a/%E6%96%87%E6%A1%A3%23c.txt')
assert.equal(toFileUri('/plain/path'), 'file:///plain/path')

// ============ listingDiffers ============

function entry(over: Partial<FileInfo>): FileInfo {
  return {
    name: 'a.txt', path: '/a.txt', isDirectory: false, isFile: true,
    size: 1, modifiedTime: '2026-08-15T00:00:00Z', ...over
  }
}

const current = [entry({}), entry({ name: 'b', path: '/b' })]

// 完全一致（顺序无关）→ 不刷新
assert.equal(listingDiffers(current, [entry({ name: 'b', path: '/b' }), entry({})]), false)
// size 变化 → 刷新
assert.equal(listingDiffers(current, [entry({ size: 2 }), entry({ name: 'b', path: '/b' })]), true)
// mtime 变化 → 刷新
assert.equal(listingDiffers(current, [entry({ modifiedTime: '2026-08-16T00:00:00Z' }), entry({ name: 'b', path: '/b' })]), true)
// 新增条目 → 刷新
assert.equal(listingDiffers(current, [...current, entry({ name: 'c', path: '/c' })]), true)
// 删除条目 → 刷新
assert.equal(listingDiffers(current, [entry({})]), true)
// 同名 file↔directory 切换 → 刷新
assert.equal(listingDiffers(
  [entry({ name: 'x', path: '/x', isDirectory: false, isFile: true })],
  [entry({ name: 'x', path: '/x', isDirectory: true, isFile: false })]
), true)

console.log('✓ relative-path / listing-diff 纯函数测试全部通过')
