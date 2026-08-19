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

/**
 * 16px 单色线性图标集（stroke 1.5 / round，viewBox 0 0 16 16）。
 * 值为 <svg> 内部标记，经 v-html 注入；描边颜色走 currentColor。
 */
const ICONS: Record<string, string> = {
  // 打开：方框 + 右上出界箭头
  open: '<path d="M6.5 3.5H4.2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V9.2"/><path d="M9.8 2.5h3.7v3.7"/><path d="M13.5 2.5 7.8 8.2"/>',
  // 移到废纸篓
  trash: '<path d="M3 4.7h10"/><path d="M6.4 4.7V3.4a.9.9 0 0 1 .9-.9h1.4a.9.9 0 0 1 .9.9v1.3"/><path d="M4.6 4.7l.5 7.6a1.1 1.1 0 0 0 1.1 1h3.6a1.1 1.1 0 0 0 1.1-1l.5-7.6"/><path d="M6.7 7.2v3.6M9.3 7.2v3.6"/>',
  // 显示简介
  info: '<circle cx="8" cy="8" r="5.6"/><path d="M8 7.4v3.2"/><path d="M8 5.1v.05"/>',
  // 重新命名
  rename: '<path d="M10.1 3.4l2.5 2.5L6.4 12l-3 .6.6-3z"/><path d="M8.9 4.6l2.5 2.5"/>',
  // 批量重命名：列表 + 笔
  batchRename: '<path d="M2.5 4.3h6.2M2.5 7.6h5M2.5 11h3.4"/><path d="M9.9 9.1l3.1-3.1 1.4 1.4-3.1 3.1-1.8.4z"/>',
  // 压缩"…"：箱体 + 向下压入箭头
  compress: '<path d="M2 6.2v6a1.2 1.2 0 0 0 1.2 1.2h9.6a1.2 1.2 0 0 0 1.2-1.2v-6"/><path d="M1.2 3h13.6v3.2H1.2z"/><path d="M8 8.4v3.2M6.5 10.1 8 11.6l1.5-1.5"/>',
  // 解压：箱体 + 向上取出箭头
  extract: '<path d="M3 6.6v5.6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.6"/><path d="M8 11V4.6M5.8 6.8 8 4.6l2.2 2.2"/>',
  // 拷贝：双层文档
  copy: '<rect x="5.6" y="5.6" width="7.9" height="7.9" rx="1.2"/><path d="M10.4 5.6V3.6a1.2 1.2 0 0 0-1.2-1.2H3.6a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h2"/>',
  // 剪切
  cut: '<circle cx="3.7" cy="4.6" r="1.5"/><circle cx="3.7" cy="11.4" r="1.5"/><path d="M5 5.6 13 12.4M5 10.4 13 3.6"/>',
  // 制作替身：锚点方块 + 弯出箭头
  alias: '<rect x="2.2" y="10.6" width="3.2" height="3.2" rx=".6"/><path d="M5.4 10.6C5.4 6.6 7.8 4.2 12 4.2h1.6"/><path d="M11.3 2l2.5 2.2-2.5 2.2"/>',
  // 快速查看
  quickLook: '<path d="M1.8 8S4.1 4 8 4s6.2 4 6.2 4-2.3 4-6.2 4S1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.7"/>',
  // 终端
  terminal: '<rect x="2" y="3.2" width="12" height="9.6" rx="1.3"/><path d="M4.6 6.4l2 2-2 2"/><path d="M8 10.4h3.2"/>',
  // 十六进制
  hex: '<path d="M8 1.8l5.3 3.1v6.2L8 14.2l-5.3-3.1V4.9z"/><path d="M6 6.4h4M6 9.2h2.6"/>',
  // 校验和：盾 + 对勾
  checksum: '<path d="M8 1.8l4.6 1.9v3.5c0 3-1.9 5.3-4.6 6.2-2.7-.9-4.6-3.2-4.6-6.2V3.7z"/><path d="M6 7.9l1.4 1.4 2.6-2.8"/>',
  // 单选选中态（网格规格等 radio 组的当前项）
  check: '<path d="M3.2 8.3l3 3 6.6-7"/>',
  // 对比目录：左右两栏
  compare: '<rect x="2.2" y="3.4" width="5" height="9.2" rx="1"/><rect x="8.8" y="3.4" width="5" height="9.2" rx="1"/>',
  // 收藏
  star: '<path d="M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9L2.4 6.3l3.9-.5z"/>',
  // 拷贝路径：路径曲线 + 端点 + 箭头
  copyPath: '<circle cx="2.9" cy="13.1" r="1.2"/><path d="M4.1 12.6C4.1 8.9 6.7 7.4 13 7.4"/><path d="M11.2 5.6l1.8 1.8-1.8 1.8"/>',
  // 打开方式：窗口 + 右向箭头
  openWith: '<rect x="2.2" y="3" width="11.6" height="8.6" rx="1.2"/><path d="M2.2 5.6h11.6"/><path d="M10.6 8.2h3.6M12.9 6.7l1.5 1.5-1.5 1.5"/>',
  // 快速操作：闪电
  quickActions: '<path d="M8.9 1.6L3.6 9.2h3.3l-1 5.2 5.3-7.6H7.9z"/>',
  // 新标签页
  tab: '<rect x="2.2" y="5" width="11.6" height="7.4" rx="1.2"/><path d="M8 7.2v3M6.5 8.7h3"/>',
  // 双面板
  split: '<rect x="2.2" y="4.4" width="11.6" height="8" rx="1.2"/><path d="M8 4.4v8"/>',
  // 图片
  images: '<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.2"/><path d="M2.8 11l3-3 2.4 2.4 2-2 3.2 3.2"/><circle cx="10.8" cy="6" r="1"/>',
  // ZIP 容器
  zip: '<path d="M2.2 6.4v6a1.2 1.2 0 0 0 1.2 1.2h9.2a1.2 1.2 0 0 0 1.2-1.2v-6"/><path d="M1.4 3h13.2v3.4H1.4z"/><path d="M8 7.3v.05M8 9.4v.05M8 11.4v.05"/>',
  // ZIP 树形预览：节点树
  tree: '<path d="M8 13.8V8.2M8 8.2 4.6 4.8M8 8.2l3.4-3.4M8 11 5.9 8.9M8 11l2.1-2.1"/>',
  // 刷新
  refresh: '<path d="M13.4 8a5.4 5.4 0 1 1-1.7-3.9"/><path d="M13.7 2.3v3h-3"/>',
  // 新建文件夹
  newFolder: '<path d="M2.4 12.6V5a1 1 0 0 1 1-1h3l1.4 1.8h5.8a1 1 0 0 1 1 1v1.2"/><path d="M2.4 12.6h5"/><path d="M10.8 10v4M8.8 12h4"/>',
  // 新建文件
  newFile: '<path d="M4.2 2.4h4.6l3 3v8.2H4.2z"/><path d="M8.8 2.4v3h3"/><path d="M6.4 9.2v3.2M4.8 10.8h3.2"/>',
  // 新建符号链接：链环
  link: '<rect x="1.8" y="6.2" width="6.4" height="3.6" rx="1.8"/><rect x="7.8" y="6.2" width="6.4" height="3.6" rx="1.8"/>',
  // 粘贴：剪贴板
  paste: '<rect x="3.6" y="3" width="8.8" height="11" rx="1.2"/><rect x="6" y="1.8" width="4" height="2.2" rx="1"/><path d="M6 7.2h4M6 9.6h4"/>',
  // 显示/隐藏隐藏文件：眼睛 + 斜杠
  hidden: '<path d="M2.2 8s2.3-3.6 5.8-3.6c1 0 1.9.3 2.7.8M13 9.4c.4-.6.8-1.4.8-1.4S11.7 4.4 8 4.4"/><path d="M6.6 9.8c.4.3.9.4 1.4.4 1.6 0 2.8-1 3.6-1.9"/><path d="M2.5 2.8l11 10.4"/>',
  // 前往文件夹：文件夹 + 指入箭头
  goto: '<path d="M8.4 3.4h4.2a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1h1"/><path d="M13 8.5H9.2M13 8.5l-1.8-1.8M13 8.5l-1.8 1.8"/>',
  // 查找重复文件：错位双文档
  duplicates: '<rect x="5.4" y="2.4" width="7" height="9.2" rx="1"/><path d="M3.6 4.8v7a1 1 0 0 0 1 1h5"/>',
  // 可视化空间：四分块
  treemap: '<rect x="2.4" y="2.4" width="5" height="5" rx=".8"/><rect x="8.6" y="2.4" width="5" height="3" rx=".8"/><rect x="2.4" y="8.6" width="4" height="5" rx=".8"/><rect x="8.6" y="6.9" width="5" height="6.7" rx=".8"/>',
  // 在此搜索内容：文字行 + 放大镜
  grep: '<path d="M2.6 4.6h7M2.6 7.6h4.6"/><circle cx="10.4" cy="9.8" r="2.9"/><path d="M12.5 11.9l2 2"/>',
  // 在 Finder 中显示：笑脸显示器
  finder: '<rect x="1.8" y="3" width="12.4" height="8.6" rx="1.4"/><path d="M4.6 6.2v.05M11.4 6.2v.05"/><path d="M5.6 9.2c.6.8 1.4 1.2 2.4 1.2s1.8-.4 2.4-1.2"/>',
  // 文件夹（面包屑折叠层级等）
  folder: '<path d="M2.2 12.6V4.6a1 1 0 0 1 1-1h3l1.4 1.8h5.2a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1z"/>',
  // 发送到设备：纸飞机
  send: '<path d="M14 2 2.4 6.8l4.4 2.1 2.1 4.7z"/><path d="M14 2 6.8 8.9"/>',
}

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
      <!-- 图标列（无图标也占位，保持三列对齐体系） -->
      <span class="menu-icon">
        <svg v-if="item.icon && ICONS[item.icon]" viewBox="0 0 16 16" aria-hidden="true" v-html="ICONS[item.icon]" />
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
