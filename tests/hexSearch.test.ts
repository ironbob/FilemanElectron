/**
 * hexSearch 查找模式与块内匹配 — 最小断言 harness。
 * 覆盖：nibble 通配解析（含非法输入）、文本模式、matchAt 边界、
 * findMatchesInChunk 非重叠语义与跨块重叠去重（minStart）。
 */

import assert from 'node:assert/strict'
import {
  parseHexPattern,
  textToPattern,
  matchAt,
  findMatchesInChunk,
  type NibblePattern
} from '../src/utils/hexSearch'

// ============ parseHexPattern ============

{
  const ok = parseHexPattern('48 65')
  assert.ok('pattern' in ok)
  assert.deepEqual(ok.pattern, [
    { hi: 4, lo: 8 },
    { hi: 6, lo: 5 }
  ])
}
{
  const wild = parseHexPattern('4? ??')
  assert.ok('pattern' in wild)
  assert.deepEqual(wild.pattern, [
    { hi: 4, lo: null },
    { hi: null, lo: null }
  ])
  const lowWild = parseHexPattern('?f')
  assert.ok('pattern' in lowWild)
  assert.deepEqual(lowWild.pattern, [{ hi: null, lo: 15 }])
}
// 连续串与大小写
{
  const joined = parseHexPattern('4142ab')
  assert.ok('pattern' in joined)
  assert.equal(joined.pattern.length, 3)
  assert.deepEqual(joined.pattern[2], { hi: 10, lo: 11 })
}
// 非法：空 / 奇数位 / 非法字符
assert.ok('error' in parseHexPattern(''))
assert.ok('error' in parseHexPattern('   '))
assert.ok('error' in parseHexPattern('414'))
assert.ok('error' in parseHexPattern('41z9'))
assert.ok('error' in parseHexPattern('41 4? 4'))  // 去空白后奇数位

// ============ textToPattern（UTF-8） ============

{
  const ok = textToPattern('He')
  assert.ok('pattern' in ok)
  assert.deepEqual(ok.pattern, [
    { hi: 4, lo: 8 },
    { hi: 6, lo: 5 }
  ])
}
{
  const zh = textToPattern('中')  // UTF-8: E4 B8 AD
  assert.ok('pattern' in zh)
  assert.deepEqual(zh.pattern, [
    { hi: 14, lo: 4 },
    { hi: 11, lo: 8 },
    { hi: 10, lo: 13 }
  ])
}
assert.ok('error' in textToPattern(''))

// ============ matchAt ============

const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
const he: NibblePattern[] = [{ hi: 4, lo: 8 }, { hi: 6, lo: 5 }]
assert.equal(matchAt(data, 0, he), true)
assert.equal(matchAt(data, 1, he), false)
assert.equal(matchAt(data, 4, he), false)          // 越界（4+2 > 5）
assert.equal(matchAt(data, -1, he), false)
assert.equal(matchAt(data, 0, []), true)           // 空模式恒真（防御）

// 通配：4? 匹配 0x48/0x4f；?? 匹配任意
assert.equal(matchAt(data, 0, [{ hi: 4, lo: null }]), true)
assert.equal(matchAt(data, 1, [{ hi: 4, lo: null }]), false)
assert.equal(matchAt(data, 4, [{ hi: null, lo: null }]), true)

// ============ findMatchesInChunk（非重叠 + minStart 去重） ============

// 'll' 在 "Hello" 的 2、3 位重叠出现 → 非重叠语义只报 2
{
  const ll: NibblePattern[] = [{ hi: 6, lo: 12 }, { hi: 6, lo: 12 }]
  assert.deepEqual(findMatchesInChunk(data, ll, 0), [2])
}
// 高 nibble 6 的字节：0x65(1) 0x6c(2) 0x6c(3) 0x6f(4)
{
  const sixHi: NibblePattern[] = [{ hi: 6, lo: null }]
  assert.deepEqual(findMatchesInChunk(data, sixHi, 0), [1, 2, 3, 4])
}
// minStart：跨块重叠区去重（块 2 起点回退导致重复扫描区间）
{
  const sixHi: NibblePattern[] = [{ hi: 6, lo: null }]
  const chunk2 = data.subarray(1)  // 绝对起点 1
  assert.deepEqual(findMatchesInChunk(chunk2, sixHi, 1, 2), [2, 3, 4])  // 绝对 1 被排除
}
// 块尾不完整模式：块长 2、模式长 2 → 只查起点 0
{
  const short = data.subarray(0, 2)
  assert.deepEqual(findMatchesInChunk(short, he, 0), [0])
}

console.log('✓ hexSearch 模式解析 + 块内匹配测试全部通过')
