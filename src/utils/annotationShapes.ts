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

export interface AnnoStyle {
  color: string
  /** 线宽（显示空间 px）——注意与 RectShape.width（几何宽）区分 */
  strokeWidth: number
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

/**
 * 把形状列表绘制到 2D context。
 * @param scale 显示空间 → 目标画布的缩放（导出 overlay 时 = overlayWidth / naturalWidth）
 */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: AnnoShape[], scale: number) {
  for (const shape of shapes) {
    ctx.save()
    ctx.strokeStyle = shape.color
    ctx.fillStyle = shape.color
    ctx.lineWidth = Math.max(1, shape.strokeWidth * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    switch (shape.kind) {
      case 'arrow':
        drawArrow(ctx, shape, scale)
        break
      case 'rect':
        ctx.strokeRect(shape.x * scale, shape.y * scale, shape.width * scale, shape.height * scale)
        break
      case 'ellipse': {
        ctx.beginPath()
        ctx.ellipse(shape.cx * scale, shape.cy * scale, Math.abs(shape.rx * scale), Math.abs(shape.ry * scale), 0, 0, Math.PI * 2)
        ctx.stroke()
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

/** 预设颜色（Finder 截图工具风格）。 */
export const ANNO_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#FFFFFF', '#000000'] as const

/** 粗细三档（显示空间 px）。 */
export const ANNO_WIDTHS = [2, 4, 8] as const
