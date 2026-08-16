<template>
  <!-- 右侧标注工具轨道（三区结构中的编辑区，52px 独占布局列——绝不遮挡画布）：
       选择｜箭头/矩形/圆形/画笔/文字｜撤销/重做/删除。
       颜色、线宽等参数在 ToolParamPopover（上下文），不在轨道内堆叠。 -->
  <div class="anno-rail edit-panel flex flex-col items-center gap-1 py-2.5" role="toolbar" :aria-label="$t('preview.editToolbar.railAria')" :aria-orientation="'vertical'">
    <button
      class="edit-icon-btn"
      :class="{ 'is-active': tool === 'select' }"
      :title="$t('preview.editToolbar.toolSelect')"
      :aria-label="$t('preview.editToolbar.toolSelect')"
      :aria-pressed="tool === 'select'"
      @click="emit('pick', 'select')"
    >
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 4l7 16 2.6-6.9 6.9-2.6z" /></svg>
    </button>

    <span class="edit-sep-h"></span>

    <button
      v-for="toolItem in drawTools"
      :key="toolItem.key"
      class="edit-icon-btn"
      :class="{ 'is-active': tool === toolItem.key }"
      :title="$t(`preview.editToolbar.${toolItem.labelKey}`)"
      :aria-label="$t(`preview.editToolbar.${toolItem.labelKey}`)"
      :aria-pressed="tool === toolItem.key"
      @click="emit('pick', toolItem.key)"
    >
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="toolItem.path" /></svg>
    </button>

    <span class="edit-sep-h"></span>

    <button class="edit-icon-btn" :title="canUndo ? $t('preview.editToolbar.undoTip') : $t('preview.editToolbar.nothingToUndo')" :aria-label="$t('preview.editToolbar.undoTip')" :disabled="!canUndo" @click="emit('undo')">
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 7" /></svg>
    </button>
    <button class="edit-icon-btn" :title="canRedo ? $t('preview.editToolbar.redoTip') : $t('preview.editToolbar.nothingToRedo')" :aria-label="$t('preview.editToolbar.redoTip')" :disabled="!canRedo" @click="emit('redo')">
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 7v6h-6M20.49 13a9 9 0 11-2.13-9.36L21 7" /></svg>
    </button>
    <button
      class="edit-icon-btn hover:!text-[color:var(--accent-red)]"
      :title="hasSelection ? $t('preview.editToolbar.deleteTip') : $t('preview.editToolbar.deleteDisabledTip')"
      :aria-label="$t('preview.editToolbar.deleteTip')"
      :disabled="!hasSelection"
      @click="emit('delete')"
    >
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { AnnoTool } from '@/utils/annotationShapes'

defineProps<{
  tool: 'select' | AnnoTool
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
}>()

const emit = defineEmits<{
  pick: [tool: 'select' | AnnoTool]
  undo: []
  redo: []
  delete: []
}>()

/** 绘制工具（图标沿用仓库现行 heroicons 风格线性 path）。 */
const drawTools: Array<{ key: AnnoTool; labelKey: string; path: string }> = [
  { key: 'arrow', labelKey: 'toolArrow', path: 'M5 19L19 5M19 5v6M19 5h-6' },
  { key: 'rect', labelKey: 'toolRect', path: 'M4 5h16v14H4z' },
  { key: 'ellipse', labelKey: 'toolEllipse', path: 'M12 4a8 8 0 100 16 8 8 0 000-16z' },
  { key: 'freehand', labelKey: 'toolFreehand', path: 'M3 21c4-1 3-5 6-8s6-6 9-9M15 4l5 5' },
  { key: 'text', labelKey: 'toolText', path: 'M5 6V4h14v2M12 4v16M9 20h6' }
]
</script>

<style scoped>
.anno-rail {
  width: 52px;
}
</style>
