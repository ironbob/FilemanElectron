/**
 * Log Analysis - Monaco Filter View Adapter (ROLE-L04, infrastructure)
 *
 * Hides every Monaco detail of rendering a filtered view: rebuilding editor
 * content from a FilterResult, mapping display lines back to ORIGINAL line
 * numbers (PRD R2), dimming context rows, forcing read-only while the view is
 * transformed (PRD QA-3), and navigating to a hit.
 *
 * The domain pipeline knows nothing about this module (DIP: L02 calls in, never out).
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { FilterResult } from '@/utils/logAnalysis/filterPipeline'

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[MonacoFilterView]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error('[MonacoFilterView]', msg, ...args)
}

export interface FilterViewAdapter {
  /** Render a filter result (or null = restore the full original content) */
  applyFilterResult(result: FilterResult | null, originalContent: string): void
  /** Always restore the full original content and re-enable editing */
  clear(originalContent: string): void
  /** True while the editor shows a filtered (transformed) view */
  isActive(): boolean
  /** Scroll to a display line and place the cursor there */
  navigateToDisplayLine(displayLine: number): boolean
  dispose(): void
}

const CONTEXT_LINE_CLASS = 'fma-hl-context'

/**
 * Create the adapter. `getEditor` is a lazy accessor so the adapter survives
 * the host component recreating its editor (view-mode switches).
 */
export function createFilterViewAdapter(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): FilterViewAdapter {
  // display line (1-based) → source line (1-based)
  let lineMapping: number[] = []
  let active = false
  let contextDecorations: monaco.editor.IEditorDecorationsCollection | null = null
  let boundEditor: monaco.editor.IStandaloneCodeEditor | null = null

  /** The host recreates its editor on view-mode switches; drop stale handles */
  function rebindIfNeeded(editor: monaco.editor.IStandaloneCodeEditor): void {
    if (editor !== boundEditor) {
      contextDecorations = null
      boundEditor = editor
      active = false
      lineMapping = []
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
    contextDecorations?.clear()
    contextDecorations = null
    lineMapping = []
    active = false
    editor.setScrollTop(0)
    log.info('restore: full view, editable')
  }

  function apply(result: FilterResult, originalContent: string): void {
    void originalContent // filtered content is rebuilt from entries; original kept by caller
    const editor = getEditor()
    if (editor === null) return
    rebindIfNeeded(editor)
    const model = editor.getModel()
    if (model === null) return

    // Mark active BEFORE setValue so the host's modification listener can
    // suppress its isModified bookkeeping (read-only safety, QA-3)
    active = true
    lineMapping = result.entries.map(e => e.sourceLine)

    model.setValue(result.entries.map(e => e.text).join('\n'))
    editor.updateOptions({
      readOnly: true,
      lineNumbers: displayLine => String(lineMapping[displayLine - 1] ?? displayLine)
    })

    // Dim context rows so matches stay visually primary (non-color signal:
    // context rows are dimmed AND their numbers stay original)
    const contextRanges: monaco.editor.IModelDeltaDecoration[] = []
    result.entries.forEach((entry, idx) => {
      if (entry.kind === 'context') {
        const line = idx + 1
        contextRanges.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: { isWholeLine: true, className: CONTEXT_LINE_CLASS }
        })
      }
    })

    if (contextDecorations === null) {
      contextDecorations = editor.createDecorationsCollection(contextRanges)
    } else {
      contextDecorations.set(contextRanges)
    }

    editor.setScrollTop(0)
    log.info('apply: entries=%d contextRows=%d', result.entries.length, contextRanges.length)
  }

  return {
    applyFilterResult(result, originalContent) {
      if (result === null) {
        restore(originalContent)
        return
      }
      apply(result, originalContent)
    },

    clear(originalContent) {
      restore(originalContent)
    },

    isActive() {
      return active
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

    dispose() {
      contextDecorations?.clear()
      contextDecorations = null
      lineMapping = []
      active = false
    }
  }
}
