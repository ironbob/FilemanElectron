<template>
  <!-- 标签总览弹层（⌄ 入口，任何时候可开）—— Finder/Quick Look 原生浮层风格：
       半透明高不透明度材质 + backdrop blur 隔离底层内容（列表文字不可透过辨认）；
       搜索（名称+路径子串过滤、匹配段加粗、n/N 计数）→ 46px 双行条目
       （✓ 当前 + 图标 + 名称 + 父级路径 · 未保存）；整行系统蓝选中（↑↓ 移动、
       Enter 切换、Esc 关闭，输入框常驻焦点，aria-activedescendant 语义）；
       hover 为浅灰（不与键盘选中争层级）；底栏 新建标签 ⌘T。
       仅列表区内部滚动，搜索/底栏固定；锚点下沿 6px 展开、空间不足上翻、
       视口钳制。外点关闭：左键整例点击被吞掉（打开期间后方内容不可直接操作），
       非左键（右键菜单等）立即关不拦截。 -->
  <div
    ref="menuEl"
    class="tab-overview-menu animate-fade-in"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    role="dialog"
    aria-modal="false"
    :aria-label="$t('tabs.overviewButton')"
    @contextmenu.prevent.stop
  >
    <div class="tab-overview-search">
      <svg class="tab-overview-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3a8 8 0 105.29 14.29L21 21" />
        <circle cx="11" cy="11" r="7" fill="none" />
      </svg>
      <input
        ref="searchInput"
        v-model="query"
        class="tab-overview-input"
        :placeholder="$t('tabs.overview.searchPlaceholder')"
        :aria-label="$t('tabs.overview.searchPlaceholder')"
        @keydown.stop="onSearchKeydown"
        @pointerdown.stop
      />
    </div>

    <div class="tab-overview-header">
      <span class="tab-overview-count">{{ $t('tabs.overview.title', { count: rows.length }) }}</span>
      <span v-if="query" class="tab-overview-count">{{ $t('tabs.overview.matchCount', { count: filtered.length, total: rows.length }) }}</span>
    </div>

    <div
      ref="listEl"
      class="tab-overview-list"
      role="listbox"
      :aria-label="$t('tabs.overviewButton')"
      :aria-activedescendant="viewRows.length ? `tab-overview-opt-${activeIndex}` : undefined"
      :style="listMaxH !== null ? { maxHeight: `${listMaxH}px` } : undefined"
    >
      <div v-if="filtered.length === 0" class="tab-overview-empty">
        {{ $t('tabs.overview.noMatch') }}
      </div>
      <button
        v-for="(row, i) in viewRows"
        :id="`tab-overview-opt-${i}`"
        :key="row.tab.id"
        :data-index="i"
        class="tab-overview-row"
        :class="{ 'is-current': row.current, 'is-active': i === activeIndex }"
        role="option"
        :aria-selected="i === activeIndex"
        :aria-current="row.current || undefined"
        :tabindex="-1"
        @click="$emit('select', row.tab.id)"
      >
        <span class="tab-overview-check" aria-hidden="true">{{ row.current ? '✓' : '' }}</span>
        <TabIcon :name="row.icon" class="w-4 h-4 shrink-0 tab-overview-icon" />
        <span class="tab-overview-text">
          <span class="tab-overview-name">
            <span v-if="row.prefix" class="tab-overview-prefix">{{ row.prefix }} › </span><template v-for="(seg, si) in row.segments" :key="si"><b v-if="seg.hit">{{ seg.text }}</b><template v-else>{{ seg.text }}</template></template>
          </span>
          <span class="tab-overview-path">
            {{ row.path }}<template v-if="row.dirty"> · {{ $t('tabs.overview.unsaved') }}</template>
          </span>
        </span>
        <span
          class="tab-overview-close"
          role="button"
          :aria-label="$t('tabs.overview.closeRowAria', { name: row.title })"
          @click.stop="$emit('close-tab', row.tab.id)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
    </div>

    <div class="tab-overview-footer">
      <button class="tab-overview-new" @click="$emit('new-tab')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        {{ $t('tabs.newTab') }}
        <span class="tab-overview-shortcut">⌘T</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import type { Tab } from '@/types'
import TabIcon from './TabIcon.vue'
import type { TabIconName } from './tabIcons'

export interface TabOverviewRow {
  tab: Tab
  icon: TabIconName
  /** 叶子名（或别名 / 工具页 i18n 标题）。 */
  title: string
  prefix: string | null
  path: string
  dirty: boolean
  current: boolean
}

const props = defineProps<{
  rows: TabOverviewRow[]
  /** 锚点（⌄ 按钮 rect，client 坐标系）；菜单右对齐锚点下沿展开。 */
  anchor: DOMRect
}>()

const emit = defineEmits<{
  select: [tabId: string]
  'close-tab': [tabId: string]
  'new-tab': []
  close: []
}>()

// 存续期间放行标题栏拖拽区（v-if 挂载即打开），否则点标题栏的外点关闭收不到事件
useAppDragSuspend()

const menuEl = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const pos = reactive({ x: 0, y: 0 })
/** 量取视口后写入的列表区最大高（null = 未量取，用 CSS 兜底 60vh）。 */
const listMaxH = ref<number | null>(null)

// ── 定位：锚点正下方 6px、右缘对齐；下方放不下上翻；两侧都紧取宽侧钳制 ────────
// 高度约束只落在列表区（overflow-y:auto），搜索/底栏固定，root overflow:hidden
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

  // 固定部分（搜索 + 计数 + 底栏 + 内边距）= root 高 − 列表高
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

  searchInput.value?.focus()
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('click', onOutsideClick, true)
  document.addEventListener('keydown', onKeydownCapture, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('click', onOutsideClick, true)
  document.removeEventListener('keydown', onKeydownCapture, true)
})

// ── 外点关闭 + 后方隔离 ───────────────────────────────────────────────────────
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

/** Esc 关菜单：document 级捕获（焦点可能已不在搜索框，如刚点过行内 ✕）。 */
function onKeydownCapture(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('close')
}

// ── 搜索 / 高亮 / 键盘 ────────────────────────────────────────────────────────
const query = ref('')
const activeIndex = ref(0)

function splitHits(text: string, q: string): Array<{ text: string; hit: boolean }> {
  if (!q) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const out: Array<{ text: string; hit: boolean }> = []
  let from = 0
  while (true) {
    const idx = lower.indexOf(needle, from)
    if (idx === -1) break
    if (idx > from) out.push({ text: text.slice(from, idx), hit: false })
    out.push({ text: text.slice(idx, idx + q.length), hit: true })
    from = idx + q.length
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false })
  return out
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.rows
  return props.rows.filter(r => r.title.toLowerCase().includes(q) || (r.prefix ?? '').toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
})

/** 过滤后叠加匹配段切分（segments 依赖组件内 query，只能就地派生）。 */
const viewRows = computed(() =>
  filtered.value.map(r => ({ ...r, segments: splitHits(r.title, query.value.trim()) }))
)

watch(filtered, list => {
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, list.length - 1))
})
watch(query, () => { activeIndex.value = 0 })

/** 键盘选中行始终滚入可视区（block:nearest 只滚动列表自身）。 */
watch(activeIndex, idx => {
  if (idx < 0) return
  menuEl.value?.querySelector(`[data-index="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    const row = viewRows.value[activeIndex.value]
    if (row) emit('select', row.tab.id)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, viewRows.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
}
</script>

<style scoped>
/* ── 浮层容器：Finder 原生材质 ────────────────────────────────────────────────
   独立 stacking context（isolation + z-index），fixed 定位不受列表容器影响
   （挂载点在标题栏条带内，标题栏 z30 已整体压过 main）；高不透明度 + blur
   让底层文件列表不可辨认；overflow:hidden 把内容裁进圆角。 */
.tab-overview-menu {
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
}

/* ── 搜索框（面板顶部，Finder 式 28px 字段；聚焦才出蓝色焦点环） ────────────── */
.tab-overview-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 10px 12px 0;
  padding: 0 8px;
  border-radius: 7px;
  background: var(--finder-control);
  transition: box-shadow 140ms ease;
}

.tab-overview-search:focus-within {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--finder-selection) 28%, transparent),
    inset 0 0 0 0.5px color-mix(in srgb, var(--finder-selection) 55%, transparent);
}

.tab-overview-search-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--finder-secondary-label);
  opacity: 0.75;
}

/* 抑制全局 .finder-shell input 的底色/边框/焦点环（材质由外层字段承担）。
   双 !important + 更高特异性（scoped 属性选择器）才压得过全局层的 !important。 */
.tab-overview-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 13px;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  outline: none;
}

.tab-overview-input::placeholder {
  color: var(--finder-secondary-label);
}

/* ── 计数行（搜索框与列表之间的分区小字） ──────────────────────────────────── */
.tab-overview-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px 2px;
}

.tab-overview-count {
  font-size: 11px;
  color: var(--finder-secondary-label);
}

/* ── 列表区：唯一滚动区（底部操作栏固定在外） ──────────────────────────────── */
.tab-overview-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: 60vh; /* 量取前的兜底；打开时被内联 maxHeight 覆盖 */
  padding: 2px 6px 6px;
}

.tab-overview-empty {
  padding: 16px 8px;
  font-size: 12px;
  text-align: center;
  color: var(--finder-secondary-label);
}

/* ── 记录行：两行结构（名称 13/500 + 路径 11.5/400），46px ─────────────────── */
.tab-overview-row {
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
.tab-overview-row:hover:not(.is-active) {
  background: var(--finder-popover-hover);
}

/* 选中（键盘 ↑↓/Enter 语义）：整行系统蓝，名称/路径/图标/✓ 全部转白 */
.tab-overview-row.is-active {
  background: var(--finder-selection);
}

.tab-overview-row.is-active .tab-overview-name,
.tab-overview-row.is-active .tab-overview-prefix,
.tab-overview-row.is-active .tab-overview-check,
.tab-overview-row.is-active .tab-overview-icon,
.tab-overview-row.is-active .tab-overview-close {
  color: #ffffff;
}

.tab-overview-row.is-active .tab-overview-path {
  color: rgba(255, 255, 255, 0.82);
}

/* 当前标签：✓ 勾选 + 名称 semibold（非颜色信号与蓝底选中互不混淆） */
.tab-overview-row.is-current .tab-overview-name {
  font-weight: 600;
}

.tab-overview-row.is-current .tab-overview-check {
  color: var(--finder-selection);
}

.tab-overview-check {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  font-size: 11px;
  color: var(--finder-secondary-label);
}

.tab-overview-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.tab-overview-name {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--finder-label);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-overview-prefix {
  color: var(--finder-secondary-label);
}

.tab-overview-name b {
  font-weight: 600;
}

.tab-overview-path {
  font-size: 11.5px;
  line-height: 15px;
  color: var(--finder-popover-path);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-overview-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 9999px;
  opacity: 0;
  color: var(--finder-secondary-label);
}

.tab-overview-row:hover .tab-overview-close,
.tab-overview-row.is-active .tab-overview-close {
  opacity: 1;
}

.tab-overview-close:hover {
  color: var(--finder-label);
  background: rgba(127, 127, 127, 0.18);
}

.tab-overview-row.is-active .tab-overview-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.22);
}

/* ── 底部「新建标签页」操作区：轻分隔线 + 整行 hover ───────────────────────── */
.tab-overview-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--finder-divider);
  padding: 5px 8px 6px;
}

.tab-overview-new {
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

.tab-overview-new:hover {
  background: var(--finder-popover-hover);
}

.tab-overview-new:focus-visible {
  outline: 2px solid var(--finder-selection);
  outline-offset: -2px;
}

.tab-overview-shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--finder-secondary-label);
  opacity: 0.75;
}
</style>
