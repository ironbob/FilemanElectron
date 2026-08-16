/**
 * Hex 字节级光标/选区模型（纯函数，可单测）。
 *
 * 模型定义：
 *   光标 cursor ≡ { offset, nibble, region } —— 字节偏移 + 半字节位
 *   （nibble 为 P0-2 nibble 编辑预留，本层移动恒置 0）+ 焦点区
 *   （hex / ascii 双向联动，编辑语义不同）。
 *   选区 ≡ (anchor, head) 字节闭区间；anchor === head 或任一为 null
 *   时无选区。head 即光标 offset（拖选/扩选移动 head，anchor 不动）。
 *
 * 不变量：一切输出钳制在 [0, size-1]；纯函数不抛异常（defensive_design）。
 * 每行字节数当前固定 BYTES_PER_ROW（P1 参数化时经 options 传入）。
 */

import { BYTES_PER_ROW } from './hexFormat'
import { clampOffset } from './hexViewport'

/** 焦点所在列（编辑时决定 nibble/整字节语义）。 */
export type HexRegion = 'hex' | 'ascii'

/** 半字节位：0 = 高 4 位，1 = 低 4 位。 */
export type HexNibble = 0 | 1

export interface HexCursor {
  offset: number
  nibble: HexNibble
  region: HexRegion
}

/** 键盘移动意图（View 键位 → 意图，本层只做几何换算）。 */
export type CursorMove =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'pageUp'
  | 'pageDown'
  | 'lineStart'
  | 'lineEnd'
  | 'fileStart'
  | 'fileEnd'

export interface CursorMoveOptions {
  /** 文件字节数（size=0 时光标恒为 0）。 */
  size: number
  /** 每行字节数（默认 16）。 */
  bytesPerRow?: number
  /** 翻页行数（默认 1 行 = 退化为按行）。 */
  pageRows?: number
}

/**
 * 自 offset 按移动意图换算目标偏移（全部钳制，越界收敛到边界字节）。
 * 不变量：结果 ∈ [0, size-1]；lineEnd 落在行内最后一个有效字节
 * （不足整行的尾行钳到 size-1）。
 */
export function cursorAfterMove(offset: number, move: CursorMove, options: CursorMoveOptions): number {
  const size = Math.max(0, options.size)
  if (size === 0) return 0
  const bpr = options.bytesPerRow ?? BYTES_PER_ROW
  const pageRows = Math.max(1, Math.floor(options.pageRows ?? 1))
  switch (move) {
    case 'left':
      return clampOffset(offset - 1, size)
    case 'right':
      return clampOffset(offset + 1, size)
    case 'up':
      return clampOffset(offset - bpr, size)
    case 'down':
      return clampOffset(offset + bpr, size)
    case 'pageUp':
      return clampOffset(offset - pageRows * bpr, size)
    case 'pageDown':
      return clampOffset(offset + pageRows * bpr, size)
    case 'lineStart':
      return clampOffset(Math.floor(offset / bpr) * bpr, size)
    case 'lineEnd':
      return clampOffset(Math.floor(offset / bpr) * bpr + (bpr - 1), size)
    case 'fileStart':
      return 0
    case 'fileEnd':
      return size - 1
    default:
      return clampOffset(offset, size)
  }
}

/** 规范化选区：闭区间 [start, end]，length 含两端；无选区返回 null。 */
export interface SelectionRange {
  start: number
  end: number
  length: number
}

/**
 * anchor/head → 规范选区。anchor 或 head 为 null、相等、或非有限数时
 * 均视为无选区（null，不抛异常）。start ≤ end 恒成立。
 */
export function selectionRange(anchor: number | null, head: number | null): SelectionRange | null {
  if (anchor === null || head === null) return null
  if (!Number.isFinite(anchor) || !Number.isFinite(head)) return null
  if (anchor === head) return null
  const start = Math.min(anchor, head)
  const end = Math.max(anchor, head)
  return { start, end, length: end - start + 1 }
}
