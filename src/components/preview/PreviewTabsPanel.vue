<template>
  <div class="h-11 bg-bg-toolbar flex items-center px-2 gap-1.5 border-b border-border flex-shrink-0 overflow-x-auto tab-bar-scroll">
    <!-- Tab items -->
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item group"
      :class="tab.id === activeTabId ? 'tab-item-active' : 'tab-item-inactive'"
      @click="emit('switch-tab', tab.id)"
      @contextmenu.prevent="showContextMenu($event, tab.id)"
    >
      <!-- File type icon -->
      <svg
        class="w-3.5 h-3.5 flex-shrink-0"
        :class="tab.id === activeTabId ? 'text-accent-blue' : 'text-text-secondary'"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>

      <!-- Tab title -->
      <span class="truncate max-w-32 text-xs font-medium">{{ tab.file.name }}</span>

      <!-- Modified indicator -->
      <span
        v-if="isTabModified(tab)"
        class="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0"
        title="Unsaved changes"
      ></span>

      <!-- Close button -->
      <button
        class="close-button"
        :class="[
          tab.id === activeTabId ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-60',
          tab.id === activeTabId ? 'text-text-secondary hover:bg-black/10 hover:text-text-primary active:bg-black/20' : 'text-text-secondary hover:bg-black/20 hover:text-text-primary active:bg-black/30'
        ]"
        @click.stop="emit('close-tab', tab.id)"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="fixed bg-bg-secondary border border-border rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button
        v-for="item in contextMenuItems"
        :key="item.action"
        class="w-full px-3 py-1.5 text-left text-xs hover:bg-bg-hover flex items-center justify-between text-text-primary"
        @click="handleMenuAction(item.action)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.shortcut" class="text-text-tertiary ml-4">{{ item.shortcut }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue'
import type { PreviewTab } from '@/types/preview'

defineProps<{
  tabs: PreviewTab[]
  activeTabId: string | null
}>()

function isTabModified(tab: PreviewTab): boolean {
  return tab.isModified ?? false
}

const emit = defineEmits<{
  'close-tab': [tabId: string]
  'switch-tab': [tabId: string]
  'context-menu-action': [action: string, tabId: string]
}>()

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  tabId: ''
})

const contextMenuItems = [
  { label: 'Close', action: 'close' },
  { label: 'Close Others', action: 'close-others' },
  { label: 'Close All to Right', action: 'close-right' },
  { label: 'Copy File Path', action: 'copy-path', shortcut: 'Cmd+C' },
  { label: 'Reveal in Finder', action: 'reveal', shortcut: 'Cmd+Shift+H' }
]

function showContextMenu(event: MouseEvent, tabId: string) {
  event.preventDefault()
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.tabId = tabId
}

function hideContextMenu() {
  contextMenu.visible = false
}

function handleMenuAction(action: string) {
  hideContextMenu()
  emit('context-menu-action', action, contextMenu.tabId)
}

function handleClickOutside() {
  if (contextMenu.visible) {
    hideContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

</script>

<style scoped>
.tab-bar-scroll::-webkit-scrollbar {
  display: none;
}
.tab-bar-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.tab-item {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 ease-in-out select-none;
  min-height: 28px;
  flex-shrink: 0;
}

.tab-item-inactive {
  @apply text-text-secondary hover:bg-black/5 hover:text-text-primary;
}

.tab-item-active {
  @apply text-text-primary bg-bg-active;
}

.close-button {
  @apply w-4 h-4 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer;
  flex-shrink: 0;
}
</style>
