<template>
  <!-- 浮动编辑工具条（图片预览右上角，hover 显现）：
       裁剪 / 压缩（单图）；批量压缩 / 批量改名（集合会话）。 -->
  <div
    class="absolute right-3 top-3 z-10 flex items-center gap-1 px-1.5 py-1 rounded-xl bg-bg-secondary/90 border border-border shadow-lg opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity"
    role="toolbar"
    aria-label="图片编辑"
  >
    <button
      class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="裁剪"
      :disabled="!editable || mode === 'crop'"
      @click="emit('crop')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14" />
      </svg>
    </button>
    <button
      class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="压缩"
      :disabled="!editable"
      @click="emit('compress')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 10h6M9 14h6" />
      </svg>
    </button>
    <template v-if="collection">
      <span class="w-px h-4 bg-border"></span>
      <button
        class="px-2 py-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="批量压缩当前集合"
        :disabled="!editable || running"
        @click="emit('batch-compress')"
      >批量压缩</button>
      <button
        class="px-2 py-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="批量改名当前集合"
        @click="emit('batch-rename')"
      >批量改名</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ImageEditMode } from '@/composables/useImageEdit'

defineProps<{
  editable: boolean
  collection: boolean
  mode: ImageEditMode
  running: boolean
}>()

const emit = defineEmits<{
  crop: []
  compress: []
  'batch-compress': []
  'batch-rename': []
}>()
</script>
