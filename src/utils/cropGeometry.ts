/**
 * 裁剪几何映射（纯函数，ROLE-L07）。
 *
 * 显示矩形 ↔ 源像素矩形 的反算，覆盖 object-fit 三种模式与缩放：
 *  - contain：图像完整可见，容器内有 letterbox（水平或垂直留白）；
 *  - cover  ：图像铺满容器、溢出裁切（映射域是「可见窗口」，超出部分不可裁）；
 *  - actual ：图像按原始像素渲染（scale=1）或经放大缩小（scale≠1）。
 *
 * 设计依据：SRP/defensive_design —— 只做几何；结果 clamp 到图像边界并取整，
 * 保证输出矩形始终是合法裁剪区域（≥1px）。
 */

export type CropFitMode = 'contain' | 'cover' | 'actual'

export interface ImageLayout {
  /** 展示容器的 CSS 尺寸（px） */
  containerWidth: number
  containerHeight: number
  /** 图像 natural 尺寸（px），即 img.naturalWidth/naturalHeight */
  naturalWidth: number
  naturalHeight: number
  fitMode: CropFitMode
  /** 用户缩放倍数（fitMode 下通常为 1；actual/放大态有效） */
  scale?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 计算图像在容器内的可见窗口（显示坐标，可能溢出容器为负起点）。 */
export function displayedImageRect(layout: ImageLayout): Rect {
  const scale = layout.scale ?? 1
  const drawW = layout.naturalWidth * scale
  const drawH = layout.naturalHeight * scale

  if (layout.fitMode === 'cover') {
    // 铺满容器：按较大比率缩放，可见窗口=容器，图像起点可能为负
    const ratio = Math.max(layout.containerWidth / layout.naturalWidth, layout.containerHeight / layout.naturalHeight) * scale
    const w = layout.naturalWidth * ratio
    const h = layout.naturalHeight * ratio
    return { x: (layout.containerWidth - w) / 2, y: (layout.containerHeight - h) / 2, width: w, height: h }
  }
  if (layout.fitMode === 'actual') {
    return { x: (layout.containerWidth - drawW) / 2, y: (layout.containerHeight - drawH) / 2, width: drawW, height: drawH }
  }
  // contain：完整可见，按较小比率
  const ratio = Math.min(layout.containerWidth / layout.naturalWidth, layout.containerHeight / layout.naturalHeight) * scale
  const w = layout.naturalWidth * ratio
  const h = layout.naturalHeight * ratio
  return { x: (layout.containerWidth - w) / 2, y: (layout.containerHeight - h) / 2, width: w, height: h }
}

/** 显示坐标（容器内）→ 源像素坐标。clamp 到 [0, natural] 并取整。 */
export function displayedToSourceRect(rect: Rect, layout: ImageLayout): Rect {
  const img = displayedImageRect(layout)
  const ratioX = layout.naturalWidth / img.width
  const ratioY = layout.naturalHeight / img.height
  const x0 = clamp((rect.x - img.x) * ratioX, 0, layout.naturalWidth)
  const y0 = clamp((rect.y - img.y) * ratioY, 0, layout.naturalHeight)
  const x1 = clamp((rect.x + rect.width - img.x) * ratioX, 0, layout.naturalWidth)
  const y1 = clamp((rect.y + rect.height - img.y) * ratioY, 0, layout.naturalHeight)
  return clampSourceRect(
    { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) },
    layout.naturalWidth,
    layout.naturalHeight
  )
}

/** 源像素坐标 → 显示坐标（容器内），用于把已存矩形回显到 overlay。 */
export function sourceToDisplayedRect(rect: Rect, layout: ImageLayout): Rect {
  const img = displayedImageRect(layout)
  const ratioX = img.width / layout.naturalWidth
  const ratioY = img.height / layout.naturalHeight
  return {
    x: img.x + rect.x * ratioX,
    y: img.y + rect.y * ratioY,
    width: rect.width * ratioX,
    height: rect.height * ratioY
  }
}

/** 边界 clamp + 最小 1px + 取整（apply 前的最后防线）。 */
export function clampSourceRect(rect: Rect, naturalWidth: number, naturalHeight: number): Rect {
  const x = Math.round(clamp(rect.x, 0, naturalWidth - 1))
  const y = Math.round(clamp(rect.y, 0, naturalHeight - 1))
  const width = Math.round(clamp(rect.width, 1, naturalWidth - x))
  const height = Math.round(clamp(rect.height, 1, naturalHeight - y))
  return { x, y, width, height }
}

/** 比例锁：在保持中心与位置尽量不变的前提下约束 w/h 比（显示坐标系内使用）。 */
export function applyAspectLock(rect: Rect, aspect: number | null): Rect {
  if (!aspect || aspect <= 0) return rect
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  let width = rect.width
  let height = width / aspect
  if (height > rect.height) {
    height = rect.height
    width = height * aspect
  }
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
