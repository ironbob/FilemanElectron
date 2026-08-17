/**
 * Log Analysis - Filter Display Model (pure, no Monaco/Vue deps)
 *
 * Turns a FilterResult (entries only) into the display model for the filtered
 * view (design 2026-08-17): contiguous runs of entries become blocks, and every
 * hidden run of source lines — INCLUDING the file head and tail — becomes a
 * "gap" pseudo-line rendered as a clickable ⋯ N 行未显示 ⋯ chip. No hidden
 * region is ever expressed as bare whitespace (which reads like a load failure).
 */

import { FilterEntry, FilterResult } from './filterPipeline'

/** A hidden run of source lines (rendered as one gap chip pseudo-line) */
export interface FilterGapItem {
  type: 'gap'
  /** First hidden source line (1-based) */
  startLine: number
  /** Number of hidden lines */
  count: number
}

/** A visible line (match or context) */
export interface FilterEntryItem {
  type: 'entry'
  entry: FilterEntry
}

export type FilterDisplayItem = FilterGapItem | FilterEntryItem

/**
 * Build the flat display sequence. `gapLabel` renders the chip text for a gap
 * count (kept injectable so tests don't depend on i18n).
 *
 * Invariants:
 * - items[0] is a head gap iff the first entry's sourceLine > 1
 * - items[last] is a tail gap iff the last entry's sourceLine < totalSourceLines
 * - between two adjacent entries with sourceLine difference > 1 exactly one gap
 */
export function buildFilterDisplayModel(
  entries: readonly FilterEntry[],
  totalSourceLines: number,
  gapLabel: (count: number) => string
): { items: FilterDisplayItem[]; lineTexts: string[] } {
  const items: FilterDisplayItem[] = []

  let prevSource = 0
  for (const entry of entries) {
    const gapStart = prevSource + 1
    if (entry.sourceLine > gapStart) {
      items.push({ type: 'gap', startLine: gapStart, count: entry.sourceLine - gapStart })
    }
    items.push({ type: 'entry', entry })
    prevSource = entry.sourceLine
  }

  if (entries.length === 0 && totalSourceLines > 0) {
    // Everything hidden — one gap covering the whole file
    items.push({ type: 'gap', startLine: 1, count: totalSourceLines })
    prevSource = totalSourceLines
  } else if (prevSource < totalSourceLines) {
    items.push({ type: 'gap', startLine: prevSource + 1, count: totalSourceLines - prevSource })
  }

  const lineTexts = items.map(item =>
    item.type === 'gap' ? gapLabel(item.count) : item.entry.text
  )
  return { items, lineTexts }
}

/**
 * Display-line index (1-based) of each match, in match order — the navigation
 * targets for ▲/▼ inside the filtered view.
 */
export function matchDisplayLinesOf(items: readonly FilterDisplayItem[]): number[] {
  const lines: number[] = []
  items.forEach((item, idx) => {
    if (item.type === 'entry' && item.entry.kind === 'match') lines.push(idx + 1)
  })
  return lines
}

/** Convenience: build display model + match lines from a FilterResult in one call */
export function buildDisplayModelFromResult(
  result: FilterResult,
  totalSourceLines: number,
  gapLabel: (count: number) => string
): { items: FilterDisplayItem[]; lineTexts: string[]; matchDisplayLines: number[] } {
  const model = buildFilterDisplayModel(result.entries, totalSourceLines, gapLabel)
  return { ...model, matchDisplayLines: matchDisplayLinesOf(model.items) }
}
