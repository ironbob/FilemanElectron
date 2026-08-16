<template>
  <!-- 标注浮层：canvas 对齐图像显示区，形状绘制来自 annotationShapes 纯函数。
       View 只负责指针交互与文字输入；形状状态归 useImageEdit（VM）。 -->
  <div
    ref="rootEl"
    class="absolute inset-0 z-20"
    :style="{ cursor: edit.annoTool.value === 'text' ? 'text' : 'crosshair' }"
    @pointerdown.prevent="onPointerDown"
  >
    <canvas
      ref="canvasRef"
      class="absolute pointer-events-none"
      :style="canvasStyle"
    ></canvas>

    <!-- 文字工具输入框 -->
    <input
      v-if="textInput.visible"
      ref="textInputRef"
      v-model="textInput.value"
      class="absolute z-10 px-2 py-1 rounded border border-accent-blue bg-bg-primary text-sm text-text-primary shadow-lg"
      :style="{ left: textInput.x + 'px', top: textInput.y + 'px' }"
      placeholder="输入文字，回车确认"
      @keydown.enter.prevent="commitText"
      @keydown.escape.stop.prevent="cancelText"
      @blur="commitText"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted, nextTick } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { ImageEditController } from '@/composables/useImageEdit'
import { drawShapes, shapeBBox, textFontSize, type AnnoShape } from '@/utils/annotationShapes'
import type { ImageLayout } from '@/utils/cropGeometry'

const props = defineProps<{
  edit: ImageEditController
  layout: ImageLayout
}>()

const rootEl = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

/** 图像显示区（显示坐标，相对容器） */
const imageArea = computed(() => {
  const img = props.layout.displayedRect
  return img ?? { x: 0, y: 0, width: props.layout.containerWidth, height: props.layout.containerHeight }
})

/** 显示坐标 → natural 空间的比例 */
const toNaturalScale = computed(() => {
  const area = imageArea.value
  return area.width > 0 ? props.layout.naturalWidth / area.width : 1
})

const canvasStyle = computed(() => {
  const area = imageArea.value
  return { left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px` }
})

// 绘制中形状（display 坐标，pointerup 时转 natural 提交）
let draft: { id: number } & Record<string, unknown> | null = null
const renderTick = ref(0)

function redraw() {
  const canvas = canvasRef.value
  const area = imageArea.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const pxW = Math.max(1, Math.round(area.width * dpr))
  const pxH = Math.max(1, Math.round(area.height * dpr))
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, area.width, area.height)

  const scale = 1 / toNaturalScale.value // natural → display
  const style = { color: props.edit.annoColor.value, strokeWidth: props.edit.annoWidth.value }
  drawShapes(ctx, props.edit.shapes.value, scale)
  if (draft) {
    drawShapes(ctx, [{ ...style, ...(draft as unknown as AnnoShape) }] as AnnoShape[], scale)
  }
}

watch([renderTick, () => props.edit.shapes.value, () => props.layout.displayedRect?.width, canvasStyle], () => redraw(), { immediate: true })

// ── 指针交互 ──────────────────────────────────────────────────────────────────
let dragStart: { x: number; y: number } | null = null

function localPoint(event: PointerEvent | MouseEvent): { x: number; y: number } | null {
  const el = rootEl.value
  if (!el) return null
  const bounds = el.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

/** 显示坐标 → natural 坐标（clamp 到图像内） */
function toNatural(p: { x: number; y: number }) {
  const area = imageArea.value
  const s = toNaturalScale.value
  return {
    x: Math.max(0, Math.min((p.x - area.x) * s, props.layout.naturalWidth)),
    y: Math.max(0, Math.min((p.y - area.y) * s, props.layout.naturalHeight))
  }
}

function onPointerDown(event: PointerEvent) {
  const p = localPoint(event)
  if (!p) return
  const tool = props.edit.annoTool.value
  if (tool === 'text') {
    openTextInput(p)
    return
  }
  const n = toNatural(p)
  dragStart = p
  const style = { color: props.edit.annoColor.value, strokeWidth: props.edit.annoWidth.value }
  if (tool === 'freehand') {
    draft = { kind: 'freehand', points: [n], ...style, id: -1 }
  } else if (tool === 'arrow') {
    draft = { kind: 'arrow', x1: n.x, y1: n.y, x2: n.x, y2: n.y, ...style, id: -1 }
  } else {
    draft = { kind: tool === 'rect' ? 'rect' : 'ellipse', ...(tool === 'rect' ? { x: n.x, y: n.y, width: 0, height: 0 } : { cx: n.x, cy: n.y, rx: 0, ry: 0 }), ...style, id: -1 }
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!draft || !dragStart) return
  const p = localPoint(event)
  if (!p) return
  const start = toNatural(dragStart)
  const n = toNatural(p)
  if (draft.kind === 'freehand') {
    ;(draft as unknown as { points: Array<{ x: number; y: number }> }).points.push(n)
  } else if (draft.kind === 'arrow') {
    const d = draft as unknown as { x1: number; y1: number; x2: number; y2: number }
    d.x2 = n.x
    d.y2 = n.y
  } else if (draft.kind === 'rect') {
    const d = draft as unknown as { x: number; y: number; width: number; height: number }
    d.x = Math.min(start.x, n.x)
    d.y = Math.min(start.y, n.y)
    d.width = Math.abs(n.x - start.x)
    d.height = Math.abs(n.y - start.y)
  } else if (draft.kind === 'ellipse') {
    const d = draft as unknown as { cx: number; cy: number; rx: number; ry: number }
    d.cx = (start.x + n.x) / 2
    d.cy = (start.y + n.y) / 2
    d.rx = Math.abs(n.x - start.x) / 2
    d.ry = Math.abs(n.y - start.y) / 2
  }
  renderTick.value++
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (draft) {
    // 过小的图形视为误触丢弃
    const bbox = shapeBBox(draft as unknown as AnnoShape)
    const minPx = Math.max(3, props.edit.annoWidth.value)
    if (bbox.width >= minPx || bbox.height >= minPx) {
      const { id: _id, ...shape } = draft as { id: number } & Record<string, unknown>
      props.edit.addShape(shape as never)
    }
  }
  draft = null
  dragStart = null
  renderTick.value++
}

// ── 文字输入 ──────────────────────────────────────────────────────────────────
const textInput = reactive({ visible: false, x: 0, y: 0, value: '' })
const textInputRef = ref<HTMLInputElement | null>(null)

function openTextInput(p: { x: number; y: number }) {
  textInput.visible = true
  textInput.x = p.x
  textInput.y = p.y - textFontSize(props.edit.annoWidth.value) / toNaturalScale.value
  textInput.value = ''
  void nextTick(() => textInputRef.value?.focus())
}

function commitText() {
  if (!textInput.visible) return
  const value = textInput.value.trim()
  textInput.visible = false
  if (!value) return
  const n = toNatural({ x: textInput.x, y: textInput.y })
  props.edit.addShape({
    kind: 'text',
    x: n.x,
    y: n.y,
    text: value,
    color: props.edit.annoColor.value,
    strokeWidth: props.edit.annoWidth.value
  } as never)
}

function cancelText() {
  textInput.visible = false
  textInput.value = ''
}

// Esc 退出标注模式：capture + return true 消费（阻止冒泡到 App.vue 的
// Esc-关闭预览 tab 处理——否则退出模式的同时整个 tab 被关掉）。
// 文字输入可见时先关输入（不退出模式）。
useKeyInterceptor(e => {
  if (e.key !== 'Escape') return
  if (textInput.visible) {
    e.preventDefault()
    cancelText()
    return true
  }
  e.preventDefault()
  props.edit.exitAnnotate()
  return true
})
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

/** 导出标注层（宿主在保存前调用）。 */
defineExpose({
  exportOverlay(): string | null {
    const canvas = canvasRef.value
    if (!canvas || props.edit.shapes.value.length === 0) return null
    // 直接复用已绘制的高分辨率 canvas：dpr 缩放下包含全部分辨率；
    // 但坐标为显示空间 → 改用 annotationShapes 导出（natural 空间精确）
    const off = document.createElement('canvas')
    off.width = props.layout.naturalWidth
    off.height = props.layout.naturalHeight
    const ctx = off.getContext('2d')
    if (!ctx) return null
    drawShapes(ctx, props.edit.shapes.value, 1)
    return off.toDataURL('image/png').slice('data:image/png;base64,'.length)
  }
})
</script>
