<script lang="ts">
/**
 * 锚点定位弹出层（下拉菜单防裁剪统一范式，2026-08-19）。
 *
 * 三个职责：
 * 1. Teleport 到 #popover-layer（.finder-shell 内、一切 overflow-hidden 与
 *    backdrop-filter / container-type / transform 包含块之外）——Quick Look 卡片、
 *    工具栏容器不再裁剪弹层，fixed 坐标恒为视口系；
 * 2. 锚点 rect + 自身测量定位：默认锚点下方弹出，下方视口余量不足时翻转到上方；
 * 3. 视口钳制：水平方向 clamp 在视口内；两侧都放不下时压缩高度 + 内部滚动。
 *
 * 宿主约定：v-if 控制开合（挂载即定位）；class / data-testid 等 attrs 透传到根
 * 元素（如 class="text-menu-popover" 的视觉样式照旧，定位被内联 fixed 覆盖）。
 * 高度可变的菜单建议自带 max-h + overflow-auto，翻转判定按压缩后的高度计算。
 */
const liveEls = new Set<HTMLElement>()

/**
 * 外点关闭判定：目标是否落在任一存续的锚定弹层内。
 * Teleport 后弹层不在宿主组件子树内，宿主的 rootEl.contains 判定必须补上它，
 * 否则点菜单内容会被误判为外点直接收起（capture 阶段监听拦不住）。
 */
export function isInsideAnchoredPopover(node: Node | null | undefined): boolean {
  if (!node) return false
  for (const el of liveEls) {
    if (el.contains(node)) return true
  }
  return false
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs } from 'vue'

// 组件根是 Teleport：fallthrough attrs（class/data-testid/aria-*）不会自动落到
// 内部定位 div，必须显式透传——否则宿主类名（text-menu-popover 等）丢失
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const props = withDefaults(defineProps<{
  /** 锚点元素（触发按钮或其定位容器）；null 时内容不显示 */
  anchor: HTMLElement | null
  /** 水平对齐：left = 弹层左缘对锚点左缘；right = 右缘对右缘（右缘按钮用） */
  align?: 'left' | 'right'
  /** 与锚点的间距（px） */
  gap?: number
  /** 视口安全边距（px） */
  margin?: number
}>(), {
  align: 'left',
  gap: 6,
  margin: 8
})

const rootEl = ref<HTMLElement | null>(null)
const placed = ref(false)
const pos = ref<{ left: number; top: number; maxHeight?: number }>({ left: 0, top: 0 })

/** 首次定位完成前隐藏，避免闪现一帧；left/top 由 place() 写入 pos。 */
const menuStyle = computed(() => ({
  visibility: placed.value ? 'visible' : 'hidden',
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  maxHeight: pos.value.maxHeight !== undefined ? `${Math.max(pos.value.maxHeight, 80)}px` : undefined,
  overflowY: pos.value.maxHeight !== undefined ? 'auto' : undefined
}))

let resizeObserver: ResizeObserver | null = null

async function place(): Promise<void> {
  await nextTick()
  const el = rootEl.value
  const anchor = props.anchor
  if (!el || !anchor) return
  const a = anchor.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight

  // 水平：对齐锚点后钳制在视口内
  let left = props.align === 'right' ? a.right - w : a.left
  left = Math.max(props.margin, Math.min(left, window.innerWidth - w - props.margin))

  // 垂直：默认锚点下方；溢出时优先翻转向上，两侧都放不下则取空间大的一侧压缩
  let top = a.bottom + props.gap
  let maxHeight: number | undefined
  const viewportBottom = window.innerHeight - props.margin
  if (top + h > viewportBottom) {
    const flippedTop = a.top - props.gap - h
    if (flippedTop >= props.margin) {
      top = flippedTop
    } else {
      const spaceBelow = viewportBottom - top
      const spaceAbove = a.top - props.gap - props.margin
      if (spaceAbove > spaceBelow) {
        top = props.margin
        maxHeight = spaceAbove
      } else {
        maxHeight = Math.max(spaceBelow, 0)
      }
    }
  }

  pos.value = { left: Math.round(left), top: Math.round(top), maxHeight }
  placed.value = true
}

onMounted(() => {
  if (rootEl.value) liveEls.add(rootEl.value)
  void place()
  // 内容高度变化（异步回填/条件行）后重定位——place 幂等，无 RO 回环
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(() => { void place() })
    resizeObserver.observe(rootEl.value)
  }
  // 窗口缩放：锚点 rect 随之移动（RO 只看尺寸不看位置），重定位
  window.addEventListener('resize', onWindowResize)
})

function onWindowResize(): void {
  void place()
}

onBeforeUnmount(() => {
  if (rootEl.value) liveEls.delete(rootEl.value)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <Teleport to="#popover-layer">
    <div
      ref="rootEl"
      v-bind="attrs"
      :style="menuStyle"
      style="position: fixed"
    >
      <slot />
    </div>
  </Teleport>
</template>
