<template>
  <!-- 通用小确认对话框（仓库首个 confirm 组件）：危险操作二次确认。
       模式与 dialogs/ 目录一致——fixed 遮罩 + @click.self 关闭 + v-if 挂载。 -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in"
    data-testid="confirm-dialog"
    @click.self="emit('close')"
  >
    <div class="confirm-card w-80 p-4 rounded-xl border border-border bg-bg-secondary shadow-2xl" role="alertdialog" :aria-label="title">
      <div class="flex items-start gap-3">
        <svg
          v-if="danger"
          class="w-5 h-5 mt-0.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-red)"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-text-primary">{{ title }}</div>
          <div class="mt-1.5 text-xs leading-relaxed text-text-secondary">{{ message }}</div>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button
          class="px-3 py-1.5 text-xs rounded-md text-text-secondary hover:bg-bg-hover transition-colors"
          data-testid="confirm-cancel"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded-md text-white transition-colors"
          :class="danger ? 'bg-accent-red hover:opacity-90' : 'bg-accent-blue hover:bg-accent-blue-hover'"
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
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'

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

useKeyInterceptor((event): boolean => {
  if (event.key === 'Escape') {
    emit('close')
    return true
  }
  return false
})
</script>
