/**
 * Log Analysis - Filter Pipeline (ROLE-D02)
 *
 * Pure, framework-free filtering over an array of source lines.
 * Given a compiled expression and options (invert / context lines), produces a
 * FilterResult describing exactly which lines are visible in which role
 * (match vs. context), preserving original 1-based line numbers.
 *
 * Chunked evaluation: runFilterAsync yields to the event loop between chunks
 * so a 1M-line file does not freeze the renderer (PRD QA-1).
 */

import { ComposedExpression } from '../textFilter'

/** One visible line in the filtered view */
export interface FilterEntry {
  /** 1-based line number in the ORIGINAL file */
  sourceLine: number
  /** The line text */
  text: string
  /** 'match' = satisfied the expression; 'context' = shown only as context of a match */
  kind: 'match' | 'context'
}

/** Result of a filter run */
export interface FilterResult {
  /** Visible lines in ascending sourceLine order, no duplicates */
  entries: FilterEntry[]
  /** Number of lines satisfying the expression (kind === 'match') */
  matchCount: number
  /** 1-based source line numbers of matches, ascending */
  matchSourceLines: number[]
}

/** Filter behaviour options */
export interface FilterOptions {
  /** Show non-matching lines instead (PRD: 反向过滤) */
  invert: boolean
  /** Context lines shown before each match */
  contextBefore: number
  /** Context lines shown after each match */
  contextAfter: number
}

/** Default options: match lines only */
export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  invert: false,
  contextBefore: 0,
  contextAfter: 0
}

/** Cancellation / staleness signal for the async run */
export interface RunControl {
  /** Returns true when the caller considers this run obsolete; result is discarded */
  isCancelled: () => boolean
}

/** Lines per evaluation chunk before yielding to the event loop */
const CHUNK_SIZE = 20000

/**
 * Synchronous core: evaluate every line, then expand context windows.
 * Exposed for tests and for callers that already own the lines synchronously.
 */
export function runFilterSync(
  lines: readonly string[],
  expr: ComposedExpression,
  options: FilterOptions
): FilterResult {
  const lineCount = lines.length
  const matchFlags = new Uint8Array(lineCount)

  for (let i = 0; i < lineCount; i++) {
    const raw = expr.match(lines[i], { lineNumber: i + 1 })
    matchFlags[i] = (options.invert ? !raw : raw) ? 1 : 0
  }

  return assembleResult(lines, matchFlags, options)
}

/**
 * Chunked async evaluation. Yields between chunks so typing stays responsive
 * on very large files. Resolves to null when cancelled (caller discards).
 */
export async function runFilterAsync(
  lines: readonly string[],
  expr: ComposedExpression,
  options: FilterOptions,
  control?: RunControl,
  chunkSize: number = CHUNK_SIZE
): Promise<FilterResult | null> {
  const lineCount = lines.length
  const matchFlags = new Uint8Array(lineCount)

  // Phase 1: evaluate matches in chunks, yielding between chunks
  for (let start = 0; start < lineCount; start += chunkSize) {
    if (control?.isCancelled()) return null
    const end = Math.min(lineCount, start + chunkSize)
    for (let i = start; i < end; i++) {
      const raw = expr.match(lines[i], { lineNumber: i + 1 })
      matchFlags[i] = (options.invert ? !raw : raw) ? 1 : 0
    }
    if (end < lineCount) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  }

  if (control?.isCancelled()) return null

  // Phase 2: context expansion + entry assembly
  return assembleResult(lines, matchFlags, options)
}

/**
 * Shared tail: expand context windows over the match flags and build entries.
 */
function assembleResult(
  lines: readonly string[],
  matchFlags: Uint8Array,
  options: FilterOptions
): FilterResult {
  const lineCount = lines.length
  const contextFlags = new Uint8Array(lineCount)
  const before = Math.max(0, options.contextBefore)
  const after = Math.max(0, options.contextAfter)

  if (before > 0 || after > 0) {
    for (let i = 0; i < lineCount; i++) {
      if (matchFlags[i] === 1) {
        const from = Math.max(0, i - before)
        const to = Math.min(lineCount - 1, i + after)
        for (let j = from; j <= to; j++) contextFlags[j] = 1
      }
    }
  }

  const entries: FilterEntry[] = []
  const matchSourceLines: number[] = []
  for (let i = 0; i < lineCount; i++) {
    if (matchFlags[i] === 1) {
      entries.push({ sourceLine: i + 1, text: lines[i], kind: 'match' })
      matchSourceLines.push(i + 1)
    } else if (contextFlags[i] === 1) {
      entries.push({ sourceLine: i + 1, text: lines[i], kind: 'context' })
    }
  }

  return { entries, matchCount: matchSourceLines.length, matchSourceLines }
}
