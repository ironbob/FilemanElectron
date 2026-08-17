/**
 * Filter display model + match-range extraction tests (redesign 2026-08-17)
 *
 * Same minimal harness as tests/logAnalysis.test.ts: esbuild bundle → node.
 * Covers:
 * - buildFilterDisplayModel invariants (head/tail/middle gaps, whole-file gap,
 *   contiguity merging, label injection)
 * - matchDisplayLinesOf ordering
 * - createMatchRangeExtractor: co/CO/word/reg/eq ranges, composite → null,
 *   invalid regex → per-line empty fallback
 */

import assert from 'node:assert/strict'
import { ComposeExpression } from '../src/utils/textFilter'
import { createMatchRangeExtractor } from '../src/utils/logAnalysis/matchRanges'
import { buildFilterDisplayModel, matchDisplayLinesOf } from '../src/utils/logAnalysis/filterGaps'
import { FilterEntry } from '../src/utils/logAnalysis/filterPipeline'

const BASE = { invert: false, contextBefore: 0, contextAfter: 0 }
const gapLabel = (n: number) => `⋯ ${n} 行未显示 ⋯`

let passed = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(err => { console.error(`  ✗ ${name}`); throw err })
}

function entry(sourceLine: number, kind: 'match' | 'context', text = `L${sourceLine}`): FilterEntry {
  return { sourceLine, kind, text }
}

async function main(): Promise<void> {
  // ── buildFilterDisplayModel ───────────────────────────────────────────────
  await test('head/middle/tail gaps: entries 3,7 with total 9', () => {
    const { items, lineTexts } = buildFilterDisplayModel([entry(3, 'match'), entry(7, 'match')], 9, gapLabel)
    assert.deepEqual(items.map(i => i.type), ['gap', 'entry', 'gap', 'entry', 'gap'])
    const head = items[0] as { type: 'gap'; startLine: number; count: number }
    assert.equal(head.startLine, 1)
    assert.equal(head.count, 2)
    const gapMid = items[2] as { type: 'gap'; startLine: number; count: number }
    assert.equal(gapMid.startLine, 4)
    assert.equal(gapMid.count, 3)
    const gapTail = items[4] as { type: 'gap'; startLine: number; count: number }
    assert.equal(gapTail.startLine, 8)
    assert.equal(gapTail.count, 2)
    assert.equal(lineTexts[2], '⋯ 3 行未显示 ⋯')
  })

  await test('head gap appears when first entry sourceLine > 1', () => {
    const { items } = buildFilterDisplayModel([entry(5, 'match')], 10, gapLabel)
    assert.deepEqual(items.map(i => i.type), ['gap', 'entry', 'gap'])
    const head = items[0] as { type: 'gap'; startLine: number; count: number }
    assert.equal(head.startLine, 1)
    assert.equal(head.count, 4)
  })

  await test('no gaps when entries are exactly the whole file', () => {
    const { items } = buildFilterDisplayModel([entry(1, 'match'), entry(2, 'context'), entry(3, 'match')], 3, gapLabel)
    assert.deepEqual(items.map(i => i.type), ['entry', 'entry', 'entry'])
  })

  await test('zero entries + non-empty file → single whole-file gap', () => {
    const { items, lineTexts } = buildFilterDisplayModel([], 54, gapLabel)
    assert.equal(items.length, 1)
    const gap = items[0] as { type: 'gap'; startLine: number; count: number }
    assert.equal(gap.startLine, 1)
    assert.equal(gap.count, 54)
    assert.equal(lineTexts[0], '⋯ 54 行未显示 ⋯')
  })

  await test('contiguous context merging: adjacent entries never produce gaps', () => {
    const { items } = buildFilterDisplayModel(
      [entry(10, 'context'), entry(11, 'match'), entry(12, 'context'), entry(13, 'match'), entry(14, 'context')],
      20, gapLabel
    )
    // One block 10-14 + head gap 1-9 + tail gap 15-20
    assert.deepEqual(items.map(i => i.type), ['gap', 'entry', 'entry', 'entry', 'entry', 'entry', 'gap'])
  })

  await test('matchDisplayLinesOf: 1-based display lines of match entries only', () => {
    const { items } = buildFilterDisplayModel([entry(2, 'context'), entry(3, 'match'), entry(9, 'match')], 10, gapLabel)
    // items: gap(1) entry(2,c) entry(3,m) gap(4-8) entry(9,m) gap(10)
    assert.deepEqual(matchDisplayLinesOf(items), [3, 5])
  })

  // ── match ranges through the real pipeline ────────────────────────────────
  await test('pipeline: co(term) yields per-line char ranges on match entries', async () => {
    const { runFilterAsync } = await import('../src/utils/logAnalysis/filterPipeline')
    const expr = ComposeExpression('co(COMPONENT)')
    const extractor = createMatchRangeExtractor(expr.getAst())
    const lines = ['if(NOT CMAKE_INSTALL_COMPONENT)', 'nothing here', 'set(CMAKE_INSTALL_COMPONENT "x") COMPONENT again']
    const result = await runFilterAsync(lines, expr, BASE, undefined, undefined, extractor!)
    assert.equal(result!.matchCount, 2)
    const first = result!.entries[0]
    assert.equal(first.kind, 'match')
    // "if(NOT CMAKE_INSTALL_COMPONENT)" → COMPONENT at 21..30
    assert.deepEqual(first.ranges, [[21, 30]])
    const third = result!.entries[1]
    // both occurrences on the third line
    assert.deepEqual(third.ranges, [[18, 27], [33, 42]])
  })

  await test('extractor: CO is case-sensitive, co is not', () => {
    const sensitive = createMatchRangeExtractor(ComposeExpression('CO(Error)').getAst())!
    assert.deepEqual(sensitive('Error here'), [[0, 5]])
    assert.deepEqual(sensitive('ERROR error'), []) // case mismatch → no ranges
    const insensitive = createMatchRangeExtractor(ComposeExpression('co(Error)').getAst())!
    assert.deepEqual(insensitive('ERROR error'), [[0, 5], [6, 11]])
  })

  await test('extractor: word mode matches whole words only', () => {
    const word = createMatchRangeExtractor(ComposeExpression('word(err)').getAst())!
    // 'error'/'catastrophic' do not contain the whole word 'err'; the standalone one at 19 does
    assert.deepEqual(word('error catastrophic err'), [[19, 22]])
    assert.deepEqual(word('errors'), [])
  })

  await test('extractor: reg mode returns all matches, invalid regex → empty', () => {
    // REG (大写) = 大小写敏感；reg 则不敏感（此处验证敏感变体）
    const reg = createMatchRangeExtractor(ComposeExpression('REG([A-Z]+)').getAst())!
    assert.deepEqual(reg('abc DEF ghi JK'), [[4, 7], [12, 14]])
    const regInsensitive = createMatchRangeExtractor(ComposeExpression('reg([A-Z]+)').getAst())!
    assert.deepEqual(regInsensitive('abc DEF ghi JK'), [[0, 3], [4, 7], [8, 11], [12, 14]])
    // 表达式词法层面拒了非法字符；非法正则的真实路径是 plain 查询（AST 直构），
    // 此处手构同形 AST 验证按行降级行为
    const bad = createMatchRangeExtractor({ type: 'term', predicate: 'reg', value: '([)' })
    assert.deepEqual(bad!('anything'), [])
  })

  await test('extractor: composite expressions → null (whole-line fallback)', () => {
    assert.equal(createMatchRangeExtractor(ComposeExpression('co(a) and co(b)').getAst()), null)
    assert.equal(createMatchRangeExtractor(ComposeExpression('not co(a)').getAst()), null)
    assert.equal(createMatchRangeExtractor(ComposeExpression('level(error)').getAst()), null)
    assert.equal(createMatchRangeExtractor(null), null)
  })

  await test('extractor: eq yields whole-line range', () => {
    const eq = createMatchRangeExtractor(ComposeExpression('eq(abc)').getAst())!
    assert.deepEqual(eq('ABC'), [[0, 3]])
  })

  console.log(`\n[filterGaps] ${passed} tests OK`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
