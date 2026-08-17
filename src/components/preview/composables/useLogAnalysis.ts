/**
 * Log Analysis - Feature ViewModel (ROLE-L02, MVVM presentation model)
 *
 * Owns the per-preview-tab find/filter session (query, plain-mode rules, error,
 * invert, context window, hit navigation, A/B view switching) and orchestrates
 * the domain pipeline (D1/D2), the scheme library (store L01) and the two
 * Monaco adapters (L04/L05). Session state deliberately does NOT persist
 * (PRD R10); global scheme library and history live in the logAnalysis store.
 *
 * Redesign 2026-08-17:
 * - Plain-text-first query: input that parses as an expression (or starts with
 *   a predicate keyword) is compiled as-is; anything else is wrapped as a raw
 *   contains/word/regex term via ComposePlainQuery (no string escaping).
 * - Two search views: 'filtered' (A: match blocks + context + gap chips) and
 *   'full' (B: full text with soft match highlights + solid current match).
 * - Match character ranges flow from the pipeline into L2/L3 decorations;
 *   composite expressions degrade to whole-line highlights.
 *
 * Race safety: every async filter run carries a generation counter; a newer
 * run invalidates older results, which are discarded instead of written back
 * to the view (contract IFC-2 / DC-5).
 */

import { computed, ref, shallowRef, watch } from 'vue'
import { t } from '@/i18n'
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { ComposeExpression, ComposePlainQuery, PlainQueryMode, looksLikeExpression } from '@/utils/textFilter'
import {
  FilterResult,
  runFilterAsync
} from '@/utils/logAnalysis/filterPipeline'
import { createMatchRangeExtractor } from '@/utils/logAnalysis/matchRanges'
import { buildDisplayModelFromResult } from '@/utils/logAnalysis/filterGaps'
import { compileScheme } from '@/utils/logAnalysis/schemeModel'
import { useLogAnalysisStore } from '@/stores/logAnalysis'
import { createFilterViewAdapter, FilterDisplayModel } from '@/components/preview/logview/monacoFilterView'
import { createHighlighter } from '@/components/preview/logview/monacoHighlighter'

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[UseLogAnalysis]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error('[UseLogAnalysis]', msg, ...args)
}

/** Context-window choices in the find-options popover (design: 0/1/3/5, default 3) */
const CONTEXT_RANGE = [0, 1, 3, 5] as const

export type SearchViewMode = 'filtered' | 'full'

export interface LogAnalysisHost {
  /** Current Monaco editor instance or null (host may recreate it) */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
  /** Original file content split into lines (never the filtered view) */
  getLines: () => string[]
  /** Full original content (for restoring the unfiltered view) */
  getOriginalContent: () => string
  /** Target file for export: deviceId + absolute path */
  getExportTarget: () => { deviceId: string; path: string } | null
  /** Whether the source device is writable (export precondition) */
  canWrite: () => boolean
}

export function useLogAnalysis(host: LogAnalysisHost) {
  const store = useLogAnalysisStore()

  // ── Session state (per tab, not persisted) ────────────────────────────────
  const expression = ref('')
  const filterError = ref<string | null>(null)
  const invert = ref(false)
  const contextEnabled = ref(false)
  const contextN = ref(3)
  const filtering = ref(false)
  const result = shallowRef<FilterResult | null>(null)
  const displayModel = shallowRef<FilterDisplayModel | null>(null)
  const hitIndex = ref(-1)
  const exporting = ref(false)
  const actionMessage = ref<string | null>(null)

  /** Find-rule sugar for plain queries (expression queries ignore this) */
  const plainMode = ref<PlainQueryMode>('contains')
  /** True when the active/last query was compiled as a predicate expression */
  const isExpressionQuery = ref(false)
  /** A = filtered view, B = full text with highlights */
  const searchViewMode = ref<SearchViewMode>('filtered')

  let generation = 0

  const filterView = createFilterViewAdapter(host.getEditor)
  const highlighter = createHighlighter(host.getEditor)

  // ── Derived state for the View ────────────────────────────────────────────
  /** True while the editor shows a transformed view (host must suppress edit/save) */
  const isViewTransformed = computed(() => result.value !== null)
  const matchCount = computed(() => result.value?.matchCount ?? null)
  const hasResult = computed(() => result.value !== null)
  const canExport = computed(() => result.value !== null && result.value.entries.length > 0)

  /** display-line index of each match entry, for A-view navigation */
  const matchDisplayLines = computed<number[]>(() => displayModel.value?.matchDisplayLines ?? [])

  // ── Scheme wiring (independent from filtering, PRD R3) ────────────────────
  watch(
    () => store.activeScheme,
    scheme => {
      highlighter.setCompiledScheme(scheme === null ? null : compileScheme(scheme))
    },
    { immediate: true }
  )

  // ── Query compilation (plain-text first, expression escape hatch) ────────
  function compileQuery(raw: string): { ok: true; expr: ReturnType<typeof ComposeExpression> } | { ok: false; error: string } {
    const parsed = ComposeExpression(raw, { levels: store.levelVocabulary })
    if (parsed.isValid()) {
      isExpressionQuery.value = true
      return { ok: true, expr: parsed }
    }
    if (looksLikeExpression(raw)) {
      // Power user intent: surface the parse error, keep the last valid view (PRD R8)
      return { ok: false, error: parsed.error() ?? t('preview.logview.filterFailed') }
    }
    // Plain query — validate regex mode up front so errors are actionable
    if (plainMode.value === 'regex') {
      try {
        new RegExp(raw)
      } catch (err) {
        return { ok: false, error: t('preview.text.invalidRegex') }
      }
    }
    isExpressionQuery.value = false
    return { ok: true, expr: ComposePlainQuery(raw, plainMode.value, { levels: store.levelVocabulary }) }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  /**
   * @param record store the query in filter history (explicit Enter/popover
   *               actions only — live-typing debounce passes false)
   */
  async function applyFilter(record: boolean = true): Promise<void> {
    const raw = expression.value
    const trimmed = raw.trim()

    if (trimmed === '') {
      clearFilter()
      return
    }

    log.info('applyFilter: query="%s" plain=%s invert=%s context=%s', trimmed, !isExpressionQuery, invert.value, contextEnabled.value ? contextN.value : 0)
    const compiled = compileQuery(trimmed)
    if (!compiled.ok) {
      // Keep the last valid view untouched (PRD R8)
      filterError.value = compiled.error
      log.info('applyFilter: compile failed: %s', compiled.error)
      return
    }

    filterError.value = null
    generation += 1
    const myGeneration = generation
    filtering.value = true

    try {
      const lines = host.getLines()
      const rangeExtractor = createMatchRangeExtractor(compiled.expr.getAst(), { levels: store.levelVocabulary })
      const filterResult = await runFilterAsync(
        lines,
        compiled.expr,
        {
          invert: invert.value,
          contextBefore: contextEnabled.value ? contextN.value : 0,
          contextAfter: contextEnabled.value ? contextN.value : 0
        },
        { isCancelled: () => generation !== myGeneration },
        undefined,
        rangeExtractor
      )

      if (filterResult === null) {
        log.info('applyFilter: run superseded (generation %d)', myGeneration)
        return
      }

      result.value = filterResult
      hitIndex.value = -1
      // A fresh query always lands in the filtered (A) view
      searchViewMode.value = 'filtered'
      displayModel.value = buildDisplayModelFromResult(
        filterResult,
        lines.length,
        n => t('preview.text.gapLinesLabel', { n })
      )
      filterView.applyFilterResult(filterResult, displayModel.value, host.getOriginalContent())
      filterView.setCurrentMatchIndex(-1)
      highlighter.scheduleRefresh()
      if (record) store.recordExpression(trimmed)
      log.info('applyFilter: matched %d / %d lines', filterResult.matchCount, lines.length)
    } catch (err) {
      log.error('applyFilter failed:', err)
      filterError.value = err instanceof Error ? err.message : t('preview.logview.filterFailed')
    } finally {
      if (generation === myGeneration) {
        filtering.value = false
      }
    }
  }

  function clearFilter(): void {
    generation += 1 // cancel any in-flight run
    expression.value = ''
    filterError.value = null
    result.value = null
    displayModel.value = null
    hitIndex.value = -1
    filtering.value = false
    searchViewMode.value = 'filtered'
    filterView.clear(host.getOriginalContent())
    highlighter.scheduleRefresh()
    log.info('clearFilter: restored full view')
  }

  function setInvert(value: boolean): void {
    if (invert.value === value) return
    invert.value = value
    if (result.value !== null) void applyFilter(false)
  }

  function setContext(enabled: boolean, n?: number): void {
    contextEnabled.value = enabled
    if (n !== undefined) contextN.value = n
    if (result.value !== null) void applyFilter(false)
  }

  function setPlainMode(mode: PlainQueryMode): void {
    if (plainMode.value === mode) return
    plainMode.value = mode
    // Rules only affect plain queries; re-run when one is (or would be) active
    if (!isExpressionQuery.value && expression.value.trim() !== '') void applyFilter(false)
  }

  // ── A/B view switching (design 2026-08-17 §3) ─────────────────────────────
  function showFullView(): void {
    const r = result.value
    if (r === null) return
    searchViewMode.value = 'full'
    filterView.showFullHighlight(r, host.getOriginalContent())
    filterView.setCurrentMatchIndex(hitIndex.value)
    log.info('showFullView: B view, matches=%d', r.matchCount)
  }

  function showFilteredView(): void {
    const r = result.value
    const model = displayModel.value
    if (r === null || model === null) return
    searchViewMode.value = 'filtered'
    filterView.applyFilterResult(r, model, host.getOriginalContent())
    filterView.setCurrentMatchIndex(hitIndex.value)
    log.info('showFilteredView: A view')
  }

  /** Jump into the B view at a source line; optionally make matchIndex current */
  function locateInFullView(sourceLine: number, matchIndex?: number): void {
    const r = result.value
    if (r === null) return
    searchViewMode.value = 'full'
    filterView.showFullHighlight(r, host.getOriginalContent())
    if (matchIndex !== undefined && matchIndex >= 0) {
      hitIndex.value = matchIndex
    }
    filterView.setCurrentMatchIndex(hitIndex.value)
    filterView.navigateToSourceLine(sourceLine)
  }

  /** Click routing for the A view: gap chip / match line → locate in B view */
  function handleEditorMouseDown(lineNumber: number | undefined): void {
    if (searchViewMode.value !== 'filtered' || lineNumber === undefined) return
    const hit = filterView.hitTestDisplayLine(lineNumber)
    if (hit === null) return
    if (hit.kind === 'gap') {
      locateInFullView(hit.sourceLine)
    } else {
      locateInFullView(hit.sourceLine, hit.matchIndex)
    }
  }

  // ── Hit navigation (PRD P1) ───────────────────────────────────────────────
  function navigateHit(direction: 1 | -1): void {
    const r = result.value
    if (r === null || r.matchSourceLines.length === 0) return
    const count = r.matchSourceLines.length
    const next = (hitIndex.value + direction + count) % count
    hitIndex.value = next
    filterView.setCurrentMatchIndex(next)
    if (searchViewMode.value === 'filtered') {
      const displayLine = matchDisplayLines.value[next]
      if (displayLine !== undefined) filterView.navigateToDisplayLine(displayLine)
    } else {
      filterView.navigateToSourceLine(r.matchSourceLines[next])
    }
  }

  // ── Copy / export (PRD P1, contract IFC-5) ───────────────────────────────
  /** Export text format: original line number + space + original text */
  function buildResultText(): string {
    const r = result.value
    if (r === null) return ''
    return r.entries.map(e => `${e.sourceLine} ${e.text}`).join('\n')
  }

  async function copyResult(): Promise<void> {
    const text = buildResultText()
    if (text === '') return
    try {
      await navigator.clipboard.writeText(text)
      actionMessage.value = t('preview.logview.copiedLines', result.value?.entries.length ?? 0)
    } catch (err) {
      log.error('copyResult failed:', err)
      actionMessage.value = t('preview.logview.copyFailed')
    }
  }

  async function exportFiltered(): Promise<void> {
    const target = host.getExportTarget()
    const r = result.value
    if (target === null || r === null || r.entries.length === 0) return
    if (!host.canWrite()) {
      actionMessage.value = t('preview.logview.exportNoWrite')
      return
    }
    if (exporting.value) return
    exporting.value = true
    actionMessage.value = null

    try {
      // <原路径>.filtered.log, 已存在则 .filtered.2.log …（不覆盖，PRD R1/R2）
      let candidate = `${target.path}.filtered.log`
      for (let n = 2; await window.fileman.exists(target.deviceId, candidate); n++) {
        candidate = `${target.path}.filtered.${n}.log`
      }

      const bytes = new TextEncoder().encode(buildResultText())
      let binary = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }

      log.info('exportFiltered: writing %d bytes to %s', bytes.length, candidate)
      await window.fileman.writeFile(target.deviceId, candidate, btoa(binary))
      actionMessage.value = t('preview.logview.exported', { path: candidate })
      log.info('exportFiltered: done')
    } catch (err) {
      log.error('exportFiltered failed:', err)
      actionMessage.value = t('preview.logview.exportFailed', { message: err instanceof Error ? err.message : String(err) })
    } finally {
      exporting.value = false
    }
  }

  // ── Host lifecycle hooks ──────────────────────────────────────────────────
  /** Host calls this after (re)creating the editor instance */
  function onEditorReady(): void {
    const r = result.value
    if (r !== null) {
      // Re-apply the current result to the fresh editor in the active view mode
      if (searchViewMode.value === 'full') {
        filterView.showFullHighlight(r, host.getOriginalContent())
      } else {
        filterView.applyFilterResult(r, displayModel.value ?? { items: [], lineTexts: [], matchDisplayLines: [] }, host.getOriginalContent())
      }
      filterView.setCurrentMatchIndex(hitIndex.value)
    }
    const scheme = store.activeScheme
    highlighter.setCompiledScheme(scheme === null ? null : compileScheme(scheme))
  }

  /** Host calls this on editor scroll/layout changes (lazy viewport coloring) */
  function notifyViewportChanged(): void {
    highlighter.scheduleRefresh()
  }

  /** Host calls this when the underlying file changes (reload) */
  function reset(): void {
    generation += 1
    expression.value = ''
    filterError.value = null
    result.value = null
    displayModel.value = null
    hitIndex.value = -1
    filtering.value = false
    actionMessage.value = null
    searchViewMode.value = 'filtered'
    filterView.clear(host.getOriginalContent())
  }

  function dispose(): void {
    generation += 1
    filterView.dispose()
    highlighter.dispose()
  }

  return {
    // session state
    expression,
    filterError,
    invert,
    contextEnabled,
    contextN,
    filtering,
    exporting,
    actionMessage,
    hitIndex,
    plainMode,
    isExpressionQuery,
    searchViewMode,
    contextOptions: CONTEXT_RANGE,
    // derived
    isViewTransformed,
    matchCount,
    hasResult,
    canExport,
    matchDisplayLines,
    // actions
    applyFilter,
    clearFilter,
    setInvert,
    setContext,
    setPlainMode,
    showFullView,
    showFilteredView,
    locateInFullView,
    handleEditorMouseDown,
    navigateHit,
    copyResult,
    exportFiltered,
    // lifecycle
    onEditorReady,
    notifyViewportChanged,
    reset,
    dispose
  }
}

export type LogAnalysisViewModel = ReturnType<typeof useLogAnalysis>
