<template>
  <!-- 历史目录弹层（时钟入口）—— TabOverviewMenu 同款 Finder 原生浮层骨架：
       半透明高不透明度材质 + backdrop blur 隔离底层内容；46px 双行条目
       （文件夹图标 + 叶子名 + 父级路径，远程设备带设备名前缀）；键盘 ↑↓ 移动、
       Enter 在新标签页打开、Esc 关闭（根聚焦，无搜索框——条目上限 10 不需要）；
       hover 为浅灰（不与键盘选中争层级），键盘选中整行系统蓝；
       底栏「清除历史记录」。仅列表区内部滚动；锚点下沿 6px 展开、空间不足上翻、
       视口钳制。外点关闭：左键整例点击被吞掉（打开期间后方内容不可直接操作），
       非左键（右键菜单等）立即关不拦截。 -->
  <div
    ref="menuEl"
    class="tab-history-menu animate-fade-in"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    role="listbox"
    tabindex="-1"
    :aria-label="$t('tabs.historyButton')"
    :aria-activedescendant="entries.length ? `tab-history-opt-${activeIndex}` : undefined"
    @contextmenu.prevent.stop
    @keydown="onMenuKeydown"
  >
    <div class="tab-history-header">
      <span class="tab-history-count">{{ $t('tabs.history.title', { count: entries.length }) }}</span>
    </div>

    <div
      ref="listEl"
      class="tab-history-list"
      :style="listMaxH !== null ? { maxHeight: `${listMaxH}px` } : undefined"
    >
      <div v-if="entries.length === 0" class="tab-history-empty">
        {{ $t('tabs.history.empty') }}
      </div>
      <button
        v-for="(row, i) in entries"
        :id="`tab-history-opt-${i}`"
        :key="`${row.deviceId}:${row.path}`"
        :data-index="i"
        class="tab-history-row"
        :class="{ 'is-active': i === activeIndex }"
        role="option"
        :aria-selected="i === activeIndex"
        :tabindex="-1"
        @click="$emit('open', row)"
      >
        <svg class="tab-history-icon shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
          />
        </svg>
        <span class="tab-history-text">
          <span class="tab-history-name">{{ row.name }}</span>
          <span class="tab-history-path">{{ row.detail }}</span>
        </span>
      </button>
    </div>

    <div class="tab-history-footer">
      <button class="tab-history-clear" :disabled="entries.length === 0" @click="$emit('clear')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"
          />
        </svg>
        {{ $t('tabs.history.clear') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

/** 一条历史目录记录（展示字段已由父组件算好：叶子名 + 副行文本）。 */
export interface TabHistoryEntry {
  deviceId: string
  path: string
  /** 叶子名（zip 虚拟路径取内层尾段；根路径显示 Root）。 */
  name: string
  /** 副行：父路径；远程设备前缀「设备名 › 」。 */
  detail: string
}

const props = defineProps<{
  entries: TabHistoryEntry[]
  /** 锚点（时钟按钮 rect，client 坐标系）；菜单右对齐锚点下沿展开。 */
  anchor: DOMRect
}>()

const emit = defineEmits<{
  open: [entry: TabHistoryEntry]
  clear: []
  close: []
}>()

const menuEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const pos = reactive({ x: 0, y: 0 })
/** 量取视口后写入的列表区最大高（null = 未量取，用 CSS 兜底 60vh）。 */
const listMaxH = ref<number | null>(null)
const activeIndex = ref(0)

// ── 定位：锚点正下方 6px、右缘对齐；下方放不下上翻；两侧都紧取宽侧钳制 ────────
// 高度约束只落在列表区（overflow-y:auto），计数/底栏固定，root overflow:hidden
// 保证内容被圆角裁剪。位置在打开时一次量定，不随后方列表滚动漂移（fixed）。
onMounted(async () => {
  await nextTick()
  const el = menuEl.value
  const list = listEl.value
  if (!el || !list) return

  const MENU_WIDTH = 320
  const MARGIN = 8
  const GAP = 6
  const MIN_LIST = 120

  // 固定部分（计数 + 底栏 + 内边距）= root 高 − 列表高
  const chromeH = el.getBoundingClientRect().height - list.getBoundingClientRect().height
  const natural = list.scrollHeight
  const want = Math.min(natural, Math.floor(window.innerHeight * 0.6))
  const below = window.innerHeight - props.anchor.bottom - GAP - MARGIN - chromeH
  const above = props.anchor.top - GAP - MARGIN - chromeH

  let listH: number
  if (want <= below) {
    listH = want
    pos.y = props.anchor.bottom + GAP
  } else if (want <= above) {
    listH = want
    pos.y = props.anchor.top - GAP - chromeH - listH
  } else if (below >= above) {
    listH = Math.max(MIN_LIST, below)
    pos.y = props.anchor.bottom + GAP
  } else {
    listH = Math.max(MIN_LIST, above)
    pos.y = Math.max(MARGIN, props.anchor.top - GAP - chromeH - listH)
  }
  listMaxH.value = listH

  pos.x = Math.min(props.anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MARGIN)
  pos.x = Math.max(MARGIN, pos.x)

  el.focus()
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('click', onOutsideClick, true)
  document.addEventListener('keydown', onKeydownCapture, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('click', onOutsideClick, true)
  document.removeEventListener('keydown', onKeydownCapture, true)
})

// ── 外点关闭 + 后方隔离（TabOverviewMenu 同款） ──────────────────────────────
// 左键：pointerdown 一拍即吞（preventDefault 抑制后方焦点的默认行为，
// stopPropagation 拦掉 App/行级处理器），click 一拍再吞并关闭——整例点击
// 不会透传激活后方文件行/标签。非左键（右键呼出其它菜单等）只关不拦。
function onOutsidePointerDown(e: PointerEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
  if (e.button !== 0) {
    emit('close')
    return
  }
  e.preventDefault()
  e.stopPropagation()
}

function onOutsideClick(e: MouseEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

/** Esc 关菜单：document 级捕获（无输入框，键盘焦点在菜单根上）。 */
function onKeydownCapture(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('close')
}

// ── 键盘导航：↑↓ 移动、Enter 打开当前行 ──────────────────────────────────────
watch(
  () => props.entries.length,
  len => {
    activeIndex.value = Math.min(activeIndex.value, Math.max(0, len - 1))
  }
)

/** 键盘选中行始终滚入可视区（block:nearest 只滚动列表自身）。 */
watch(activeIndex, idx => {
  if (idx < 0) return
  menuEl.value?.querySelector(`[data-index="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onMenuKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    const row = props.entries[activeIndex.value]
    if (row) emit('open', row)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, props.entries.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
}
</script>

<style scoped>
/* ── 浮层容器：Finder 原生材质（TabOverviewMenu 同款 token） ──────────────────
   独立 stacking context（isolation + z-index），fixed 定位不受列表容器影响
   （挂载点在标题栏条带内，标题栏 z30 已整体压过 main）；高不透明度 + blur
   让底层文件列表不可辨认；overflow:hidden 把内容裁进圆角。 */
.tab-history-menu {
  position: fixed;
  width: 320px;
  display: flex;
  flex-direction: column;
  isolation: isolate;
  z-index: 40;
  overflow: hidden;
  background: var(--finder-popover-bg);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--finder-popover-border);
  border-radius: 12px;
  box-shadow: var(--finder-popover-shadow);
  -webkit-app-region: no-drag;
  color: var(--finder-label);
  outline: none;
}

/* ── 计数行（列表上方的分区小字） ───────────────────────────────────────────── */
.tab-history-header {
  display: flex;
  align-items: baseline;
  padding: 10px 14px 2px;
}

.tab-history-count {
  font-size: 11px;
  color: var(--finder-secondary-label);
}

/* ── 列表区：唯一滚动区（底部操作栏固定在外） ──────────────────────────────── */
.tab-history-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: 60vh; /* 量取前的兜底；打开时被内联 maxHeight 覆盖 */
  padding: 4px 6px 6px;
}

.tab-history-empty {
  padding: 16px 8px;
  font-size: 12px;
  text-align: center;
  color: var(--finder-secondary-label);
}

/* ── 记录行：两行结构（名称 13/500 + 路径 11.5/400），46px ─────────────────── */
.tab-history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 5px 10px;
  border-radius: 7px;
  text-align: left;
}

/* hover：低对比浅灰（不与键盘选中争层级） */
.tab-history-row:hover:not(.is-active) {
  background: var(--finder-popover-hover);
}

/* 选中（键盘 ↑↓/Enter 语义）：整行系统蓝，名称/路径/图标全部转白 */
.tab-history-row.is-active {
  background: var(--finder-selection);
}

.tab-history-row.is-active .tab-history-name,
.tab-history-row.is-active .tab-history-icon {
  color: #ffffff;
}

.tab-history-row.is-active .tab-history-path {
  color: rgba(255, 255, 255, 0.82);
}

.tab-history-icon {
  width: 18px;
  height: 18px;
  color: var(--finder-secondary-label);
}

.tab-history-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.tab-history-name {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--finder-label);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-history-path {
  font-size: 11.5px;
  line-height: 15px;
  color: var(--finder-popover-path);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 底部「清除历史记录」操作区：轻分隔线 + 整行 hover ─────────────────────── */
.tab-history-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--finder-divider);
  padding: 5px 8px 6px;
}

.tab-history-clear {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--finder-label);
}

.tab-history-clear:not(:disabled):hover {
  background: var(--finder-popover-hover);
}

.tab-history-clear:focus-visible {
  outline: 2px solid var(--finder-selection);
  outline-offset: -2px;
}

.tab-history-clear:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
