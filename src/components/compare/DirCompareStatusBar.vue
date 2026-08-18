<template>
  <div class="h-7 bg-bg-statusbar flex items-center px-4 gap-5 text-xs border-t border-border flex-shrink-0">
    <span class="text-text-tertiary"><span class="text-accent-red font-medium">{{ $t('compare.statusBar.different') }}</span><span class="text-text-primary font-medium ml-1">{{ stats.different }}</span></span>
    <span class="text-text-tertiary">
      <span class="text-accent-orange font-medium">{{ $t('compare.statusBar.leftOnly') }}</span>
      <span class="text-text-primary font-medium ml-1">{{ stats.leftOnly }}</span>
    </span>
    <span class="text-text-tertiary">
      <span class="text-accent-orange font-medium">{{ $t('compare.statusBar.rightOnly') }}</span>
      <span class="text-text-primary font-medium ml-1">{{ stats.rightOnly }}</span>
    </span>
    <span class="text-text-tertiary"><span class="font-medium">{{ $t('compare.statusBar.metadataEqual') }}</span><span class="text-text-primary font-medium ml-1">{{ stats.metadataEqual }}</span></span>
    <span class="text-text-tertiary"><span class="text-accent-green font-medium">{{ $t('compare.statusBar.contentEqual') }}</span><span class="text-text-primary font-medium ml-1">{{ stats.contentEqual }}</span></span>
    <span v-if="stats.failed" class="text-text-tertiary"><span class="text-accent-orange font-medium">{{ $t('compare.statusBar.failed') }}</span><span class="text-text-primary font-medium ml-1">{{ stats.failed }}</span></span>
    <span v-if="selectedCount" class="text-text-tertiary"><span class="font-medium">{{ $t('compare.statusBar.selected') }}</span><span class="text-text-primary font-medium ml-1">{{ selectedCount }}</span></span>
    <span v-if="verificationProgress.total" class="text-text-tertiary"><span class="text-accent-blue font-medium">{{ $t('compare.statusBar.verifying') }}</span><span class="text-text-primary font-medium ml-1">{{ verificationProgress.completed }}/{{ verificationProgress.total }}</span></span>
    <span class="ml-auto text-text-tertiary">
      {{ $t('compare.statusBar.shownSummary', { visible: stats.visible, total: stats.total, hidden: stats.hidden }) }}
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
