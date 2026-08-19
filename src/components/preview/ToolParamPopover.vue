<template>
  <!-- 绘制参数 Popover（232px，轨道左侧弹出）：颜色 / 线宽 / 填充 / 透明度。
       有选中对象时调整 → 即时作用于选中（VM setAnnoParam）；否则改工具默认值。
       画布 pointerdown 由宿主收起；Esc 只收面板不换工具。 -->
  <div ref="rootEl" class="tool-param-popover edit-panel p-3 flex flex-col gap-3" role="group" :aria-label="$t('preview.editToolbar.paramAria')">
    <!-- 颜色 -->
    <section>
      <h4 class="popover-label">{{ $t('preview.editToolbar.paramColor') }}</h4>
      <div class="grid grid-cols-4 gap-1 mt-1.5">
        <button
          v-for="c in colors"
          :key="c"
          class="color-dot-cell"
          :class="{ 'is-selected': param.color === c }"
          :title="$t('preview.editToolbar.colorTip', { color: c })"
          :aria-label="$t('preview.editToolbar.colorTip', { color: c })"
          :aria-pressed="param.color === c"
          @click="emit('update', { color: c })"
        >
          <span class="color-dot" :class="{ 'is-bordered': c === '#FFFFFF' || c === '#000000' }" :style="{ backgroundColor: c }"></span>
        </button>
      </div>
      <label class="custom-color-row" :title="$t('preview.editToolbar.paramCustomColor')">
        <span class="custom-dot" aria-hidden="true"></span>
        <span class="text-xs text-text-secondary">{{ $t('preview.editToolbar.paramCustomColor') }}</span>
        <input type="color" class="sr-only-color" :value="param.color" @input="emit('update', { color: ($event.target as HTMLInputElement).value.toUpperCase() })" />
      </label>
    </section>

    <!-- 线宽 -->
    <section>
      <h4 class="popover-label">{{ $t('preview.editToolbar.paramWidth') }}</h4>
      <div class="flex gap-1 mt-1.5">
        <button
          v-for="w in widths"
          :key="w"
          class="width-cell"
          :class="{ 'is-selected': param.width === w }"
          :title="$t('preview.editToolbar.strokeWidthTip', { width: w })"
          :aria-label="$t('preview.editToolbar.strokeWidthTip', { width: w })"
          :aria-pressed="param.width === w"
          @click="emit('update', { width: w })"
        >
          <span class="width-line" :style="{ height: Math.min(w, 12) + 'px', backgroundColor: param.color }"></span>
        </button>
      </div>
    </section>

    <!-- 填充（仅矩形/圆形） -->
    <section v-if="tool === 'rect' || tool === 'ellipse'">
      <h4 class="popover-label">{{ $t('preview.editToolbar.paramFill') }}</h4>
      <div class="segmented mt-1.5">
        <button
          v-for="mode in FILL_MODES"
          :key="mode.key"
          class="segmented-item"
          :class="{ 'is-selected': param.fill === mode.key }"
          :aria-pressed="param.fill === mode.key"
          @click="emit('update', { fill: mode.key })"
        >{{ $t(`preview.editToolbar.${mode.labelKey}`) }}</button>
      </div>
    </section>

    <!-- 透明度 -->
    <section>
      <div class="flex items-center justify-between">
        <h4 class="popover-label">{{ $t('preview.editToolbar.paramOpacity') }}</h4>
        <span class="text-xs text-text-secondary tabular-nums">{{ Math.round(param.opacity * 100) }}%</span>
      </div>
      <input
        class="opacity-slider mt-1.5"
        type="range"
        min="10"
        :max="100"
        step="5"
        :value="Math.round(param.opacity * 100)"
        :aria-label="$t('preview.editToolbar.paramOpacity')"
        @input="emit('update', { opacity: Number(($event.target as HTMLInputElement).value) / 100 })"
      />
    </section>

    <p class="hint-line">{{ hasSelection ? $t('preview.editToolbar.paramHintSelected') : $t('preview.editToolbar.paramHintPending') }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { AnnoStylePatch, AnnoToolParam } from '@/composables/useImageEdit'
import type { AnnoFillMode, AnnoToolKey } from '@/utils/annotationShapes'

defineProps<{
  param: AnnoToolParam
  tool: AnnoToolKey
  hasSelection: boolean
  colors: readonly string[]
  widths: readonly number[]
}>()

const emit = defineEmits<{
  update: [patch: AnnoStylePatch]
  close: []
}>()

const FILL_MODES: Array<{ key: AnnoFillMode; labelKey: string }> = [
  { key: 'stroke', labelKey: 'paramFillNone' },
  { key: 'fill', labelKey: 'paramFillOnly' },
  { key: 'both', labelKey: 'paramFillSolid' }
]

const rootEl = ref<HTMLElement | null>(null)

// Esc 只收面板（消费，不触发画布的取消选中/退出阶梯）
useKeyInterceptor(e => {
  if (e.key !== 'Escape') return false
  e.preventDefault()
  emit('close')
  return true
})

// 面板外 pointerdown 收起（画布开始绘制时不挡视线；轨道点击由宿主处理开合）
function onWindowPointerDown(e: PointerEvent) {
  const target = e.target
  if (!(target instanceof Node)) return
  if (rootEl.value?.contains(target)) return
  if (target instanceof HTMLElement && target.closest('.anno-rail')) return
  emit('close')
}
onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, true))
onUnmounted(() => window.removeEventListener('pointerdown', onWindowPointerDown, true))
</script>

<style scoped>
.tool-param-popover {
  width: 232px;
  /* 宿主以 absolute top-1/2 垂直居中锚定：容器过矮时收缩 + 内滚，
     不再被预览区 overflow-hidden 裁掉上下端（防裁剪审计 2026-08-19） */
  max-height: calc(100% - 24px);
  overflow-y: auto;
}

.popover-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--finder-secondary-label);
}

/* 20px 色点，热区 32×32（4×2 网格） */
.color-dot-cell {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
}
.color-dot-cell:hover {
  background: var(--finder-control);
}
.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}
.color-dot.is-bordered {
  box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.5);
}
.color-dot-cell.is-selected {
  outline: 2px solid var(--finder-selection);
  outline-offset: 2px;
  border-radius: 9999px;
}

.custom-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  cursor: pointer;
}
.custom-color-row:hover {
  background: var(--finder-control);
}
.custom-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: conic-gradient(#ff3b30, #ff9500, #ffcc00, #34c759, #007aff, #af52de, #ff3b30);
}
.sr-only-color {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}

/* 线宽三档（真实粗细预览） */
.width-cell {
  flex: 1;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
}
.width-cell:hover {
  background: var(--finder-control);
}
.width-cell.is-selected {
  border-color: var(--finder-selection);
  background: rgba(10, 132, 255, 0.10);
}
.width-line {
  width: 28px;
  border-radius: 9999px;
}

/* macOS segmented（填充三段） */
.segmented {
  display: flex;
  height: 28px;
  padding: 2px;
  border-radius: 7px;
  background: var(--finder-control);
}
.segmented-item {
  flex: 1;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  color: var(--finder-secondary-label);
  background: transparent;
}
.segmented-item.is-selected {
  background: var(--edit-surface);
  color: var(--finder-label);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.opacity-slider {
  width: 100%;
  accent-color: var(--finder-selection);
}

.hint-line {
  font-size: 11px;
  color: var(--finder-secondary-label);
  border-top: 1px solid var(--finder-divider);
  padding-top: 8px;
  margin: 0;
}
</style>
