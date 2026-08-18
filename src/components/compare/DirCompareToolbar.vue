<template>
  <div class="h-10 bg-bg-toolbar flex items-center px-2 gap-1 border-b border-border flex-shrink-0">
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button class="toolbar-btn-enhanced" :title="$t('compare.toolbar.goParent')" :aria-label="$t('compare.toolbar.goParent')" @click="$emit('go-parent')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <button class="toolbar-btn-enhanced" :title="$t('compare.toolbar.swapSides')" :aria-label="$t('compare.toolbar.swapSides')" @click="$emit('swap-sides')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h11l-3-3m3 13H7l3 3M18 7l-3 3M7 17l3-3" /></svg>
      </button>
    </div>
    <div class="w-px h-5 bg-border mx-1" />
    <!-- Copy operations -->
    <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
      <button
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.copyLeft')"
        :aria-label="$t('compare.toolbar.copyLeft')"
        @click="$emit('copy-left')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7M4 12h16" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.copyRight')"
        :aria-label="$t('compare.toolbar.copyRight')"
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
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.expandAll')"
        :aria-label="$t('compare.toolbar.expandAll')"
        @click="$emit('expand-all')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M9 12l3 3 3-3" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.collapseAll')"
        :aria-label="$t('compare.toolbar.collapseAll')"
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
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.prevDiffTip')"
        :aria-label="$t('compare.toolbar.prevDiff')"
        @click="$emit('prev-diff')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        class="toolbar-btn-enhanced"
        :title="$t('compare.toolbar.nextDiffTip')"
        :aria-label="$t('compare.toolbar.nextDiff')"
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
        :class="{ 'is-active': isAllFilter }"
        :title="$t('compare.toolbar.filterAllTip')"
        @click="setFilter('all')"
      >{{ $t('compare.toolbar.filterAll') }}</button>
      <button
        class="filter-btn"
        :class="{ 'is-active': isDiffFilter }"
        :title="$t('compare.toolbar.filterDiffTip')"
        @click="setFilter('diff')"
      >{{ $t('compare.toolbar.filterDiff') }}</button>
      <button
        class="filter-btn"
        :class="{ 'is-active': isOnlyFilter }"
        :title="$t('compare.toolbar.filterOrphanTip')"
        @click="setFilter('only')"
      >{{ $t('compare.toolbar.filterOrphan') }}</button>
      <button
        class="filter-btn"
        :class="{ 'is-active': isEqualFilter }"
        :title="$t('compare.toolbar.filterEqualTip')"
        @click="setFilter('equal')"
      >{{ $t('compare.toolbar.filterEqual') }}</button>
    </div>

    <div class="w-px h-5 bg-border mx-1" />

    <!-- Compare Rule -->
    <div class="flex items-center bg-bg-secondary/50 rounded-lg border border-border/50 px-2 py-1 gap-1.5">
      <span class="text-xs text-text-tertiary">{{ $t('compare.toolbar.rule') }}</span>
      <select
        :value="rule"
        class="text-xs bg-transparent text-text-primary border-none outline-none"
        @change="$emit('update:rule', ($event.target as HTMLSelectElement).value as CompareRule)"
      >
        <option value="name">{{ $t('compare.toolbar.ruleName') }}</option>
        <option value="size">{{ $t('compare.toolbar.ruleSize') }}</option>
        <option value="timestamp">{{ $t('compare.toolbar.ruleTime') }}</option>
      </select>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <button
      v-if="!isVerifying"
      class="toolbar-btn-enhanced"
      :title="$t('compare.toolbar.verifySelection')"
      :aria-label="$t('compare.toolbar.verifySelection')"
      @click="$emit('verify')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </button>
    <button v-else class="toolbar-btn-enhanced" :title="$t('compare.toolbar.cancelVerify')" :aria-label="$t('compare.toolbar.cancelVerify')" @click="$emit('cancel-verify')">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M6 6l12 12M18 6L6 18" /></svg>
    </button>

    <!-- Loading indicator -->
    <div v-if="isLoading" class="flex items-center gap-1.5 text-text-tertiary text-xs">
      <div class="w-3.5 h-3.5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      <span>{{ $t('compare.toolbar.comparing') }}</span>
    </div>

    <!-- Refresh -->
    <button
      class="toolbar-btn-enhanced"
      :title="$t('compare.toolbar.refreshTip')"
      :aria-label="$t('compare.toolbar.refresh')"
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
  isVerifying: boolean
}>()

const emit = defineEmits<{
  'copy-left': []
  'copy-right': []
  'expand-all': []
  'collapse-all': []
  'prev-diff': []
  'next-diff': []
  'refresh': []
  'go-parent': []
  'swap-sides': []
  'verify': []
  'cancel-verify': []
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
    diff:  { showEqual: false, showDifferent: true,  showLeftOnly: true,  showRightOnly: true  },
    only:  { showEqual: false, showDifferent: false, showLeftOnly: true,  showRightOnly: true  },
    equal: { showEqual: true,  showDifferent: false, showLeftOnly: false, showRightOnly: false }
  }
  emit('update:filter', map[preset])
}
</script>

<style scoped>
/* 过滤组：分段控件语义（与视图切换/设置分段同语言）——
   默认次级灰、hover 浅底、激活=系统蓝实底白字（唯一长蓝态）。 */
.filter-btn {
  @apply px-2.5 py-1 text-xs rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors;
}

.filter-btn.is-active {
  background: var(--finder-selection);
  @apply text-white;
  font-weight: 500;
}
</style>
