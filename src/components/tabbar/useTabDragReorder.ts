/**
 * 标签指针拖拽重排（document mousemove/mouseup 模式，参照 FileList 橡皮筋）
 *
 * 不用 HTML5 DnD：标签栏根上的 dragover/drop 已被「拖文件夹开新标签」占用，
 * 且 HTML5 拖拽无法做插入指示条的逐像素跟手。
 *
 * 交互契约：4px 阈值防误拖；仅主键；起于 关闭钮/重命名输入 不启动；
 * 拖拽后抑制一次 click（防止落点触发切换）；非固定标签不可拖入 pinned 区
 * （insertIndex 钳制 + store 侧 partitionByPinned 兜底）。
 */

import { reactive } from 'vue'

export interface DragReorderState {
  active: boolean
  /** 插入指示条渲染在哪个标签之前（= 原数组的间隙位置，可为 length）。 */
  insertIndex: number
}

export interface UseTabDragReorderOptions {
  /** 滚动容器（边缘自动滚动 + 量取标签矩形）。 */
  scroller: () => HTMLElement | null
  /** 落点提交。参数为原索引与目标索引（已按 splice 语义换算）。 */
  onReorder: (fromIndex: number, toIndex: number) => void
  /** pinned 标签数（insertIndex 下限）。 */
  pinnedCount: () => number
}

/** 拖拽后是否应吞掉紧随的 click（AppTabBar 在 select 处理器里消费）。 */
export function useTabDragReorder(options: UseTabDragReorderOptions) {
  const dragState = reactive<DragReorderState>({ active: false, insertIndex: -1 })
  let suppressClick = false

  let fromIndex = -1
  let started = false
  let startX = 0
  let startY = 0
  let lastX = 0
  const DRAG_THRESHOLD = 4

  function tabElements(): HTMLElement[] {
    const root = options.scroller()
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>('.tab-item'))
  }

  /** 计算指针 x 落在哪个间隙：遍历标签中点；精确落在某标签正中（±2px）= 与其换位。 */
  function insertIndexAt(x: number, excludeIndex: number): number {
    const els = tabElements()
    // 正中落点（测试/精确操作常见）：向右拖 → 插到该标签之后；向左拖 → 之前
    for (let i = 0; i < els.length; i++) {
      if (i === excludeIndex) continue
      const rect = els[i].getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (Math.abs(x - mid) < 2) {
        const index = excludeIndex < i ? i + 1 : i
        return Math.max(options.pinnedCount(), index)
      }
    }
    let index = els.length
    for (let i = 0; i < els.length; i++) {
      if (i === excludeIndex) continue
      const rect = els[i].getBoundingClientRect()
      if (x < rect.left + rect.width / 2) {
        index = i
        break
      }
    }
    // 非固定标签不可越过 pinned 边界
    return Math.max(options.pinnedCount(), index)
  }

  function edgeAutoScroll(x: number) {
    const root = options.scroller()
    if (!root) return
    const rect = root.getBoundingClientRect()
    const EDGE = 36
    const SPEED = 10
    if (x < rect.left + EDGE) root.scrollLeft -= SPEED
    else if (x > rect.right - EDGE) root.scrollLeft += SPEED
  }

  function onPointerMove(e: MouseEvent) {
    if (!started) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return
      started = true
      dragState.active = true
      dragState.insertIndex = fromIndex
    }
    lastX = e.clientX
    dragState.insertIndex = insertIndexAt(lastX, fromIndex)
    edgeAutoScroll(lastX)
  }

  function onPointerUp() {
    document.removeEventListener('mousemove', onPointerMove)
    document.removeEventListener('mouseup', onPointerUp)
    if (started) {
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 0)
      const to = dragState.insertIndex
      if (to >= 0 && to !== fromIndex) {
        // splice 语义：向右移时目标位随删除前移一位
        const target = to > fromIndex ? to - 1 : to
        options.onReorder(fromIndex, target)
      }
    }
    started = false
    dragState.active = false
    dragState.insertIndex = -1
    fromIndex = -1
  }

  /** 挂在 TabItem 根上的 pointerdown。 */
  function onTabPointerDown(e: PointerEvent, index: number): void {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, input')) return
    fromIndex = index
    started = false
    startX = e.clientX
    startY = e.clientY
    document.addEventListener('mousemove', onPointerMove)
    document.addEventListener('mouseup', onPointerUp)
  }

  /** select 处理器先查此函数，true 则跳过本次切换。 */
  function shouldSuppressClick(): boolean {
    return suppressClick
  }

  return { dragState, onTabPointerDown, shouldSuppressClick }
}
