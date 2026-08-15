/**
 * Log Analysis - minimal assertion harness (module C verification)
 *
 * The repo has no test framework; this file bundles with esbuild and runs
 * under node (`npm run log-analysis-test`, see package.json). It is NOT
 * imported by app code, so it stays out of production bundles.
 *
 * Covers: engine predicate extension + backward compat (IFC-1), filter
 * pipeline invariants (IFC-2), scheme overlay semantics (IFC-3) and scheme
 * serializer round-trips (QA-6).
 */

import assert from 'node:assert/strict'
import { ComposeExpression } from '../src/utils/textFilter'
import {
  runFilterSync,
  runFilterAsync,
  FilterOptions
} from '../src/utils/logAnalysis/filterPipeline'
import {
  HighlightScheme,
  BUILTIN_SCHEMES,
  compileScheme,
  matchLine
} from '../src/utils/logAnalysis/schemeModel'
import {
  serializeScheme,
  deserializeScheme,
  importedToScheme,
  uniqueName
} from '../src/utils/logAnalysis/schemeSerializer'

const BASE: FilterOptions = { invert: false, contextBefore: 0, contextAfter: 0 }

let passed = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++
      console.log(`  ✓ ${name}`)
    })
    .catch(err => {
      console.error(`  ✗ ${name}`)
      throw err
    })
}

async function main(): Promise<void> {
  // ── IFC-1: engine extension ─────────────────────────────────────────────
  await test('level() matches vocabulary synonyms case-insensitively', () => {
    const f = ComposeExpression('level(error)')
    assert.equal(f.match('2026-08-15 [ERROR] boom'), true)
    assert.equal(f.match('2026-08-15 error: x'), true)
    assert.equal(f.match('2026-08-15 FATAL: x'), true)
    assert.equal(f.match('2026-08-15 INFO: x'), false)
  })

  await test('level(a,b) matches any listed level', () => {
    const f = ComposeExpression('level(error,warn)')
    assert.equal(f.match('WARN deprecated'), true)
    assert.equal(f.match('INFO ok'), false)
  })

  await test('level() unknown level falls back to the word itself; custom vocabulary merges', () => {
    const f1 = ComposeExpression('level(trace2)')
    assert.equal(f1.match('hello TRACE2 world'), true)
    const f2 = ComposeExpression('level(custom)', {
      levels: { custom: ['bizflow'] }
    })
    assert.equal(f2.match('BIZFLOW started'), true)
    assert.equal(f2.match('other'), false)
  })

  await test('lines(n)/lines(n-m) match with LineContext only', () => {
    const f = ComposeExpression('lines(3-5)')
    assert.equal(f.requiresLineContext(), true)
    assert.equal(f.match('anything', { lineNumber: 4 }), true)
    assert.equal(f.match('anything', { lineNumber: 6 }), false)
    assert.equal(f.match('anything'), false, 'without ctx must be false')
    const single = ComposeExpression('lines(10)')
    assert.equal(single.match('x', { lineNumber: 10 }), true)
    assert.equal(single.match('x', { lineNumber: 11 }), false)
  })

  await test('lines() value syntax errors are reported at parse time', () => {
    assert.equal(ComposeExpression('lines(abc)').isValid(), false)
    assert.equal(ComposeExpression('lines(5-3)').isValid(), false)
    assert.equal(ComposeExpression('lines()').isValid(), false)
    assert.match(ComposeExpression('lines(abc)').error() ?? '', /lines/)
  })

  await test('invalid regex surfaces as expression error (not silent no-match)', () => {
    const bad = ComposeExpression('reg([unclosed)')
    assert.equal(bad.isValid(), false)
    assert.match(bad.error() ?? '', /regex/i)
  })

  await test('backward compat: legacy predicates unchanged without ctx', () => {
    const f = ComposeExpression('co(error) and not co(warning)')
    assert.equal(f.match('[ERROR] Connection failed'), true)
    assert.equal(f.match('[ERROR] with warning'), false)
    assert.equal(ComposeExpression('CO(Error)').match('error'), false)
    assert.equal(ComposeExpression('CO(Error)').match('x Error y'), true)
    assert.equal(ComposeExpression('word(fail)').match('failure'), false)
    assert.equal(ComposeExpression('word(fail)').match('total fail!'), true)
    assert.equal(ComposeExpression('eq(abc)').match('ABC'), true)
    assert.equal(ComposeExpression('reg(\\d+-\\d+)').match('a 12-34 b'), true)
  })

  // ── IFC-2: filter pipeline ──────────────────────────────────────────────
  const lines = ['alpha one', 'beta ERROR two', 'gamma three', 'delta ERROR four', 'epsilon']

  await test('pipeline: match-only keeps original line numbers', () => {
    const r = runFilterSync(lines, ComposeExpression('co(error)'), BASE)
    assert.deepEqual(
      r.entries.map(e => [e.sourceLine, e.kind]),
      [[2, 'match'], [4, 'match']]
    )
    assert.equal(r.matchCount, 2)
    assert.deepEqual(r.matchSourceLines, [2, 4])
    assert.equal(r.entries[0].text, 'beta ERROR two')
  })

  await test('pipeline: context window merges overlapping ranges, no duplicates', () => {
    const r = runFilterSync(
      lines,
      ComposeExpression('co(error)'),
      { invert: false, contextBefore: 1, contextAfter: 1 }
    )
    // matches at 2,4; contexts {1,3} ∪ {3,5} = {1,3,5}
    assert.deepEqual(
      r.entries.map(e => [e.sourceLine, e.kind]),
      [[1, 'context'], [2, 'match'], [3, 'context'], [4, 'match'], [5, 'context']]
    )
    assert.equal(r.matchCount, 2)
  })

  await test('pipeline: zero context when disabled', () => {
    const r = runFilterSync(lines, ComposeExpression('co(error)'), {
      invert: false,
      contextBefore: 0,
      contextAfter: 0
    })
    assert.equal(r.entries.some(e => e.kind === 'context'), false)
  })

  await test('pipeline: invert flips semantics, count matches complement', () => {
    const positive = runFilterSync(lines, ComposeExpression('co(error)'), BASE)
    const inverted = runFilterSync(lines, ComposeExpression('co(error)'), { ...BASE, invert: true })
    assert.equal(inverted.matchCount, lines.length - positive.matchCount)
    assert.deepEqual(inverted.matchSourceLines, [1, 3, 5])
  })

  await test('pipeline: zero hits is a valid result, not an error', () => {
    const r = runFilterSync(lines, ComposeExpression('co(nope)'), BASE)
    assert.equal(r.matchCount, 0)
    assert.deepEqual(r.entries, [])
  })

  await test('pipeline: cancelled run resolves to null (generation guard)', async () => {
    const bigLines = Array.from({ length: 150000 }, (_, i) => `line ${i} ${i % 7 === 0 ? 'ERROR' : 'ok'}`)
    let cancelled = false
    const promise = runFilterAsync(
      bigLines,
      ComposeExpression('co(error)'),
      BASE,
      { isCancelled: () => cancelled },
      10000 // small chunks so cancellation is observable
    )
    cancelled = true
    const r = await promise
    assert.equal(r, null)
  })

  await test('pipeline: async result equals sync result', async () => {
    const r = await runFilterAsync(
      lines,
      ComposeExpression('co(error)'),
      { invert: false, contextBefore: 1, contextAfter: 0 }
    )
    const s = runFilterSync(lines, ComposeExpression('co(error)'), {
      invert: false,
      contextBefore: 1,
      contextAfter: 0
    })
    assert.deepEqual(r, s)
  })

  await test('pipeline: lines() predicate works end-to-end with context', () => {
    const r = runFilterSync(lines, ComposeExpression('lines(3)'), BASE)
    assert.deepEqual(r.matchSourceLines, [3])
  })

  // ── IFC-3: scheme overlay semantics ─────────────────────────────────────
  const scheme: HighlightScheme = {
    id: 'test-scheme',
    name: 'test',
    builtin: false,
    rules: [
      { id: 'r1', matchType: 'word', value: 'ERROR', scope: 'line', colorKey: 'red' },
      { id: 'r2', matchType: 'word', value: 'WARN', scope: 'line', colorKey: 'orange' },
      { id: 'r3', matchType: 'regex', value: '\\d+', scope: 'fragment', colorKey: 'blue' },
      { id: 'r4', matchType: 'contains', value: 'id', scope: 'fragment', colorKey: 'green' }
    ]
  }

  await test('scheme: first matching line rule wins', () => {
    const compiled = compileScheme(scheme)
    const c = matchLine(compiled, 'ERROR WARN here')
    assert.equal(c.lineClass, 'fma-hl-line-red')
  })

  await test('scheme: fragment priority is first-come, no overlap', () => {
    const compiled = compileScheme(scheme)
    // "id123": regex \d+ claims "123" first; later 'contains id' claims "id"
    const c = matchLine(compiled, 'id123')
    assert.deepEqual(
      c.fragments.map(f => [f.start, f.end, f.className]),
      [[0, 2, 'fma-hl-frag-green'], [2, 5, 'fma-hl-frag-blue']]
    )
  })

  await test('scheme: single invalid rule is skipped, others still compile', () => {
    const withBad: HighlightScheme = {
      ...scheme,
      rules: [
        ...scheme.rules,
        { id: 'bad', matchType: 'regex', value: '[unclosed', scope: 'fragment', colorKey: 'pink' },
        { id: 'badcolor', matchType: 'word', value: 'x', scope: 'line', colorKey: 'nope' as string }
      ]
    }
    const compiled = compileScheme(withBad)
    assert.equal(compiled.invalidRules.length, 2)
    assert.ok(compiled.fragmentRules.length >= 1)
    const c = matchLine(compiled, 'ERROR 42')
    assert.equal(c.lineClass, 'fma-hl-line-red')
  })

  await test('scheme: built-in presets compile without invalid rules', () => {
    for (const b of BUILTIN_SCHEMES) {
      const compiled = compileScheme(b)
      assert.deepEqual(compiled.invalidRules, [], `${b.name} should be clean`)
    }
  })

  await test('scheme: line + fragment coloring coexist (R5)', () => {
    const compiled = compileScheme(scheme)
    const c = matchLine(compiled, 'ERROR code 500')
    assert.equal(c.lineClass, 'fma-hl-line-red')
    assert.ok(c.fragments.length > 0)
  })

  // ── QA-6: serializer ────────────────────────────────────────────────────
  await test('serializer: round-trip preserves rules and priority order', () => {
    const json = serializeScheme(scheme)
    const { data, error } = deserializeScheme(json)
    assert.equal(error, null)
    assert.ok(data !== null)
    assert.equal(data!.name, 'test')
    assert.deepEqual(
      data!.rules.map(r => [r.matchType, r.value, r.scope, r.colorKey]),
      scheme.rules.map(r => [r.matchType, r.value, r.scope, r.colorKey])
    )
  })

  await test('serializer: rejects invalid payloads without partial output', () => {
    assert.equal(deserializeScheme('not json').data, null)
    assert.ok(deserializeScheme('not json').error !== null)
    assert.ok(deserializeScheme('{"type":"other","version":1}').error !== null)
    assert.ok(deserializeScheme(`{"type":"fileman-color-scheme","version":99,"name":"x","rules":[]}`).error !== null)
    assert.ok(
      deserializeScheme(
        `{"type":"fileman-color-scheme","version":1,"name":"x","rules":[{"matchType":"nope","value":"a","scope":"line","colorKey":"red"}]}`
      ).error !== null
    )
  })

  await test('serializer: imported scheme avoids name collisions', () => {
    assert.equal(uniqueName(['a', 'b'], 'c'), 'c')
    assert.equal(uniqueName(['a'], 'a'), 'a (2)')
    assert.equal(uniqueName(['a', 'a (2)'], 'a'), 'a (3)')
    const { data } = deserializeScheme(serializeScheme(scheme))
    const imported = importedToScheme(data!, ['test'])
    assert.equal(imported.name, 'test (2)')
    assert.equal(imported.builtin, false)
  })

  console.log(`\n${passed} tests passed`)
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err)
    process.exit(1)
  }
)
