<script setup lang="ts">
/**
 * FinderContextMenu 的递归菜单列表节点。
 *
 * 一次渲染一个层级的 items；item 带 children 且处于打开路径时，在其内部
 * 渲染下一层 FinderMenuNode（SFC 允许以自身文件名隐式自引用实现递归）。
 *
 * 交互模型（NSMenu 语义）：
 * - 高亮 = 悬停 = 键盘焦点，三者共用根组件里的 highlight 路径（number[]），
 *   mouseenter 只是把 highlight 移到该项（emit('hover', path)）。
 * - 某项的子菜单是否展开由「highlight 是否落在该项或其内部」推导，
 *   因此悬停父项 → 子菜单展开 → 深入子菜单，父链全程保持展开。
 */
import type { FinderMenuItem } from './FinderContextMenu.vue'
import { GLYPHS } from '../icons/glyphs'

defineProps<{
  items: FinderMenuItem[]
  /** 根组件持有的绝对高亮路径（逐级索引）；null = 无高亮 */
  hl: number[] | null
  /** ← 收起覆盖：该路径上的子菜单保持收起（高亮仍可在其父项上） */
  suppress: number[] | null
  /** 本节点在菜单树中的路径前缀（顶层为 []） */
  pathPrefix: number[]
}>()

const emit = defineEmits<{
  /** 高亮移动到 path（悬停或键盘导航） */
  hover: [path: number[]]
  /** 激活一个无子菜单的叶子项 */
  activate: [item: FinderMenuItem]
}>()

/** 该项的子菜单是否展开：highlight 落在它自身或其后代上，且未被 ← 收起覆盖。 */
function isSubmenuOpen(hl: number[] | null, suppress: number[] | null, path: number[]): boolean {
  if (!hl || hl.length < path.length) return false
  if (suppress && suppress.length === path.length && path.every((seg, i) => suppress[i] === seg)) return false
  return path.every((seg, i) => hl[i] === seg)
}

function isHighlighted(hl: number[] | null, path: number[]): boolean {
  if (!hl || hl.length !== path.length) return false
  return path.every((seg, i) => hl[i] === seg)
}

function onItemEnter(path: number[]): void {
  emit('hover', path)
}

function onItemClick(item: FinderMenuItem, path: number[]): void {
  if (item.disabled) return
  // 带子菜单的父项：点击 = 展开（导航交给 hover/键盘），不触发动作
  if (item.children && item.children.length > 0) {
    emit('hover', path)
    return
  }
  emit('activate', item)
}

/**
 * 子菜单垂直防裁剪（函数 ref，v-if 重挂载自然复位）：默认顶部对齐父项所在行
 * （top: -6px），挂载后测量——底部溢出视口则整层上移；高于视口时压缩 + 内滚。
 * 视口系计算不受层级影响（祖先链 teleported 后均为视口坐标）。
 */
function clampSubmenuRef(el: unknown): void {
  const node = el as HTMLElement | null
  if (!node) return
  requestAnimationFrame(() => {
    const rect = node.getBoundingClientRect()
    if (rect.height === 0) return
    let delta = 0
    if (rect.bottom > window.innerHeight - 8) delta = rect.bottom - (window.innerHeight - 8)
    if (rect.top - delta < 8) delta = rect.top - 8
    if (delta !== 0) node.style.top = `${node.offsetTop - delta}px`
    if (rect.height > window.innerHeight - 16) {
      node.style.maxHeight = `${window.innerHeight - 16}px`
      node.style.overflowY = 'auto'
    }
  })
}
</script>

<template>
  <template v-for="(item, i) in items" :key="`${pathPrefix.join('.')}.${i}.${item.action}`">
    <!-- 语义组分隔线：左右缩进与文字列对齐 -->
    <div v-if="item.action === '__divider__'" class="context-menu-separator" role="separator" />

    <div
      v-else
      class="context-menu-item"
      :class="{
        disabled: item.disabled,
        'has-submenu': !!(item.children && item.children.length > 0),
        highlighted: isHighlighted(hl, [...pathPrefix, i]),
      }"
      role="menuitem"
      :aria-disabled="item.disabled || undefined"
      :aria-haspopup="item.children && item.children.length > 0 ? 'menu' : undefined"
      :title="item.label"
      @mouseenter="onItemEnter([...pathPrefix, i])"
      @click="onItemClick(item, [...pathPrefix, i])"
    >
      <!-- 图标列（无图标也占位，保持三列对齐体系）；swatch = 实心色点（颜色标记色板） -->
      <span class="menu-icon">
        <span v-if="item.swatch" class="menu-swatch" :style="{ backgroundColor: item.swatch }" />
        <svg v-else-if="item.icon && GLYPHS[item.icon]" viewBox="0 0 24 24" aria-hidden="true" v-html="GLYPHS[item.icon]" />
      </span>
      <!-- 文本列 -->
      <span class="menu-label">{{ item.label }}</span>
      <!-- 快捷键 / 子菜单箭头列 -->
      <span v-if="item.shortcut && !(item.children && item.children.length > 0)" class="menu-shortcut">{{ item.shortcut }}</span>
      <svg
        v-if="item.children && item.children.length > 0"
        class="menu-chevron"
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <!-- 递归子菜单：仅在展开路径上渲染（未展开不占 DOM，避免隐藏层误命中） -->
      <div
        v-if="item.children && item.children.length > 0 && isSubmenuOpen(hl, suppress, [...pathPrefix, i])"
        :ref="clampSubmenuRef"
        class="context-submenu"
        role="menu"
      >
        <FinderMenuNode
          :items="item.children"
          :hl="hl"
          :suppress="suppress"
          :path-prefix="[...pathPrefix, i]"
          @hover="p => emit('hover', p)"
          @activate="it => emit('activate', it)"
        />
      </div>
    </div>
  </template>
</template>

<style scoped>
/* ── 菜单项：28px 行高、图标/文本/快捷键三列对齐 ─────────────────────────── */
.context-menu-item {
  position: relative;            /* 子菜单的定位基准 */
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px 0 10px;
  font-size: 14px;
  line-height: 1;
  color: var(--menu-text);
  cursor: default;
  user-select: none;
  white-space: nowrap;
  /* 全局 style.css 的 .context-menu-item 带 0.15s 背景过渡（标签栏菜单在用，
     不能删）；NSMenu 高亮是即时的，这里显式关掉——也避免过渡中间帧被
     e2e computed 采样成半透明色 */
  transition: none;
}

/* 整行可点击；悬停 = 键盘焦点共用系统蓝底白字选中态（与列表 Finder 选中同语言） */
.context-menu-item.highlighted:not(.disabled) {
  background-color: var(--menu-item-active-bg);
  color: var(--menu-item-active-text);
}

.context-menu-item.highlighted:not(.disabled) .menu-icon {
  color: var(--menu-item-active-icon);
}

.context-menu-item.highlighted:not(.disabled) .menu-shortcut,
.context-menu-item.highlighted:not(.disabled) .menu-chevron {
  color: var(--menu-item-active-shortcut);
}

.context-menu-item.disabled {
  opacity: 0.35;
}

/* 图标列：统一 16px 单色线性图标，无图标时占位保持文本列起点稳定 */
.menu-icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  color: var(--menu-icon);
  display: inline-flex;
}

.menu-icon svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 24 网格字形在 16px 显示：non-scaling-stroke 保持 1.5px 光学粗细，与全应用一致 */
.menu-icon svg :deep(*) {
  vector-effect: non-scaling-stroke;
}

/* 色板实心圆点：居中占满图标列（10px，不随高亮变白） */
.menu-swatch {
  width: 10px;
  height: 10px;
  margin: auto;
  border-radius: 9999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08); /* 深底色上的发丝描边 */
}

/* 文本列：超宽截断（菜单宽度钳制在 224px 内） */
.menu-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 快捷键列：12px、更浅的系统灰、右对齐 */
.menu-shortcut {
  flex: none;
  margin-left: 16px;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--menu-shortcut);
}

.menu-chevron {
  flex: none;
  width: 11px;
  height: 11px;
  margin-left: 10px;
  color: var(--menu-shortcut);
}

/* ── 分隔线：浅灰细线，左侧与文本列对齐、右侧收至快捷键列 ───────────────── */
.context-menu-separator {
  height: 1px;
  margin: 5px 12px 5px 34px;   /* 34 = 左内边距10 + 图标16 + 间距8 */
  background-color: var(--menu-separator);
}

/* ── 子菜单浮层：与主菜单同一种 NSMenu 表面 ──────────────────────────────── */
.context-submenu {
  position: absolute;
  /* 与父项有 6px 重叠：鼠标横穿无死区；顶部对齐父项所在行 */
  left: calc(100% - 6px);
  top: -6px;                    /* 抵消父级菜单容器的 5px 内边距 + 1px 边框 */
  z-index: 1;
  display: block;
  min-width: 208px;
  max-width: 224px;
  width: max-content;
  box-sizing: border-box;
  padding: 5px 0;
  border-radius: 12px;
  background-color: var(--menu-bg);
  border: 1px solid var(--menu-border);
  box-shadow: var(--menu-shadow);
  -webkit-backdrop-filter: blur(28px) saturate(1.8);
  backdrop-filter: blur(28px) saturate(1.8);
}

/* 主菜单贴近视口右边缘时，所有层级子菜单一律向左弹出（类名挂在根上，级联生效） */
:global(.context-menu-flipped) .context-submenu {
  left: auto;
  right: calc(100% - 6px);
}
</style>
