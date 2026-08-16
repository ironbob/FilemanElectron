/**
 * grep/rg 输出解析与命令构造 — 最小断言 harness（M3 验证）。
 */

import assert from 'node:assert/strict'
import {
  parseGrepLine,
  truncateLine,
  globsToRgArgs,
  globsToGrepArgs,
  rgFlags,
  grepFlags,
  looksBinary,
  createLineMatcher,
  matchGlob as streamGlob
} from '../electron/src/services/support/grepParsing'

// ============ parseGrepLine（rg 带列 / grep 只带行） ============

const rgLine = '/work/repo/src/a.ts:12:5:const x = TODO_FIX'
const m1 = parseGrepLine(rgLine, '/work/repo')!
assert.ok(m1)
assert.equal(m1.path, '/work/repo/src/a.ts')
assert.equal(m1.line, 12)
assert.equal(m1.column, 5)
assert.equal(m1.lineText, 'const x = TODO_FIX')

const grepLine = './src/a.ts:12:const x = TODO_FIX'
const m2 = parseGrepLine(grepLine, '/work/repo')!
assert.ok(m2)
// 相对路径归一为绝对（rootPath 尾斜杠容错）
assert.equal(m2.path, '/work/repo/src/a.ts')
assert.equal(m2.line, 12)
assert.equal(m2.column, undefined)

// 路径含冒号的歧义：以「:数字:」为界，不误切路径
const colonPath = '/work/my:dir/b.txt:3:2:hit'
const m3 = parseGrepLine(colonPath, '/work')!
assert.ok(m3)
assert.equal(m3.path, '/work/my:dir/b.txt')
assert.equal(m3.line, 3)
assert.equal(m3.column, 2)

// 非命中行
assert.equal(parseGrepLine('', '/r'), null)
assert.equal(parseGrepLine('no-separator-here', '/r'), null)
assert.equal(parseGrepLine('only:nonnumeric:x', '/r'), null)

// 行文本截断
assert.equal(truncateLine('x'.repeat(500)).length, 401) // 400 + …
assert.equal(truncateLine('short'), 'short')

// ============ 命令构造 ============

assert.deepEqual(globsToRgArgs('*.ts, *.vue', '*.log'), ['-g', '*.ts', '-g', '*.vue', '-g', '!*.log'])
assert.deepEqual(globsToRgArgs(undefined, undefined), [])
assert.deepEqual(globsToGrepArgs('*.ts', '*.log'), { include: ['--include=*.ts'], exclude: ['--exclude=*.log'] })

assert.deepEqual(rgFlags(true, true), ['-n', '--no-heading', '--color', 'never', '--column'])
assert.ok(rgFlags(false, false).includes('-F'))
assert.ok(rgFlags(false, false).includes('-i'))
assert.ok(grepFlags(false, true).includes('-F'))
assert.ok(!grepFlags(false, true).includes('-i'))

// ============ 二进制嗅探 ============

assert.equal(looksBinary(Buffer.from('hello\0world')), true)
assert.equal(looksBinary(Buffer.from('plain text')), false)

// ============ 行匹配器 ============

const fixedCi = createLineMatcher('todo', false, false)
assert.equal(fixedCi('has TODO here'), 4)
const fixedCs = createLineMatcher('TODO', false, true)
assert.equal(fixedCs('has todo here'), -1)
const re = createLineMatcher('foo\\d+', true, true)
assert.equal(re('xx foo123'), 3)
const reCi = createLineMatcher('FOO\\d', true, false)
assert.equal(reCi('xx foo1'), 3)

// ============ 流式引擎 glob ============

assert.equal(streamGlob('a.ts', '*.ts'), true)
assert.equal(streamGlob('a.tsx', '*.ts'), false)
assert.equal(streamGlob('x.ts', '*.TS'), false) // 大小写敏感
assert.equal(streamGlob('src/deep/a.ts', 'src/**'), true)
assert.equal(streamGlob('other/a.ts', 'src/**'), false)
assert.equal(streamGlob('exact.txt', 'exact.txt'), true)

console.log('✓ grepParsing 解析/构造/嗅探/匹配测试全部通过')
