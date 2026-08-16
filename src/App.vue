<template>
  <div class="h-screen flex flex-col bg-bg-primary finder-shell" :data-theme="theme">
    <!-- Title bar: tabs share this row with the native window controls. -->
    <div class="finder-window-titlebar h-12 bg-bg-toolbar flex items-center px-4 border-b border-border app-drag overflow-visible">
      <!-- Left spacer for macOS traffic lights (native buttons via hiddenInset) -->
      <div class="w-16 finder-traffic-light-inset"></div>

      <!-- Keep tabs in the title bar to reclaim their former dedicated row.
           标签栏本身可拖动窗口（Finder 语义）；tab 与按钮在组件内标记 app-no-drag。 -->
      <AppTabBar class="flex-1 min-w-0" />

      <!-- Global actions moved to the fixed sidebar utility area. -->
      <div v-if="false" class="flex items-center gap-1.5 app-no-drag bg-bg-secondary/30 rounded-lg p-0.5 overflow-visible">
        <button
          class="toolbar-btn-enhanced"
          @click="toggleTheme"
          :title="theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          :aria-label="theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        >
          <!-- Sun icon for dark mode -->
          <svg v-if="theme === 'dark'" class="w-4 h-4 text-accent-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <!-- Moon icon for light mode -->
          <svg v-else class="w-4 h-4 text-accent-indigo" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
        <button
          class="toolbar-btn-enhanced"
          @click="fileOpsStore.togglePanel()"
          :class="{ 'active': fileOpsStore.isPanelVisible }"
          title="File Operations"
          aria-label="File Operations"
        >
          <svg class="w-4 h-4" :class="fileOpsStore.isPanelVisible ? 'text-accent-blue' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          class="toolbar-btn-enhanced"
          :class="{ active: activePanes.length === 2 }"
          :disabled="!!activeTab?.compareSession || !!activeTab?.fileDiffSession"
          @click="tabsStore.toggleActiveSplit()"
          title="Toggle Dual Pane"
          aria-label="Toggle Dual Pane"
        >
          <svg class="w-4 h-4" :class="activePanes.length === 2 ? 'text-accent-blue' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 012-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </button>
        
        <!-- Settings Button -->
        <button
          class="toolbar-btn-enhanced"
          @click="showSettingsDialog = true"
          title="Settings"
          aria-label="Settings"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <AppSidebar
        class="flex-shrink-0 overflow-hidden"
        :style="{ width: sidebarWidth + 'px' }"
        :theme="theme"
        :is-file-operations-visible="fileOpsStore.isPanelVisible"
        :active-task-count="fileOpsStore.activeTaskCount"
        :is-dual-pane-active="activePanes.length === 2"
        :is-split-toggle-disabled="!!activeTab?.compareSession || !!activeTab?.fileDiffSession"
        @toggle-theme="toggleTheme"
        @toggle-file-operations="fileOpsStore.togglePanel()"
        @toggle-dual-pane="tabsStore.toggleActiveSplit()"
        @open-settings="showSettingsDialog = true"
      />

      <!-- Sidebar Resize Handle -->
      <div
        class="w-1 bg-border hover:bg-accent-blue cursor-col-resize flex-shrink-0 transition-colors"
        :class="{ 'bg-accent-blue': isSidebarResizing }"
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
    </div>

    <!-- Status Bar -->
    <div class="h-7 bg-bg-statusbar flex items-center justify-between px-4 text-xs border-t border-border">
      <span class="text-text-secondary">{{ statusText }}</span>
      <div class="flex items-center gap-4">
        <span v-for="device in connectedDevices" :key="device.id" class="flex items-center gap-1.5 text-text-secondary">
          <span
            class="w-2 h-2 rounded-full"
            :class="device.status === 'connected' ? 'bg-[#28c840]' : 'bg-[#ffbd2e]'"
          ></span>
          <span>{{ device.name }}</span>
        </span>
      </div>
    </div>

    <!-- File Operation Panel -->
    <FileOperationPanel
      :visible="fileOpsStore.isPanelVisible"
      @close="fileOpsStore.hidePanel()"
      @locate="handleTaskEndpointLocate"
    />

    <!-- Settings Dialog -->
    <SettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
    />

    <!-- Command Palette (⌘⇧P) -->
    <CommandPalette
      v-if="paletteOpen"
      :context="paletteContext"
      @close="paletteOpen = false"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTabBar from './components/AppTabBar.vue'
import FilePane from './components/FilePane.vue'
import FileOperationPanel from './components/FileOperationPanel.vue'
import PreviewView from './components/preview/PreviewView.vue'
import QuickLookOverlay from './components/preview/QuickLookOverlay.vue'
import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import CommandPalette from './components/palette/CommandPalette.vue'
import { useCommandRegistryStore, type CommandContext } from './stores/commandRegistry'
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
import { useGitStatusStore } from './stores/gitStatus'
import { useDragSessionStore } from './stores/dragSession'
import { getParentPath } from './utils/path'
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

const theme = ref<'light' | 'dark'>('dark')
const showSettingsDialog = ref(false)
const paletteOpen = ref(false)
const commandRegistry = useCommandRegistryStore()

// The reference Finder sidebar occupies about 15% of its window width.
// This default keeps that ratio at the app's normal 1152px launch viewport.
const SIDEBAR_DEFAULT_WIDTH = 176
const SIDEBAR_MIN_WIDTH = 168
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_WIDTH_KEY = 'fileman-finder-sidebar-width'
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH)
const isSidebarResizing = ref(false)

// Load theme from storage
onMounted(() => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (savedTheme) {
    theme.value = savedTheme
  } else {
    // Follow system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme.value = prefersDark ? 'dark' : 'light'
  }

  // Initialize file operations store
  fileOpsStore.initialize()

  // Git 状态徽标：订阅 watch:changed 做缓存失效（本地仓库目录）
  useGitStatusStore().initialize()

  // 命令面板内置命令播种
  seedBuiltinCommands()

  // Load app settings (hidden-files toggle etc.)
  void settingsStore.load()

  // Restore sidebar width
  const savedSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  if (savedSidebarWidth >= SIDEBAR_MIN_WIDTH) {
    sidebarWidth.value = Math.min(SIDEBAR_MAX_WIDTH, savedSidebarWidth)
  }

  // 拖拽会话防陈旧清理：应用内任何新拖拽必先经过 pointerdown；
  // HTML5 拖拽结束（含取消/拖出窗口）触发 dragend；drop 用冒泡阶段挂载，
  // 在所有落点处理器之后运行，覆盖「落到标签栏等未消费会话的区域」的情况。
  // 原生拖拽拖出到 Finder 后无 App 内事件，由落点侧的文件名匹配兜底（dragTransfer.ts）。
  window.addEventListener('pointerdown', clearDragSession, true)
  window.addEventListener('dragend', clearDragSession, true)
  window.addEventListener('drop', clearDragSession)
  document.addEventListener('dragleave', convertToNativeDragOnWindowExit)

  log.info('[FinderShell] initialized', { theme: theme.value, sidebarWidth: sidebarWidth.value })
})

/**
 * HTML5 拖拽拖出窗口边界时转原生拖拽（webContents.startDrag），
 * 使文件可以拖到 Finder / 其他应用。Electron 的原生拖拽不会向源窗口派发
 * dragover/drop（electron#7118），因此不能在 dragstart 时直接劫持，
 * 只能在光标已经离开窗口、应用内放置不可能发生时再转换。
 */
function convertToNativeDragOnWindowExit(event: DragEvent) {
  if (event.relatedTarget) return // 仍在文档内移动
  const payload = dragSessionStore.peek()
  if (!payload) return
  if (payload.deviceId !== 'local' || payload.files.some(filePath => isZipVirtualPath(filePath))) return

  log.info('[DnD][App] drag left window → converting to native drag', {
    paneId: payload.paneId,
    fileCount: payload.files.length
  })
  window.fileman.startNativeDrag(payload.files)
}

function clearDragSession() {
  dragSessionStore.clear()
  hideDropHint()
}

onUnmounted(() => {
  window.removeEventListener('pointerdown', clearDragSession, true)
  window.removeEventListener('dragend', clearDragSession, true)
  window.removeEventListener('drop', clearDragSession)
  document.removeEventListener('dragleave', convertToNativeDragOnWindowExit)
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', theme.value)
}

// ── 命令面板（⌘⇧P）────────────────────────────────────────────────────────
// 捕获期消费（return true），先于 FileList 的 document 冒泡监听；
// 面板自身打开后，其内部的 ↑↓/Enter/Esc 由 CommandPalette 的 interceptor
// 以 LIFO 顺序先处理（疑难问题解决记录/子组件ESC键消费 的既定模式）。
useKeyInterceptor(event => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return true
  }
  return false
})

/** 面板执行上下文：活动面板 + 导航回调（收藏/手输路径跳转）。 */
const paletteContext = computed<CommandContext>(() => ({
  activePane: activeTab.value?.panes.length
    ? (() => {
        const pane = activeTab.value!.panes.find(p => p.id === activeTab.value!.activePaneId) ?? activeTab.value!.panes[0]
        return { paneId: pane.id, deviceId: pane.deviceId, path: pane.path }
      })()
    : undefined,
  navigate: (deviceId, path) => {
    const tab = activeTab.value
    if (!tab || tab.panes.length === 0) {
      tabsStore.openPathInNewTab(deviceId, path)
      return
    }
    const pane = tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]
    tabsStore.navigatePane(pane.id, path)
  }
}))

/** 内置命令播种（一次性；M3/M4 功能组件挂载时各自追加）。 */
function seedBuiltinCommands(): void {
  commandRegistry.registerCommands([
    {
      id: 'app.new-tab', title: '新建标签页', group: '标签页',
      run: () => { tabsStore.createTab() }
    },
    {
      id: 'app.close-tab', title: '关闭当前标签页', group: '标签页',
      run: () => { const tab = activeTab.value; if (tab) tabsStore.closeTab(tab.id) }
    },
    {
      id: 'app.toggle-dual-pane', title: '切换双面板', group: '标签页', shortcut: '⌘D',
      run: () => { tabsStore.toggleActiveSplit() }
    },
    {
      id: 'app.view-list', title: '切换为列表视图', group: '视图',
      run: ctx => { if (ctx.activePane) tabsStore.setViewMode(ctx.activePane.paneId, 'list') }
    },
    {
      id: 'app.view-grid', title: '切换为图标视图', group: '视图',
      run: ctx => { if (ctx.activePane) tabsStore.setViewMode(ctx.activePane.paneId, 'grid') }
    },
    {
      id: 'app.view-columns', title: '切换为分栏视图', group: '视图',
      run: ctx => { if (ctx.activePane) tabsStore.setViewMode(ctx.activePane.paneId, 'columns') }
    },
    {
      id: 'app.toggle-hidden', title: '显示/隐藏隐藏文件', group: '视图', shortcut: '⌘⇧.',
      run: () => { void settingsStore.toggleShowHiddenFiles() }
    },
    {
      id: 'app.toggle-theme', title: '切换深/浅色主题', group: '外观',
      run: () => { toggleTheme() }
    },
    {
      id: 'app.open-settings', title: '打开设置', group: '外观',
      run: () => { showSettingsDialog.value = true }
    },
    {
      id: 'app.refresh', title: '刷新当前目录', group: '文件', shortcut: '⌘R',
      keywords: ['refresh', 'reload'],
      run: () => { window.dispatchEvent(new CustomEvent('fileman:refresh-active-pane')) }
    }
  ])
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

const activeTab = computed(() => tabsStore.activeTab)

const activePanes = computed(() => {
  if (!activeTab.value) return []
  return activeTab.value.panes
})

const connectedDevices = computed(() =>
  devicesStore.connectedDevices
)

const statusText = computed(() => {
  const pane = tabsStore.activePane
  if (!pane) return 'Ready'

  const selectedCount = pane.selectedFiles.length
  if (selectedCount > 0) {
    return `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected`
  }

  const activeCount = fileOpsStore.activeTaskCount
  if (activeCount > 0) {
    return `Processing ${activeCount} task${activeCount > 1 ? 's' : ''}...`
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
</style>
