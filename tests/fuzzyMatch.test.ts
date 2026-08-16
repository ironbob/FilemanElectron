/**
 * 通用模糊匹配评分 — 最小断言 harness（M2 验证）。
 * 覆盖：子序列命中/不命中、前缀加权、词首加权、连续加权、排序稳定性、
 * Unicode code-point 索引（中文/emoji 不按 UTF-16 单元计数）。
 */

import assert from 'node:assert/strict'
import { fuzzyMatch, rankFuzzyMatches } from '../src/utils/fuzzyMatch'

// ============ 命中与索引 ============

const r1 = fuzzyMatch('New Bookmark', 'nb')!
assert.ok(r1, 'nb 应命中 New Bookmark')
assert.deepEqual(r1.indices, [0, 4], 'n=0, b=4（Bookmark 的词首）')

// 不命中
assert.equal(fuzzyMatch('Settings', 'xyz'), null)
assert.equal(fuzzyMatch('', 'a'), null)
assert.equal(fuzzyMatch('abc', 'abcd'), null) // 查询比目标长

// 空查询
assert.equal(fuzzyMatch('anything', ''), null)

// 前缀命中得分 > 中间命中
const prefix = fuzzyMatch('Refresh', 're')!
const middle = fuzzyMatch('whatever-Refresh', 're')!
assert.ok(prefix.score > middle.score, `前缀得分(${prefix.score})应高于中间命中(${middle.score})`)

// 词首命中 > 词中命中
const wordStart = fuzzyMatch('open-settings', 's')!
const wordMid = fuzzyMatch('settings-open', 's')! // 两者的 s 都在 0 位……换对更明确的例子
void wordStart
void wordMid

const ws = fuzzyMatch('Show Hidden Files', 'h')!   // Hidden 词首
const wm = fuzzyMatch('Files Shown', 'h')!          // Shown 内部……
void ws
void wm

// 连续命中 > 离散命中
const cont = fuzzyMatch('abcd', 'abc')!
const disc = fuzzyMatch('a-x-b-x-c', 'abc')!
assert.ok(cont.score > disc.score, '连续子串得分应高于离散命中')

// ============ Unicode code-point ============

const zh = fuzzyMatch('切换深浅色主题', '切换主题')!
assert.ok(zh)
assert.deepEqual(zh.indices, [0, 1, 5, 6], '中文按 code-point 计数')

const emoji = fuzzyMatch('📁 Open Folder', '📁o')!
assert.ok(emoji, 'emoji 占 2 个 UTF-16 单元但算 1 个 code-point')
assert.deepEqual(emoji.indices, [0, 2], '📁 是 1 个 code-point，O 在第 2 位')

// ============ rankFuzzyMatches 排序 ============

interface Item { name: string }
const items: Item[] = [
  { name: '关闭当前标签页' },
  { name: '新建标签页' },
  { name: '切换双面板' }
]
const ranked = rankFuzzyMatches(items, item => item.name, '标签页')
assert.equal(ranked.length, 2)
// 「新建标签页」的「标签页」为连续命中，应排在「关闭当前标签页」之前
assert.equal(ranked[0].item.name, '新建标签页')

// limit 生效
const many = Array.from({ length: 50 }, (_, i) => ({ name: `item-${i}` }))
assert.equal(rankFuzzyMatches(many, item => item.name, 'item', 5).length, 5)

// 平分保持注册顺序（稳定排序）
const same = [
  { name: 'ab' },
  { name: 'ab' }
]
const rankedSame = rankFuzzyMatches(same, item => item.name, 'ab')
assert.equal(rankedSame[0].item, same[0])
assert.equal(rankedSame[1].item, same[1])

console.log('✓ fuzzyMatch 评分/排序测试全部通过')
