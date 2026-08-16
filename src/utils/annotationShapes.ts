/**
 * 标注形状模型与绘制（纯函数，标注 feature 的几何/导出单一事实源）。
 *
 * 坐标空间：与裁剪矩形一致——「显示 natural 空间」（img.naturalWidth/Height）。
 * 绘制到屏幕或导出 overlay 时按 scale 等比缩放（displayed/natural 或
 * overlay/natural），保证换图缩放后标注位置不变。
 *
 * 设计依据：SRP —— 只做形状几何与 canvas 绘制；不持有状态（shapes 归 VM）。
 */

export type AnnoTool = 'arrow' | 'rect' | 'ellipse' | 'freehand' | 'text'

/** 工具栏工具键：'select'（选择/移动）+ 绘制工具。 */
export const ANNO_TOOL_KEYS = ['select', 'arrow', 'rect', 'ellipse', 'freehand', 'text'] as const
export type AnnoToolKey = (typeof ANNO_TOOL_KEYS)[number]

/** 形状填充模式（仅 rect/ellipse 有意义；其余形状忽略）。 */
export type AnnoFillMode = 'stroke' | 'fill' | 'both'

export interface AnnoStyle {
  color: string
  /** 线宽（显示空间 px）——注意与 RectShape.width（几何宽）区分 */
  strokeWidth: number
  /** 填充模式，缺省 'stroke'（仅描边） */
  fill?: AnnoFillMode
  /** 整体不透明度 0–1，缺省 1 */
  opacity?: number
}

interface AnnoBase extends AnnoStyle {
  id: number
}

export interface ArrowShape extends AnnoBase {
  kind: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RectShape extends AnnoBase {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
}

export interface EllipseShape extends AnnoBase {
  kind: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface FreehandShape extends AnnoBase {
  kind: 'freehand'
  points: Array<{ x: number; y: number }>
}

export interface TextShape extends AnnoBase {
  kind: 'text'
  x: number
  y: number
  text: string
}

export type AnnoShape = ArrowShape | RectShape | EllipseShape | FreehandShape | TextShape

/** 形状包围盒（显示空间）——命中检测与外层 clamp 用。 */
export function shapeBBox(shape: AnnoShape): { x: number; y: number; width: number; height: number } {
  switch (shape.kind) {
    case 'arrow':
      return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), width: Math.abs(shape.x2 - shape.x1), height: Math.abs(shape.y2 - shape.y1) }
    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
    case 'ellipse':
      return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 }
    case 'freehand': {
      const xs = shape.points.map(p => p.x)
      const ys = shape.points.map(p => p.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    case 'text': {
      // 文本宽度按 ~0.6×字号 估算（显示空间近似；导出时用 measureText 精确）
      const size = textFontSize(shape.strokeWidth)
      return { x: shape.x, y: shape.y - size, width: shape.text.length * size * 0.6, height: size * 1.2 }
    }
  }
}

/** 粗细档位 → 文字字号（与线条同档位视觉平衡）。 */
export function textFontSize(strokeWidth: number): number {
  return Math.max(14, strokeWidth * 4)
}

/** 平移形状（natural 空间增量；深替换返回新对象）。 */
export function moveShape<T extends AnnoShape>(shape: T, dx: number, dy: number): T {
  switch (shape.kind) {
    case 'arrow':
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
    case 'freehand':
      return { ...shape, points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
  }
}

/**
 * 仿射映射：把形状几何从包围盒 from 等比映射到包围盒 to。
 * 移动（to=from 平移）与手柄缩放（to 尺寸变化）统一走本函数。
 * text 仅映射锚点，字号不随缩放（设计约束：文字只移动）。
 */
export function mapShapeToBBox<T extends AnnoShape>(shape: T, from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }): T {
  const sx = from.width > 0 ? to.width / from.width : 1
  const sy = from.height > 0 ? to.height / from.height : 1
  const mx = (x: number) => to.x + (x - from.x) * sx
  const my = (y: number) => to.y + (y - from.y) * sy
  switch (shape.kind) {
    case 'arrow':
      return { ...shape, x1: mx(shape.x1), y1: my(shape.y1), x2: mx(shape.x2), y2: my(shape.y2) } as T
    case 'rect':
      return { ...shape, x: mx(shape.x), y: my(shape.y), width: shape.width * sx, height: shape.height * sy } as T
    case 'ellipse':
      return { ...shape, cx: mx(shape.cx), cy: my(shape.cy), rx: Math.abs(shape.rx * sx), ry: Math.abs(shape.ry * sy) } as T
    case 'freehand':
      return { ...shape, points: shape.points.map(p => ({ x: mx(p.x), y: my(p.y) })) } as T
    case 'text':
      return { ...shape, x: mx(shape.x), y: my(shape.y) } as T
  }
}

/** 点命中（natural 空间；bbox 粗判 + 容差，满足选择交互精度）。 */
export function hitTestShape(shape: AnnoShape, p: { x: number; y: number }, tol = 4): boolean {
  const b = shapeBBox(shape)
  return p.x >= b.x - tol && p.x <= b.x + b.width + tol && p.y >= b.y - tol && p.y <= b.y + b.height + tol
}

/** 框选相交判定（natural 空间）。 */
export function shapeIntersectsRect(shape: AnnoShape, r: { x: number; y: number; width: number; height: number }): boolean {
  const b = shapeBBox(shape)
  return b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * 把形状列表绘制到 2D context。
 * @param scale 显示空间 → 目标画布的缩放（导出 overlay 时 = overlayWidth / naturalWidth）
 */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: AnnoShape[], scale: number) {
  for (const shape of shapes) {
    ctx.save()
    ctx.globalAlpha = clamp01(shape.opacity ?? 1)
    ctx.strokeStyle = shape.color
    ctx.fillStyle = shape.color
    ctx.lineWidth = Math.max(1, shape.strokeWidth * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const fill = shape.fill ?? 'stroke'
    switch (shape.kind) {
      case 'arrow':
        drawArrow(ctx, shape, scale)
        break
      case 'rect': {
        const x = shape.x * scale
        const y = shape.y * scale
        const w = shape.width * scale
        const h = shape.height * scale
        if (fill !== 'stroke') ctx.fillRect(x, y, w, h)
        if (fill !== 'fill') ctx.strokeRect(x, y, w, h)
        break
      }
      case 'ellipse': {
        ctx.beginPath()
        ctx.ellipse(shape.cx * scale, shape.cy * scale, Math.abs(shape.rx * scale), Math.abs(shape.ry * scale), 0, 0, Math.PI * 2)
        if (fill !== 'stroke') ctx.fill()
        if (fill !== 'fill') ctx.stroke()
        break
      }
      case 'freehand': {
        ctx.beginPath()
        shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)))
        ctx.stroke()
        break
      }
      case 'text': {
        const size = textFontSize(shape.strokeWidth) * scale
        ctx.font = `bold ${size}px -apple-system, "Helvetica Neue", sans-serif`
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(shape.text, shape.x * scale, shape.y * scale)
        break
      }
    }
    ctx.restore()
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, s: ArrowShape, scale: number) {
  const x1 = s.x1 * scale
  const y1 = s.y1 * scale
  const x2 = s.x2 * scale
  const y2 = s.y2 * scale
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = Math.max(8, s.strokeWidth * 3.2) * scale

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2 - Math.cos(angle) * headLen * 0.6, y2 - Math.sin(angle) * headLen * 0.6)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

/**
 * 导出标注层：透明底 PNG（naturalW×naturalH，scale=1 直接映射）。
 * 空形状 → null（调用方不发送 annotate op）。
 */
export function shapesToOverlayBase64(shapes: AnnoShape[], naturalWidth: number, naturalHeight: number): string | null {
  if (shapes.length === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(naturalWidth))
  canvas.height = Math.max(1, Math.round(naturalHeight))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawShapes(ctx, shapes, canvas.width / naturalWidth)
  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl.slice('data:image/png;base64,'.length)
}

/** 预设颜色（Finder 截图工具风格；8 色凑满 4×2 色板）。 */
export const ANNO_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FFFFFF', '#000000'] as const

/** 粗细三档（显示空间 px）。 */
export const ANNO_WIDTHS = [2, 4, 8] as const
