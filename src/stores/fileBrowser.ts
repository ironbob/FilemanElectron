import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FileBrowserViewState, FileSortDescriptor, RecentLocation } from '@/types/fileBrowser'

const RECENT_STORAGE_KEY = 'fileman-recent-locations'
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

/** Presentation state only. File I/O stays behind the preload API. */
export const useFileBrowserStore = defineStore('fileBrowser', () => {
  const paneStates = ref<Record<string, FileBrowserViewState>>({})
  const recentLocations = ref<RecentLocation[]>(loadRecent())
  const recent = computed(() => recentLocations.value.slice(0, 12))

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

  return { stateFor, setSort, toggleRecursiveSearch, recent, rememberLocation }
})
