import { BYTES_PER_ROW } from './hexFormat'

/**
 * Hex 视口坐标系（纯函数，可单测）—— 全文件虚拟滚动的唯一换算点。
 *
 * 坐标系定义（变更需同步渲染层行高）：
 *   row ≡ ⌊offset / BYTES_PER_ROW⌋
 *   top ≡ row × ROW_HEIGHT
 * 一切输出钳制在 [0, totalRows)，非法输入（负数/NaN）按钳制规则收敛，
 * 纯函数不抛异常（defensive_design）。
 */
export const ROW_HEIGHT = 22

/** 可视区两侧额外渲染的缓冲行数（预取滚动余量）。 */
export const OVERSCAN_ROWS = 24

/** 字节偏移 → 行号（0 基）。 */
export function offsetToRow(offset: number): number {
  if (!Number.isFinite(offset) || offset < 0) return 0
  return Math.floor(offset / BYTES_PER_ROW)
}

/** 行号 → 行首字节偏移。 */
export function rowToOffset(row: number): number {
  if (!Number.isFinite(row) || row < 0) return 0
  return row * BYTES_PER_ROW
}

/** 行号 → 绝对定位 top（px）。 */
export function rowTop(row: number): number {
  if (!Number.isFinite(row) || row < 0) return 0
  return row * ROW_HEIGHT
}

/** 偏移钳制到 [0, size-1]（size=0 返回 0）。 */
export function clampOffset(offset: number, size: number): number {
  if (!Number.isFinite(offset) || offset < 0) return 0
  return Math.min(offset, Math.max(size - 1, 0))
}

/** 行号钳制到 [0, totalRows-1]（totalRows=0 返回 0）。 */
export function clampRow(row: number, totalRows: number): number {
  if (!Number.isFinite(row) || row < 0) return 0
  return Math.min(row, Math.max(totalRows - 1, 0))
}

export interface RowRange {
  /** 可视首行（含）。 */
  first: number
  /** 可视末行（含）。 */
  last: number
  /** 渲染缓冲首行（含，= first - overscan）。 */
  bufferFirst: number
  /** 渲染缓冲末行（含，= last + overscan）。 */
  bufferLast: number
}

/**
 * 滚动位置 → 可视行区间（含 overscan 缓冲）。
 * 不变量：buffer 区间覆盖可视区间；全部钳在 [0, totalRows)。
 */
export function visibleRowRange(
  scrollTop: number,
  viewportHeight: number,
  totalRows: number,
  overscan: number = OVERSCAN_ROWS
): RowRange {
  const safeTop = Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0
  if (totalRows <= 0) {
    return { first: 0, last: 0, bufferFirst: 0, bufferLast: 0 }
  }
  const first = clampRow(Math.floor(safeTop / ROW_HEIGHT), totalRows)
  const last = clampRow(Math.max(first, Math.ceil((safeTop + safeHeight) / ROW_HEIGHT) - 1), totalRows)
  return {
    first,
    last,
    bufferFirst: clampRow(first - overscan, totalRows),
    bufferLast: clampRow(last + overscan, totalRows)
  }
}

/** 跳转定位：让目标行居中所需的 scrollTop。 */
export function scrollTopToCenter(row: number, viewportHeight: number): number {
  const center = rowTop(row) + ROW_HEIGHT / 2 - viewportHeight / 2
  return Number.isFinite(center) && center > 0 ? center : 0
}
