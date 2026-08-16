/**
 * Squarified treemap 布局（纯函数，可单测）。
 *
 * Bruls / Huizing / van Wijk 经典算法：按值降序逐条放入当前矩形，
 * 每步贪心收集一行并沿短边布置，选择使「最差纵横比」最小的行构成。
 * 关键点：每行的厚度相对「剩余值总量」与「剩余矩形」计算（不是全局
 * 总量——这是面积守恒的常见错误源）。
 */

export interface TreemapInput {
  key: string
  value: number
}

export interface TreemapRect {
  key: string
  value: number
  x: number
  y: number
  w: number
  h: number
}

interface Slice {
  key: string
  value: number
}

export function squarify(items: TreemapInput[], width: number, height: number): TreemapRect[] {
  const valid = items.filter(item => item.value > 0 && Number.isFinite(item.value))
  if (width <= 0 || height <= 0 || valid.length === 0) return []
  const sorted = [...valid].sort((a, b) => b.value - a.value)

  const rects: TreemapRect[] = []
  let remaining: Slice[] = sorted.map(item => ({ key: item.key, value: item.value }))
  let x = 0
  let y = 0
  let w = width
  let h = height

  while (remaining.length > 0) {
    const horizontal = w >= h // 沿短边切
    const span = horizontal ? w : h   // 行的厚度方向
    const shorter = horizontal ? h : w // 行内条目的延展方向

    const remainingTotal = remaining.reduce((sum, slice) => sum + slice.value, 0)

    // 贪心收集一行：逐个加入并检查最差纵横比是否改善
    let row: Slice[] = []
    let rowSum = 0
    let best = Infinity
    for (const slice of remaining) {
      const candidateSum = rowSum + slice.value
      const thickness = (candidateSum / remainingTotal) * span
      const worst = worstAspectRatio(remaining.slice(0, row.length + 1), candidateSum, thickness, shorter)
      if (row.length === 0 || worst <= best) {
        row = remaining.slice(0, row.length + 1)
        rowSum = candidateSum
        best = worst
      } else {
        break
      }
    }

    // 布置该行（厚度按剩余总量归一）
    const thickness = (rowSum / remainingTotal) * span
    let offset = 0
    for (const slice of row) {
      const extent = (slice.value / rowSum) * shorter
      if (horizontal) {
        rects.push({ key: slice.key, value: slice.value, x, y: y + offset, w: thickness, h: extent })
      } else {
        rects.push({ key: slice.key, value: slice.value, x: x + offset, y, w: extent, h: thickness })
      }
      offset += extent
    }

    // 收缩剩余矩形（浮点残差吸收：厚度直接扣，剩余量自然对齐）
    if (horizontal) {
      x += thickness
      w -= thickness
    } else {
      y += thickness
      h -= thickness
    }
    remaining = remaining.slice(row.length)
  }
  return rects
}

function worstAspectRatio(row: Slice[], rowSum: number, thickness: number, shorter: number): number {
  if (thickness <= 0 || rowSum <= 0) return Infinity
  let worst = 0
  for (const slice of row) {
    const extent = (slice.value / rowSum) * shorter
    if (extent <= 0) continue
    const ratio = Math.max(thickness / extent, extent / thickness)
    if (ratio > worst) worst = ratio
  }
  return worst
}
