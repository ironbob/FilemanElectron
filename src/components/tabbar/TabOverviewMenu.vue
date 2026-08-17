<template>
  <!-- 标签总览弹层（⌄ 入口，任何时候可开）：
       搜索（名称+路径子串过滤、匹配段加粗、n/N 计数）→ 40px 双行条目
       （图标 + 名称 + 父级路径 · 未保存），当前项 ✓ + 蓝名；底栏 新建标签 ⌘T。
       键盘：搜索框 ↑↓ 高亮行、Enter 切换、Esc 关闭（input @keydown.stop 截住）。 -->
  <div
    ref="menuEl"
    class="tab-overview-menu animate-fade-in"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    @contextmenu.prevent.stop
  >
    <div class="tab-overview-header">
      <span class="tab-overview-count">{{ $t('tabs.overview.title', { count: rows.length }) }}</span>
      <span v-if="query" class="tab-overview-count">{{ $t('tabs.overview.matchCount', { count: filtered.length, total: rows.length }) }}</span>
    </div>

    <div class="tab-overview-search">
      <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3a8 8 0 105.29 14.29L21 21" />
        <circle cx="11" cy="11" r="7" fill="none" />
      </svg>
      <input
        ref="searchInput"
        v-model="query"
        class="tab-overview-input"
        :placeholder="$t('tabs.overview.searchPlaceholder')"
        @keydown.stop="onSearchKeydown"
        @pointerdown.stop
      />
    </div>

    <div class="tab-overview-list">
      <div v-if="filtered.length === 0" class="tab-overview-empty">
        {{ $t('tabs.overview.noMatch') }}
      </div>
      <button
        v-for="(row, i) in viewRows"
        :key="row.tab.id"
        class="tab-overview-row"
        :class="{ 'is-current': row.current, 'is-active': i === activeIndex }"
        @click="$emit('select', row.tab.id)"
        @mouseenter="activeIndex = i"
      >
        <span class="tab-overview-check" aria-hidden="true">{{ row.current ? '✓' : '' }}</span>
        <TabIcon :name="row.icon" class="w-4 h-4 shrink-0" />
        <span class="tab-overview-text">
          <span class="tab-overview-name" :class="row.current ? 'text-accent-blue' : ''">
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

const menuEl = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const pos = reactive({ x: 0, y: 0 })

// ── 定位：锚点正下方、右缘对齐，视口内钳制 ────────────────────────────────────
onMounted(async () => {
  await nextTick()
  const el = menuEl.value
  const MENU_WIDTH = 320
  const MARGIN = 8
  pos.x = Math.min(props.anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MARGIN)
  pos.x = Math.max(MARGIN, pos.x)
  pos.y = props.anchor.bottom + 6
  if (el) {
    const h = el.getBoundingClientRect().height
    if (pos.y + h > window.innerHeight - MARGIN) {
      pos.y = Math.max(MARGIN, props.anchor.top - h - 6)
    }
  }
  searchInput.value?.focus()
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('keydown', onKeydownCapture, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('keydown', onKeydownCapture, true)
})

function onOutsidePointerDown(e: PointerEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
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
.tab-overview-menu {
  position: fixed;
  width: 320px;
  z-index: var(--z-dropdown);
  background: var(--finder-chrome);
  border: 1px solid var(--finder-divider);
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  -webkit-app-region: no-drag;
  color: var(--finder-label);
}

.tab-overview-header {
  @apply flex items-center justify-between;
  padding: 8px 12px 4px;
}

.tab-overview-count {
  font-size: 11px;
  color: var(--finder-secondary-label);
}

.tab-overview-search {
  @apply flex items-center gap-1.5;
  margin: 0 10px 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--finder-control);
  color: var(--finder-secondary-label);
}

.tab-overview-input {
  @apply flex-1 min-w-0 text-xs;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--finder-label);
}

.tab-overview-list {
  max-height: 60vh;
  overflow-y: auto;
  padding: 2px 4px;
}

.tab-overview-empty {
  @apply text-xs text-center;
  padding: 14px 0;
  color: var(--finder-secondary-label);
}

.tab-overview-row {
  @apply flex items-center gap-2 w-full text-left;
  min-height: 40px;
  padding: 3px 8px;
  border-radius: 6px;
}

.tab-overview-row.is-active {
  background: var(--finder-tab-hover, rgba(127, 127, 127, 0.12));
}

.tab-overview-row.is-current .tab-overview-name {
  font-weight: 600;
}

.tab-overview-check {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  font-size: 11px;
  color: var(--accent-blue);
}

.tab-overview-text {
  @apply flex flex-col min-w-0 flex-1;
}

.tab-overview-name {
  @apply text-xs truncate;
}

.tab-overview-prefix {
  color: var(--finder-secondary-label);
}

.tab-overview-name b {
  font-weight: 700;
}

.tab-overview-path {
  @apply text-[11px] truncate;
  color: var(--finder-secondary-label);
}

.tab-overview-close {
  @apply flex items-center justify-center shrink-0 rounded-full;
  width: 24px;
  height: 24px;
  opacity: 0;
  color: var(--finder-secondary-label);
}

.tab-overview-row:hover .tab-overview-close {
  opacity: 1;
}

.tab-overview-close:hover {
  color: var(--finder-label);
}

.tab-overview-footer {
  border-top: 1px solid var(--finder-divider);
  padding: 4px;
}

.tab-overview-new {
  @apply flex items-center gap-2 w-full text-xs;
  padding: 5px 8px;
  border-radius: 6px;
  color: var(--finder-label);
}

.tab-overview-new:hover {
  background: var(--finder-tab-hover, rgba(127, 127, 127, 0.12));
}

.tab-overview-shortcut {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.5;
}
</style>
