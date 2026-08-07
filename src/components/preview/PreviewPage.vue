<template>
  <div
    v-if="previewStore.isOpen"
    class="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-border overflow-hidden animate-slide-up"
    :style="{ height: previewStore.panelHeight + 'px' }"
  >
    <!-- Tabs Panel -->
    <PreviewTabsPanel
      :tabs="previewStore.tabs"
      :active-tab-id="previewStore.activeTabId"
      @close-tab="handleCloseTab"
      @switch-tab="handleSwitchTab"
      class="flex-shrink-0"
    />

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden" style="height: calc(100% - 36px);">
      <PreviewTextContent
        v-if="activeTab?.type === 'text'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        class="h-full"
        @openInFull="openInFull"
      />
      <PreviewImageContent
        v-else-if="activeTab?.type === 'image'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        class="h-full"
        @openInFull="openInFull"
      />
      <PreviewVideoContent
        v-else-if="activeTab?.type === 'video'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        class="h-full"
        @openInFull="openInFull"
      />
      <PreviewAudioContent
        v-else-if="activeTab?.type === 'audio'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        class="h-full"
        @openInFull="openInFull"
      />
      <PreviewPdfContent
        v-else-if="activeTab?.type === 'pdf'"
        :file="activeTab.file"
        :device-id="activeTab.deviceId"
        class="h-full"
        @openInFull="openInFull"
      />
    </div>

    <!-- Resize Handle -->
    <div
      class="absolute top-0 left-0 right-0 h-1 bg-transparent cursor-row-resize hover:bg-accent-blue/30 transition-colors"
      @mousedown="startResize"
    ></div>

    <!-- Close Button -->
    <button
      class="absolute top-2 right-2 p-1 rounded hover:bg-bg-hover z-10"
      title="Close Panel"
      @click="closePanel"
    >
      <svg class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import PreviewTabsPanel from './PreviewTabsPanel.vue'
import PreviewTextContent from './PreviewTextContent.vue'
import PreviewImageContent from './PreviewImageContent.vue'
import PreviewVideoContent from './PreviewVideoContent.vue'
import PreviewAudioContent from './PreviewAudioContent.vue'
import PreviewPdfContent from './PreviewPdfContent.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewPage] ${message}`, ...args)
}

const previewStore = usePreviewStore()

const activeTab = computed(() => previewStore.activeTab)

function handleCloseTab(tabId: string) {
  log('Closing tab:', tabId)
  previewStore.closeTab(tabId)
}

function handleSwitchTab(tabId: string) {
  log('Switching to tab:', tabId)
  previewStore.setActiveTab(tabId)
}

function closePanel() {
  log('Closing panel')
  previewStore.closePanel()
}

function openInFull() {
  log('Opening in full viewer')
  // This could open a modal or new window
}

function startResize(e: MouseEvent) {
  log('Starting resize')
  e.preventDefault()

  const startY = e.clientY
  const startHeight = previewStore.panelHeight

  function onMouseMove(e: MouseEvent) {
    const deltaY = startY - e.clientY
    const newHeight = Math.max(100, Math.min(800, startHeight + deltaY))
    previewStore.setPanelHeight(newHeight)
  }

  function onMouseUp() {
    log('Resize ended')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
