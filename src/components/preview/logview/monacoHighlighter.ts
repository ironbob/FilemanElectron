/**
 * Log Analysis - Monaco Highlight Renderer (ROLE-L05, infrastructure)
 *
 * Applies a compiled HighlightScheme to the editor as decorations, lazily:
 * only the visible viewport plus a buffer is computed/decorated, and rows far
 * outside the buffer are trimmed. This keeps a million-line log usable —
 * computing decorations for the whole file upfront would freeze the renderer
 * (contract IFC-4).
 *
 * Rows keep their decoration descriptors (not live ids), and the collection is
 * rebuilt from that cache on each apply — simple and bounded
 * (MAX_DECORATED_ROWS x rules). RAF-debounced: scroll bursts coalesce into
 * one apply per frame.
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { CompiledScheme, matchLine } from '@/utils/logAnalysis/schemeModel'

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[MonacoHighlighter]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error('[MonacoHighlighter]', msg, ...args)
}

export interface HighlighterAdapter {
  /** Swap the active scheme (null disables coloring); triggers a full refresh */
  setCompiledScheme(compiled: CompiledScheme | null): void
  /** Debounced re-apply for the current viewport; call on scroll/layout/editor ready */
  scheduleRefresh(): void
  dispose(): void
}

/** Rows decorated beyond the visible range, on each side */
const VIEWPORT_BUFFER = 150
/** Hard cap on decorated rows; beyond this the farthest rows are trimmed */
const MAX_DECORATED_ROWS = 3000

interface CachedRow {
  displayLine: number
  decorations: monaco.editor.IModelDeltaDecoration[]
}

/** Build the decorations for one display line under a compiled scheme */
function buildRowDecorations(
  compiled: CompiledScheme,
  model: monaco.editor.ITextModel,
  line: number
): monaco.editor.IModelDeltaDecoration[] | null {
  const coloring = matchLine(compiled, model.getLineContent(line))
  if (coloring.lineClass === null && coloring.fragments.length === 0) return null

  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  if (coloring.lineClass !== null) {
    decorations.push({
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: { isWholeLine: true, className: coloring.lineClass }
    })
  }
  for (const frag of coloring.fragments) {
    decorations.push({
      range: {
        startLineNumber: line,
        startColumn: frag.start + 1,
        endLineNumber: line,
        endColumn: frag.end + 1
      },
      options: { inlineClassName: frag.className }
    })
  }
  return decorations
}

export function createHighlighter(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): HighlighterAdapter {
  let compiled: CompiledScheme | null = null
  let collection: monaco.editor.IEditorDecorationsCollection | null = null
  let boundEditor: monaco.editor.IStandaloneCodeEditor | null = null
  let rows: CachedRow[] = []
  let appliedSchemeId: string | null = null
  let rafHandle = 0
  let disposed = false

  function clearAll(): void {
    collection?.clear()
    rows = []
  }

  function apply(): void {
    rafHandle = 0
    const editor = getEditor()
    if (disposed || editor === null) return

    // The host recreates its editor on view-mode switches; rebind cleanly
    if (editor !== boundEditor) {
      clearAll()
      collection = null
      boundEditor = editor
    }

    if (compiled === null) {
      clearAll()
      appliedSchemeId = null
      return
    }
    const model = editor.getModel()
    if (model === null) return

    // Scheme swap invalidates the whole cache
    if (appliedSchemeId !== compiled.schemeId) {
      log.info('scheme swap: %s -> %s (invalid=%d)',
        appliedSchemeId ?? 'none', compiled.schemeId, compiled.invalidRules.length)
      clearAll()
      appliedSchemeId = compiled.schemeId
    }
    if (collection === null) {
      collection = editor.createDecorationsCollection([])
    }

    const ranges = editor.getVisibleRanges()
    if (ranges.length === 0) return
    const lineCount = model.getLineCount()
    const start = Math.max(1, Math.min(...ranges.map(r => r.startLineNumber)) - VIEWPORT_BUFFER)
    const end = Math.min(lineCount, Math.max(...ranges.map(r => r.endLineNumber)) + VIEWPORT_BUFFER)

    const decoratedLines = new Set(rows.map(r => r.displayLine))
    for (let line = start; line <= end; line++) {
      if (decoratedLines.has(line)) continue
      const decorations = buildRowDecorations(compiled, model, line)
      if (decorations !== null) {
        rows.push({ displayLine: line, decorations })
      }
    }

    // Trim rows far outside the window to bound the decoration count
    if (rows.length > MAX_DECORATED_ROWS) {
      rows = rows.filter(
        r => r.displayLine >= start - VIEWPORT_BUFFER && r.displayLine <= end + VIEWPORT_BUFFER
      )
    }

    collection.set(rows.flatMap(r => r.decorations))
  }

  return {
    setCompiledScheme(next) {
      compiled = next
      // synchronous swap for immediate feedback (PRD R6), then viewport pass
      apply()
    },

    scheduleRefresh() {
      if (disposed || rafHandle !== 0) return
      rafHandle = requestAnimationFrame(apply)
    },

    dispose() {
      disposed = true
      if (rafHandle !== 0) cancelAnimationFrame(rafHandle)
      clearAll()
      collection = null
      log.info('disposed')
    }
  }
}
