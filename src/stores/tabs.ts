import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Tab, Pane, DirCompareSession, FileDiffSession, FileInfo, CompareStatus, DuplicateSession, GrepSession, SpaceSession, PaneLoadError } from '@/types'
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

/**
 * 瞬态（工具视图）标签判定：带任一会话字段的标签不持久化、重启即弃。
 * 新工具页（grep / 重复查找 / 空间分析…）在 Tab 上加可选 session 字段后，
 * 在此追加条件即可（单一事实源，saveToStorage 与恢复逻辑共用）。
 */
export function isTransientTab(tab: Tab): boolean {
  return Boolean(tab.compareSession || tab.fileDiffSession || tab.preview || tab.dupesSession || tab.grepSession || tab.spaceSession)
}

function saveToStorage(state: PersistedTabState) {
  try {
    // selectedFiles 是瞬态 UI 状态，不需要持久化（避免序列化大量路径字符串）
    // 工具视图标签（compare/diff/preview 及后续 grep/dupes/space）重启即弃
    const regularTabs = state.tabs.filter(tab => !isTransientTab(tab))
    const stripped: PersistedTabState = {
      activeTabId: regularTabs.find(t => t.id === state.activeTabId)
        ? state.activeTabId
        : (regularTabs[0]?.id ?? ''),
      tabs: regularTabs.map(tab => ({
        ...tab,
        panes: tab.panes.map(pane => ({
          ...pane,
          selectedFiles: [],
          // loadError 是瞬态加载状态，重启后由 FileList 重新判定
          loadError: null
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

  // ── 新 tab 来源记忆 ─────────────────────────────────────────────────────────
  // 打开新 tab 时记录当时的活动 tab（来源）；关闭「最新 tab」（数组末位）时回到
  // 来源 tab。只对末位 tab 生效：非末位（历史中更早打开的）关闭仍走默认的
  // 「激活左侧相邻」，避免与既有 muscle memory 冲突。
  const tabOrigins = new Map<string, string>()

  /** 统一的新 tab 落位：记录来源 → push → 激活。 */
  function pushTab(tab: Tab): void {
    tabOrigins.set(tab.id, activeTabId.value)
    tabs.value.push(tab)
    activeTabId.value = tab.id
  }

  /** 复用既有 tab（如再次双击同一文件）时更新来源记忆：关闭时回到本次打开者。 */
  function retargetTabOrigin(tabId: string): void {
    if (tabId !== activeTabId.value) tabOrigins.set(tabId, activeTabId.value)
  }

  // ── 面板滚动位置记忆（切 tab 重挂载后恢复；导航/换视图即弃，不持久化） ──────
  // 与 tabOrigins 同款非响应式 Map：滚动写入不进 tabs ref，避免触发深 watch 的
  // localStorage 序列化（同 selectedFiles 的高频状态约定）。
  const paneScrollTops = new Map<string, number>()

  function savePaneScroll(paneId: string, top: number): void {
    paneScrollTops.set(paneId, top)
  }

  function getPaneScroll(paneId: string): number | undefined {
    return paneScrollTops.get(paneId)
  }

  /** 失效（置 0）而非删除：导航/换视图后 loadFiles 完成时恢复为 0（确定性回顶），
   * 后续滚动仍会经 save 刷新条目 —— 自动刷新（同路径 reload）因此保位不跳顶。 */
  function resetPaneScroll(paneId: string): void {
    paneScrollTops.set(paneId, 0)
  }

  /** 彻底遗忘（面板销毁）：closeTab 清理用，防 Map 无限增长。 */
  function forgetPaneScroll(paneId: string): void {
    paneScrollTops.delete(paneId)
  }

  function createTab(): Tab {
    const tab = createDefaultTab(defaultHomePath)
    pushTab(tab)
    return tab
  }

  // ── 关闭守卫（预览内容组件注册；如 hex 编辑的未保存修改确认） ────────────────
  // 键 = preview session id（tab.preview.id）；守卫返回 false 阻止本次关闭。

  const closeGuards = new Map<string, () => boolean>()

  /** 注册关闭守卫；返回反注册函数（组件卸载时调用）。 */
  function registerCloseGuard(sessionId: string, guard: () => boolean): () => void {
    closeGuards.set(sessionId, guard)
    return () => {
      if (closeGuards.get(sessionId) === guard) closeGuards.delete(sessionId)
    }
  }

  // ── 脏探针（标签栏圆点用；键 = preview session id，Set 允许多组件共存） ──────
  // 与关闭守卫分立：守卫管「能否关」，探针管「是否有未保存修改」的展示态。
  const dirtyProbes = new Map<string, Set<() => boolean>>()
  const dirtyVersion = ref(0)

  /** 注册脏探针；返回反注册函数。探针闭包读组件 ref 即保持响应式。 */
  function registerDirtyProbe(sessionId: string, probe: () => boolean): () => void {
    let set = dirtyProbes.get(sessionId)
    if (!set) {
      set = new Set()
      dirtyProbes.set(sessionId, set)
    }
    set.add(probe)
    dirtyVersion.value++
    return () => {
      set!.delete(probe)
      if (set!.size === 0) dirtyProbes.delete(sessionId)
      dirtyVersion.value++
    }
  }

  /** 标签是否有未保存修改（无探针/未挂载内容 → false）。 */
  function isTabDirty(tab: Tab): boolean {
    const sessionId = tab.preview?.id
    if (!sessionId) return false
    const probes = dirtyProbes.get(sessionId)
    if (!probes) return false
    for (const probe of probes) {
      if (probe()) return true
    }
    return false
  }

  /** 按 preview session id 关闭所在 tab（守卫语义同 closeTab）。 */
  function closePreviewSession(sessionId: string) {
    const tab = tabs.value.find(t => t.preview?.id === sessionId)
    if (tab) closeTab(tab.id)
  }

  function closeTab(tabId: string) {
    const index = tabs.value.findIndex(t => t.id === tabId)
    if (index === -1) return

    // 守卫拦截（保存确认等）：返回 false 则本次关闭中止，由守卫方自行处理
    const guardKey = tabs.value[index].preview?.id
    const guard = guardKey ? closeGuards.get(guardKey) : undefined
    if (guard && !guard()) return

    if (tabs.value.length === 1) {
      // 唯一的普通浏览 tab 拒绝关闭；唯一的临时 tab（预览/对比/diff）
      // 则替换为新的浏览 tab，保证窗口永不出现 0 tab。
      const only = tabs.value[0]
      if (only.panes.length > 0) return
      const replacement = createDefaultTab()
      tabs.value = [replacement]
      activeTabId.value = replacement.id
      return
    }

    const closed = tabs.value[index]
    tabs.value.splice(index, 1)
    // 滚动记忆随面板一并清理（paneId 不复用，防 Map 无限增长）
    for (const pane of closed.panes) forgetPaneScroll(pane.id)
    // 关的是最新 tab（原末位）且来源 tab 仍存活 → 回到来源 tab；
    // 其余情况维持默认：激活左侧相邻
    const originId = tabOrigins.get(tabId)
    const wasNewest = index >= tabs.value.length
    // 来源记忆清理：自己的条目 + 指向自己的条目（Map 迭代中删除安全）
    tabOrigins.delete(tabId)
    for (const [key, origin] of tabOrigins) {
      if (origin === tabId) tabOrigins.delete(key)
    }
    if (activeTabId.value === tabId) {
      if (wasNewest && originId && tabs.value.some(t => t.id === originId)) {
        activeTabId.value = originId
      } else {
        activeTabId.value = tabs.value[Math.max(0, index - 1)].id
      }
    }
  }

  // ── 标签栏重排 / 固定 / 别名 / 批量关闭 ─────────────────────────────────────

  /** 重分区：pinned 组依序在前，普通组依序在后（重排/固定的不变式，单一事实源）。 */
  function partitionByPinned() {
    const pinned = tabs.value.filter(t => t.pinned)
    if (pinned.length === 0) return
    const merged = [...pinned, ...tabs.value.filter(t => !t.pinned)]
    if (merged.some((t, i) => t !== tabs.value[i])) tabs.value = merged
  }

  /** 指针拖拽重排（索引 = tabs 数组顺序 = 视觉顺序；pinned 区不可跨界，事后兜底重分区）。 */
  function moveTab(fromIndex: number, toIndex: number) {
    const max = tabs.value.length - 1
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex > max || toIndex > max) return
    const [moved] = tabs.value.splice(fromIndex, 1)
    tabs.value.splice(toIndex, 0, moved)
    partitionByPinned()
  }

  /** 关闭除指定标签与所有固定标签外的全部（逐个走 closeTab，守卫/never-empty 语义自然生效）。 */
  function closeOtherTabs(tabId: string) {
    for (const tab of [...tabs.value]) {
      if (tab.id === tabId || tab.pinned) continue
      closeTab(tab.id)
    }
  }

  /** 关闭指定标签右侧所有非固定标签。 */
  function closeTabsToRight(tabId: string) {
    const index = tabs.value.findIndex(t => t.id === tabId)
    if (index === -1) return
    for (const tab of [...tabs.value].slice(index + 1)) {
      if (tab.pinned) continue
      closeTab(tab.id)
    }
  }

  /** 固定/取消固定：翻转标志后交给重分区维持 pinned-left 不变式（组内相对顺序不变）。 */
  function togglePin(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return
    if (tab.pinned) delete tab.pinned
    else tab.pinned = true
    partitionByPinned()
  }

  /** 设置/清除本地显示别名；空串等价清除（delete 键，保持持久化 JSON 干净）。 */
  function setTabAlias(tabId: string, alias: string | undefined) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return
    const trimmed = alias?.trim()
    if (!trimmed) delete tab.titleAlias
    else tab.titleAlias = trimmed
  }

  /** ⌘T / ⊕ 语义：活动标签是浏览页 → 在当前位置旁开新标签；否则回默认首页。 */
  function newTabFromActiveContext() {
    const pane = activePane.value
    if (pane && activeTab.value && activeTab.value.panes.length > 0) {
      openPathInNewTab(pane.deviceId, pane.path)
    } else {
      createTab()
    }
  }

  function setActivePane(paneId: string) {
    if (activeTab.value) {
      activeTab.value.activePaneId = paneId
    }
  }

  /** Toggles a second directory pane for the active regular tab.
   *  fromPaneId：打开时以该面板（须属于活动标签）的设备与路径克隆出第二面板；
   *  省略时回退 panes[0]（命令面板等无面板上下文的调用方）。 */
  function toggleActiveSplit(fromPaneId?: string): boolean {
    const tab = activeTab.value
    if (!tab || tab.compareSession || tab.fileDiffSession || tab.panes.length < 1 || tab.panes.length > 2) {
      return false
    }

    if (tab.panes.length === 1) {
      const sourcePane = tab.panes.find(p => p.id === fromPaneId) ?? tab.panes[0]
      const secondPane = createDefaultPane(sourcePane.path, sourcePane.deviceId)
      tab.panes.push(secondPane)
      tab.activePaneId = secondPane.id
      log.info('[TabsStore] opened dual-pane workspace', { tabId: tab.id, deviceId: sourcePane.deviceId, path: sourcePane.path })
      return true
    }

    const retainedPane = tab.panes[0]
    tab.panes.splice(1)
    tab.activePaneId = retainedPane.id
    log.info('[TabsStore] closed dual-pane workspace', { tabId: tab.id, retainedPaneId: retainedPane.id })
    return true
  }

  /** 在新标签页打开指定目录（文件夹右键 / 拖到标签栏）。 */
  function openPathInNewTab(deviceId: string, path: string): void {
    const pane = createDefaultPane(path, deviceId)
    const tab: Tab = {
      id: generateId(),
      title: getPathDisplayName(path),
      panes: [pane],
      activePaneId: pane.id
    }
    pushTab(tab)
    log.info('[TabsStore] opened path in new tab', { deviceId, path, tabId: tab.id })
  }

  /**
   * 在新的并列双面板标签页打开：目标文件夹占左面板，参照面板（refDeviceId/
   * refPath，通常为右键来源面板的当前位置）占右面板，方便两边直接传文件。
   */
  function openPathInSplitTab(deviceId: string, path: string, refDeviceId?: string, refPath?: string): void {
    const left = createDefaultPane(path, deviceId)
    const right = createDefaultPane(refPath ?? path, refDeviceId ?? deviceId)
    const tab: Tab = {
      id: generateId(),
      title: getPathDisplayName(path),
      panes: [left, right],
      activePaneId: left.id
    }
    pushTab(tab)
    log.info('[TabsStore] opened path in dual-pane tab', { deviceId, path, refPath: refPath ?? '(same)', tabId: tab.id })
  }

  function navigatePane(paneId: string, newPath: string) {
    const pane = findPane(paneId)
    if (!pane) return

    pane.path = newPath

    pane.history = pane.history.slice(0, pane.historyIndex + 1)
    pane.history.push(newPath)
    pane.historyIndex = pane.history.length - 1

    pane.selectedFiles = []
    resetPaneScroll(paneId) // 滚动偏移属于旧目录，导航即弃

    const tab = tabs.value.find(t => t.panes.some(p => p.id === paneId))
    if (tab) {
      tab.title = getPathDisplayName(newPath)
    }
  }

  /** 设置面板目录加载错误状态（FileList 判定写入；null 清除）。tab 栏据此打 ⚠。 */
  function setPaneLoadError(paneId: string, error: PaneLoadError | null) {
    const pane = findPane(paneId)
    if (!pane) return
    pane.loadError = error
  }

  function goBack(paneId: string) {
    const pane = findPane(paneId)
    if (!pane || pane.historyIndex <= 0) return

    pane.historyIndex--
    pane.path = pane.history[pane.historyIndex]
    pane.selectedFiles = []
    resetPaneScroll(paneId)

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
    resetPaneScroll(paneId)

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
      resetPaneScroll(paneId) // 列表/网格/分栏的滚动容器不同，偏移不可比
    }
  }

  function setGridSize(paneId: string, size: Pane['gridSize']) {
    const pane = findPane(paneId)
    if (pane) {
      pane.gridSize = size
      resetPaneScroll(paneId) // 行高变化使旧偏移失真
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
    resetPaneScroll(paneId)
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
    pushTab(tab)
    return tab.id
  }

  /** 重复文件查找工具页（瞬态；同 rootPath 已开着则复用并激活）。 */
  function openDuplicatesTab(deviceId: string, rootPath: string, minSize = 1): string {
    const existing = tabs.value.find(tab => tab.dupesSession &&
      tab.dupesSession.deviceId === deviceId && tab.dupesSession.rootPath === rootPath)
    if (existing) {
      activeTabId.value = existing.id
      return existing.id
    }
    const session: DuplicateSession = { id: generateId(), deviceId, rootPath, minSize }
    const tab: Tab = {
      id: generateId(),
      title: `重复文件 · ${getPathDisplayName(rootPath)}`,
      titleKey: 'tabs.title.dupes',
      titleParams: { path: getPathDisplayName(rootPath) },
      panes: [],
      activePaneId: '',
      dupesSession: session
    }
    pushTab(tab)
    return tab.id
  }

  /** 内容搜索工具页（瞬态）。 */
  function openGrepTab(session: Omit<GrepSession, 'id'>): string {
    const full: GrepSession = { id: generateId(), ...session }
    const tab: Tab = {
      id: generateId(),
      title: `搜索 · ${full.pattern}`,
      titleKey: 'tabs.title.grep',
      titleParams: { pattern: full.pattern },
      panes: [],
      activePaneId: '',
      grepSession: full
    }
    pushTab(tab)
    return tab.id
  }

  /** 空间分析工具页（瞬态；同 root 已开着则复用——下钻用）。 */
  function openSpaceTab(deviceId: string, rootPath: string): string {
    const existing = tabs.value.find(tab => tab.spaceSession &&
      tab.spaceSession.deviceId === deviceId && tab.spaceSession.rootPath === rootPath)
    if (existing) {
      activeTabId.value = existing.id
      return existing.id
    }
    const session: SpaceSession = { id: generateId(), deviceId, rootPath }
    const tab: Tab = {
      id: generateId(),
      title: `空间 · ${getPathDisplayName(rootPath)}`,
      titleKey: 'tabs.title.space',
      titleParams: { path: getPathDisplayName(rootPath) },
      panes: [],
      activePaneId: '',
      spaceSession: session
    }
    pushTab(tab)
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
    pushTab(tab)
    return tab.id
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    activePane,
    setActiveTab,
    createTab,
    pushTab,
    retargetTabOrigin,
    savePaneScroll,
    getPaneScroll,
    resetPaneScroll,
    forgetPaneScroll,
    closeTab,
    closePreviewSession,
    registerCloseGuard,
    dirtyVersion,
    registerDirtyProbe,
    isTabDirty,
    moveTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePin,
    setTabAlias,
    newTabFromActiveContext,
    setActivePane,
    toggleActiveSplit,
    openPathInNewTab,
    openPathInSplitTab,
    navigatePane,
    setPaneLoadError,
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
    openDuplicatesTab,
    openGrepTab,
    openSpaceTab,
    openFileDiffTab,
  }
})
