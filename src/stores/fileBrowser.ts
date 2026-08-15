import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FileBrowserViewState, FileSortDescriptor, RecentLocation } from '@/types/fileBrowser'

const RECENT_STORAGE_KEY = 'fileman-recent-locations'
const SEARCH_HISTORY_KEY = 'fileman-search-history'
const SEARCH_HISTORY_LIMIT = 10
const log = console
const DEFAULT_VIEW_STATE: FileBrowserViewState = {
  sort: { field: 'name', direction: 'asc', foldersFirst: true },
  recursiveSearch: false,
  showInfoPane: false
}

function loadRecent(): RecentLocation[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function loadSearchHistory(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]')
    return Array.isArray(value) ? value.filter((q): q is string => typeof q === 'string') : []
  } catch {
    return []
  }
}

/** Presentation state only. File I/O stays behind the preload API. */
export const useFileBrowserStore = defineStore('fileBrowser', () => {
  const paneStates = ref<Record<string, FileBrowserViewState>>({})
  const recentLocations = ref<RecentLocation[]>(loadRecent())
  const recent = computed(() => recentLocations.value.slice(0, 12))
  const searchHistory = ref<string[]>(loadSearchHistory())

  function stateFor(paneId: string): FileBrowserViewState {
    if (!paneStates.value[paneId]) {
      paneStates.value[paneId] = structuredClone(DEFAULT_VIEW_STATE)
    }
    return paneStates.value[paneId]
  }

  function setSort(paneId: string, sort: FileSortDescriptor) {
    stateFor(paneId).sort = sort
  }

  function toggleRecursiveSearch(paneId: string) {
    const state = stateFor(paneId)
    state.recursiveSearch = !state.recursiveSearch
  }

  function rememberLocation(deviceId: string, path: string) {
    const key = `${deviceId}:${path}`
    recentLocations.value = [
      { deviceId, path, visitedAt: Date.now() },
      ...recentLocations.value.filter(item => `${item.deviceId}:${item.path}` !== key)
    ].slice(0, 12)
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentLocations.value))
    log.info('[FileBrowserStore] recent location saved', { deviceId, path })
  }

  /** 记录一次搜索(去重置顶,空串忽略);搜索是渲染层过滤,历史留在 localStorage 即可。 */
  function rememberSearch(query: string) {
    const q = query.trim()
    if (!q) return
    searchHistory.value = [q, ...searchHistory.value.filter(h => h !== q)].slice(0, SEARCH_HISTORY_LIMIT)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.value))
  }

  function clearSearchHistory() {
    searchHistory.value = []
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }

  return { stateFor, setSort, toggleRecursiveSearch, recent, rememberLocation, searchHistory, rememberSearch, clearSearchHistory }
})
