<script lang="ts">
/**
 * 菜单项模型。action === '__divider__' 渲染为语义组分隔线（无图标/快捷键）。
 * icon 取 FinderMenuNode 的 ICONS 键名；children 非空即子菜单（可任意嵌套）。
 */
export interface FinderMenuItem {
  label: string
  action: string
  shortcut?: string
  disabled?: boolean
  icon?: string
  children?: FinderMenuItem[]
}
</script>

<script setup lang="ts">
/**
 * Finder 风格右键菜单（NSMenu 视觉/交互语言）。
 *
 * 职责划分：
 * - 本组件（根）：浮层定位与视口钳制、子菜单左右翻转、键盘导航状态机；
 * - FinderMenuNode：递归渲染菜单项/分隔线/子菜单（三列对齐、图标、悬停高亮）。
 *
 * 高亮模型：hover 与键盘焦点共用同一个 highlight 路径（逐级索引数组）。
 * 悬停某项 = 把 highlight 移过去；子菜单是否展开由「highlight 是否落在该项
 * 或其后代」推导——与 NSMenu 的悬停/键盘行为一致。
 *
 * 键盘（经 useKeyInterceptor 捕获阶段消费，菜单打开时优先于 App/FileList）：
 * ↑↓ 同层移动（跳过分隔线与禁用项）· → 展开并进入子菜单 · ← 收起当前层
 * · Enter 激活（父项则进入子菜单）· Esc 关闭整个菜单。
 */
import { ref, watch, onMounted, nextTick } from 'vue'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import FinderMenuNode from './FinderMenuNode.vue'

const props = defineProps<{
  items: FinderMenuItem[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  /** 激活叶子菜单项（action 原样上抛，由宿主分发） */
  select: [action: string]
  /** 请求关闭整个菜单（Esc） */
  close: []
}>()

// 存续期间放行标题栏拖拽区（v-if 挂载即打开；宿主的外点关闭同样收不到标题栏点击）
useAppDragSuspend()

// ── 定位：渲染后测量实际尺寸，钳制在视口内；右侧空间不足时子菜单向左弹 ──────
const rootEl = ref<HTMLElement | null>(null)
const left = ref(props.x)
const top = ref(props.y)
const flipped = ref(false)

const VIEWPORT_MARGIN = 8
const SUBMENU_RESERVE = 200 // 子菜单最小宽度 + 余量

async function clampToViewport(): Promise<void> {
  await nextTick()
  const el = rootEl.value
  if (!el) return
  // 尺寸取 offsetWidth/offsetHeight（布局尺寸）：menu-pop 入场动画带 scale 变换，
  // 此刻 getBoundingClientRect 量到的是缩放中间态，会让底部钳制差出几个像素
  const w = el.offsetWidth
  const h = el.offsetHeight
  flipped.value = window.innerWidth - (left.value + w) < SUBMENU_RESERVE
  if (left.value < VIEWPORT_MARGIN || left.value + w > window.innerWidth - VIEWPORT_MARGIN) {
    left.value = Math.max(VIEWPORT_MARGIN, Math.min(left.value, window.innerWidth - w - VIEWPORT_MARGIN))
  }
  if (top.value < VIEWPORT_MARGIN || top.value + h > window.innerHeight - VIEWPORT_MARGIN) {
    top.value = Math.max(VIEWPORT_MARGIN, Math.min(top.value, window.innerHeight - h - VIEWPORT_MARGIN))
    // 菜单比视口还高（极矮窗口）：顶部对齐并压缩 + 内滚，而非溢出裁剪
    if (top.value + h > window.innerHeight - VIEWPORT_MARGIN) {
      top.value = VIEWPORT_MARGIN
      el.style.maxHeight = `${window.innerHeight - VIEWPORT_MARGIN * 2}px`
      el.style.overflowY = 'auto'
    }
  }
}

onMounted(() => { void clampToViewport() })

// ── 高亮路径导航 ────────────────────────────────────────────────────────────
const highlight = ref<number[] | null>(null)
// ← 收起的层级：子菜单展开默认由「highlight 落在父项或其内部」推导（悬停父项
// 即展开），但 ← 要求高亮退回父项的同时收起该层 —— 用显式覆盖位区分这两种
// 「高亮在父项上」的状态；任何悬停/键盘移动都会清掉它。
const suppressedAt = ref<number[] | null>(null)

// items 异步重建（如「打开方式」应用列表回填）后重置高亮并重新钳制
watch(() => props.items, () => {
  highlight.value = null
  suppressedAt.value = null
  void clampToViewport()
})

function itemAt(path: number[]): FinderMenuItem | null {
  let list: FinderMenuItem[] | undefined = props.items
  let item: FinderMenuItem | null = null
  for (const i of path) {
    if (!list || i < 0 || i >= list.length) return null
    item = list[i]
    list = item.children
  }
  return item
}

function navigable(item: FinderMenuItem): boolean {
  return item.action !== '__divider__' && !item.disabled
}

function stepIndex(list: FinderMenuItem[], dir: 1 | -1): number {
  if (dir === 1) return list.findIndex(navigable)
  for (let i = list.length - 1; i >= 0; i--) if (navigable(list[i])) return i
  return -1
}

/** ↑↓：在 highlight 所在层级内移动（无高亮时从首/末项开始）。 */
function moveVertically(dir: 1 | -1): void {
  const base = highlight.value
  if (!base) {
    const idx = stepIndex(props.items, dir)
    if (idx >= 0) highlight.value = [idx]
    return
  }
  const parent = base.slice(0, -1)
  const siblings = parent.length === 0 ? props.items : (itemAt(parent)?.children ?? [])
  if (siblings.length === 0) return
  let i = base[base.length - 1]
  for (let step = 0; step < siblings.length; step++) {
    i = (i + dir + siblings.length) % siblings.length
    if (navigable(siblings[i])) {
      highlight.value = [...parent, i]
      suppressedAt.value = null
      return
    }
  }
}

/** →：展开当前项的子菜单并把高亮移入第一个可导航项。 */
function openSubmenu(): void {
  const path = highlight.value
  if (!path) return
  const cur = itemAt(path)
  if (!cur?.children?.length) return
  const idx = stepIndex(cur.children, 1)
  if (idx >= 0) {
    highlight.value = [...path, idx]
    suppressedAt.value = null
  }
}

/** ←：收起当前层，高亮退回父项（父项保持高亮但子菜单收起）。 */
function closeLevel(): void {
  if (highlight.value && highlight.value.length > 1) {
    highlight.value = highlight.value.slice(0, -1)
    suppressedAt.value = [...highlight.value]
  }
}

/** Enter：叶子项激活；父项进入子菜单。 */
function activateCurrent(): void {
  const cur = highlight.value ? itemAt(highlight.value) : null
  if (!cur) return
  if (cur.children && cur.children.length > 0) {
    openSubmenu()
    return
  }
  if (!navigable(cur)) return
  emit('select', cur.action)
}

useKeyInterceptor((event: KeyboardEvent): boolean => {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveVertically(1)
      return true
    case 'ArrowUp':
      event.preventDefault()
      moveVertically(-1)
      return true
    case 'ArrowRight':
      event.preventDefault()
      openSubmenu()
      return true
    case 'ArrowLeft':
      event.preventDefault()
      closeLevel()
      return true
    case 'Enter':
      event.preventDefault()
      activateCurrent()
      return true
    case 'Escape':
      event.preventDefault()
      emit('close')
      return true
    default:
      return false
  }
})

function onHover(path: number[]): void {
  highlight.value = path
  suppressedAt.value = null
}

function onActivate(item: FinderMenuItem): void {
  emit('select', item.action)
}
</script>

<template>
  <!-- Teleport 到 shell 级浮层层：脱离宿主组件树的 overflow-hidden 祖先与
       backdrop-filter/container-type 包含块（TabContextMenu 在标题栏 backdrop-filter
       内、面包屑菜单在工具栏容器旁——fixed 坐标恒为视口系，不再依赖巧合） -->
  <Teleport to="#popover-layer">
    <div
      ref="rootEl"
      class="context-menu"
      :class="{ 'context-menu-flipped': flipped }"
      :style="{ left: left + 'px', top: top + 'px' }"
      role="menu"
      aria-orientation="vertical"
      @click.stop
      @contextmenu.prevent
    >
      <FinderMenuNode :items="items" :hl="highlight" :suppress="suppressedAt" :path-prefix="[]" @hover="onHover" @activate="onActivate" />
    </div>
  </Teleport>
</template>

<style scoped>
/* ── NSMenu 浮层表面：半透明 + backdrop blur、1px 细边界、柔和扩散阴影 ────── */
.context-menu {
  position: fixed;
  z-index: 50;
  min-width: 208px;      /* Finder 密度：菜单宽度 208–224px，随最长文案自适应 */
  max-width: 224px;
  width: max-content;
  box-sizing: border-box;
  padding: 5px 0;        /* 顶部/底部克制的内边距 */
  border-radius: 12px;
  background-color: var(--menu-bg);
  border: 1px solid var(--menu-border);
  box-shadow: var(--menu-shadow);
  -webkit-backdrop-filter: blur(28px) saturate(1.8);
  backdrop-filter: blur(28px) saturate(1.8);
  animation: menu-pop 0.09s ease-out;
  transform-origin: top left;
}

@keyframes menu-pop {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
