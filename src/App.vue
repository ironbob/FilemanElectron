<template>
  <div class="h-screen flex flex-col bg-bg-primary finder-shell" :data-theme="theme">
    <!-- Title bar: tabs share this row with the native window controls. -->
    <div class="finder-window-titlebar h-12 bg-bg-toolbar flex items-center px-4 border-b border-border app-drag overflow-visible">
      <!-- Left spacer for macOS traffic lights (native buttons via hiddenInset) -->
      <div class="w-16 finder-traffic-light-inset"></div>

      <!-- Keep tabs in the title bar to reclaim their former dedicated row. -->
      <AppTabBar class="flex-1 min-w-0 app-no-drag" />

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
            <!-- Normal File Panes -->
            <template v-else>
              <FilePane
                v-for="pane in activePanes"
                :key="pane.id"
                :pane-id="pane.id"
                class="flex-1 border-r border-border last:border-r-0"
                @drop="handleDrop($event, pane.id)"
                @dragover.prevent
              />
            </template>
          </div>
        </div>

        <!-- Image browser overlay (folder-aware viewer for images) -->
        <ImageBrowserOverlay />
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

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTabBar from './components/AppTabBar.vue'
import FilePane from './components/FilePane.vue'
import FileOperationPanel from './components/FileOperationPanel.vue'
import PreviewView from './components/preview/PreviewView.vue'
import ImageBrowserOverlay from './components/preview/ImageBrowserOverlay.vue'
import QuickLookOverlay from './components/preview/QuickLookOverlay.vue'
import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import DirCompareView from './components/compare/DirCompareView.vue'
import FileDiffView from './components/compare/FileDiffView.vue'
import { useTabsStore } from './stores/tabs'
import { useDevicesStore } from './stores/devices'
import { useFileOperationsStore } from './stores/fileOperations'
import { usePreviewStore } from './stores/preview'
import { useSettingsStore } from './stores/settings'
import { getParentPath } from './utils/path'
import type { InternalFileDragPayload } from './types/fileOperation'

const log = console
const previewStore = usePreviewStore()

const tabsStore = useTabsStore()
const devicesStore = useDevicesStore()
const fileOpsStore = useFileOperationsStore()
const settingsStore = useSettingsStore()

const theme = ref<'light' | 'dark'>('dark')
const showSettingsDialog = ref(false)

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

  // Load app settings (hidden-files toggle etc.)
  void settingsStore.load()

  // Restore sidebar width
  const savedSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  if (savedSidebarWidth >= SIDEBAR_MIN_WIDTH) {
    sidebarWidth.value = Math.min(SIDEBAR_MAX_WIDTH, savedSidebarWidth)
  }

  log.info('[FinderShell] initialized', { theme: theme.value, sidebarWidth: sidebarWidth.value })
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', theme.value)
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

function parseInternalFileDragPayload(value: string): InternalFileDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null

    const payload = parsed as Record<string, unknown>
    if (
      typeof payload.paneId !== 'string' ||
      typeof payload.deviceId !== 'string' ||
      payload.deviceId.length === 0 ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0 ||
      !payload.files.every(file => typeof file === 'string')
    ) {
      return null
    }

    return {
      paneId: payload.paneId,
      deviceId: payload.deviceId,
      files: payload.files
    }
  } catch {
    return null
  }
}

async function handleDrop(event: DragEvent, targetPaneId: string) {
  event.preventDefault()
  if (event.dataTransfer) {
    const internalDragData = event.dataTransfer.getData('application/json')
    if (internalDragData) {
      const data = parseInternalFileDragPayload(internalDragData)
      if (!data) {
        console.error('[DualPaneWorkspace] Rejected invalid internal drag payload', { targetPaneId })
        return
      }

      if (data.paneId === targetPaneId) return

      const targetPane = tabsStore.findPane(targetPaneId)
      if (!targetPane) {
        console.error('[DualPaneWorkspace] Drop target pane was not found', { targetPaneId })
        return
      }

      try {
        await fileOpsStore.createCopyTask(
          data.deviceId,
          data.files,
          targetPane.deviceId,
          targetPane.path
        )
        fileOpsStore.showPanel()
      } catch (error) {
        console.error('[DualPaneWorkspace] Failed to queue internal copy', {
          sourcePaneId: data.paneId,
          sourceDeviceId: data.deviceId,
          targetPaneId,
          targetDeviceId: targetPane.deviceId,
          error
        })
      }
      return
    }

    const externalFiles = Array.from(event.dataTransfer.files)
    if (externalFiles.length > 0) {
      const targetPane = tabsStore.findPane(targetPaneId)
      if (!targetPane) return

      try {
        await fileOpsStore.importExternalFiles(externalFiles, targetPane.deviceId, targetPane.path)
        fileOpsStore.showPanel()
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
  // Image browser / Quick Look handle their own Esc via useKeyInterceptor
  // (capture phase); skip here to avoid double-handling while they are open.
  if (e.key === 'Escape' && !previewStore.imageBrowserOpen && !previewStore.quickLookOpen) {
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
.app-drag {
  -webkit-app-region: drag;
}

.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
