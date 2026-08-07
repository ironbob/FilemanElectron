<template>
  <Transition name="preview-slide">
    <div
      v-if="previewStore.tabs.length > 0 && !previewStore.isFullscreen"
      class="flex flex-col border-l border-border bg-bg-primary relative flex-shrink-0"
      :style="{ width: previewStore.previewWidth + 'px' }"
    >
    <!-- Resize Handle -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 transition-colors"
      :class="isResizing ? 'bg-accent-blue' : 'bg-transparent hover:bg-accent-blue/50'"
      @mousedown="startResize"
    />

    <!-- Tab Panel -->
    <PreviewTabsPanel
      :tabs="previewStore.tabs"
      :active-tab-id="previewStore.activeTabId"
      @close-tab="handleCloseTab"
      @switch-tab="handleSwitchTab"
      @context-menu-action="handleContextMenuAction"
    />

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden">
      <PreviewTextContent
        v-if="activeTab?.type === 'text'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="() => {}"
      />
      <PreviewImageContent
        v-else-if="activeTab?.type === 'image'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="openImageFullscreen"
      />
      <PreviewVideoContent
        v-else-if="activeTab?.type === 'video'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="() => {}"
      />
      <PreviewAudioContent
        v-else-if="activeTab?.type === 'audio'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="() => {}"
      />
      <PreviewPdfContent
        v-else-if="activeTab?.type === 'pdf'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="() => {}"
      />
      <PreviewZipContent
        v-else-if="activeTab?.type === 'zip'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        @open-in-full="() => {}"
      />
      <!-- Unknown file type -->
      <div
        v-else-if="activeTab"
        class="flex flex-col items-center justify-center h-full text-text-tertiary"
      >
        <svg class="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm font-medium text-text-primary">{{ activeTab.file.name }}</p>
        <p class="text-xs mt-1">Cannot preview this file type</p>
      </div>
    </div>
  </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import PreviewTabsPanel from './PreviewTabsPanel.vue'
import PreviewTextContent from './PreviewTextContent.vue'
import PreviewImageContent from './PreviewImageContent.vue'
import PreviewVideoContent from './PreviewVideoContent.vue'
import PreviewAudioContent from './PreviewAudioContent.vue'
import PreviewPdfContent from './PreviewPdfContent.vue'
import PreviewZipContent from './PreviewZipContent.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewPane] ${message}`, ...args)
}

const previewStore = usePreviewStore()

const isResizing = ref(false)

const activeTab = computed(() => previewStore.activeTab)

function handleCloseTab(tabId: string) {
  log('Closing tab:', tabId)
  previewStore.closeTab(tabId)
}

function handleSwitchTab(tabId: string) {
  log('Switching to tab:', tabId)
  previewStore.setActiveTab(tabId)
}

function openImageFullscreen() {
  if (activeTab.value) {
    previewStore.openImageBrowser(activeTab.value.file, activeTab.value.deviceId, [activeTab.value.file])
  }
}

function handleContextMenuAction(action: string, tabId: string) {
  log('Context menu action:', action, 'on tab:', tabId)
  switch (action) {
    case 'close':
      previewStore.closeTab(tabId)
      break
    case 'close-others':
      previewStore.closeOtherTabs(tabId)
      break
    case 'close-right':
      previewStore.closeTabsToRight(tabId)
      break
    case 'copy-path':
      previewStore.copyFilePath(tabId)
      break
    case 'reveal':
      previewStore.revealInFinder(tabId)
      break
  }
}

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  log('Starting resize')

  const startX = e.clientX
  const startWidth = previewStore.previewWidth

  function onMouseMove(e: MouseEvent) {
    const diff = startX - e.clientX
    previewStore.setPreviewWidth(startWidth + diff)
  }

  function onMouseUp() {
    isResizing.value = false
    log('Resize ended')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
/* Preview pane slide transition */
.preview-slide-enter-active,
.preview-slide-leave-active {
  transition: all 0.2s ease-out;
}

.preview-slide-enter-from,
.preview-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
