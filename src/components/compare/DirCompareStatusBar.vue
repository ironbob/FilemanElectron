<template>
  <div class="h-7 bg-bg-statusbar flex items-center px-4 gap-5 text-xs border-t border-border flex-shrink-0">
    <span class="text-text-tertiary">
      <span class="text-red-400 font-medium">差异</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.different }}</span>
    </span>
    <span class="text-text-tertiary">
      <span class="text-orange-400 font-medium">仅左侧</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.leftOnly }}</span>
    </span>
    <span class="text-text-tertiary">
      <span class="text-orange-400 font-medium">仅右侧</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.rightOnly }}</span>
    </span>
    <span class="text-text-tertiary">
      <span class="font-medium">相同</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.equal }}</span>
    </span>
    <span class="ml-auto text-text-tertiary">
      总计 <span class="text-text-primary font-semibold">{{ stats.total }}</span> 个文件
    </span>
  </div>
</template>

<script setup lang="ts">
import type { CompareStats } from './useDirCompare'

defineProps<{
  stats: CompareStats
}>()
</script>
