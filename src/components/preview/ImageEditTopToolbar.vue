<template>
  <!-- 顶部工具栏（三区结构第一区，40px，恒显——标注/裁剪中不再隐藏）：
       集合导航｜缩放（含 100%▾ 菜单）｜旋转/裁剪｜标注可见性 ‥‥ 集合菜单 + 完成。
       纯预览（无 edit）只渲染视图组；右端主动作随模式切换（标注→完成）。 -->
  <div class="img-top-toolbar h-10 flex-shrink-0 flex items-center gap-0.5 px-2" role="toolbar" :aria-label="$t('preview.editToolbar.toolbarAria')">
    <!-- 集合导航组（多图会话） -->
    <template v-if="collection">
      <button class="edit-icon-btn" :title="$t('preview.common.prevImageTip')" :aria-label="$t('preview.common.prevImageAria')" :disabled="collection.index <= 0" @click="emit('prev-image')">
        <IconfontIcon name="previous" />
      </button>
      <button class="edit-icon-btn" :title="$t('preview.common.nextImageTip')" :aria-label="$t('preview.common.nextImageAria')" :disabled="collection.index >= collection.total - 1" @click="emit('next-image')">
        <IconfontIcon name="next" />
      </button>
      <span class="px-1.5 text-xs text-text-secondary tabular-nums select-none">{{ collection.index + 1 }} / {{ collection.total }}</span>
      <span class="edit-sep-v"></span>
    </template>

    <!-- 缩放组 -->
    <button class="edit-icon-btn" :title="$t('preview.common.zoomOutTip')" :disabled="zoomDisabled" @click="emit('zoom-out')">
      <IconfontIcon name="zoomOut" />
    </button>
    <button class="edit-icon-btn" :title="$t('preview.common.zoomInTip')" :disabled="zoomDisabled" @click="emit('zoom-in')">
      <IconfontIcon name="zoomIn" />
    </button>
    <button class="edit-icon-btn" :title="$t('preview.editToolbar.fitWindow')" :disabled="zoomDisabled" @click="emit('fit-window')">
      <IconfontIcon name="fit" />
    </button>
    <div class="relative">
      <button
        class="h-8 px-2 rounded-md text-xs font-medium text-text-secondary tabular-nums hover:bg-bg-hover active:bg-bg-active transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        :title="$t('preview.editToolbar.zoomMenuAria')"
        :aria-label="$t('preview.editToolbar.zoomMenuAria')"
        :aria-expanded="zoomMenuOpen"
        :disabled="zoomDisabled"
        @click="toggleZoomMenu"
      >
        <span class="min-w-[38px] text-right">{{ displayScale }}</span>
        <svg class="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>
      </button>
      <div v-if="zoomMenuOpen" class="edit-panel absolute left-0 top-9 z-40 min-w-[180px] py-1">
        <button v-for="pct in ZOOM_STEPS" :key="pct" class="menu-item" :class="{ 'is-checked': displayScale === pct + '%' }" @click="pickZoom(() => emit('zoom-to', pct))">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
          <span class="tabular-nums">{{ $t('preview.editToolbar.zoomTo', { percent: pct }) }}</span>
        </button>
        <div class="edit-sep-h"></div>
        <button class="menu-item" @click="pickZoom(() => emit('fit-window'))">{{ $t('preview.editToolbar.fitWindow') }}</button>
        <button class="menu-item" @click="pickZoom(() => emit('actual-size'))">{{ $t('preview.editToolbar.actualSize') }}</button>
      </div>
    </div>

    <span class="edit-sep-v"></span>

    <!-- 旋转 + 裁剪 -->
    <button class="edit-icon-btn" :title="rotateTip" :disabled="mode === 'crop'" @click="emit('rotate-left')">
      <IconfontIcon name="rotateLeft" />
    </button>
    <button class="edit-icon-btn" :title="rotateTip" :disabled="mode === 'crop'" @click="emit('rotate-right')">
      <IconfontIcon name="rotateRight" />
    </button>
    <button
      v-if="editable"
      class="edit-icon-btn"
      :class="{ 'is-active': mode === 'crop' }"
      :title="$t('preview.editToolbar.cropTip')"
      :disabled="mode === 'annotate'"
      @click="emit('crop')"
    >
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14" /></svg>
    </button>

    <!-- 标注可见性（标注模式） -->
    <template v-if="mode === 'annotate'">
      <span class="edit-sep-v"></span>
      <button
        class="edit-icon-btn"
        :class="{ 'is-active': annotationsVisible }"
        :title="annotationsVisible ? $t('preview.editToolbar.showAnnoTip') : $t('preview.editToolbar.hideAnnoTip')"
        :aria-label="annotationsVisible ? $t('preview.editToolbar.showAnnoTip') : $t('preview.editToolbar.hideAnnoTip')"
        :aria-pressed="annotationsVisible"
        @click="emit('toggle-annotations')"
      >
        <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          <path v-if="!annotationsVisible" stroke-linecap="round" stroke-width="1.8" d="M4 4l16 16" />
        </svg>
      </button>
    </template>

    <div class="flex-1"></div>

    <!-- 集合菜单（压缩/批量） -->
    <div v-if="editable" class="relative">
      <button
        class="edit-icon-btn"
        :title="$t('preview.editToolbar.moreAria')"
        :aria-label="$t('preview.editToolbar.moreAria')"
        :aria-expanded="moreMenuOpen"
        @click="toggleMoreMenu"
      >
        <IconfontIcon name="more" />
      </button>
      <div v-if="moreMenuOpen" class="edit-panel absolute right-0 top-9 z-40 min-w-[160px] py-1">
        <button class="menu-item" :disabled="running" @click="pickMenu(() => emit('compress'))">{{ $t('preview.editToolbar.compressTip') }}</button>
        <template v-if="collection && collection.total > 1">
          <div class="edit-sep-h"></div>
          <button class="menu-item" :disabled="running" @click="pickMenu(() => emit('batch-compress'))">{{ $t('preview.editToolbar.batchCompress') }}</button>
          <button class="menu-item" @click="pickMenu(() => emit('batch-rename'))">{{ $t('preview.editToolbar.batchRename') }}</button>
        </template>
      </div>
    </div>

    <!-- 右端主动作：标注入口（idle）→ 完成（annotate） -->
    <button
      v-if="editable && mode === 'idle'"
      class="edit-icon-btn"
      :title="$t('preview.editToolbar.annotateTip')"
      :aria-label="$t('preview.editToolbar.annotateTip')"
      @click="emit('annotate')"
    >
      <svg class="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
    </button>
    <button
      v-if="editable && mode === 'annotate'"
      class="edit-primary-btn ml-1"
      :title="$t('preview.editToolbar.doneTip')"
      @click="emit('done')"
    >{{ $t('preview.editToolbar.done') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { t } from '@/i18n'
import type { ImageEditMode } from '@/composables/useImageEdit'
import IconfontIcon from './IconfontIcon.vue'

const props = defineProps<{
  mode: ImageEditMode
  editable: boolean
  /** 多图集合会话导航信息；单文件为 null */
  collection: { index: number; total: number } | null
  /** 缩放读数（如 "100%"） */
  displayScale: string
  annotationsVisible: boolean
  running?: boolean
}>()

const emit = defineEmits<{
  'zoom-in': []
  'zoom-out': []
  'fit-window': []
  'actual-size': []
  'zoom-to': [pct: number]
  'rotate-left': []
  'rotate-right': []
  crop: []
  annotate: []
  'toggle-annotations': []
  done: []
  'prev-image': []
  'next-image': []
  compress: []
  'batch-compress': []
  'batch-rename': []
}>()

const ZOOM_STEPS = [25, 50, 100, 200, 400]

const zoomMenuOpen = ref(false)
const moreMenuOpen = ref(false)

/** 裁剪模式几何与旋转互斥（进入裁剪已复位视图）；缩放保持可用。 */
const zoomDisabled = computed(() => props.mode === 'crop')
const rotateTip = computed(() => (props.mode === 'crop' ? t('preview.editToolbar.rotateDisabledInCrop') : t('preview.image.rotateLeftTip')))

function pickZoom(action: () => void) {
  zoomMenuOpen.value = false
  action()
}
function pickMenu(action: () => void) {
  moreMenuOpen.value = false
  action()
}
function toggleZoomMenu() {
  zoomMenuOpen.value = !zoomMenuOpen.value
  if (zoomMenuOpen.value) moreMenuOpen.value = false
}
function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value
  if (moreMenuOpen.value) zoomMenuOpen.value = false
}

// 点击菜单外关闭（菜单开时挂全局监听）
function closeMenus(e: Event) {
  const el = e.target as HTMLElement
  if (el.closest('.img-top-toolbar')) return // 工具栏内交互由各自 click 处理
  zoomMenuOpen.value = false
  moreMenuOpen.value = false
  window.removeEventListener('pointerdown', closeMenus)
}

watch([zoomMenuOpen, moreMenuOpen], ([a, b]) => {
  if (a || b) window.addEventListener('pointerdown', closeMenus)
  else window.removeEventListener('pointerdown', closeMenus)
})
onUnmounted(() => window.removeEventListener('pointerdown', closeMenus))
</script>

<style scoped>
.img-top-toolbar {
  position: relative;
  z-index: 50; /* backdrop-filter 建立合成层但 z 默认 auto——下拉菜单会被后画的画布区盖住 */
  background: var(--finder-chrome);
  border-bottom: 1px solid var(--finder-divider);
  backdrop-filter: saturate(150%) blur(14px);
  -webkit-backdrop-filter: saturate(150%) blur(14px);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 8px);
  margin: 0 4px;
  padding: 0 10px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  color: var(--finder-label);
  background: transparent;
  text-align: left;
  cursor: default;
}
.menu-item:hover:not(:disabled) {
  background: var(--finder-control);
}
.menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.menu-item.is-checked svg {
  opacity: 1;
}
.menu-item svg {
  opacity: 0;
}
</style>
