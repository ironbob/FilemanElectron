<template>
  <!-- 底部编辑工具条 + 右下角开合按钮。
       开合状态归 VM（toolbarExpanded，纯手动）；本组件只渲染与转发意图。
       布局：右下角圆形按钮常驻（editable 时）；展开时底部居中胶囊工具条。 -->
  <div v-if="editable" class="pointer-events-none absolute inset-0 z-30">
    <!-- 右下角开合按钮（严格手动） -->
    <button
      class="pointer-events-auto absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center
             bg-accent-blue text-white shadow-lg hover:bg-accent-blue/90 transition-colors"
      :title="expanded ? '收起编辑工具' : '展开编辑工具'"
      :aria-label="expanded ? 'Collapse edit toolbar' : 'Expand edit toolbar'"
      @click="emit('toggle')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path v-if="!expanded" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" />
        <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- 右侧竖排标注工具面板（标注模式期间常驻，不随底部工具条折叠） -->
    <div
      v-if="mode === 'annotate'"
      class="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1
             px-1.5 py-2 rounded-2xl bg-bg-secondary/95 border border-border shadow-xl"
      role="toolbar"
      aria-label="标注工具"
    >
      <button
        v-for="t in ANNO_TOOLS"
        :key="t.key"
        class="p-1.5 rounded-lg transition-colors"
        :class="annoTool === t.key ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
        :title="t.label"
        @click="setAnnoTool(t.key)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="t.path" /></svg>
      </button>

      <span class="h-px w-6 bg-border my-1"></span>
      <button
        v-for="c in ANNO_COLORS"
        :key="c"
        class="w-5 h-5 rounded-full border transition-transform"
        :class="annoColor === c ? 'ring-2 ring-accent-blue scale-110' : 'border-border hover:scale-110'"
        :style="{ backgroundColor: c }"
        :title="`颜色 ${c}`"
        @click="setAnnoColor(c)"
      ></button>

      <span class="h-px w-6 bg-border my-1"></span>
      <button
        v-for="w in ANNO_WIDTHS"
        :key="w"
        class="w-8 h-7 rounded-lg flex items-center justify-center transition-colors"
        :class="annoWidth === w ? 'bg-accent-blue' : 'hover:bg-bg-hover'"
        :title="`粗细 ${w}px`"
        @click="setAnnoWidth(w)"
      >
        <span class="rounded-full bg-current" :style="{ width: '14px', height: w + 'px' }"></span>
      </button>

      <span class="h-px w-6 bg-border my-1"></span>
      <button class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30" title="撤销上一个标注" :disabled="shapeCount === 0" @click="edit.undoAnno()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 7" /></svg>
      </button>
      <button class="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-bg-hover transition-colors disabled:opacity-30" title="清空全部标注" :disabled="shapeCount === 0" @click="edit.clearAnno()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
      <button
        class="px-2 py-1.5 rounded-lg text-xs bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-40"
        :disabled="shapeCount === 0"
        @click="emit('anno-apply')"
      >保存标注</button>
    </div>

    <!-- 底部工具条（expanded 时渲染；标注参数在右侧竖排面板） -->
    <div
      v-if="expanded"
      class="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[92%] flex items-center gap-1 flex-wrap justify-center
             px-2 py-1.5 rounded-2xl bg-bg-secondary/95 border border-border shadow-xl"
      role="toolbar"
      aria-label="图片编辑"
    >
      <!-- 模式组 -->
      <button
        class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        :class="mode === 'crop' ? 'bg-bg-hover text-accent-blue' : ''"
        title="裁剪"
        :disabled="mode === 'crop'"
        @click="emit('crop')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14" /></svg>
      </button>
      <button
        class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        :class="mode === 'annotate' ? 'bg-bg-hover text-accent-blue' : ''"
        title="标注"
        @click="emit('annotate')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
      </button>

      <!-- 单图压缩 -->
      <span class="w-px h-5 bg-border mx-0.5"></span>
      <button
        class="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="压缩"
        @click="emit('compress')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 10h6M9 14h6" /></svg>
      </button>

      <!-- 批量组（集合会话） -->
      <template v-if="collection">
        <span class="w-px h-5 bg-border mx-0.5"></span>
        <button
          class="px-2 py-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="批量压缩当前集合"
          :disabled="running"
          @click="emit('batch-compress')"
        >批量压缩</button>
        <button
          class="px-2 py-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
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

// 标注参数（工具/颜色/粗细）是 VM 状态——工具条仅转发赋值
function setAnnoTool(t: AnnoTool) {
  props.edit.annoTool.value = t
}
function setAnnoColor(c: string) {
  props.edit.annoColor.value = c
}
function setAnnoWidth(w: number) {
  props.edit.annoWidth.value = w
}
</script>
