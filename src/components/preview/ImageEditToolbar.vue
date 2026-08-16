<template>
  <!-- 底部编辑工具条 + 右下角开合按钮。
       开合状态归 VM（toolbarExpanded，纯手动）；本组件只渲染与转发意图。
       按钮沿用 Finder 工具栏风格（finder-icon-button），并在本工具条局部放大。 -->
  <div v-if="editable" class="pointer-events-none absolute inset-0 z-30">
    <!-- 右下角开合按钮（严格手动；放大到 44px FAB） -->
    <button
      class="pointer-events-auto absolute bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center
             bg-accent-blue text-white shadow-lg hover:bg-accent-blue/90 active:bg-accent-blue-active transition-colors"
      :title="expanded ? '收起编辑工具' : '展开编辑工具'"
      :aria-label="expanded ? 'Collapse edit toolbar' : 'Expand edit toolbar'"
      @click="emit('toggle')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path v-if="!expanded" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" />
        <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- 右侧竖排标注工具面板：工具条展开即直接可见（平铺可用功能），
         点击任一工具自动进入标注模式，无需先点「标注」二次展开 -->
    <div
      v-if="expanded"
      class="edit-panel pointer-events-auto absolute right-4 top-4 bottom-24 flex flex-col items-center justify-center
             gap-1 overflow-y-auto py-2 px-1.5 rounded-2xl bg-bg-secondary/95 border border-border shadow-xl"
      role="toolbar"
      aria-label="标注工具"
    >
      <button
        v-for="t in ANNO_TOOLS"
        :key="t.key"
        class="finder-icon-button"
        :class="annoTool === t.key ? 'is-active' : ''"
        :title="t.label"
        @click="pickAnnoTool(t.key)"
      >
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="t.path" /></svg>
      </button>

      <span class="h-px w-7 bg-border my-1"></span>
      <button
        v-for="c in ANNO_COLORS"
        :key="c"
        class="w-6 h-6 rounded-full border-2 transition-transform"
        :class="annoColor === c ? 'ring-2 ring-accent-blue ring-offset-1 ring-offset-bg-secondary scale-110' : 'border-transparent hover:scale-110'"
        :style="{ backgroundColor: c }"
        :title="`颜色 ${c}`"
        @click="setAnnoColor(c)"
      ></button>

      <span class="h-px w-7 bg-border my-1"></span>
      <button
        v-for="w in ANNO_WIDTHS"
        :key="w"
        class="finder-icon-button"
        :class="annoWidth === w ? 'is-active' : ''"
        :title="`粗细 ${w}px`"
        @click="setAnnoWidth(w)"
      >
        <span class="rounded-full bg-current" :style="{ width: '16px', height: w + 'px' }"></span>
      </button>

      <span class="h-px w-7 bg-border my-1"></span>
      <button class="finder-icon-button" title="撤销上一个标注" :disabled="shapeCount === 0" @click="edit.undoAnno()">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 7" /></svg>
      </button>
      <button class="finder-icon-button hover:!text-red-400" title="清空全部标注" :disabled="shapeCount === 0" @click="edit.clearAnno()">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
      <button
        class="mt-0.5 px-3 py-2 rounded-lg text-[13px] font-medium bg-accent-blue text-white hover:bg-accent-blue/90 active:bg-accent-blue-active transition-colors disabled:opacity-40"
        :disabled="mode !== 'annotate' || shapeCount === 0"
        :title="mode !== 'annotate' ? '先选择一个标注工具' : '保存标注'"
        @click="emit('anno-apply')"
      >保存标注</button>
    </div>

    <!-- 底部工具条（expanded 时渲染；标注参数在右侧竖排面板） -->
    <div
      v-if="expanded"
      class="edit-panel pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[92%] flex items-center gap-1 flex-wrap justify-center
             px-2 py-1.5 rounded-2xl bg-bg-secondary/95 border border-border shadow-xl"
      role="toolbar"
      aria-label="图片编辑"
    >
      <!-- 模式组 -->
      <button
        class="finder-icon-button"
        :class="mode === 'crop' ? 'is-active' : ''"
        title="裁剪"
        :disabled="mode === 'crop'"
        @click="emit('crop')"
      >
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14" /></svg>
      </button>
      <button
        class="finder-icon-button"
        :class="mode === 'annotate' ? 'is-active' : ''"
        title="标注"
        @click="emit('annotate')"
      >
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
      </button>

      <!-- 单图压缩 -->
      <span class="finder-toolbar-divider"></span>
      <button
        class="finder-icon-button"
        title="压缩"
        @click="emit('compress')"
      >
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 10h6M9 14h6" /></svg>
      </button>

      <!-- 批量组（集合会话） -->
      <template v-if="collection">
        <span class="finder-toolbar-divider"></span>
        <button
          class="px-3 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-bg-hover active:bg-bg-active transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="批量压缩当前集合"
          :disabled="running"
          @click="emit('batch-compress')"
        >批量压缩</button>
        <button
          class="px-3 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-bg-hover active:bg-bg-active transition-colors"
          title="批量改名当前集合"
          @click="emit('batch-rename')"
        >批量改名</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ImageEditMode, ImageEditController } from '@/composables/useImageEdit'
import { ANNO_COLORS, ANNO_WIDTHS, type AnnoTool } from '@/utils/annotationShapes'

const props = defineProps<{
  edit: ImageEditController
  editable: boolean
  collection: boolean
  mode: ImageEditMode
  running: boolean
  expanded: boolean
  annoTool: AnnoTool
  annoColor: string
  annoWidth: number
  shapeCount: number
}>()

const emit = defineEmits<{
  toggle: []
  crop: []
  annotate: []
  'anno-apply': []
  compress: []
  'batch-compress': []
  'batch-rename': []
}>()

const ANNO_TOOLS: Array<{ key: AnnoTool; label: string; path: string }> = [
  { key: 'arrow', label: '箭头', path: 'M5 19L19 5M19 5v6M19 5h-6' },
  { key: 'rect', label: '矩形', path: 'M4 5h16v14H4z' },
  { key: 'ellipse', label: '椭圆', path: 'M12 4a8 8 0 100 16 8 8 0 000-16z' },
  { key: 'freehand', label: '画笔', path: 'M3 21c4-1 3-5 6-8s6-6 9-9M15 4l5 5' },
  { key: 'text', label: '文字', path: 'M5 6V4h14v2M12 4v16M9 20h6' }
]

/** 点任一标注工具：未进入标注模式时由宿主进入（复位视图），再选中工具。 */
function pickAnnoTool(t: AnnoTool) {
  if (props.mode !== 'annotate') emit('annotate')
  props.edit.annoTool.value = t
}

// 标注参数（颜色/粗细）是 VM 状态——工具条仅转发赋值
function setAnnoColor(c: string) {
  props.edit.annoColor.value = c
}
function setAnnoWidth(w: number) {
  props.edit.annoWidth.value = w
}
</script>

<style scoped>
/* 编辑工具条内的 Finder 图标按钮局部放大（finder-icon-button 全局为 28px） */
.edit-panel :deep(.finder-icon-button) {
  width: 34px;
  height: 34px;
}
.edit-panel :deep(.finder-toolbar-divider) {
  height: 24px;
}
</style>
