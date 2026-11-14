<template>
  <!-- 通用小确认对话框（仓库首个 confirm 组件）：危险操作二次确认。
       模式与 dialogs/ 目录一致——fixed 遮罩 + @click.self 关闭 + v-if 挂载。 -->
  <div
    class="finder-sheet-mask z-modal"
    data-testid="confirm-dialog"
    @click.self="!danger && emit('close')"
  >
    <div ref="sheetRef" class="confirm-card finder-sheet w-[360px] p-4" role="alertdialog" aria-modal="true" :aria-label="title">
      <div class="flex items-start gap-3">
        <span class="sheet-chip" :style="{ '--sheet-tone': danger ? 'var(--accent-red)' : 'var(--accent-blue)' }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-if="danger" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            <template v-else><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></template>
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="sheet-title">{{ title }}</div>
          <div class="mt-1.5 text-xs leading-relaxed text-text-secondary">{{ message }}</div>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button
          class="finder-btn-secondary"
          data-testid="confirm-cancel"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="finder-btn-primary"
          :class="{ 'is-danger': danger }"
          data-testid="confirm-ok"
          @click="emit('confirm')"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useSheetFocus } from '@/composables/useSheetFocus'

defineProps<{
  title: string
  message: string
  confirmText: string
  /** 危险确认：红色警示图标 + 红色确认按钮。 */
  danger?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const sheetRef = ref<HTMLElement | null>(null)
useSheetFocus(sheetRef)

useKeyInterceptor((event): boolean => {
  if (event.key === 'Escape') {
    emit('close')
    return true
  }
  return false
})
</script>
