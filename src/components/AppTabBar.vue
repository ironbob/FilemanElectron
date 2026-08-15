<template>
  <div
    class="finder-tab-strip h-11 bg-bg-toolbar flex items-center px-2 gap-1.5 border-b border-border overflow-x-auto transition-colors"
    :class="folderDragOver ? 'border-b-2 border-b-accent-blue bg-accent-blue/5' : ''"
    @dragover.prevent="onFolderDragOver"
    @dragleave="onFolderDragLeave"
    @drop.prevent="onFolderDrop"
  >
    <!-- Tabs -->
    <div
      v-for="tab in tabsStore.tabs"
      :key="tab.id"
      class="tab-item group"
      :class="[
        tab.id === tabsStore.activeTabId ? 'tab-item-active' : 'tab-item-inactive'
      ]"
      @click="tabsStore.setActiveTab(tab.id)"
    >
      <!-- Tab icon -->
      <svg class="w-3.5 h-3.5 flex-shrink-0" :class="tab.id === tabsStore.activeTabId ? 'text-accent-blue' : 'text-text-secondary'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <!-- Tab title -->
      <span class="truncate max-w-32 text-xs font-medium">{{ tab.title }}</span>

      <!-- Close button -->
      <button
        v-if="tabsStore.tabs.length > 1"
        class="close-button"
        :class="[
          tab.id === tabsStore.activeTabId ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-60',
          tab.id === tabsStore.activeTabId ? 'text-text-secondary hover:bg-black/10 hover:text-text-primary active:bg-black/20' : 'text-text-secondary hover:bg-black/20 hover:text-text-primary active:bg-black/30'
        ]"
        @click.stop="tabsStore.closeTab(tab.id)"
        :aria-label="`Close ${tab.title}`"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Add Tab Button -->
    <button
      class="action-button"
      @click="tabsStore.createTab"
      title="New Tab"
      aria-label="New Tab"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>

    <!-- Split Pane Button -->
    <button
      v-if="activeTab && activeTab.panes.length < 2"
      class="action-button ml-auto"
      @click="splitPane"
      title="Split Pane"
      aria-label="Split Pane"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import type { InternalFileDragPayload } from '@/types/fileOperation'

const tabsStore = useTabsStore()

const activeTab = computed(() => tabsStore.activeTab)

function splitPane() {
  tabsStore.toggleActiveSplit()
}

// ── 拖文件夹到标签栏 → 新标签页打开 ───────────────────────────────────────────
// dragover 阶段读不到 dataTransfer 数据（浏览器限制），只能按 types 判断是否为
// app 内部拖拽；isDirectory 校验与开 tab 在 drop 时进行。
const folderDragOver = ref(false)

function onFolderDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/json')) {
    folderDragOver.value = true
  }
}

function onFolderDragLeave() {
  folderDragOver.value = false
}

async function onFolderDrop(event: DragEvent) {
  folderDragOver.value = false
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const payload = JSON.parse(raw) as InternalFileDragPayload
    const path = payload.files[0]
    if (!path || payload.files.length !== 1) return // 仅单个文件夹有"打开"语义
    const stats = await window.fileman.getStats(payload.deviceId, path)
    if (!stats.isDirectory) return
    tabsStore.openPathInNewTab(payload.deviceId, path)
  } catch (e) {
    console.warn('[AppTabBar] drop: not a folder or invalid payload', e)
  }
}
</script>

<style scoped>
div::-webkit-scrollbar {
  display: none;
}
div {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.tab-item {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out select-none;
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
  @apply w-4 h-4 flex items-center justify-center rounded-full transition-all duration-200;
  flex-shrink: 0;
}

.action-button {
  @apply h-7 w-7 flex items-center justify-center text-text-secondary hover:text-accent-blue hover:bg-black/5 rounded-md transition-all duration-200;
  @apply active:bg-black/10;
  flex-shrink: 0;
}
</style>
