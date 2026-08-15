/**
 * Log Analysis - Feature ViewModel (ROLE-L02, MVVM presentation model)
 *
 * Owns the per-preview-tab filter session (expression, error, invert, context
 * window, hit navigation) and orchestrates the domain pipeline (D1/D2), the
 * scheme library (store L01) and the two Monaco adapters (L04/L05).
 * Session state deliberately does NOT persist (PRD R10); global scheme
 * library and history live in the logAnalysis store.
 *
 * Race safety: every async filter run carries a generation counter; a newer
 * run invalidates older results, which are discarded instead of written back
 * to the view (contract IFC-2 / DC-5).
 */

import { computed, ref, shallowRef, watch } from 'vue'
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { ComposeExpression } from '@/utils/textFilter'
import {
  FilterResult,
  runFilterAsync
} from '@/utils/logAnalysis/filterPipeline'
import { compileScheme } from '@/utils/logAnalysis/schemeModel'
import { useLogAnalysisStore } from '@/stores/logAnalysis'
import { createFilterViewAdapter } from '@/components/preview/logview/monacoFilterView'
import { createHighlighter } from '@/components/preview/logview/monacoHighlighter'

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[UseLogAnalysis]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error('[UseLogAnalysis]', msg, ...args)
}

/** Smallest context window offered in the toolbar */
const CONTEXT_RANGE = [0, 1, 2, 3, 5, 10] as const

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
  const hitIndex = ref(-1)
  const exporting = ref(false)
  const actionMessage = ref<string | null>(null)

  let generation = 0

  const filterView = createFilterViewAdapter(host.getEditor)
  const highlighter = createHighlighter(host.getEditor)

  // ── Derived state for the View ────────────────────────────────────────────
  /** True while the editor shows a filtered view (host must suppress edit/save) */
  const isViewTransformed = computed(() => result.value !== null)
  const matchCount = computed(() => result.value?.matchCount ?? null)
  const hasResult = computed(() => result.value !== null)
  const canExport = computed(() => result.value !== null && result.value.entries.length > 0)

  /** display-line index of each match entry, for navigation */
  const matchDisplayLines = computed<number[]>(() => {
    const r = result.value
    if (r === null) return []
    const lines: number[] = []
    r.entries.forEach((e, idx) => {
      if (e.kind === 'match') lines.push(idx + 1)
    })
    return lines
  })

  // ── Scheme wiring (independent from filtering, PRD R3) ────────────────────
  watch(
    () => store.activeScheme,
    scheme => {
      highlighter.setCompiledScheme(scheme === null ? null : compileScheme(scheme))
    },
    { immediate: true }
  )

  // ── Filtering ─────────────────────────────────────────────────────────────
  async function applyFilter(): Promise<void> {
    const expr = expression.value.trim()

    if (expr === '') {
      clearFilter()
      return
    }

    log.info('applyFilter: expr="%s" invert=%s context=%s', expr, invert.value, contextEnabled.value ? contextN.value : 0)
    const parsed = ComposeExpression(expr, { levels: store.levelVocabulary })
    if (!parsed.isValid()) {
      // Keep the last valid view untouched (PRD R8)
      filterError.value = parsed.error()
      log.info('applyFilter: parse failed: %s', parsed.error())
      return
    }

    filterError.value = null
    generation += 1
    const myGeneration = generation
    filtering.value = true

    try {
      const lines = host.getLines()
      const filterResult = await runFilterAsync(
        lines,
        parsed,
        {
          invert: invert.value,
          contextBefore: contextEnabled.value ? contextN.value : 0,
          contextAfter: contextEnabled.value ? contextN.value : 0
        },
        { isCancelled: () => generation !== myGeneration }
      )

      if (filterResult === null) {
        log.info('applyFilter: run superseded (generation %d)', myGeneration)
        return
      }

      result.value = filterResult
      hitIndex.value = -1
      filterView.applyFilterResult(filterResult, host.getOriginalContent())
      highlighter.scheduleRefresh()
      store.recordExpression(expr)
      log.info('applyFilter: matched %d / %d lines', filterResult.matchCount, lines.length)
    } catch (err) {
      log.error('applyFilter failed:', err)
      filterError.value = err instanceof Error ? err.message : '过滤执行失败'
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
    hitIndex.value = -1
    filtering.value = false
    filterView.clear(host.getOriginalContent())
    highlighter.scheduleRefresh()
    log.info('clearFilter: restored full view')
  }

  function setInvert(value: boolean): void {
    if (invert.value === value) return
    invert.value = value
    if (result.value !== null) void applyFilter()
  }

  function setContext(enabled: boolean, n?: number): void {
    contextEnabled.value = enabled
    if (n !== undefined) contextN.value = n
    if (result.value !== null) void applyFilter()
  }

  // ── Hit navigation (PRD P1) ───────────────────────────────────────────────
  function navigateHit(direction: 1 | -1): void {
    const lines = matchDisplayLines.value
    if (lines.length === 0) return
    const next = (hitIndex.value + direction + lines.length) % lines.length
    hitIndex.value = next
    filterView.navigateToDisplayLine(lines[next])
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
      actionMessage.value = `已复制 ${result.value?.entries.length ?? 0} 行`
    } catch (err) {
      log.error('copyResult failed:', err)
      actionMessage.value = '复制失败（剪贴板不可用）'
    }
  }

  async function exportFiltered(): Promise<void> {
    const target = host.getExportTarget()
    const r = result.value
    if (target === null || r === null || r.entries.length === 0) return
    if (!host.canWrite()) {
      actionMessage.value = '目标设备不支持写入，无法导出'
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
      actionMessage.value = `已导出：${candidate}`
      log.info('exportFiltered: done')
    } catch (err) {
      log.error('exportFiltered failed:', err)
      actionMessage.value = `导出失败：${err instanceof Error ? err.message : String(err)}`
    } finally {
      exporting.value = false
    }
  }

  // ── Host lifecycle hooks ──────────────────────────────────────────────────
  /** Host calls this after (re)creating the editor instance */
  function onEditorReady(): void {
    if (result.value !== null) {
      // Re-apply the current filter result to the fresh editor
      filterView.applyFilterResult(result.value, host.getOriginalContent())
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
    hitIndex.value = -1
    filtering.value = false
    actionMessage.value = null
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
