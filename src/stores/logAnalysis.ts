import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  HighlightScheme,
  BUILTIN_SCHEMES,
  newSchemeId,
  newRuleId
} from '@/utils/logAnalysis/schemeModel'
import { ImportedSchemeData } from '@/utils/logAnalysis/schemeSerializer'

/**
 * Log Analysis global store (ROLE-L01)
 *
 * Owns the scheme library (custom schemes persisted to localStorage, built-ins
 * merged read-only), the active scheme id, the custom level vocabulary and the
 * filter expression history/favorites. Persistence follows the fileBrowser
 * searchHistory habit: JSON in localStorage, dedup-to-top, bounded, clearable.
 *
 * Per-preview-tab session state (expression being typed, current filter
 * result, …) deliberately does NOT live here — it belongs to useLogAnalysis.
 */

const SCHEMES_STORAGE_KEY = 'fileman.logAnalysis.customSchemes'
const ACTIVE_SCHEME_STORAGE_KEY = 'fileman.logAnalysis.activeSchemeId'
const LEVEL_WORDS_STORAGE_KEY = 'fileman.logAnalysis.customLevelWords'
const HISTORY_STORAGE_KEY = 'fileman.logAnalysis.filterHistory'
const FAVORITES_STORAGE_KEY = 'fileman.logAnalysis.filterFavorites'

const HISTORY_LIMIT = 50

/** Console-backed logger, main-process call-site style (log.info/log.error) */
const log = {
  info: (msg: string, ...args: unknown[]) => console.log('[LogAnalysisStore]', msg, ...args)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function readString(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback
}

export const useLogAnalysisStore = defineStore('logAnalysis', () => {
  // ── Scheme library ────────────────────────────────────────────────────────
  const customSchemes = ref<HighlightScheme[]>(readJson<HighlightScheme[]>(SCHEMES_STORAGE_KEY, []))
  /** '' = no active scheme */
  const activeSchemeId = ref(readString(ACTIVE_SCHEME_STORAGE_KEY, ''))

  const schemes = computed<HighlightScheme[]>(() => [...BUILTIN_SCHEMES, ...customSchemes.value])

  const activeScheme = computed<HighlightScheme | null>(
    () => schemes.value.find(s => s.id === activeSchemeId.value) ?? null
  )

  function persistSchemes(): void {
    localStorage.setItem(SCHEMES_STORAGE_KEY, JSON.stringify(customSchemes.value))
  }

  watch(customSchemes, persistSchemes, { deep: true })

  watch(activeSchemeId, id => {
    localStorage.setItem(ACTIVE_SCHEME_STORAGE_KEY, id)
  })

  function setActiveScheme(id: string): void {
    // Only allow ids that exist in the merged library ('' disables coloring)
    if (id === '' || schemes.value.some(s => s.id === id)) {
      activeSchemeId.value = id
    }
  }

  /** Create a custom scheme; returns its id. Invalid rules stay editable until saved. */
  function addScheme(name: string, rules: HighlightScheme['rules']): string {
    const scheme: HighlightScheme = { id: newSchemeId(), name, builtin: false, rules }
    customSchemes.value.push(scheme)
    return scheme.id
  }

  /** Replace a custom scheme wholesale (aggregate replacement, value-object rules) */
  function updateScheme(id: string, name: string, rules: HighlightScheme['rules']): boolean {
    const idx = customSchemes.value.findIndex(s => s.id === id)
    if (idx === -1) return false
    customSchemes.value[idx] = { ...customSchemes.value[idx], name, rules }
    return true
  }

  /** Delete a custom scheme; deleting the active one falls back to no scheme (PRD R) */
  function deleteScheme(id: string): boolean {
    const idx = customSchemes.value.findIndex(s => s.id === id)
    if (idx === -1) return false
    customSchemes.value.splice(idx, 1)
    if (activeSchemeId.value === id) {
      activeSchemeId.value = ''
      log.info('deleteScheme: active scheme removed, coloring disabled')
    }
    return true
  }

  /** Duplicate any scheme (built-in included) into an editable custom copy */
  function duplicateScheme(sourceId: string): string | null {
    const source = schemes.value.find(s => s.id === sourceId)
    if (!source) return null
    const copy: HighlightScheme = {
      id: newSchemeId(),
      name: uniqueSchemeName(`${source.name} 副本`),
      builtin: false,
      rules: source.rules.map(r => ({ ...r, id: newRuleId() }))
    }
    customSchemes.value.push(copy)
    return copy.id
  }

  /** Import scheme data as a new custom scheme with a collision-free name */
  function importScheme(data: ImportedSchemeData): string {
    const scheme: HighlightScheme = {
      id: newSchemeId(),
      name: uniqueSchemeName(data.name),
      builtin: false,
      rules: data.rules
    }
    customSchemes.value.push(scheme)
    log.info('importScheme: name=%s rules=%d', scheme.name, scheme.rules.length)
    return scheme.id
  }

  function uniqueSchemeName(base: string): string {
    const taken = new Set(schemes.value.map(s => s.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} (${n})`)) n++
    return `${base} (${n})`
  }

  // ── Custom level vocabulary (level() synonyms, PRD R9) ────────────────────
  const customLevelWords = ref<string[]>(readJson<string[]>(LEVEL_WORDS_STORAGE_KEY, []))

  watch(customLevelWords, words => {
    localStorage.setItem(LEVEL_WORDS_STORAGE_KEY, JSON.stringify(words))
  }, { deep: true })

  /** Level vocabulary passed to ComposeExpression: { custom: [words...] } */
  const levelVocabulary = computed(() =>
    customLevelWords.value.length > 0 ? { custom: customLevelWords.value } : undefined
  )

  function addLevelWord(word: string): void {
    const w = word.trim()
    if (w !== '' && !customLevelWords.value.includes(w)) {
      customLevelWords.value.push(w)
    }
  }

  function removeLevelWord(word: string): void {
    const idx = customLevelWords.value.indexOf(word)
    if (idx !== -1) customLevelWords.value.splice(idx, 1)
  }

  // ── Filter history / favorites (dedup-to-top, bounded, PRD P1) ───────────
  const filterHistory = ref<string[]>(readJson<string[]>(HISTORY_STORAGE_KEY, []))
  const filterFavorites = ref<string[]>(readJson<string[]>(FAVORITES_STORAGE_KEY, []))

  watch(filterHistory, list => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list))
  })

  watch(filterFavorites, list => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list))
  })

  /** Record a successfully applied expression: dedup, move to top, cap */
  function recordExpression(expr: string): void {
    const trimmed = expr.trim()
    if (trimmed === '') return
    const next = [trimmed, ...filterHistory.value.filter(e => e !== trimmed)]
    if (next.length > HISTORY_LIMIT) next.length = HISTORY_LIMIT
    filterHistory.value = next
  }

  function toggleFavorite(expr: string): void {
    const trimmed = expr.trim()
    if (trimmed === '') return
    const idx = filterFavorites.value.indexOf(trimmed)
    if (idx === -1) {
      filterFavorites.value = [trimmed, ...filterFavorites.value]
    } else {
      filterFavorites.value.splice(idx, 1)
    }
  }

  function isFavorite(expr: string): boolean {
    return filterFavorites.value.includes(expr.trim())
  }

  function clearHistory(): void {
    filterHistory.value = []
  }

  return {
    // scheme library
    schemes,
    customSchemes,
    activeSchemeId,
    activeScheme,
    setActiveScheme,
    addScheme,
    updateScheme,
    deleteScheme,
    duplicateScheme,
    importScheme,
    // level vocabulary
    levelVocabulary,
    customLevelWords,
    addLevelWord,
    removeLevelWord,
    // history / favorites
    filterHistory,
    filterFavorites,
    recordExpression,
    toggleFavorite,
    isFavorite,
    clearHistory
  }
})
