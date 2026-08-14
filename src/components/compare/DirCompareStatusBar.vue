<template>
  <div class="h-7 bg-bg-statusbar flex items-center px-4 gap-5 text-xs border-t border-border flex-shrink-0">
    <span class="text-text-tertiary"><span class="text-red-400 font-medium">差异</span><span class="text-text-primary font-semibold ml-1">{{ stats.different }}</span></span>
    <span class="text-text-tertiary">
      <span class="text-orange-400 font-medium">仅左侧</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.leftOnly }}</span>
    </span>
    <span class="text-text-tertiary">
      <span class="text-orange-400 font-medium">仅右侧</span>
      <span class="text-text-primary font-semibold ml-1">{{ stats.rightOnly }}</span>
    </span>
    <span class="text-text-tertiary"><span class="font-medium">元数据相同</span><span class="text-text-primary font-semibold ml-1">{{ stats.metadataEqual }}</span></span>
    <span class="text-text-tertiary"><span class="text-green-400 font-medium">内容相同</span><span class="text-text-primary font-semibold ml-1">{{ stats.contentEqual }}</span></span>
    <span v-if="stats.failed" class="text-text-tertiary"><span class="text-orange-400 font-medium">失败</span><span class="text-text-primary font-semibold ml-1">{{ stats.failed }}</span></span>
    <span v-if="selectedCount" class="text-text-tertiary"><span class="font-medium">已选</span><span class="text-text-primary font-semibold ml-1">{{ selectedCount }}</span></span>
    <span v-if="verificationProgress.total" class="text-text-tertiary"><span class="text-blue-400 font-medium">校验</span><span class="text-text-primary font-semibold ml-1">{{ verificationProgress.completed }}/{{ verificationProgress.total }}</span></span>
    <span class="ml-auto text-text-tertiary">
      已显示 <span class="text-text-primary font-semibold">{{ stats.visible }}</span> / {{ stats.total }}，隐藏 {{ stats.hidden }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { CompareStats } from './compareDomain'

defineProps<{
  stats: CompareStats
  selectedCount: number
  verificationProgress: { completed: number; total: number }
}>()
</script>
