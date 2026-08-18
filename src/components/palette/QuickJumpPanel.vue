<template>
  <!-- 快速跳转面板（⌘⇧P）—— 只做一件事：搜索并跳转到最近打开过的目录。
       Finder 原生浮层（TabHistoryMenu 同款材质骨架）：半透明高不透明度 + blur；
       搜索框只过滤历史目录（无命令/收藏/绝对路径入口）；单一可见分组「跳转到」，
       MRU 倒序，46px 双行条目；键盘 ↑↓/Enter/Esc 经 useKeyInterceptor 捕获期消费；
       锚定标题栏下沿 8px、水平居中，空间不足上翻、视口钳制；仅列表区滚动；
       外点关闭（左键吞掉，后方内容不可操作）；关闭时还原先前焦点。 -->
  <div
    ref="panelEl"
    class="quick-jump-panel animate-fade-in"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${panelW}px` }"
    role="dialog"
    :aria-label="$t('palette.ariaLabel')"
    @contextmenu.prevent.stop
  >
    <div class="qj-search">
      <svg class="qj-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
          d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z" />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="qj-input"
        :placeholder="$t('palette.placeholder')"
        spellcheck="false"
        role="combobox"
        :aria-expanded="true"
        :aria-controls="'qj-list'"
        aria-autocomplete="list"
      >
    </div>

    <div v-if="entries.length" class="qj-group-title">{{ $t('palette.groupJump') }}</div>

    <div
      v-if="entries.length"
      id="qj-list"
      ref="listEl"
      class="qj-list"
      role="listbox"
      :aria-label="$t('palette.groupJump')"
      :aria-activedescendant="results.length ? `qj-opt-${activeIndex}` : undefined"
      :style="listMaxH !== null ? { maxHeight: `${listMaxH}px` } : undefined"
    >
      <button
        v-for="(row, i) in results"
        :id="`qj-opt-${i}`"
        :key="`${row.deviceId}:${row.path}`"
        :data-index="i"
        class="qj-row"
        :class="{ 'is-active': i === activeIndex }"
        role="option"
        :aria-selected="i === activeIndex"
        :tabindex="-1"
        @click="open(row)"
      >
        <svg class="qj-row-icon shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
          />
        </svg>
        <span class="qj-row-text">
          <span class="qj-row-name">{{ row.name }}</span>
          <span class="qj-row-path">{{ row.detail }}</span>
        </span>
      </button>
      <div v-if="results.length === 0" class="qj-empty">{{ $t('palette.noMatch') }}</div>
    </div>

    <div v-else class="qj-empty qj-empty-root">{{ $t('palette.empty') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useFileBrowserStore } from '@/stores/fileBrowser'
import { useRecentLocationEntries } from '@/composables/useRecentLocationEntries'
import type { RecentLocationEntry } from '@/composables/useRecentLocationEntries'

/**
 * 快速跳转面板（⌘⇧P）：Finder 风格「最近打开目录」搜索跳转浮层。
 *
 * 键盘契约（疑难问题解决记录/子组件ESC键消费）：↑↓/Enter/Esc 经
 * useKeyInterceptor 捕获期消费（return true），不得落入 FileList 的
 * document 冒泡监听（否则触发 typeahead/重命名等）。
 *
 * 其余分组（未来可能的收藏/设备等）只存在于数据结构层，界面不渲染空分组
 * 标题或占位——当前唯一可见分组即「跳转到」。
 */

const props = defineProps<{
  /** 锚点（窗口标题栏 rect，client 坐标系）；面板在锚点下沿 8px 展开、水平居中。 */
  anchor: DOMRect
  /** 打开目录（App 组装：活动面板导航；活动标签为工具视图时开新标签页）。 */
  navigate: (deviceId: string, path: string) => void
}>()

const emit = defineEmits<{ close: [] }>()

const browserStore = useFileBrowserStore()
const entries = useRecentLocationEntries()

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const pos = reactive({ x: 0, y: 0 })
/** 量取视口后写入的列表区最大高（null = 未量取，用 CSS 兜底 50vh）。 */
const listMaxH = ref<number | null>(null)
const panelW = ref(480)

/** 过滤：目录名/路径片段大小写不敏感子串匹配，保持 MRU 顺序（不重排序）。 */
const results = computed<RecentLocationEntry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter(
    entry => entry.name.toLowerCase().includes(q) || entry.detail.toLowerCase().includes(q)
  )
})

watch(results, list => { activeIndex.value = list.length ? 0 : -1 }, { flush: 'post' })

function move(delta: number): void {
  if (results.value.length === 0) return
  activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length
}

function accept(): void {
  const entry = results.value[activeIndex.value]
  if (entry) open(entry)
}

function open(entry: RecentLocationEntry): void {
  props.navigate(entry.deviceId, entry.path)
  // 显式置顶 MRU：新 tab 打开不触发面板导航记录（与标签栏历史菜单一致）
  browserStore.rememberLocation(entry.deviceId, entry.path)
  emit('close')
}

// 捕获期消费面板自身按键（LIFO：面板是最新挂载的，先于 App/文档层）
useKeyInterceptor(event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return true }
  if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return true }
  if (event.key === 'Enter') { event.preventDefault(); accept(); return true }
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return true }
  return false
})

/** 关闭时还原打开前的焦点（元素仍在线才还原）。 */
let restoreFocusEl: HTMLElement | null = null

// ── 定位：锚点（标题栏）下沿 8px、水平居中；下方放不下上翻；视口钳制 ──────────
// 高度约束只落在列表区（overflow-y:auto），搜索框/分组标题固定，root
// overflow:hidden 保证内容被圆角裁剪。位置打开时一次量定（fixed）。
onMounted(async () => {
  restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null

  await nextTick()
  const el = panelEl.value
  const list = listEl.value
  if (!el) return

  const MARGIN = 12
  const GAP = 8
  const MIN_LIST = 120

  panelW.value = Math.max(280, Math.min(480, window.innerWidth - 2 * MARGIN))

  let listH = Math.floor(window.innerHeight * 0.5)
  let y = props.anchor.bottom + GAP
  if (list) {
    // 固定部分（搜索框 + 分组标题 + 内边距）= root 高 − 列表高
    const chromeH = el.getBoundingClientRect().height - list.getBoundingClientRect().height
    const natural = list.scrollHeight
    const want = Math.min(natural, Math.floor(window.innerHeight * 0.6))
    const below = window.innerHeight - props.anchor.bottom - GAP - MARGIN - chromeH
    const above = props.anchor.top - GAP - MARGIN - chromeH

    if (want <= below) {
      listH = want
      y = props.anchor.bottom + GAP
    } else if (want <= above) {
      listH = want
      y = props.anchor.top - GAP - chromeH - listH
    } else if (below >= above) {
      listH = Math.max(MIN_LIST, below)
      y = props.anchor.bottom + GAP
    } else {
      listH = Math.max(MIN_LIST, above)
      y = Math.max(MARGIN, props.anchor.top - GAP - chromeH - listH)
    }
    listMaxH.value = listH
  }
  pos.y = y
  pos.x = Math.max(MARGIN, Math.min((window.innerWidth - panelW.value) / 2, window.innerWidth - panelW.value - MARGIN))

  void nextTick(() => inputRef.value?.focus())

  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('click', onOutsideClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('click', onOutsideClick, true)
  if (restoreFocusEl?.isConnected) restoreFocusEl.focus()
})

// ── 外点关闭 + 后方隔离（TabHistoryMenu 同款） ──────────────────────────────
// 左键：pointerdown 一拍即吞（preventDefault 抑制后方焦点的默认行为，
// stopPropagation 拦掉 App/行级处理器），click 一拍再吞并关闭——整例点击
// 不会透传激活后方文件行/标签。非左键（右键呼出其它菜单等）只关不拦。
function onOutsidePointerDown(e: PointerEvent) {
  if (panelEl.value?.contains(e.target as Node)) return
  if (e.button !== 0) {
    emit('close')
    return
  }
  e.preventDefault()
  e.stopPropagation()
}

function onOutsideClick(e: MouseEvent) {
  if (panelEl.value?.contains(e.target as Node)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

// 键盘选中行始终滚入可视区（block:nearest 只滚动列表自身）
watch(activeIndex, idx => {
  if (idx < 0) return
  panelEl.value?.querySelector(`[data-index="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
})
</script>

<style scoped>
/* ── 浮层容器：Finder 原生材质（TabHistoryMenu 同款 token） ──────────────────
   独立 stacking context（isolation + z-index），fixed 定位；高不透明度 + blur
   让底层文件列表不可辨认；overflow:hidden 把内容裁进 12px 圆角。 */
.quick-jump-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  isolation: isolate;
  z-index: 70;
  overflow: hidden;
  background: var(--finder-popover-bg);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid var(--finder-popover-border);
  border-radius: 12px;
  box-shadow: var(--finder-popover-shadow);
  -webkit-app-region: no-drag;
  color: var(--finder-label);
  outline: none;
}

/* ── 搜索框：Finder 检索控件（填充式圆角字段，全局 .finder-shell input 提供底色） */
.qj-search {
  position: relative;
  flex-shrink: 0;
  padding: 10px 12px 6px;
}

.qj-search-icon {
  position: absolute;
  top: 50%;
  left: 22px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--finder-secondary-label);
  pointer-events: none;
}

.qj-input {
  width: 100%;
  height: 28px;
  padding: 0 10px 0 30px;
  font-size: 13px;
  outline: none;
}

.qj-input::placeholder {
  color: var(--finder-secondary-label);
  opacity: 0.7;
}

/* ── 分组标题「跳转到」：12.5px Medium 灰（空分组不渲染，见模板 v-if） ──────── */
.qj-group-title {
  flex-shrink: 0;
  padding: 4px 22px 3px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--finder-secondary-label);
}

/* ── 列表区：唯一滚动区（搜索框/分组标题固定在外） ──────────────────────────── */
.qj-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: 50vh; /* 量取前的兜底；打开时被内联 maxHeight 覆盖 */
  padding: 2px 8px 8px;
}

/* ── 记录行：两行结构（名称 13/500 + 路径 11.5），46px ─────────────────────── */
.qj-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 46px;
  padding: 5px 10px;
  border-radius: 7px;
  text-align: left;
}

/* hover：低对比浅灰（不与键盘选中争层级） */
.qj-row:hover:not(.is-active) {
  background: var(--finder-popover-hover);
}

/* 选中（键盘 ↑↓/Enter 语义）：整行系统蓝，名称/路径/图标全部转白 */
.qj-row.is-active {
  background: var(--finder-selection);
}

.qj-row.is-active .qj-row-name,
.qj-row.is-active .qj-row-icon {
  color: #ffffff;
}

.qj-row.is-active .qj-row-path {
  color: rgba(255, 255, 255, 0.82);
}

.qj-row:focus-visible {
  outline: 2px solid var(--finder-selection);
  outline-offset: -2px;
}

.qj-row-icon {
  width: 18px;
  height: 18px;
  color: var(--finder-secondary-label);
}

.qj-row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.qj-row-name {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--finder-label);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qj-row-path {
  font-size: 11.5px;
  line-height: 15px;
  color: var(--finder-popover-path);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 空状态：无历史 / 无匹配（Finder 式居中次级灰） ────────────────────────── */
.qj-empty {
  padding: 14px 8px;
  font-size: 12px;
  text-align: center;
  color: var(--finder-secondary-label);
}

.qj-empty-root {
  flex-shrink: 0;
  margin: 0 12px 12px;
}
</style>
