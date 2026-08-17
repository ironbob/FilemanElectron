/**
 * Log Analysis - Monaco Filter View Adapter v2 (ROLE-L04, infrastructure)
 *
 * Hides every Monaco detail of rendering the find/search views (redesign
 * 2026-08-17, docs/superpowers/specs/2026-08-17-text-preview-finder-redesign.md):
 *
 *   mode 'off'      — full editable content, native line numbers
 *   mode 'filtered' — A view: match blocks + context + gap pseudo-lines
 *                     ("⋯ N 行未显示 ⋯" chips), original line numbers remapped,
 *                     read-only
 *   mode 'full'     — B view: full content, read-only, L3 soft highlight on
 *                     every match + L2 solid-blue on the current match
 *
 * Decoration layers: L2 fma-find-current (blue solid + white text) sits above
 * L3 fma-find-match (soft yellow); context rows dim via fma-hl-context (55%).
 * Entries without character ranges (composite expressions / invert) degrade to
 * whole-line L3.
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { FilterResult } from '@/utils/logAnalysis/filterPipeline'
import { FilterDisplayItem } from '@/utils/logAnalysis/filterGaps'

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[MonacoFilterView]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error('[MonacoFilterView]', msg, ...args)
}

export type FilterViewMode = 'off' | 'filtered' | 'full'

export type FilterViewHit =
  | { kind: 'gap'; sourceLine: number }
  | { kind: 'match'; matchIndex: number; sourceLine: number }

export interface FilterDisplayModel {
  items: FilterDisplayItem[]
  lineTexts: string[]
  /** display-line (1-based) of each match, in match order */
  matchDisplayLines: number[]
}

export interface FilterViewAdapter {
  /** Render the filtered (A) view from a prebuilt display model */
  applyFilterResult(result: FilterResult, model: FilterDisplayModel, originalContent: string): void
  /** Render the full-content highlight (B) view */
  showFullHighlight(result: FilterResult, originalContent: string): void
  /** Always restore the full original content and re-enable editing */
  clear(originalContent: string): void
  /** True while the editor shows a transformed (filtered/full-highlight) view */
  isActive(): boolean
  mode(): FilterViewMode
  /** Update the L2 current-match decoration (-1 = none) */
  setCurrentMatchIndex(index: number): void
  /** Scroll to a display line and place the cursor there (A view) */
  navigateToDisplayLine(displayLine: number): boolean
  /** Scroll to a source line and place the cursor there (B view) */
  navigateToSourceLine(sourceLine: number): boolean
  /** Resolve a click on a display line into a gap/match hit (A view only) */
  hitTestDisplayLine(displayLine: number): FilterViewHit | null
  dispose(): void
}

const CONTEXT_LINE_CLASS = 'fma-hl-context'
const GAP_LINE_CLASS = 'fma-gap-line'
const GAP_CHIP_CLASS = 'fma-gap-chip'
const MATCH_CLASS = 'fma-find-match'
const CURRENT_CLASS = 'fma-find-current'

/**
 * Create the adapter. `getEditor` is a lazy accessor so the adapter survives
 * the host component recreating its editor (view-mode switches).
 */
export function createFilterViewAdapter(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): FilterViewAdapter {
  let mode: FilterViewMode = 'off'
  let items: FilterDisplayItem[] = []
  let matchDisplayLines: number[] = []
  let matchSourceLines: number[] = []
  let currentMatchIndex = -1
  let baseDecorations: monaco.editor.IEditorDecorationsCollection | null = null
  let currentDecorations: monaco.editor.IEditorDecorationsCollection | null = null
  let boundEditor: monaco.editor.IStandaloneCodeEditor | null = null

  /** The host recreates its editor on view-mode switches; drop stale handles */
  function rebindIfNeeded(editor: monaco.editor.IStandaloneCodeEditor): void {
    if (editor !== boundEditor) {
      baseDecorations = null
      currentDecorations = null
      boundEditor = editor
      mode = 'off'
      items = []
      matchDisplayLines = []
      matchSourceLines = []
      currentMatchIndex = -1
    }
  }

  function setBase(decorations: monaco.editor.IModelDeltaDecoration[]): void {
    const editor = getEditor()
    if (editor === null) return
    if (baseDecorations === null) {
      baseDecorations = editor.createDecorationsCollection(decorations)
    } else {
      baseDecorations.set(decorations)
    }
  }

  function restore(originalContent: string): void {
    const editor = getEditor()
    if (editor === null) return
    rebindIfNeeded(editor)
    const model = editor.getModel()
    if (model !== null) {
      model.setValue(originalContent)
    }
    // Back to editable full view with native line numbers
    editor.updateOptions({ readOnly: false, lineNumbers: 'on' })
    baseDecorations?.clear()
    currentDecorations?.clear()
    baseDecorations = null
    currentDecorations = null
    items = []
    matchDisplayLines = []
    matchSourceLines = []
    currentMatchIndex = -1
    mode = 'off'
    editor.setScrollTop(0)
    log.info('restore: full view, editable')
  }

  /** L3 match decorations for one line; whole-line fallback without ranges */
  function pushMatchDecorations(
    out: monaco.editor.IModelDeltaDecoration[],
    line: number,
    ranges: Array<[number, number]> | undefined
  ): void {
    if (ranges !== undefined && ranges.length > 0) {
      for (const [start, end] of ranges) {
        out.push({
          range: { startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: end + 1 },
          options: { inlineClassName: MATCH_CLASS }
        })
      }
    } else {
      out.push({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: MATCH_CLASS }
      })
    }
  }

  function applyFiltered(result: FilterResult, model: FilterDisplayModel, originalContent: string): void {
    void originalContent // filtered content is rebuilt from items; original kept by caller
    const editor = getEditor()
    if (editor === null) return
    rebindIfNeeded(editor)
    const m = editor.getModel()
    if (m === null) return

    // Mark mode BEFORE setValue so the host's modification listener can
    // suppress its isModified bookkeeping (read-only safety, QA-3)
    mode = 'filtered'
    items = model.items
    matchDisplayLines = model.matchDisplayLines
    matchSourceLines = result.matchSourceLines

    m.setValue(model.lineTexts.join('\n'))
    editor.updateOptions({
      readOnly: true,
      lineNumbers: displayLine => {
        const item = items[displayLine - 1]
        if (item === undefined) return String(displayLine)
        return item.type === 'gap' ? '' : String(item.entry.sourceLine)
      }
    })

    // Decorations: dim context rows, gap chips, L3 match highlights
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    items.forEach((item, idx) => {
      const line = idx + 1
      if (item.type === 'gap') {
        decorations.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: { isWholeLine: true, className: GAP_LINE_CLASS }
        })
        const label = model.lineTexts[idx]
        decorations.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: label.length + 1 },
          options: { inlineClassName: GAP_CHIP_CLASS }
        })
      } else if (item.entry.kind === 'context') {
        decorations.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: { isWholeLine: true, className: CONTEXT_LINE_CLASS }
        })
      } else {
        pushMatchDecorations(decorations, line, item.entry.ranges)
      }
    })
    setBase(decorations)
    applyCurrentMatch()

    editor.setScrollTop(0)
    log.info('apply: items=%d matches=%d', items.length, matchSourceLines.length)
  }

  function applyFullHighlight(result: FilterResult, originalContent: string): void {
    const editor = getEditor()
    if (editor === null) return
    rebindIfNeeded(editor)
    const m = editor.getModel()
    if (m === null) return

    mode = 'full'
    items = []
    matchDisplayLines = []
    matchSourceLines = result.matchSourceLines

    m.setValue(originalContent)
    editor.updateOptions({ readOnly: true, lineNumbers: 'on' })

    // L3 on every match line at its SOURCE line number
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    const bySourceLine = new Map<number, Array<[number, number]> | undefined>()
    for (const entry of result.entries) {
      if (entry.kind === 'match') bySourceLine.set(entry.sourceLine, entry.ranges)
    }
    for (const sourceLine of result.matchSourceLines) {
      pushMatchDecorations(decorations, sourceLine, bySourceLine.get(sourceLine))
    }
    setBase(decorations)
    applyCurrentMatch()

    log.info('showFullHighlight: matches=%d', matchSourceLines.length)
  }

  /** Rebuild the L2 current-match decoration from currentMatchIndex + mode */
  function applyCurrentMatch(): void {
    const editor = getEditor()
    if (editor === null) return
    const decorations: monaco.editor.IModelDeltaDecoration[] = []

    if (currentMatchIndex >= 0 && currentMatchIndex < matchSourceLines.length) {
      let line = -1
      let ranges: Array<[number, number]> | undefined
      if (mode === 'filtered') {
        const displayLine = matchDisplayLines[currentMatchIndex]
        const item = items[displayLine - 1]
        if (item !== undefined && item.type === 'entry') {
          line = displayLine
          ranges = item.entry.ranges
        }
      } else if (mode === 'full') {
        line = matchSourceLines[currentMatchIndex]
        ranges = currentMatchRangesBySource.get(line)
      }
      if (line > 0) {
        if (ranges !== undefined && ranges.length > 0) {
          const [start, end] = ranges[0]
          decorations.push({
            range: { startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: end + 1 },
            options: { inlineClassName: CURRENT_CLASS }
          })
        } else {
          decorations.push({
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: { isWholeLine: true, className: CURRENT_CLASS }
          })
        }
      }
    }

    if (currentDecorations === null) {
      currentDecorations = editor.createDecorationsCollection(decorations)
    } else {
      currentDecorations.set(decorations)
    }
  }

  /** sourceLine → ranges, maintained for the B view's current-match lookup */
  const currentMatchRangesBySource = new Map<number, Array<[number, number]> | undefined>()
  function rememberSourceRanges(result: FilterResult): void {
    currentMatchRangesBySource.clear()
    for (const entry of result.entries) {
      if (entry.kind === 'match') currentMatchRangesBySource.set(entry.sourceLine, entry.ranges)
    }
  }

  return {
    applyFilterResult(result, model, originalContent) {
      rememberSourceRanges(result)
      applyFiltered(result, model, originalContent)
    },

    showFullHighlight(result, originalContent) {
      rememberSourceRanges(result)
      applyFullHighlight(result, originalContent)
    },

    clear(originalContent) {
      restore(originalContent)
    },

    isActive() {
      return mode !== 'off'
    },

    mode() {
      return mode
    },

    setCurrentMatchIndex(index) {
      currentMatchIndex = index
      if (mode !== 'off') applyCurrentMatch()
    },

    navigateToDisplayLine(displayLine) {
      const editor = getEditor()
      if (editor === null) return false
      const model = editor.getModel()
      if (model === null || displayLine < 1 || displayLine > model.getLineCount()) return false
      editor.revealLineInCenter(displayLine)
      editor.setPosition({ lineNumber: displayLine, column: 1 })
      editor.focus()
      return true
    },

    navigateToSourceLine(sourceLine) {
      const editor = getEditor()
      if (editor === null) return false
      const model = editor.getModel()
      if (model === null || sourceLine < 1 || sourceLine > model.getLineCount()) return false
      editor.revealLineInCenter(sourceLine)
      editor.setPosition({ lineNumber: sourceLine, column: 1 })
      editor.focus()
      return true
    },

    hitTestDisplayLine(displayLine) {
      if (mode !== 'filtered' || displayLine < 1) return null
      const item = items[displayLine - 1]
      if (item === undefined) return null
      if (item.type === 'gap') {
        return { kind: 'gap', sourceLine: item.startLine }
      }
      if (item.entry.kind === 'match') {
        const matchIndex = matchDisplayLines.indexOf(displayLine)
        if (matchIndex === -1) return null
        return { kind: 'match', matchIndex, sourceLine: item.entry.sourceLine }
      }
      return null
    },

    dispose() {
      baseDecorations?.clear()
      currentDecorations?.clear()
      baseDecorations = null
      currentDecorations = null
      items = []
      matchDisplayLines = []
      matchSourceLines = []
      currentMatchRangesBySource.clear()
      currentMatchIndex = -1
      mode = 'off'
    }
  }
}
