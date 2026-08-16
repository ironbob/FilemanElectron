<template>
  <!-- 标注浮层：canvas 对齐图像显示区，形状绘制来自 annotationShapes 纯函数。
       View 只负责指针交互与文字输入；形状/选中/历史状态归 useImageEdit（VM）。
       选择工具：点选（⇧ 加选）、拖动移动、空白拖框选、rect/ellipse 角柄缩放、
       文字双击再编辑。标注隐藏时不可交互（预览最终效果）。 -->
  <div
    ref="rootEl"
    class="absolute inset-0 z-20"
    :style="rootStyle"
    @pointerdown.prevent="onPointerDown"
    @dblclick.prevent="onDoubleClick"
  >
    <canvas ref="canvasRef" class="absolute pointer-events-none" :style="canvasStyle"></canvas>

    <!-- 文字工具输入框（新建 / 双击再编辑） -->
    <input
      v-if="textInput.visible"
      ref="textInputRef"
      v-model="textInput.value"
      class="absolute z-10 px-2 py-1 rounded-md border border-accent-blue bg-bg-primary text-sm text-text-primary shadow-lg outline-none"
      :style="{ left: textInput.x + 'px', top: textInput.y + 'px' }"
      :placeholder="$t('preview.image.textPlaceholder')"
      @keydown.enter.prevent="commitText"
      @keydown.escape.stop.prevent="cancelText"
      @blur="commitText"
      @pointerdown.stop
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted, nextTick } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { ImageEditController } from '@/composables/useImageEdit'
import {
  drawShapes,
  hitTestShape,
  mapShapeToBBox,
  moveShape,
  shapeBBox,
  shapeIntersectsRect,
  textFontSize,
  type AnnoShape
} from '@/utils/annotationShapes'
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

const rootStyle = computed(() => ({
  cursor: cursorFor(),
  pointerEvents: props.edit.annotationsVisible.value ? ('auto' as const) : ('none' as const)
}))

function cursorFor(): string {
  if (!props.edit.annotationsVisible.value) return 'default'
  const tool = props.edit.annoTool.value
  if (tool === 'text') return 'text'
  if (tool === 'select') return moveSession.value ? 'move' : 'default'
  return 'crosshair'
}

// ── 交互会话 ─────────────────────────────────────────────────────────────────
/** 绘制中形状（natural 坐标，pointerup 提交 VM）。 */
let draft: (AnnoShape & { id: number }) | null = null
/** 拖框选（natural 坐标对角）。 */
let marquee: { x1: number; y1: number; x2: number; y2: number } | null = null
/** 移动会话（natural 增量，pointerup 提交 VM）。 */
const moveSession = ref<{ startX: number; startY: number; dx: number; dy: number } | null>(null)
/** 缩放会话（rect/ellipse 单选；from=原包围盒，to=拖拽中的新包围盒）。 */
let resizeSession: { id: number; corner: Corner; from: BBox; to: BBox } | null = null

type Corner = 'nw' | 'ne' | 'sw' | 'se'
interface BBox { x: number; y: number; width: number; height: number }

const renderTick = ref(0)
/** 选中包围盒（容器显示坐标）——供宿主定位上下文浮动条。 */
const selectionDisplayBox = ref<BBox | null>(null)

/** 当前工具参数（绘制用样式）。 */
function draftStyle() {
  const p = props.edit.activeParam.value
  return {
    color: p?.color ?? '#FF3B30',
    strokeWidth: p?.width ?? 4,
    fill: p?.fill,
    opacity: p?.opacity ?? 1
  }
}

// ── 绘制 ─────────────────────────────────────────────────────────────────────
function effectiveShapes(): AnnoShape[] {
  let list = props.edit.shapes.value
  const move = moveSession.value
  if (move && (move.dx || move.dy)) {
    const sel = new Set(props.edit.selectedIds.value)
    list = list.map(s => (sel.has(s.id) ? moveShape(s, move.dx, move.dy) : s))
  }
  if (resizeSession) {
    const rs = resizeSession
    const shape = list.find(s => s.id === rs.id)
    if (shape) {
      const preview = mapShapeToBBox(shape, rs.from, rs.to)
      list = list.map(s => (s.id === rs.id ? preview : s))
    }
  }
  return list
}

function selectionBoxOf(list: AnnoShape[]): BBox | null {
  const sel = new Set(props.edit.selectedIds.value)
  const boxes = list.filter(s => sel.has(s.id)).map(shapeBBox)
  if (!boxes.length) return null
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map(b => b.x + b.width)) - x,
    height: Math.max(...boxes.map(b => b.y + b.height)) - y
  }
}

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
  const visible = props.edit.annotationsVisible.value
  const list = visible ? effectiveShapes() : []
  drawShapes(ctx, list, scale)
  if (visible && draft) drawShapes(ctx, [draft], scale)

  // 选中态：蓝色虚线包围盒 + 可缩放角柄（white 10px 方块 + accent 描边）
  const selBox = visible ? selectionBoxOf(list) : null
  if (selBox) {
    const x = selBox.x * scale
    const y = selBox.y * scale
    const w = selBox.width * scale
    const h = selBox.height * scale
    ctx.save()
    ctx.strokeStyle = '#0A84FF'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
    if (resizableSelectionIds().length === 1) {
      ctx.fillStyle = '#FFFFFF'
      for (const [hx, hy] of cornerPoints(x, y, w, h)) {
        ctx.beginPath()
        ctx.rect(hx - 4.5, hy - 4.5, 9, 9)
        ctx.fill()
        ctx.strokeRect(hx - 4.5, hy - 4.5, 9, 9)
      }
    }
    ctx.restore()
    selectionDisplayBox.value = { x: area.x + x, y: area.y + y, width: w, height: h }
  } else {
    selectionDisplayBox.value = null
  }

  // 拖框选预览
  if (visible && marquee) {
    const mx = Math.min(marquee.x1, marquee.x2) * scale
    const my = Math.min(marquee.y1, marquee.y2) * scale
    ctx.save()
    ctx.strokeStyle = 'rgba(142, 142, 147, 0.9)'
    ctx.fillStyle = 'rgba(10, 132, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.fillRect(mx, my, Math.abs(marquee.x2 - marquee.x1) * scale, Math.abs(marquee.y2 - marquee.y1) * scale)
    ctx.strokeRect(mx, my, Math.abs(marquee.x2 - marquee.x1) * scale, Math.abs(marquee.y2 - marquee.y1) * scale)
    ctx.restore()
  }
}

watch(
  [
    renderTick,
    () => props.edit.shapes.value,
    () => props.edit.selectedIds.value,
    () => props.edit.annotationsVisible.value,
    () => props.layout.displayedRect?.width,
    () => props.layout.displayedRect?.height,
    canvasStyle
  ],
  () => redraw(),
  { immediate: true }
)

// ── 坐标换算 ─────────────────────────────────────────────────────────────────
function localPoint(event: PointerEvent | MouseEvent): { x: number; y: number } | null {
  const el = rootEl.value
  if (!el) return null
  const bounds = el.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

/** 显示坐标 → natural 坐标（clamp 到图像内）。 */
function toNatural(p: { x: number; y: number }) {
  const area = imageArea.value
  const s = toNaturalScale.value
  return {
    x: Math.max(0, Math.min((p.x - area.x) * s, props.layout.naturalWidth)),
    y: Math.max(0, Math.min((p.y - area.y) * s, props.layout.naturalHeight))
  }
}

// ── 命中测试 ─────────────────────────────────────────────────────────────────
function hitShapeIdAt(n: { x: number; y: number }): number | null {
  const tol = 6 * toNaturalScale.value // 6 显示 px 容差
  for (let i = props.edit.shapes.value.length - 1; i >= 0; i--) {
    if (hitTestShape(props.edit.shapes.value[i], n, tol)) return props.edit.shapes.value[i].id
  }
  return null
}

function resizableSelectionIds(): number[] {
  const ids = props.edit.selectedIds.value
  if (ids.length !== 1) return []
  const shape = props.edit.shapes.value.find(s => s.id === ids[0])
  return shape && (shape.kind === 'rect' || shape.kind === 'ellipse') ? ids : []
}

function cornerPoints(x: number, y: number, w: number, h: number): Array<[number, number]> {
  return [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h]
  ]
}

/** 显示坐标下探测选中包围盒角柄（±8px）。 */
function hitResizeCorner(p: { x: number; y: number }): Corner | null {
  const box = selectionDisplayBox.value
  if (!box || resizableSelectionIds().length !== 1) return null
  const corners: Array<[Corner, number, number]> = [
    ['nw', box.x, box.y],
    ['ne', box.x + box.width, box.y],
    ['sw', box.x, box.y + box.height],
    ['se', box.x + box.width, box.y + box.height]
  ]
  for (const [corner, cx, cy] of corners) {
    if (Math.abs(p.x - cx) <= 8 && Math.abs(p.y - cy) <= 8) return corner
  }
  return null
}

// ── 指针交互 ─────────────────────────────────────────────────────────────────
function onPointerDown(event: PointerEvent) {
  const p = localPoint(event)
  if (!p) return
  const edit = props.edit
  const tool = edit.annoTool.value
  if (tool === 'text') {
    openTextInput(p)
    return
  }
  const n = toNatural(p)
  if (tool === 'select') {
    const corner = hitResizeCorner(p)
    if (corner) {
      const id = resizableSelectionIds()[0]
      const shape = edit.shapes.value.find(s => s.id === id)
      if (shape) {
        resizeSession = { id, corner, from: shapeBBox(shape), to: shapeBBox(shape) }
        bindWindowDrag()
      }
      return
    }
    const hit = hitShapeIdAt(n)
    if (hit !== null) {
      if (event.shiftKey) {
        // ⇧ 点选切换成员
        const next = edit.selectedIds.value.includes(hit)
          ? edit.selectedIds.value.filter(i => i !== hit)
          : [...edit.selectedIds.value, hit]
        edit.selectMany(next)
      } else if (!edit.selectedIds.value.includes(hit)) {
        edit.selectShape(hit)
      }
      moveSession.value = { startX: n.x, startY: n.y, dx: 0, dy: 0 }
    } else {
      if (!event.shiftKey) edit.clearSelection()
      marquee = { x1: n.x, y1: n.y, x2: n.x, y2: n.y }
    }
    bindWindowDrag()
    return
  }
  startDraft(tool, n)
  bindWindowDrag()
}

function bindWindowDrag() {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function startDraft(tool: 'arrow' | 'rect' | 'ellipse' | 'freehand', n: { x: number; y: number }) {
  const style = draftStyle()
  if (tool === 'freehand') {
    draft = { kind: 'freehand', points: [n], ...style, id: -1 }
  } else if (tool === 'arrow') {
    draft = { kind: 'arrow', x1: n.x, y1: n.y, x2: n.x, y2: n.y, ...style, id: -1 }
  } else {
    draft = {
      kind: tool === 'rect' ? 'rect' : 'ellipse',
      ...(tool === 'rect' ? { x: n.x, y: n.y, width: 0, height: 0 } : { cx: n.x, cy: n.y, rx: 0, ry: 0 }),
      ...style,
      id: -1
    } as AnnoShape & { id: number }
  }
}

function onPointerMove(event: PointerEvent) {
  const p = localPoint(event)
  if (!p) return
  const n = toNatural(p)
  if (draft) {
    updateDraft(n)
  } else if (moveSession.value) {
    moveSession.value.dx = n.x - moveSession.value.startX
    moveSession.value.dy = n.y - moveSession.value.startY
  } else if (marquee) {
    marquee.x2 = n.x
    marquee.y2 = n.y
  } else if (resizeSession) {
    resizeSession.to = resizeBox(resizeSession.from, resizeSession.corner, n)
  } else {
    return
  }
  renderTick.value++
}

function updateDraft(n: { x: number; y: number }) {
  if (!draft) return
  if (draft.kind === 'freehand') {
    draft.points.push(n)
  } else if (draft.kind === 'arrow') {
    draft.x2 = n.x
    draft.y2 = n.y
  } else if (draft.kind === 'rect') {
    // 允许反向拖拽（负宽高在 pointerup 归一化）
    draft.width = n.x - draft.x
    draft.height = n.y - draft.y
  } else if (draft.kind === 'ellipse') {
    const d = draft as { cx: number; cy: number; rx: number; ry: number }
    d.rx = Math.abs(n.x - d.cx)
    d.ry = Math.abs(n.y - d.cy)
  }
  renderTick.value++
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  const edit = props.edit
  if (draft) {
    // 负宽高归一化 + 过小图形视为误触丢弃
    if (draft.kind === 'rect') {
      if (draft.width < 0) {
        draft.x += draft.width
        draft.width = -draft.width
      }
      if (draft.height < 0) {
        draft.y += draft.height
        draft.height = -draft.height
      }
    }
    const bbox = shapeBBox(draft)
    const minPx = Math.max(3, draftStyle().strokeWidth)
    if (bbox.width >= minPx || bbox.height >= minPx) {
      const { id: _id, ...shape } = draft
      edit.addShape(shape as never)
    }
  } else if (moveSession.value) {
    const { dx, dy } = moveSession.value
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
      edit.moveShapes(edit.selectedIds.value, Math.round(dx), Math.round(dy))
    }
  } else if (marquee) {
    const w = Math.abs(marquee.x2 - marquee.x1)
    const h = Math.abs(marquee.y2 - marquee.y1)
    if (w * toNaturalScale.value >= 4 || h * toNaturalScale.value >= 4) {
      const rect = {
        x: Math.min(marquee.x1, marquee.x2),
        y: Math.min(marquee.y1, marquee.y2),
        width: w,
        height: h
      }
      edit.selectMany(edit.shapes.value.filter(s => shapeIntersectsRect(s, rect)).map(s => s.id))
    }
  } else if (resizeSession) {
    const shape = edit.shapes.value.find(s => s.id === resizeSession!.id)
    if (shape) {
      const preview = mapShapeToBBox(shape, resizeSession.from, resizeSession.to)
      const { id: _id, ...rest } = preview
      edit.replaceShape(resizeSession.id, rest as never)
    }
  }
  draft = null
  marquee = null
  moveSession.value = null
  resizeSession = null
  renderTick.value++
}

/** 角柄拖拽：按 corner 把指针 natural 坐标换算成新包围盒（最小 4 natural px）。 */
function resizeBox(from: BBox, corner: Corner, p: { x: number; y: number }): BBox {
  let { x, y, width, height } = from
  if (corner === 'se') {
    width = Math.max(4, p.x - x)
    height = Math.max(4, p.y - y)
  } else if (corner === 'ne') {
    width = Math.max(4, p.x - x)
    const bottom = y + height
    y = Math.min(p.y, bottom - 4)
    height = bottom - y
  } else if (corner === 'sw') {
    height = Math.max(4, p.y - y)
    const right = x + width
    x = Math.min(p.x, right - 4)
    width = right - x
  } else {
    const right = x + width
    const bottom = y + height
    x = Math.min(p.x, right - 4)
    y = Math.min(p.y, bottom - 4)
    width = right - x
    height = bottom - y
  }
  return { x, y, width, height }
}

// ── 文字输入 ─────────────────────────────────────────────────────────────────
const textInput = reactive({ visible: false, x: 0, y: 0, value: '' })
const textInputRef = ref<HTMLInputElement | null>(null)
let editingTextId: number | null = null

function openTextInput(p: { x: number; y: number }, existing?: { id: number; text: string; style: { color: string; width: number } }) {
  textInput.visible = true
  textInput.x = p.x
  textInput.y = p.y - textFontSize(existing?.style.width ?? draftStyle().strokeWidth) / toNaturalScale.value
  textInput.value = existing?.text ?? ''
  editingTextId = existing?.id ?? null
  void nextTick(() => textInputRef.value?.focus())
}

function onDoubleClick(event: MouseEvent) {
  if (props.edit.annoTool.value === 'text') return // 文字工具单击已开输入框
  const p = localPoint(event)
  if (!p) return
  const id = hitShapeIdAt(toNatural(p))
  if (id === null) return
  const shape = props.edit.shapes.value.find(s => s.id === id)
  if (shape?.kind !== 'text') return
  props.edit.selectShape(id)
  openTextInput({ x: shape.x / toNaturalScale.value + imageArea.value.x, y: shape.y / toNaturalScale.value + imageArea.value.y }, {
    id,
    text: shape.text,
    style: { color: shape.color, width: shape.strokeWidth }
  })
}

function commitText() {
  if (!textInput.visible) return
  const value = textInput.value.trim()
  const wasEditing = editingTextId
  const box = { x: textInput.x, y: textInput.y }
  textInput.visible = false
  editingTextId = null
  if (!value) return
  const n = toNatural(box)
  const style = draftStyle()
  if (wasEditing !== null) {
    props.edit.replaceShape(wasEditing, {
      kind: 'text',
      x: n.x,
      y: n.y,
      text: value,
      color: style.color,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity
    } as never)
  } else {
    props.edit.addShape({
      kind: 'text',
      x: n.x,
      y: n.y,
      text: value,
      color: style.color,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity
    } as never)
  }
}

function cancelText() {
  textInput.visible = false
  textInput.value = ''
  editingTextId = null
}

// ── 键盘：工具快捷键 + 编辑命令 + Esc 阶梯 ─────────────────────────────────
const TOOL_KEYS: Record<string, 'select' | 'arrow' | 'rect' | 'ellipse' | 'freehand' | 'text'> = {
  v: 'select',
  a: 'arrow',
  r: 'rect',
  o: 'ellipse',
  p: 'freehand',
  t: 'text'
}

useKeyInterceptor(e => {
  const typing = e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
  const edit = props.edit
  const mod = e.metaKey || e.ctrlKey

  // Esc 阶梯：文字输入 → 进行中交互 → 选中 → （交给宿主处理退出）
  if (e.key === 'Escape') {
    if (textInput.visible) {
      cancelText()
      return true
    }
    if (draft || marquee || moveSession.value || resizeSession) {
      draft = null
      marquee = null
      moveSession.value = null
      resizeSession = null
      renderTick.value++
      return true
    }
    if (edit.selectedIds.value.length > 0) {
      edit.clearSelection()
      return true
    }
    return false
  }

  if (typing) return false

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (edit.selectedIds.value.length > 0) {
      e.preventDefault()
      edit.deleteShapes(edit.selectedIds.value)
      return true
    }
    return false
  }

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) edit.redoAnno()
    else edit.undoAnno()
    return true
  }

  if (mod && e.key.toLowerCase() === 'd') {
    if (edit.selectedIds.value.length > 0) {
      e.preventDefault()
      edit.duplicateShapes(edit.selectedIds.value)
      return true
    }
    return false
  }

  // 方向键微移选中（1 显示 px；⇧ ×10）；无选中交给集合导航
  if (e.key.startsWith('Arrow') && edit.selectedIds.value.length > 0) {
    e.preventDefault()
    const step = (e.shiftKey ? 10 : 1) * toNaturalScale.value
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    edit.moveShapes(edit.selectedIds.value, Math.round(dx), Math.round(dy))
    return true
  }

  // 工具快捷键（无修饰键）
  if (!mod && !e.altKey) {
    const tool = TOOL_KEYS[e.key.toLowerCase()]
    if (tool) {
      e.preventDefault()
      edit.annoTool.value = tool
      return true
    }
  }
  return false
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

/** 导出标注层（宿主在保存前调用）。 */
defineExpose({
  selectionDisplayBox,
  exportOverlay(): string | null {
    const canvas = canvasRef.value
    if (!canvas || props.edit.shapes.value.length === 0) return null
    // 坐标为显示空间 → 用 annotationShapes 导出（natural 空间精确）
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
