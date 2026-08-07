<template>
  <div class="h-10 bg-bg-toolbar flex items-center px-2 gap-1 border-b border-border flex-shrink-0">
    <!-- Copy operations -->
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button
        class="toolbar-btn-enhanced btn-teal"
        title="复制到左侧"
        aria-label="复制到左侧"
        @click="$emit('copy-left')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7M4 12h16" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced btn-blue"
        title="复制到右侧"
        aria-label="复制到右侧"
        @click="$emit('copy-right')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M20 12H4" />
        </svg>
      </button>
    </div>

    <div class="w-px h-5 bg-border mx-1" />

    <!-- Expand / Collapse -->
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button
        class="toolbar-btn-enhanced btn-green"
        title="展开全部"
        aria-label="展开全部"
        @click="$emit('expand-all')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M9 12l3 3 3-3" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced btn-green"
        title="折叠全部"
        aria-label="折叠全部"
        @click="$emit('collapse-all')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M9 12h6" />
        </svg>
      </button>
    </div>

    <div class="w-px h-5 bg-border mx-1" />

    <!-- Diff Navigation -->
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button
        class="toolbar-btn-enhanced btn-purple"
        title="上一个差异 (Shift+F7)"
        aria-label="上一个差异"
        @click="$emit('prev-diff')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced btn-purple"
        title="下一个差异 (F7)"
        aria-label="下一个差异"
        @click="$emit('next-diff')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <div class="w-px h-5 bg-border mx-1" />

    <!-- Filter Buttons -->
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button
        class="filter-btn"
        :class="{ 'filter-btn-active-all': isAllFilter }"
        title="显示全部"
        @click="setFilter('all')"
      >全部</button>
      <button
        class="filter-btn"
        :class="{ 'filter-btn-active-diff': isDiffFilter }"
        title="仅显示差异"
        @click="setFilter('diff')"
      >差异</button>
      <button
        class="filter-btn"
        :class="{ 'filter-btn-active-only': isOnlyFilter }"
        title="仅显示孤立文件"
        @click="setFilter('only')"
      >孤立</button>
      <button
        class="filter-btn"
        :class="{ 'filter-btn-active-equal': isEqualFilter }"
        title="仅显示相同"
        @click="setFilter('equal')"
      >相同</button>
    </div>

    <div class="w-px h-5 bg-border mx-1" />

    <!-- Compare Rule -->
    <div class="flex items-center bg-bg-secondary/50 rounded-lg border border-border/50 px-2 py-1 gap-1.5">
      <span class="text-xs text-text-tertiary">规则:</span>
      <select
        :value="rule"
        class="text-xs bg-transparent text-text-primary border-none outline-none cursor-pointer"
        @change="$emit('update:rule', ($event.target as HTMLSelectElement).value as CompareRule)"
      >
        <option value="name">按名称</option>
        <option value="size">按大小</option>
        <option value="timestamp">按时间</option>
      </select>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Loading indicator -->
    <div v-if="isLoading" class="flex items-center gap-1.5 text-text-tertiary text-xs">
      <div class="w-3.5 h-3.5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      <span>对比中…</span>
    </div>

    <!-- Refresh -->
    <button
      class="toolbar-btn-enhanced btn-orange"
      title="刷新对比 (F5)"
      aria-label="刷新对比"
      @click="$emit('refresh')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CompareRule, DirCompareFilter } from '@/types'

const props = defineProps<{
  rule: CompareRule
  filter: DirCompareFilter
  isLoading: boolean
}>()

const emit = defineEmits<{
  'copy-left': []
  'copy-right': []
  'expand-all': []
  'collapse-all': []
  'prev-diff': []
  'next-diff': []
  'refresh': []
  'update:rule': [rule: CompareRule]
  'update:filter': [filter: DirCompareFilter]
}>()

const isAllFilter = computed(() =>
  props.filter.showEqual && props.filter.showDifferent &&
  props.filter.showLeftOnly && props.filter.showRightOnly
)
const isDiffFilter = computed(() =>
  !props.filter.showEqual && props.filter.showDifferent &&
  !props.filter.showLeftOnly && !props.filter.showRightOnly
)
const isOnlyFilter = computed(() =>
  !props.filter.showEqual && !props.filter.showDifferent &&
  props.filter.showLeftOnly && props.filter.showRightOnly
)
const isEqualFilter = computed(() =>
  props.filter.showEqual && !props.filter.showDifferent &&
  !props.filter.showLeftOnly && !props.filter.showRightOnly
)

function setFilter(preset: 'all' | 'diff' | 'only' | 'equal') {
  const map: Record<string, DirCompareFilter> = {
    all:   { showEqual: true,  showDifferent: true,  showLeftOnly: true,  showRightOnly: true  },
    diff:  { showEqual: false, showDifferent: true,  showLeftOnly: false, showRightOnly: false },
    only:  { showEqual: false, showDifferent: false, showLeftOnly: true,  showRightOnly: true  },
    equal: { showEqual: true,  showDifferent: false, showLeftOnly: false, showRightOnly: false }
  }
  emit('update:filter', map[preset])
}
</script>

<style scoped>
.filter-btn {
  @apply px-2.5 py-1 text-xs rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer;
}

/* Per-button accent colors — override toolbar-btn-enhanced defaults */
.btn-teal   { color: var(--accent-teal); }
.btn-blue   { color: var(--accent-blue); }
.btn-green  { color: var(--accent-green); }
.btn-purple { color: var(--accent-purple); }
.btn-orange { color: var(--accent-orange); }

/* Per-filter active colors */
.filter-btn-active-all  { background-color: rgba(10, 132, 255, 0.75); @apply text-white; }
.filter-btn-active-diff { background-color: rgba(239, 68, 68, 0.75);  @apply text-white; }
.filter-btn-active-only { background-color: rgba(249, 115, 22, 0.75); @apply text-white; }
.filter-btn-active-equal{ background-color: rgba(34, 197, 94, 0.75);  @apply text-white; }
</style>
