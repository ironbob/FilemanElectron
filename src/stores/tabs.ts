import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Tab, Pane, DirCompareSession, FileDiffSession, FileInfo, CompareStatus } from '@/types'
import { isZipVirtualPath, zipVirtualParent } from '@shared/zipPath'

const log = console
const STORAGE_KEY = 'fileman-tabs-state'

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function createDefaultPane(homePath: string = '/', deviceId: string = 'local'): Pane {
  return {
    id: generateId(),
    deviceId,
    path: homePath,
    history: [homePath],
    historyIndex: 0,
    viewMode: 'list',
    selectedFiles: [],
    gridSize: 'large'
  }
}

let defaultHomePath = '/'

export function setDefaultHomePath(path: string) {
  defaultHomePath = path
}

function getPathDisplayName(path: string): string {
  if (!path || path === '/') return 'Root'
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : 'Root'
}

function createDefaultTab(homePath: string = defaultHomePath): Tab {
  const pane = createDefaultPane(homePath)
  return {
    id: generateId(),
    title: getPathDisplayName(homePath),
    panes: [pane],
    activePaneId: pane.id
  }
}

interface PersistedTabState {
  tabs: Tab[]
  activeTabId: string
}

function saveToStorage(state: PersistedTabState) {
  try {
    // selectedFiles 是瞬态 UI 状态，不需要持久化（避免序列化大量路径字符串）
    // Compare tabs are ephemeral — don't persist them across restarts
    const regularTabs = state.tabs.filter(tab => !tab.compareSession && !tab.fileDiffSession)
    const stripped: PersistedTabState = {
      activeTabId: regularTabs.find(t => t.id === state.activeTabId)
        ? state.activeTabId
        : (regularTabs[0]?.id ?? ''),
      tabs: regularTabs.map(tab => ({
        ...tab,
        panes: tab.panes.map(pane => ({
          ...pane,
          selectedFiles: []
        }))
      }))
    }
    const t0 = performance.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped))
    const elapsed = performance.now() - t0
    if (elapsed > 5) {
      console.warn('[TabsStore] saveToStorage took', elapsed.toFixed(1), 'ms')
    }
  } catch (e) {
    console.warn('Failed to save tabs state:', e)
  }
}

// 防抖：避免高频操作（如框选、拖选）触发大量 localStorage 写入
let _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSave(state: PersistedTabState) {
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer)
  _saveDebounceTimer = setTimeout(() => {
    _saveDebounceTimer = null
    saveToStorage(state)
  }, 300)
}

function loadFromStorage(): PersistedTabState | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data)
    }
  } catch (e) {
    log.error('[TabsStore] 持久化状态解析失败，回退默认标签:', e)
  }
  return null
}

export const useTabsStore = defineStore('tabs', () => {
  const persistedState = loadFromStorage()
  
  const tabs = ref<Tab[]>(persistedState?.tabs || [createDefaultTab()])
  const activeTabId = ref(persistedState?.activeTabId || tabs.value[0].id)
  let skipNextPersistenceForSelection = false

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

  const activePane = computed(() => {
    if (!activeTab.value) return null
    return activeTab.value.panes.find(p => p.id === activeTab.value!.activePaneId) || null
  })

  watch(
    [tabs, activeTabId],
    () => {
      if (skipNextPersistenceForSelection) {
        skipNextPersistenceForSelection = false
        return
      }
      debouncedSave({
        tabs: tabs.value,
        activeTabId: activeTabId.value
      })
    },
    { deep: true }
  )

  function setActiveTab(tabId: string) {
    activeTabId.value = tabId
  }

  function createTab(): Tab {
    const tab = createDefaultTab(defaultHomePath)
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  function closeTab(tabId: string) {
    if (tabs.value.length === 1) return

    const index = tabs.value.findIndex(t => t.id === tabId)
    if (index > -1) {
      tabs.value.splice(index, 1)
      if (activeTabId.value === tabId) {
        activeTabId.value = tabs.value[Math.max(0, index - 1)].id
      }
    }
  }

  function setActivePane(paneId: string) {
    if (activeTab.value) {
      activeTab.value.activePaneId = paneId
    }
  }

  /** Toggles a second directory pane for the active regular tab. */
  function toggleActiveSplit(): boolean {
    const tab = activeTab.value
    if (!tab || tab.compareSession || tab.fileDiffSession || tab.panes.length < 1 || tab.panes.length > 2) {
      return false
    }

    if (tab.panes.length === 1) {
      const sourcePane = tab.panes[0]
      const secondPane = createDefaultPane('/', sourcePane.deviceId)
      tab.panes.push(secondPane)
      tab.activePaneId = secondPane.id
      log.info('[TabsStore] opened dual-pane workspace', { tabId: tab.id, deviceId: sourcePane.deviceId })
      return true
    }

    const retainedPane = tab.panes[0]
    tab.panes.splice(1)
    tab.activePaneId = retainedPane.id
    log.info('[TabsStore] closed dual-pane workspace', { tabId: tab.id, retainedPaneId: retainedPane.id })
    return true
  }

  function navigatePane(paneId: string, newPath: string) {
    const pane = findPane(paneId)
    if (!pane) return

    pane.path = newPath

    pane.history = pane.history.slice(0, pane.historyIndex + 1)
    pane.history.push(newPath)
    pane.historyIndex = pane.history.length - 1

    pane.selectedFiles = []

    const tab = tabs.value.find(t => t.panes.some(p => p.id === paneId))
    if (tab) {
      tab.title = getPathDisplayName(newPath)
    }
  }

  function goBack(paneId: string) {
    const pane = findPane(paneId)
    if (!pane || pane.historyIndex <= 0) return

    pane.historyIndex--
    pane.path = pane.history[pane.historyIndex]
    pane.selectedFiles = []

    const tab = tabs.value.find(t => t.panes.some(p => p.id === paneId))
    if (tab) {
      tab.title = getPathDisplayName(pane.path)
    }
  }

  function goForward(paneId: string) {
    const pane = findPane(paneId)
    if (!pane || pane.historyIndex >= pane.history.length - 1) return

    pane.historyIndex++
    pane.path = pane.history[pane.historyIndex]
    pane.selectedFiles = []

    const tab = tabs.value.find(t => t.panes.some(p => p.id === paneId))
    if (tab) {
      tab.title = getPathDisplayName(pane.path)
    }
  }

  function goUp(paneId: string) {
    const pane = findPane(paneId)
    if (!pane) return

    const path = pane.path

    // Handle virtual ZIP path: "<zipFilePath>::<innerPath>"（协议解析统一在 @shared/zipPath）
    if (isZipVirtualPath(path)) {
      navigatePane(paneId, zipVirtualParent(path))
      return
    }

    const pathParts = pane.path.split('/').filter(Boolean)
    if (pathParts.length === 0) return

    pathParts.pop()
    const newPath = '/' + pathParts.join('/')
    navigatePane(paneId, newPath || '/')
  }

  function setViewMode(paneId: string, mode: Pane['viewMode']) {
    const pane = findPane(paneId)
    if (pane) {
      pane.viewMode = mode
    }
  }

  function setGridSize(paneId: string, size: Pane['gridSize']) {
    const pane = findPane(paneId)
    if (pane) {
      pane.gridSize = size
    }
  }

  function setSelectedFiles(paneId: string, files: string[]) {
    const pane = findPane(paneId)
    if (pane) {
      if (pane.selectedFiles.length === files.length && pane.selectedFiles.every((file, index) => file === files[index])) {
        return
      }
      // Selection is transient and is removed before persistence.  Avoid a
      // debounced JSON serialization after every click or rubber-band update.
      skipNextPersistenceForSelection = true
      pane.selectedFiles = files
    }
  }

  /** Switches a pane to another device before navigating to a recent location. */
  function setPaneDevice(paneId: string, deviceId: string) {
    const pane = findPane(paneId)
    if (!pane || pane.deviceId === deviceId) return
    pane.deviceId = deviceId
    pane.path = '/'
    pane.history = ['/']
    pane.historyIndex = 0
    pane.selectedFiles = []
  }

  function setColumns(paneId: string, columns: Array<{ path: string; selectedPath?: string }>) {
    const pane = findPane(paneId)
    if (pane) {
      pane.columns = columns
    }
  }

  function findPane(paneId: string): Pane | undefined {
    for (const tab of tabs.value) {
      const pane = tab.panes.find(p => p.id === paneId)
      if (pane) return pane
    }
    return undefined
  }

  function openCompareTab(
    leftDeviceId: string,
    leftPath: string,
    rightDeviceId: string,
    rightPath: string
  ): string {
    const session: DirCompareSession = {
      id: generateId(),
      leftDeviceId,
      leftRootPath: leftPath,
      rightDeviceId,
      rightRootPath: rightPath,
      rule: 'timestamp',
      filter: {
        showEqual: true,
        showDifferent: true,
        showLeftOnly: true,
        showRightOnly: true
      }
    }
    const leftName = getPathDisplayName(leftPath)
    const rightName = getPathDisplayName(rightPath)
    const tab: Tab = {
      id: generateId(),
      title: `${leftName} ↔ ${rightName}`,
      panes: [],
      activePaneId: '',
      compareSession: session
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab.id
  }

  function openFileDiffTab(
    leftDeviceId: string,
    left: FileInfo | undefined,
    rightDeviceId: string,
    right: FileInfo | undefined,
    fileName: string,
    status: CompareStatus
  ): string {
    const session: FileDiffSession = {
      id: generateId(),
      fileName,
      status,
      leftDeviceId,
      left,
      rightDeviceId,
      right,
    }
    const statusPrefix = status === 'metadata-equal' || status === 'content-equal'
      ? '=' : status === 'left-only' || status === 'right-only' ? '◇' : '≠'
    const tab: Tab = {
      id: generateId(),
      title: `${statusPrefix} ${fileName}`,
      panes: [],
      activePaneId: '',
      fileDiffSession: session,
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab.id
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    activePane,
    setActiveTab,
    createTab,
    closeTab,
    setActivePane,
    toggleActiveSplit,
    navigatePane,
    goBack,
    goForward,
    goUp,
    setViewMode,
    setGridSize,
    setSelectedFiles,
    setPaneDevice,
    setColumns,
    findPane,
    openCompareTab,
    openFileDiffTab,
  }
})
