<template>
  <div class="h-screen flex flex-col bg-bg-primary" :data-theme="theme">
    <!-- Title Bar / Toolbar (macOS style) -->
    <div class="h-12 bg-bg-toolbar flex items-center px-4 border-b border-border app-drag overflow-visible">
      <!-- Left spacer for macOS traffic lights (native buttons via hiddenInset) -->
      <div class="w-16"></div>

      <!-- Center Title -->
      <div class="flex-1 text-center text-sm font-medium text-text-secondary">
        {{ appTitle }}
      </div>

      <!-- Right Actions -->
      <div class="flex items-center gap-1.5 app-no-drag bg-bg-secondary/30 rounded-lg p-0.5 overflow-visible">
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
      <AppSidebar class="w-52 flex-shrink-0 border-r border-border" />

      <!-- Main Area -->
      <div class="flex-1 flex flex-col overflow-hidden bg-bg-primary relative">
        <!-- Tab Bar -->
        <AppTabBar />

        <!-- Content Area with File Panes -->
        <div class="flex-1 flex overflow-hidden">
          <!-- File Panes Container -->
          <div class="flex-1 flex overflow-hidden min-w-0">
            <!-- File Diff View -->
            <template v-if="activeTab?.fileDiffSession">
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

        <!-- Fullscreen Preview (covers tab bar + file panes, keeps sidebar visible) -->
        <PreviewFullscreen />
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
import PreviewFullscreen from './components/preview/PreviewFullscreen.vue'
import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import DirCompareView from './components/compare/DirCompareView.vue'
import FileDiffView from './components/compare/FileDiffView.vue'
import { useTabsStore } from './stores/tabs'
import { useDevicesStore } from './stores/devices'
import { useFileOperationsStore } from './stores/fileOperations'
import { usePreviewStore } from './stores/preview'

const previewStore = usePreviewStore()

const tabsStore = useTabsStore()
const devicesStore = useDevicesStore()
const fileOpsStore = useFileOperationsStore()

const theme = ref<'light' | 'dark'>('dark')
const showSettingsDialog = ref(false)

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
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', theme.value)
}

const activeTab = computed(() => tabsStore.activeTab)

const appTitle = computed(() => {
  if (activeTab.value) {
    return activeTab.value.title
  }
  return 'Fileman'
})

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

function handleDrop(event: DragEvent, targetPaneId: string) {
  event.preventDefault()
  if (event.dataTransfer) {
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'))
      if (data.paneId !== targetPaneId) {
        const targetPane = tabsStore.findPane(targetPaneId)
        if (targetPane) {
          if (event.altKey) {
            fileOpsStore.createMoveTask(
              data.deviceId || 'local',
              data.files,
              targetPane.deviceId,
              targetPane.path
            )
          } else {
            fileOpsStore.createCopyTask(
              data.deviceId || 'local',
              data.files,
              targetPane.deviceId,
              targetPane.path
            )
          }
          fileOpsStore.showPanel()
        }
      }
    } catch (e) {
      console.error('Failed to handle drop:', e)
    }
  }
}

// Keyboard shortcuts for preview
// Note: child components that open modals (e.g. diff view) use useKeyInterceptor in
// capture phase and return `true` to consume ESC — this handler (bubble phase) is
// automatically skipped when a child has already handled the key.
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && previewStore.tabs.length > 0) {
    // First close fullscreen, then close all tabs
    if (previewStore.isFullscreen) {
      previewStore.closeFullscreen()
    } else {
      console.log('Closing all tabs')
      previewStore.closeAllTabs()
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
