/**
 * Log Analysis - Match Range Extraction (pure, no Monaco/Vue deps)
 *
 * Given a compiled expression's AST, produce a per-line extractor for the
 * character ranges of matched text (used for the L3/L2 find decorations).
 *
 * Contract (design decision ③, 2026-08-17):
 * - Only a ROOT-LEVEL single term with a text predicate (co/CO/eq/EQ/word/WORD/
 *   reg/REG) yields precise ranges.
 * - Everything else (and/or/not compositions, level(), lines(), invert) returns
 *   null → the caller degrades to whole-line highlight.
 */

import { ExpressionNode, LevelVocabulary } from '../textFilter'

/** Half-open char range [start, end), 0-based columns in the line text */
export type MatchRange = [number, number]

export type MatchRangeExtractor = (text: string) => MatchRange[]

const TEXT_PREDICATES = new Set(['co', 'CO', 'eq', 'EQ', 'word', 'WORD', 'reg', 'REG'])

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** All non-overlapping occurrences of `needle` (already case-folded per flag) */
function allIndexOf(text: string, needle: string, caseSensitive: boolean): MatchRange[] {
  if (needle === '') return []
  const ranges: MatchRange[] = []
  const haystack = caseSensitive ? text : text.toLowerCase()
  const target = caseSensitive ? needle : needle.toLowerCase()
  let from = 0
  for (;;) {
    const idx = haystack.indexOf(target, from)
    if (idx === -1) break
    ranges.push([idx, idx + needle.length])
    from = idx + needle.length
  }
  return ranges
}

function allRegexMatches(text: string, source: string, caseSensitive: boolean): MatchRange[] | null {
  try {
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(source, flags)
    const ranges: MatchRange[] = []
    for (;;) {
      const m = regex.exec(text)
      if (m === null) break
      if (m[0] === '') { regex.lastIndex += 1; continue } // zero-width guard
      ranges.push([m.index, m.index + m[0].length])
      if (ranges.length > 200) break // pathological pattern guard
    }
    return ranges
  } catch {
    return null // invalid regex → whole-line fallback
  }
}

/**
 * Build the extractor, or null when precise ranges are unavailable.
 * `levels` is accepted for signature symmetry but level() never gets ranges.
 */
export function createMatchRangeExtractor(
  ast: ExpressionNode | null,
  options?: { levels?: LevelVocabulary }
): MatchRangeExtractor | null {
  void options
  if (ast === null || ast.type !== 'term') return null
  const { predicate, value } = ast
  if (!TEXT_PREDICATES.has(predicate)) return null

  const caseSensitive = predicate === predicate.toUpperCase() && predicate !== predicate.toLowerCase()
  // ^ 'CO'/'EQ'/'WORD'/'REG' are the all-caps sensitive variants; 'co'/'word'/… insensitive

  switch (predicate.toLowerCase()) {
    case 'co':
      return text => allIndexOf(text, value, caseSensitive)
    case 'word': {
      const source = `\\b${escapeRegex(value)}\\b`
      return text => allRegexMatches(text, source, caseSensitive) ?? []
    }
    case 'reg':
      // Built at extraction time so an invalid pattern degrades per line, not at setup
      return text => allRegexMatches(text, value, caseSensitive) ?? []
    case 'eq':
      // Whole-line equality: highlight the entire line content
      return text => [[0, text.length]]
    default:
      return null
  }
}
