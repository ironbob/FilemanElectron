<template>
  <!-- 裁剪模式浮层：暗化遮罩 + 可拖拽矩形 + 角点手柄 + 比例锁预设。
       View 只渲染与转发意图；坐标换算全部来自 cropGeometry（纯函数）。 -->
  <div
    ref="rootEl"
    class="absolute inset-0 z-20 select-none cursor-crosshair"
    @mousedown.prevent="onSurfaceMouseDown"
  >
    <!-- 四块暗化区域：用超大 box-shadow 实现选中框外变暗；
         pointer-events-auto + cursor-move 让选区悬停显示移动光标
         （mousedown 冒泡到 root：insideRect → 进入移动拖拽） -->
    <div
      v-if="rect"
      class="absolute cursor-move"
      :style="{
        left: rect.x + 'px',
        top: rect.y + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
        outline: '1.5px solid var(--accent-blue)'
      }"
    ></div>
    <div v-else class="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
      <span class="px-3 py-1.5 rounded-full bg-black/55 text-white text-xs">{{ $t('preview.image.dragToCropHint') }}</span>
    </div>

    <!-- 角点/边中点手柄 -->
    <template v-if="rect">
      <div
        v-for="h in HANDLES"
        :key="h"
        class="absolute w-3 h-3 rounded-sm bg-white border border-accent-blue"
        :style="handleStyle(h)"
        @mousedown.prevent.stop="startHandleDrag(h, $event)"
      ></div>
    </template>

    <!-- 底部操作栏 -->
    <div class="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-bg-secondary/95 border border-border shadow-lg" @mousedown.stop>
      <button
        v-for="preset in ASPECT_PRESETS"
        :key="preset.label"
        class="px-2 py-1 rounded-md text-xs transition-colors"
        :class="aspect === preset.value ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
        @click="setAspect(preset.value)"
      >{{ preset.label || $t('preview.image.aspectFree') }}</button>
      <span v-if="sourceSizeLabel" class="ml-2 text-xs text-text-tertiary tabular-nums">{{ sourceSizeLabel }}</span>
      <div class="flex-1"></div>
      <button class="px-3 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-hover" title="Esc" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button
        class="px-3 py-1 rounded-md text-xs bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-40"
        :disabled="!rect"
        @click="emit('apply')"
      >{{ $t('preview.image.cropApply') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { applyAspectLock, displayedImageRect, displayedToSourceRect, sourceToDisplayedRect, type ImageLayout, type Rect } from '@/utils/cropGeometry'

const props = defineProps<{
  layout: ImageLayout
  modelValue: Rect | null
}>()

const emit = defineEmits<{
  'update:modelValue': [rect: Rect | null]
  cancel: []
  apply: []
}>()

const ASPECT_PRESETS = [
  { label: '', value: null as number | null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 }
]

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e']

const aspect = ref<number | null>(null)

const rect = computed(() => props.modelValue)

// 显示坐标 ↔ 源像素（提交的始终是源像素矩形）
const sourceRect = computed<Rect | null>(() => {
  if (!rect.value) return null
  return displayedToSourceRect(rect.value, props.layout)
})

const sourceSizeLabel = computed(() => {
  if (!sourceRect.value) return ''
  return `${Math.round(sourceRect.value.width)} × ${Math.round(sourceRect.value.height)}`
})

// 拖拽会话（显示坐标；base 在创建时始终给定）
let dragStart: { px: number; py: number; base: Rect; handle: Handle | 'move' | 'create' } | null = null

function onSurfaceMouseDown(event: MouseEvent) {
  const p = localPoint(event)
  if (!p) return
  if (rect.value && insideRect(p, rect.value)) {
    dragStart = { px: p.x, py: p.y, base: { ...rect.value }, handle: 'move' }
  } else {
    emit('update:modelValue', null)
    dragStart = { px: p.x, py: p.y, base: { x: p.x, y: p.y, width: 0, height: 0 }, handle: 'create' }
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function startHandleDrag(handle: Handle, event: MouseEvent) {
  const p = localPoint(event)
  if (!p || !rect.value) return
  dragStart = { px: p.x, py: p.y, base: { ...rect.value }, handle }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(event: MouseEvent) {
  if (!dragStart) return
  const p = localPoint(event)
  if (!p) return
  const { px, py, base, handle } = dragStart
  const dx = p.x - px
  const dy = p.y - py

  let next: Rect
  if (handle === 'move') {
    next = { ...base, x: base.x + dx, y: base.y + dy }
  } else if (handle === 'create') {
    next = {
      x: Math.min(base.x, p.x),
      y: Math.min(base.y, p.y),
      width: Math.abs(dx),
      height: Math.abs(dy)
    }
  } else {
    next = { ...base }
    if (handle.includes('n')) { next.y = base.y + dy; next.height = base.height - dy }
    if (handle.includes('s')) { next.height = base.height + dy }
    if (handle.includes('w')) { next.x = base.x + dx; next.width = base.width - dx }
    if (handle.includes('e')) { next.width = base.width + dx }
    if (next.width < 0) { next.x += next.width; next.width = -next.width }
    if (next.height < 0) { next.y += next.height; next.height = -next.height }
  }

  if (aspect.value && handle !== 'move') {
    next = applyAspectLock(next, aspect.value)
  }
  // clamp 到图像实际显示区（letterbox 区域不可选；图小于容器时约束到图内）
  const imgArea = displayedImageRect(props.layout)
  const ax = Math.max(imgArea.x, 0)
  const ay = Math.max(imgArea.y, 0)
  const aw = Math.min(imgArea.width, props.layout.containerWidth - ax)
  const ah = Math.min(imgArea.height, props.layout.containerHeight - ay)
  const x0 = Math.max(ax, Math.min(next.x, ax + Math.max(1, aw - 1)))
  const y0 = Math.max(ay, Math.min(next.y, ay + Math.max(1, ah - 1)))
  next = {
    x: x0,
    y: y0,
    width: Math.min(Math.max(1, next.width), ax + aw - x0),
    height: Math.min(Math.max(1, next.height), ay + ah - y0)
  }
  emit('update:modelValue', next)
}

function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  // 过小的选区视为误触
  if (rect.value && (rect.value.width < 8 || rect.value.height < 8)) {
    emit('update:modelValue', null)
  }
}

function setAspect(value: number | null) {
  aspect.value = value
  if (value && rect.value) {
    emit('update:modelValue', applyAspectLock(rect.value, value))
  }
}

function localPoint(event: MouseEvent): { x: number; y: number } | null {
  const el = rootEl.value
  if (!el) return null
  const bounds = el.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function insideRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

function handleStyle(h: Handle): Record<string, string> {
  const r = rect.value
  if (!r) return {}
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const pos: Record<Handle, [number, number]> = {
    nw: [r.x, r.y], n: [cx, r.y], ne: [r.x + r.width, r.y],
    w: [r.x, cy], e: [r.x + r.width, cy],
    sw: [r.x, r.y + r.height], s: [cx, r.y + r.height], se: [r.x + r.width, r.y + r.height]
  }
  const [x, y] = pos[h]
  const cursor: Record<Handle, string> = {
    nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize'
  }
  return { left: `${x - 6}px`, top: `${y - 6}px`, cursor: cursor[h] }
}

const rootEl = ref<HTMLElement | null>(null)

// Esc 取消：capture + return true 消费（阻止冒泡到 App.vue 的
// Esc-关闭预览 tab 处理——否则退出裁剪的同时整个 tab 被关掉）
useKeyInterceptor(e => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  emit('cancel')
  return true
})
onUnmounted(() => {
  onDragEnd()
})

// 对外提交源像素矩形（供宿主读取）
defineExpose({ sourceRect })

// 布局变化（窗口缩放/平移/缩放视图）时，把源像素矩形回显到新显示坐标
watch(
  () => [props.layout.containerWidth, props.layout.containerHeight, props.layout.displayedRect?.x, props.layout.displayedRect?.y, props.layout.displayedRect?.width, props.layout.displayedRect?.height],
  () => {
    if (!sourceRect.value) return
    emit('update:modelValue', sourceToDisplayedRect(sourceRect.value, props.layout))
  }
)
</script>
