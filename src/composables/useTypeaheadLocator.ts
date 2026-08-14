import { computed, onUnmounted, ref } from 'vue'
import type { FileInfo } from '@/types'
import { findFileNameMatches } from '@/utils/pinyinFileNameMatcher'

const CLEAR_DELAY_MS = 800

/** Owns transient keyboard-location state; views retain selection and scrolling. */
export function useTypeaheadLocator(files: () => readonly FileInfo[]) {
  const query = ref('')
  let clearTimer: ReturnType<typeof setTimeout> | null = null

  const matches = computed(() => findFileNameMatches(files(), query.value))
  const activeMatch = computed(() => matches.value[0] ?? null)

  function clear() {
    query.value = ''
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = null
  }

  function append(text: string): boolean {
    const committed = text.replace(/[\r\n\t]/g, '')
    if (!committed || (committed === ' ' && !query.value)) return false
    query.value += committed
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = setTimeout(clear, CLEAR_DELAY_MS)
    return true
  }

  onUnmounted(clear)
  return { query, matches, activeMatch, append, clear }
}
