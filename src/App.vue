<template>
  <div
    class="h-screen flex flex-col bg-bg-primary finder-shell"
    :class="{ 'is-window-inactive': !windowActive }"
    :data-theme="theme"
    :style="{ '--task-drawer-width': (fileOpsStore.isDrawerOpen ? taskDrawerWidth : 0) + 'px' }"
  >
    <!-- 锚定浮层专用层：弹出菜单 Teleport 目标（首子节点，先于一切子组件存在）。
         fixed inset-0 不参与布局；见 style.css .finder-popover-layer 注释 -->
    <div id="popover-layer" class="finder-popover-layer"></div>

    <!-- Title bar: tabs share this row with the native window controls. -->
    <div
      ref="titlebarRef"
      class="finder-window-titlebar h-12 bg-bg-toolbar flex items-center px-4 border-b border-border app-drag overflow-visible"
    >
      <!-- Left spacer for macOS traffic lights (native buttons via hiddenInset) -->
      <div class="w-16 finder-traffic-light-inset"></div>

      <!-- Keep tabs in the title bar to reclaim their former dedicated row.
           标签栏本身可拖动窗口（Finder 语义）；tab 与按钮在组件内标记 app-no-drag。 -->
      <AppTabBar class="flex-1 min-w-0" />

      <!-- 任务抽屉唯一入口：Badge 三态（进度环/数字/红数字） -->
      <TaskTitlebarButton class="app-no-drag" />
    </div>

    <!-- Main Content（relative：窄窗时任务抽屉/侧边栏 overlay 模式的定位锚） -->
    <div ref="mainRowRef" class="flex-1 flex overflow-hidden relative">
      <!-- Sidebar dock：浮层卡片容器（内缩 + 圆角材质见 finder-ui.css；
           窄窗 sidebarOverlay 时转 absolute 覆盖，panes 保持全宽） -->
      <div
        class="sidebar-dock"
        :class="{ 'sidebar-dock-overlay': sidebarOverlay }"
        :style="{ width: sidebarWidth + SIDEBAR_DOCK_INSET + 'px' }"
      >
        <AppSidebar
          :theme="theme"
          @toggle-theme="toggleTheme"
          @open-settings="showSettingsDialog = true"
        />
      </div>

      <!-- Sidebar Resize Handle（10px 拖拽热区，视觉仅 1px 低对比线） -->
      <div
        class="sidebar-splitter"
        :class="{ 'is-resizing': isSidebarResizing, 'sidebar-splitter-overlay': sidebarOverlay }"
        :style="sidebarOverlay ? { left: sidebarWidth + SIDEBAR_DOCK_INSET + 'px' } : undefined"
        title="Drag to resize sidebar"
        @mousedown="startSidebarResize"
      ></div>

      <!-- Main Area -->
      <div class="flex-1 flex flex-col overflow-hidden bg-bg-primary relative">
        <!-- Content Area with File Panes -->
        <div class="flex-1 flex overflow-hidden">
          <!-- File Panes Container -->
          <div class="flex-1 flex overflow-hidden min-w-0">
            <!-- Preview View（预览 tab，统一挂在主 tab 栏） -->
            <template v-if="activeTab?.preview">
              <PreviewView
                :key="activeTab.id"
                :session="activeTab.preview"
                class="flex-1"
              />
            </template>
            <!-- File Diff View -->
            <template v-else-if="activeTab?.fileDiffSession">
              <FileDiffView
                :key="activeTab.id"
                :session="activeTab.fileDiffSession"
                class="flex-1"
              />
            </template>
            <!-- Directory Compare View -->
            <template v-else-if="activeTab?.compareSession">
              <DirCompareView
                :key="activeTab.id"
                :session="activeTab.compareSession"
                class="flex-1"
              />
            </template>
            <!-- Duplicate Finder View -->
            <template v-else-if="activeTab?.dupesSession">
              <DuplicateFinderView
                :key="activeTab.id"
                :session="activeTab.dupesSession"
                class="flex-1"
              />
            </template>
            <!-- Grep Content Search View -->
            <template v-else-if="activeTab?.grepSession">
              <GrepSearchView
                :key="activeTab.id"
                :session="activeTab.grepSession"
                class="flex-1"
              />
            </template>
            <!-- Space Analysis Treemap View -->
            <template v-else-if="activeTab?.spaceSession">
              <TreemapView
                :key="activeTab.id"
                :session="activeTab.spaceSession"
                class="flex-1"
              />
            </template>
            <!-- Normal File Panes -->
            <template v-else>
              <FilePane
                v-for="pane in activePanes"
                :key="pane.id"
                :pane-id="pane.id"
                class="flex-1 border-r border-border last:border-r-0"
                @drop="handleDrop($event, pane.id)"
                @dragover="handlePaneDragOver($event, pane.id)"
              />
            </template>
          </div>
        </div>

        <!-- Quick Look overlay (space-key transient preview; single file, ↑↓ to step) -->
        <QuickLookOverlay />
      </div>

      <!-- 抽屉拖拽把手（抽屉左缘；方向与侧边栏相反：向左拖变宽，双击复位） -->
      <div
        v-if="fileOpsStore.isDrawerOpen && !taskDrawerOverlay"
        class="w-1 bg-border hover:bg-accent-blue cursor-col-resize flex-shrink-0 transition-colors"
        :class="{ 'bg-accent-blue': isTaskDrawerResizing }"
        title="Drag to resize task drawer"
        data-testid="task-drawer-resize-handle"
        @mousedown="startTaskDrawerResize"
        @dblclick="resetTaskDrawerWidth"
      ></div>

      <!-- 任务抽屉（push 模式）：常挂载宽度动画容器，内容 v-if 控制挂载，
           使 Esc 拦截器（useKeyInterceptor）仅在打开时注册。
           窄窗（taskDrawerOverlay）时切 absolute 覆盖 + 投影，panes 保持全宽。 -->
      <div
        v-if="!taskDrawerOverlay"
        class="h-full min-h-0 flex-shrink-0 overflow-hidden task-drawer-wrap"
        :style="{ width: (fileOpsStore.isDrawerOpen ? taskDrawerWidth : 0) + 'px' }"
      >
        <TaskDrawer
          v-if="fileOpsStore.isDrawerOpen"
          :style="{ width: taskDrawerWidth + 'px' }"
          @locate="handleTaskEndpointLocate"
        />
      </div>
      <TaskDrawer
        v-else-if="fileOpsStore.isDrawerOpen"
        overlay
        :style="{ width: taskDrawerWidth + 'px' }"
        @locate="handleTaskEndpointLocate"
      />
    </div>

    <!-- 完成通知（右上角轻量横幅；绝不自动展开抽屉） -->
    <TaskToastLayer />

    <!-- 移动设备截图结果浮层(全窗口覆盖,不随内容区裁剪;Esc 关闭,保存走原生另存为) -->
    <ScreenshotOverlay />

    <!-- Status Bar -->
    <div class="h-7 bg-bg-statusbar flex items-center justify-between px-4 text-xs border-t border-border">
      <span class="text-text-secondary">{{ statusText }}</span>
      <!-- 设备徽标属窗口状态层：视频播放页（媒体沉浸层）期间隐藏，不与播放页混排 -->
      <div v-if="!isVideoPreviewActive" class="flex items-center gap-4">
        <span
          v-for="device in connectedDevices"
          :key="device.id"
          class="flex items-center gap-1.5 text-text-secondary"
          :title="device.status === 'connected' ? device.name : `${device.name} · ${device.status}`"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="device.status === 'connected' ? 'bg-accent-green' : 'bg-accent-yellow'"
            aria-hidden="true"
          ></span>
          <span>{{ device.name }}</span>
        </span>
      </div>
    </div>

    <!-- Settings Dialog -->
    <SettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
    />

    <!-- 快速跳转面板（⌘⇧P）：最近打开目录的搜索跳转浮层 -->
    <QuickJumpPanel
      v-if="paletteOpen"
      :anchor="paletteAnchor"
      :navigate="quickJumpNavigate"
      @close="paletteOpen = false"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTabBar from './components/AppTabBar.vue'
import FilePane from './components/FilePane.vue'
import TaskTitlebarButton from './components/tasks/TaskTitlebarButton.vue'
import TaskDrawer from './components/tasks/TaskDrawer.vue'
import TaskToastLayer from './components/tasks/TaskToastLayer.vue'
import PreviewView from './components/preview/PreviewView.vue'
import QuickLookOverlay from './components/preview/QuickLookOverlay.vue'
import ScreenshotOverlay from './components/mobile/ScreenshotOverlay.vue'
import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import QuickJumpPanel from './components/palette/QuickJumpPanel.vue'
import { useKeyInterceptor } from './composables/useKeyInterceptor'
import DirCompareView from './components/compare/DirCompareView.vue'
import DuplicateFinderView from './components/dupes/DuplicateFinderView.vue'
import GrepSearchView from './components/grep/GrepSearchView.vue'
import TreemapView from './components/treemap/TreemapView.vue'
import FileDiffView from './components/compare/FileDiffView.vue'
import { useTabsStore } from './stores/tabs'
import { useDevicesStore } from './stores/devices'
import { useFileOperationsStore } from './stores/fileOperations'
import { usePreviewStore } from './stores/preview'
import { useSettingsStore } from './stores/settings'
import { useColorTagsStore } from './stores/colorTags'
import { useGitStatusStore } from './stores/gitStatus'
import { useDragSessionStore } from './stores/dragSession'
import { useClipboardContentStore } from './stores/clipboardContent'
import { getParentPath } from './utils/path'
import { resolveInitialTheme, persistTheme } from './utils/theme'
import { isAppLocale, LOCALE_STORAGE_KEY, setLocale, t } from './i18n'
import { isZipVirtualPath } from '@shared/zipPath'
import {
  extractDragSource,
  isSelfOrDescendant,
  peekDragSource,
  queueTransfer,
  resolveDropAction
} from './utils/dragTransfer'
import { showDropHint, hideDropHint } from './utils/dropHint'

const log = console
const previewStore = usePreviewStore()

const tabsStore = useTabsStore()
const devicesStore = useDevicesStore()
const fileOpsStore = useFileOperationsStore()
const settingsStore = useSettingsStore()
const dragSessionStore = useDragSessionStore()
const clipboardContentStore = useClipboardContentStore()

const theme = ref<'light' | 'dark'>('dark')
const showSettingsDialog = ref(false)
const paletteOpen = ref(false)
const titlebarRef = ref<HTMLElement | null>(null)
/** 打开面板时量取的标题栏 rect（锚点；取不到时兜底窗口顶部 48px 条带）。 */
const paletteAnchor = ref(new DOMRect(0, 0, window.innerWidth, 48))

// Finder 式浮层侧边栏：卡片宽度 240–360（dock 另有 10px 内缩，见 SIDEBAR_DOCK_INSET）。
// Finder 侧边栏常规档位约 15–25% 窗宽，240 在 1152px 视口下约 21%。
const SIDEBAR_DEFAULT_WIDTH = 240
const SIDEBAR_MIN_WIDTH = 240
const SIDEBAR_MAX_WIDTH = 360
/** dock 左/上/下的窗口内缩量（浮层卡片与窗口边缘的呼吸空间）。 */
const SIDEBAR_DOCK_INSET = 10
const SIDEBAR_WIDTH_KEY = 'fileman-finder-sidebar-width'
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH)
const isSidebarResizing = ref(false)

// ── 窗口失焦态（Finder 语义：侧边栏选中从蓝底白字退为灰底蓝字）──
// 与 PreviewHexContent 的 is-window-inactive 同一套 blur/focus 驱动。
// focus 同时驱动系统剪贴板内容探测刷新：用户在别的应用 ⌘C 后切回是
// 「从剪贴板新建文件」菜单可见性变化的准确时机（菜单是同步 computed）。
const windowActive = ref(document.hasFocus())
function onWindowFocus() {
  windowActive.value = true
  void clipboardContentStore.refresh(true)
}
function onWindowBlur() { windowActive.value = false }

// 任务抽屉宽度（照抄 sidebar 的 localStorage 持久化模式）
const TASK_DRAWER_DEFAULT_WIDTH = 340
const TASK_DRAWER_MIN_WIDTH = 280
const TASK_DRAWER_MAX_WIDTH = 440
const TASK_DRAWER_WIDTH_KEY = 'fileman-task-drawer-width'
const taskDrawerWidth = ref(TASK_DRAWER_DEFAULT_WIDTH)
const isTaskDrawerResizing = ref(false)

// 窄窗 overlay 降级判定：观察主内容行总宽（不随抽屉开合变化，无反馈振荡），
// 侧边栏 + 抽屉挤掉 panes 最小内容宽度时切覆盖模式。
const mainRowRef = ref<HTMLElement | null>(null)
const mainRowWidth = ref(Number.MAX_SAFE_INTEGER)
let mainRowObserver: ResizeObserver | null = null

// Load theme from storage
onMounted(() => {
  theme.value = resolveInitialTheme()

  // Initialize file operations store
  fileOpsStore.initialize()

  // 「从剪贴板新建文件」：初始探测一次（focus 前菜单可见性就有数据）
  void clipboardContentStore.refresh(true)

  // Git 状态徽标：订阅 watch:changed 做缓存失效（本地仓库目录）
  useGitStatusStore().initialize()

  // 颜色标记：FileList 行圆点与主 tab 圆点都消费，须在渲染前就位
  void useColorTagsStore().load()

  // Load app settings (hidden-files toggle etc.)
  void settingsStore.load().then(() => {
    // 语言对账：localStorage 被清但 config 里有语言（如选过 en-US）时以 config 为准。
    // persist:false —— 只补渲染层状态，不回写 config。
    const storedLocale = settingsStore.settings.locale
    if (!isAppLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) && isAppLocale(storedLocale)) {
      void setLocale(storedLocale, { persist: false })
    }
  })

  // Restore sidebar width
  const savedSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  if (savedSidebarWidth >= SIDEBAR_MIN_WIDTH) {
    sidebarWidth.value = Math.min(SIDEBAR_MAX_WIDTH, savedSidebarWidth)
  }

  // Restore task drawer width
  const savedDrawerWidth = Number(localStorage.getItem(TASK_DRAWER_WIDTH_KEY))
  if (savedDrawerWidth >= TASK_DRAWER_MIN_WIDTH) {
    taskDrawerWidth.value = Math.min(TASK_DRAWER_MAX_WIDTH, savedDrawerWidth)
  }

  // 窄窗 overlay 降级：观察主内容行宽（不随抽屉开合变化）
  if (mainRowRef.value) {
    mainRowObserver = new ResizeObserver(entries => {
      for (const entry of entries) mainRowWidth.value = entry.contentRect.width
    })
    mainRowObserver.observe(mainRowRef.value)
  }

  // 拖拽会话防陈旧清理：应用内任何新拖拽必先经过 pointerdown；
  // HTML5 拖拽结束（含取消/拖出窗口）触发 dragend；drop 用冒泡阶段挂载，
  // 在所有落点处理器之后运行，覆盖「落到标签栏等未消费会话的区域」的情况。
  // 原生拖拽拖出到 Finder 后无 App 内事件，由落点侧的文件名匹配兜底（dragTransfer.ts）；
  // blur 兜底堵「会话存活期间从 Finder 拖入同名文件」的误判——原生拖拽进行中
  // 本窗口保持焦点（blur 不触发），而从 Finder 发起拖入前本窗口必已失焦。
  window.addEventListener('pointerdown', clearDragSession, true)
  window.addEventListener('dragend', clearDragSession, true)
  window.addEventListener('drop', clearDragSession)
  window.addEventListener('blur', clearDragSession)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('blur', onWindowBlur)

  log.info('[FinderShell] initialized', { theme: theme.value, sidebarWidth: sidebarWidth.value })
})

function clearDragSession() {
  dragSessionStore.clear()
  hideDropHint()
}

onUnmounted(() => {
  window.removeEventListener('pointerdown', clearDragSession, true)
  window.removeEventListener('dragend', clearDragSession, true)
  window.removeEventListener('drop', clearDragSession)
  window.removeEventListener('blur', clearDragSession)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('blur', onWindowBlur)
  mainRowObserver?.disconnect()
  mainRowObserver = null
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  persistTheme(theme.value)
}

// ── 快速跳转面板（⌘⇧P）────────────────────────────────────────────────────
// 捕获期消费（return true），先于 FileList 的 document 冒泡监听；
// 面板自身打开后，其内部的 ↑↓/Enter/Esc 由 QuickJumpPanel 的 interceptor
// 以 LIFO 顺序先处理（疑难问题解决记录/子组件ESC键消费 的既定模式）。
useKeyInterceptor(event => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    if (!paletteOpen.value) {
      paletteAnchor.value = titlebarRef.value?.getBoundingClientRect()
        ?? new DOMRect(0, 0, window.innerWidth, 48)
    }
    paletteOpen.value = !paletteOpen.value
    return true
  }
  return false
})

// ── 标签快捷键（⌘T / ⌘W / ⇧⌘[ ] / ⌘1-9）─────────────────────────────────
// 同为捕获期消费；面板/Quick Look 打开时静默（浮层持有键盘），总览弹层与
// 重命名输入由各自后注册的 interceptor 以 LIFO 先行接管 Enter/Esc。
useKeyInterceptor(event => {
  if (paletteOpen.value || previewStore.quickLookOpen) return false
  const mod = event.metaKey || event.ctrlKey
  if (!mod || event.altKey) return false

  const key = event.key
  const lower = key.toLowerCase()

  if (!event.shiftKey && lower === 't') {
    event.preventDefault()
    tabsStore.newTabFromActiveContext()
    return true
  }
  // ⌘⇧T：任务抽屉开关（⌘T 已被"新建标签页"占用）
  if (event.shiftKey && lower === 't') {
    event.preventDefault()
    fileOpsStore.toggleDrawer()
    return true
  }
  if (!event.shiftKey && lower === 'w') {
    event.preventDefault()
    if (tabsStore.activeTabId) tabsStore.closeTab(tabsStore.activeTabId) // never-empty 在 store
    return true
  }
  if (event.shiftKey && (key === '[' || key === '{')) {
    event.preventDefault()
    cycleActiveTab(-1)
    return true
  }
  if (event.shiftKey && (key === ']' || key === '}')) {
    event.preventDefault()
    cycleActiveTab(1)
    return true
  }
  if (!event.shiftKey && key >= '1' && key <= '9') {
    const tabs = tabsStore.tabs
    if (tabs.length === 0) return false
    // ⌘1-8 直达；⌘9 = 最后一个（Safari 惯例）
    const index = key === '9' ? tabs.length - 1 : Math.min(Number(key) - 1, tabs.length - 1)
    event.preventDefault()
    tabsStore.setActiveTab(tabs[index].id)
    return true
  }
  return false
})

/** ⇧⌘[ / ⇧⌘] 循环切换（首尾环绕）。 */
function cycleActiveTab(delta: number) {
  const tabs = tabsStore.tabs
  if (tabs.length === 0) return
  const index = tabs.findIndex(tb => tb.id === tabsStore.activeTabId)
  const next = (index + delta + tabs.length) % tabs.length
  tabsStore.setActiveTab(tabs[next].id)
}

/** 跳转回调：活动面板导航；活动标签为工具视图（无面板）时开新标签页。 */
function quickJumpNavigate(deviceId: string, path: string) {
  const tab = activeTab.value
  if (!tab || tab.panes.length === 0) {
    tabsStore.openPathInNewTab(deviceId, path)
    return
  }
  const pane = tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]
  tabsStore.navigatePane(pane.id, path)
}

// Resize sidebar via the divider handle (mirrors FilePane's preview resize).
function startSidebarResize(event: MouseEvent) {
  isSidebarResizing.value = true
  event.preventDefault()

  const startX = event.clientX
  const startWidth = sidebarWidth.value

  function onMouseMove(e: MouseEvent) {
    if (!isSidebarResizing.value) return
    // Sidebar is on the left: dragging right (clientX increases) widens it.
    const diff = e.clientX - startX
    sidebarWidth.value = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + diff))
  }

  function onMouseUp() {
    isSidebarResizing.value = false
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 任务抽屉宽度拖拽（与侧边栏同模式，方向相反：向左拖 clientX 减小 = 变宽）
function startTaskDrawerResize(event: MouseEvent) {
  isTaskDrawerResizing.value = true
  event.preventDefault()

  const startX = event.clientX
  const startWidth = taskDrawerWidth.value

  function onMouseMove(e: MouseEvent) {
    if (!isTaskDrawerResizing.value) return
    const diff = startX - e.clientX
    taskDrawerWidth.value = Math.max(TASK_DRAWER_MIN_WIDTH, Math.min(TASK_DRAWER_MAX_WIDTH, startWidth + diff))
  }

  function onMouseUp() {
    isTaskDrawerResizing.value = false
    localStorage.setItem(TASK_DRAWER_WIDTH_KEY, String(taskDrawerWidth.value))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function resetTaskDrawerWidth() {
  taskDrawerWidth.value = TASK_DRAWER_DEFAULT_WIDTH
  localStorage.setItem(TASK_DRAWER_WIDTH_KEY, String(taskDrawerWidth.value))
}

/** 窄窗降级：panes 剩余宽度低于内容最小值（双面板 640 / 单面板 360）时 overlay。 */
const taskDrawerOverlay = computed(() => {
  const minPanesWidth = activePanes.value.length === 2 ? 640 : 360
  return mainRowWidth.value - sidebarWidth.value - taskDrawerWidth.value < minPanesWidth
})

/** 窄窗降级（侧边栏）：dock（卡片 + 内缩）挤掉 panes 最小内容宽度时，
 *  整个 dock 转 absolute 浮层覆盖主内容，panes 保持全宽不被挤压。 */
const sidebarOverlay = computed(() => {
  const minPanesWidth = activePanes.value.length === 2 ? 640 : 360
  return mainRowWidth.value - (sidebarWidth.value + SIDEBAR_DOCK_INSET) < minPanesWidth
})

const activeTab = computed(() => tabsStore.activeTab)

const activePanes = computed(() => {
  if (!activeTab.value) return []
  return activeTab.value.panes
})

const connectedDevices = computed(() =>
  devicesStore.connectedDevices
)

/** 视频预览 tab 激活中：状态栏右下设备徽标让位（Quick Look 沉浸语义） */
const isVideoPreviewActive = computed(() =>
  activeTab.value?.preview?.type === 'video'
)

const statusText = computed(() => {
  const pane = tabsStore.activePane
  if (!pane) return 'Ready'

  const selectedCount = pane.selectedFiles.length
  if (selectedCount > 0) {
    return `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected`
  }

  // 任务聚合行：仅抽屉关闭时显示（打开时信息已在场）
  const summary = fileOpsStore.statusSummary
  if (summary && !fileOpsStore.isDrawerOpen) {
    return t('tasks.statusbar.processing', {
      action: t(summary.verbKey),
      count: summary.count,
      percent: summary.percent
    })
  }

  return 'Ready'
})

/** 面板背景 dragover：能力允许才 preventDefault（否则浏览器显示禁止光标且不触发 drop）。
 * 应用内拖拽（含原生拖拽）通过 dragSession 识别源；外部 Finder 拖入始终接受。
 * dragover 高频触发，日志仅在判定变化时输出。 */
let lastPaneDragOverDecision = ''

function paneDisplayName(panePath: string): string {
  return panePath.split('/').filter(Boolean).pop() || panePath
}

function handlePaneDragOver(event: DragEvent, targetPaneId: string) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  const targetPane = tabsStore.findPane(targetPaneId)
  if (!targetPane) return

  const source = peekDragSource(event, dragSessionStore)
  if (!source) {
    // 外部（Finder）拖入：仅当面板可写目录时接受
    const accepted = dataTransfer.types.includes('Files') && !isZipVirtualPath(targetPane.path)
    const decision = `external:${accepted}`
    if (lastPaneDragOverDecision !== decision) {
      lastPaneDragOverDecision = decision
      log.info('[DnD][App] pane dragover (external drag)', { accepted, targetPaneId })
    }
    if (accepted) {
      event.preventDefault()
      dataTransfer.dropEffect = 'copy'
      showDropHint(event.clientX, event.clientY, 'copy', paneDisplayName(targetPane.path))
    } else {
      hideDropHint()
    }
    return
  }

  if (source.paneId === targetPaneId) {
    const decision = 'same-pane'
    if (lastPaneDragOverDecision !== decision) {
      lastPaneDragOverDecision = decision
      log.info('[DnD][App] pane dragover skipped: same pane', { targetPaneId, sourcePaneId: source.paneId })
    }
    hideDropHint()
    return // 同面板背景放置无效
  }
  if (isZipVirtualPath(targetPane.path)) {
    log.info('[DnD][App] pane dragover skipped: target pane inside zip', { targetPaneId })
    hideDropHint()
    return
  }
  if (isSelfOrDescendant(source.files, targetPane.path)) {
    log.info('[DnD][App] pane dragover skipped: target is self/descendant', { targetPaneId, targetPath: targetPane.path })
    hideDropHint()
    return
  }
  lastPaneDragOverDecision = ''

  event.preventDefault()
  // 光标反馈：Option/跨设备 copy，同设备 move（drop 时按 altKey 重新判定）
  const dropEffect = event.altKey || source.deviceId !== targetPane.deviceId ? 'copy' : 'move'
  dataTransfer.dropEffect = dropEffect
  showDropHint(event.clientX, event.clientY, dropEffect, paneDisplayName(targetPane.path))
}

async function handleDrop(event: DragEvent, targetPaneId: string) {
  event.preventDefault()
  hideDropHint()
  const targetPane = tabsStore.findPane(targetPaneId)
  if (!targetPane) {
    console.error('[DualPaneWorkspace] Drop target pane was not found', { targetPaneId })
    return
  }

  log.info('[DnD][App] pane drop', {
    targetPaneId,
    targetDeviceId: targetPane.deviceId,
    targetPath: targetPane.path
  })

  const source = extractDragSource(event, dragSessionStore)
  if (source) {
    // 应用内拖拽（JSON payload 或原生拖拽会话回落）
    if (source.paneId === targetPaneId) {
      log.info('[DnD][App] pane drop skipped: same pane', { targetPaneId })
      return
    }
    if (isZipVirtualPath(targetPane.path)) {
      log.info('[DnD][App] pane drop skipped: target pane inside zip')
      return
    }
    if (isSelfOrDescendant(source.files, targetPane.path)) {
      log.info('[DnD][App] pane drop skipped: target is self/descendant', { targetPath: targetPane.path })
      return
    }

    const action = await resolveDropAction(source.deviceId, targetPane.deviceId, event)
    if (!action) {
      log.warn('[DnD][App] pane drop rejected: transfer not allowed', {
        sourceDeviceId: source.deviceId,
        targetDeviceId: targetPane.deviceId
      })
      return
    }

    try {
      const task = await queueTransfer(fileOpsStore, source, action, targetPane)
      log.info('[DnD][App] pane drop → task queued', {
        taskId: task.id,
        type: task.type,
        sourceDeviceId: source.deviceId,
        targetDeviceId: targetPane.deviceId,
        targetPath: targetPane.path,
        fileCount: source.files.length
      })
    } catch (error) {
      console.error('[DnD][App] Failed to queue internal transfer', {
        sourcePaneId: source.paneId,
        sourceDeviceId: source.deviceId,
        targetPaneId,
        targetDeviceId: targetPane.deviceId,
        action,
        error
      })
    }
    return
  }

  if (event.dataTransfer) {
    const externalFiles = Array.from(event.dataTransfer.files)
    if (externalFiles.length > 0) {
      log.info('[DnD][App] pane drop → external (Finder) import', {
        targetPaneId,
        fileCount: externalFiles.length,
        names: externalFiles.map(file => file.name)
      })
      try {
        await fileOpsStore.importExternalFiles(externalFiles, targetPane.deviceId, targetPane.path)
        tabsStore.navigatePane(targetPaneId, targetPane.path)
      } catch (error) {
        console.error('[App] Failed to import Finder drop:', { targetPaneId, error })
      }
      return
    }
  }
}

function handleTaskEndpointLocate(endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }) {
  const existingTab = tabsStore.tabs.find(tab => tab.panes.some(pane => pane.deviceId === endpoint.deviceId))
  if (existingTab) tabsStore.setActiveTab(existingTab.id)

  const targetPane = existingTab?.panes.find(pane => pane.deviceId === endpoint.deviceId) || tabsStore.activePane
  if (!targetPane) return

  if (targetPane.deviceId !== endpoint.deviceId) {
    tabsStore.setPaneDevice(targetPane.id, endpoint.deviceId)
  }

  const directory = endpoint.kind === 'source' ? getParentPath(endpoint.path) : endpoint.path
  tabsStore.navigatePane(targetPane.id, directory)
  if (endpoint.kind === 'source') {
    tabsStore.setSelectedFiles(targetPane.id, [endpoint.path])
  }
}

// Keyboard shortcuts for preview
// Note: child components that open modals (e.g. diff view) use useKeyInterceptor in
// capture phase and return `true` to consume ESC — this handler (bubble phase) is
// automatically skipped when a child has already handled the key.
function handleKeydown(e: KeyboardEvent) {
  // Quick Look handles its own Esc via useKeyInterceptor (capture phase);
  // skip here to avoid double-handling while it is open.
  if (e.key === 'Escape' && !previewStore.quickLookOpen) {
    // 预览 tab 激活时，Esc 关闭当前预览 tab（回到之前的 tab）。
    if (activeTab.value?.preview) {
      tabsStore.closeTab(activeTab.value.id)
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* macOS traffic light positioning */
/* .app-drag / .app-no-drag 已移至 style.css 全局定义 */

/* 任务抽屉 push 模式的宽度动画容器（macOS 标准材质曲线）。
   内容固定像素宽 + overflow hidden，随容器宽度伸缩实现滑入/滑出。 */
.task-drawer-wrap {
  transition: width 220ms cubic-bezier(0.2, 0, 0, 1);
}
</style>
