<template>
  <div
    class="text-filter-statusbar flex items-center gap-2 flex-shrink-0 border-b"
    data-testid="text-filter-statusbar"
  >
    <!-- 左：查询摘要 + 视图说明（+ 分片范围标注） -->
    <span class="truncate" data-testid="text-status-summary">
      {{ $t('preview.text.statusQuerySummary', { query: vm.expression.value, n: vm.matchCount.value ?? 0 }) }}
      <template v-if="!isFullView">
        <span v-if="contextDesc"> · {{ contextDesc }}</span>
      </template>
      <template v-else>
        <span> · {{ $t('preview.text.fullHighlightNote') }}</span>
      </template>
      <span v-if="partialLoaded">{{ $t('preview.text.loadedRangeNote') }}</span>
    </span>

    <div class="flex-1"></div>

    <!-- 右：A⇄B 切换 + Esc 提示 + 反馈消息 -->
    <span v-if="vm.actionMessage.value" class="truncate max-w-[280px]" :title="vm.actionMessage.value" data-testid="text-status-action">
      {{ vm.actionMessage.value }}
    </span>
    <button
      class="statusbar-toggle-btn"
      data-testid="text-status-toggle"
      @click="isFullView ? vm.showFilteredView() : vm.showFullView()"
    >{{ isFullView ? $t('preview.text.showMatchLinesBtn') : $t('preview.text.showFullTextBtn') }}</button>
    <span class="whitespace-nowrap opacity-70">{{ $t('preview.text.escRestoreTip') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'

const props = defineProps<{
  vm: LogAnalysisViewModel
  /** 大文件分片加载未全量时，标注搜索范围 */
  partialLoaded: boolean
}>()

const { t } = useI18n()

const isFullView = computed(() => props.vm.searchViewMode.value === 'full')

const contextDesc = computed(() => {
  const vm = props.vm
  if (!vm.contextEnabled.value || vm.contextN.value <= 0) return t('preview.text.statusContextOff')
  return t('preview.text.statusContextDesc', vm.contextN.value)
})
</script>
