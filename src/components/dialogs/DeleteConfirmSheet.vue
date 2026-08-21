<template>
  <!-- 删除确认 alertdialog（2026-08-21 Finder 化）：可恢复（移到废纸篓）/永久
       （立即删除，红色危险钮）两态。标题带数量或名称、正文列名（≤3 个 + 折叠
       其余）+ 恢复性说明；遮罩不可点击关闭（危险操作惯例，同 ConfirmDialog
       danger 分支），Esc 经捕获层拦截消费。 -->
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 animate-fade-in"
    data-testid="delete-sheet-mask"
  >
    <div
      class="finder-sheet w-[400px] p-5"
      role="alertdialog"
      :aria-label="title"
      data-testid="delete-sheet"
    >
      <h3 class="sheet-title">{{ title }}</h3>
      <div v-if="visibleNames.length > 0" class="mt-2 text-[13px] leading-relaxed text-text-secondary">
        <span
          v-for="(item, index) in visibleNames"
          :key="index"
          class="break-all"
          :title="item"
        >{{ middleEllipsis(item, 32) }}<span v-if="index < visibleNames.length - 1 || hiddenCount > 0" class="text-text-tertiary">、</span></span>
        <span v-if="hiddenCount > 0" class="text-text-tertiary">{{ t('fileList.deleteSheet.moreItems', { count: hiddenCount }) }}</span>
      </div>
      <p class="mt-2 text-[13px] leading-relaxed text-text-secondary">
        {{ recoverable ? t('fileList.deleteSheet.recoverNote') : t('fileList.deleteSheet.permanentNote') }}
      </p>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="finder-btn-secondary"
          data-testid="delete-cancel"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="finder-btn-primary"
          :class="{ 'is-danger': !recoverable }"
          data-testid="delete-confirm"
          @click="emit('confirm')"
        >
          {{ recoverable ? t('fileList.deleteSheet.confirmTrash') : t('fileList.deleteSheet.confirmDelete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { middleEllipsis } from '@/utils/taskDisplay'

const props = withDefaults(
  defineProps<{
    /** 待删项目展示名（FilePane 传 basename；DirCompare 传「左侧：a.txt」组合）。 */
    names?: string[]
    /** true=移到废纸篓（可恢复）；false=立即删除（危险红钮）。 */
    recoverable?: boolean
  }>(),
  {
    names: () => [],
    recoverable: true
  }
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()

/** 正文最多列 3 个名字，其余折叠成「以及另外 N 个项目」。 */
const MAX_VISIBLE_NAMES = 3
const visibleNames = computed(() => props.names.slice(0, MAX_VISIBLE_NAMES))
const hiddenCount = computed(() => Math.max(0, props.names.length - MAX_VISIBLE_NAMES))

const title = computed(() => {
  const count = props.names.length
  // 单选时标题内嵌名称：超长名截断防撑破标题（正文列表带 title 悬停可见全名）。
  const name = middleEllipsis(props.names[0] ?? '', 40)
  if (props.recoverable) {
    return count === 1
      ? t('fileList.deleteSheet.titleOne', { name })
      : t('fileList.deleteSheet.titleMany', { count })
  }
  return count === 1
    ? t('fileList.deleteSheet.titleOnePermanent', { name })
    : t('fileList.deleteSheet.titleManyPermanent', { count })
})

useKeyInterceptor((event): boolean => {
  if (event.key === 'Escape') {
    emit('close')
    return true
  }
  return false
})
</script>
