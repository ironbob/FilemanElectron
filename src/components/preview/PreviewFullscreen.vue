<template>
  <Transition name="preview-fade">
    <div
      v-if="previewStore.isFullscreen && previewStore.tabs.length > 0"
      class="absolute inset-0 z-50 flex flex-col bg-bg-primary"
    >
      <!-- Header with close button -->
      <div class="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span class="text-sm font-medium text-text-primary">Preview</span>
          <span class="text-xs text-text-tertiary">{{ previewStore.tabs.length }} file{{ previewStore.tabs.length > 1 ? 's' : '' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Exit Fullscreen (Esc)"
            @click="closeFullscreen"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

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
          @open-in-full="() => {}"
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
import { computed } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import PreviewTabsPanel from './PreviewTabsPanel.vue'
import PreviewTextContent from './PreviewTextContent.vue'
import PreviewImageContent from './PreviewImageContent.vue'
import PreviewVideoContent from './PreviewVideoContent.vue'
import PreviewAudioContent from './PreviewAudioContent.vue'
import PreviewPdfContent from './PreviewPdfContent.vue'
import PreviewZipContent from './PreviewZipContent.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewFullscreen] ${message}`, ...args)
}

const previewStore = usePreviewStore()

const activeTab = computed(() => previewStore.activeTab)

function closeFullscreen() {
  log('Closing fullscreen')
  previewStore.closeFullscreen()
}

function handleCloseTab(tabId: string) {
  log('Closing tab:', tabId)
  previewStore.closeTab(tabId)
}

function handleSwitchTab(tabId: string) {
  log('Switching to tab:', tabId)
  previewStore.setActiveTab(tabId)
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
</script>

<style scoped>
/* Preview fullscreen transition */
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: all 0.25s ease-out;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
