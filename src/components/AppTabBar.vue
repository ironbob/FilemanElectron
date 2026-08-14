<template>
  <div class="finder-tab-strip h-11 bg-bg-toolbar flex items-center px-2 gap-1.5 border-b border-border overflow-x-auto">
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
import { computed } from 'vue'
import { useTabsStore } from '@/stores/tabs'

const tabsStore = useTabsStore()

const activeTab = computed(() => tabsStore.activeTab)

function splitPane() {
  tabsStore.toggleActiveSplit()
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

.action-button {
  @apply h-7 w-7 flex items-center justify-center text-text-secondary hover:text-accent-blue hover:bg-black/5 cursor-pointer rounded-md transition-all duration-200;
  @apply active:bg-black/10;
  flex-shrink: 0;
}
</style>
