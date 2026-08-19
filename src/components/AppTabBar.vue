<template>
  <!-- Finder 式标签栏（三区结构）：
       A 红绿灯保留区在 App.vue 的 spacer；B 可滚动标签区（溢出横滚 + 渐隐）；
       C 固定簇 ⊕/⌄ 贴右缘。根不再担任滚动容器，弹层/渐隐才能正确定位。
       视觉（材质/hairline/hover/press）在 finder-ui.css 全局层。 -->
  <div
    class="finder-tab-strip app-drag h-11 flex items-center px-2 relative"
    :class="folderDragOver ? 'bg-accent-blue/5' : ''"
    role="tablist"
    :aria-label="$t('tabs.stripAriaLabel')"
    @dragover.prevent="onFolderDragOver"
    @dragleave="onFolderDragLeave"
    @drop.prevent="onFolderDrop"
    @keydown="onStripKeydown"
    @wheel="onStripWheel"
  >
    <div ref="scrollerEl" class="tab-scroll" @scroll="updateEdgeFades">
      <template v-for="(tab, i) in tabsStore.tabs" :key="tab.id">
        <div
          v-if="drag.active && drag.insertIndex === i"
          class="tab-drop-indicator"
          aria-hidden="true"
        />
        <TabItem
          :ref="el => setTabEl(tab.id, el)"
          :tab="tab"
          :active="tab.id === tabsStore.activeTabId"
          :dirty="dirtyIds.has(tab.id)"
          :error="errorIds.has(tab.id)"
          :closable="tabsStore.tabs.length > 1"
          :label="labelFor(tab)"
          :tooltip="tooltipFor(tab)"
          :a11y-label="ariaFor(tab, i)"
          @pointerdown="onTabPointerDown($event, i)"
          @select="onSelect"
          @close="tabsStore.closeTab"
          @contextmenu="openContextMenu($event, tab, i)"
          @rename="onRename"
        />
      </template>
      <div
        v-if="drag.active && drag.insertIndex === tabsStore.tabs.length"
        class="tab-drop-indicator"
        aria-hidden="true"
      />
    </div>

    <!-- 溢出渐隐（12px，pointer-events 穿透；background-image 显式声明避开全局层简写坑） -->
    <div v-if="canScrollLeft" class="edge-fade is-left" aria-hidden="true" />
    <div v-if="canScrollRight" class="edge-fade is-right" aria-hidden="true" />

    <!-- 固定簇：⊕（⌘T 语义）+ 🕐（历史目录，最近10条）+ ⌄（标签总览，任何时候可开） -->
    <div class="tab-cluster app-no-drag">
      <button
        class="action-button"
        :title="$t('tabs.newTab')"
        :aria-label="$t('tabs.newTab')"
        @click="tabsStore.newTabFromActiveContext()"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <button
        ref="historyBtnEl"
        class="action-button"
        :title="$t('tabs.historyButton')"
        :aria-label="$t('tabs.historyButton')"
        :aria-expanded="historyRect !== null"
        @click="toggleHistory"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      <button
        ref="overviewBtnEl"
        class="action-button"
        :title="$t('tabs.overviewButton')"
        :aria-label="$t('tabs.overviewButton')"
        :aria-expanded="overviewRect !== null"
        @click="toggleOverview"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <TabContextMenu
      v-if="ctxMenu"
      :tab="ctxMenu.tab"
      :has-others="ctxMenu.hasOthers"
      :has-right="ctxMenu.hasRight"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      @action="onContextMenuAction"
      @close="ctxMenu = null"
    />

    <TabOverviewMenu
      v-if="overviewRect"
      :rows="overviewRows"
      :anchor="overviewRect"
      @select="id => { tabsStore.setActiveTab(id); closeOverview() }"
      @close-tab="id => tabsStore.closeTab(id)"
      @new-tab="() => { tabsStore.newTabFromActiveContext(); closeOverview() }"
      @close="closeOverview"
    />

    <TabHistoryMenu
      v-if="historyRect"
      :entries="historyEntries"
      :anchor="historyRect"
      @open="openHistoryEntry"
      @clear="() => { browserStore.clearRecentLocations(); closeHistory() }"
      @close="closeHistory"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { useDevicesStore } from '@/stores/devices'
import { useFileBrowserStore } from '@/stores/fileBrowser'
import { useI18n } from 'vue-i18n'
import type { InternalFileDragPayload } from '@/types/fileOperation'
import type { Tab } from '@/types'
import { disambiguateTabTitles, tabFullPath, tabKindOf, tabTitleEntry } from '@/utils/tabTitles'
import TabItem, { type TabLabel } from './tabbar/TabItem.vue'
import TabContextMenu, { type TabContextMenuAction } from './tabbar/TabContextMenu.vue'
import TabOverviewMenu, { type TabOverviewRow } from './tabbar/TabOverviewMenu.vue'
import TabHistoryMenu, { type TabHistoryEntry } from './tabbar/TabHistoryMenu.vue'
import { iconForTab } from './tabbar/tabIcons'
import { useTabDragReorder } from './tabbar/useTabDragReorder'
import { useRecentLocationEntries } from '@/composables/useRecentLocationEntries'

const tabsStore = useTabsStore()
const devicesStore = useDevicesStore()
const browserStore = useFileBrowserStore()
const recentLocationEntries = useRecentLocationEntries()
const { t } = useI18n()

// ── 同名消歧（只在渲染层 computed，绝不写回 Tab —— 写回会持续触发持久化） ──────
const deviceNameOf = (deviceId: string): string | undefined => {
  if (deviceId === 'local') return t('devices.localName')
  return devicesStore.devices.find(d => d.id === deviceId)?.name
}

const disambiguated = computed(() =>
  disambiguateTabTitles(tabsStore.tabs.map(tabTitleEntry), deviceNameOf)
)

/** 工具页标题（titleKey 走 i18n，语言切换即时生效）。 */
function i18nTitle(tab: Tab): string {
  return tab.titleKey ? t(tab.titleKey, tab.titleParams ?? {}) : tab.title
}

function displayTitle(tab: Tab): string {
  if (tab.titleAlias) return tab.titleAlias
  if (tab.titleKey || tabKindOf(tab) === 'tool') return i18nTitle(tab)
  const d = disambiguated.value.get(tab.id)
  return d ? (d.prefix ? `${d.prefix} › ${d.leaf}` : d.leaf) : tab.title
}

function labelFor(tab: Tab): TabLabel {
  if (tab.titleAlias) return { prefix: null, leaf: tab.titleAlias }
  if (tab.titleKey || tabKindOf(tab) === 'tool') return { prefix: null, leaf: i18nTitle(tab) }
  const d = disambiguated.value.get(tab.id)
  return d ? { prefix: d.prefix, leaf: d.leaf } : { prefix: null, leaf: tab.title }
}

function tooltipFor(tab: Tab): string {
  const path = tabFullPath(tab)
  return path ? `${displayTitle(tab)}\n${path}` : displayTitle(tab)
}

function ariaFor(tab: Tab, index: number): string {
  return t('tabs.ariaTabLabel', {
    name: displayTitle(tab),
    type: t(`tabs.tabType.${tabKindOf(tab)}`),
    index: index + 1,
    total: tabsStore.tabs.length
  })
}

// ── 脏态（探针在预览内容组件注册；dirtyVersion 变化触发重算） ──────────────────
const dirtyIds = computed(() => {
  void tabsStore.dirtyVersion
  void tabsStore.tabs.length
  const set = new Set<string>()
  for (const tab of tabsStore.tabs) {
    if (tabsStore.isTabDirty(tab)) set.add(tab.id)
  }
  return set
})

// ── 目录失效（任一 pane.loadError 非空 → ⚠）──────────────────────────────────
const errorIds = computed(() => {
  const set = new Set<string>()
  for (const tab of tabsStore.tabs) {
    if (tab.panes.some(p => p.loadError)) set.add(tab.id)
  }
  return set
})

// ── 选择 / 别名 ───────────────────────────────────────────────────────────────
function onSelect(tabId: string) {
  if (shouldSuppressClick()) return
  tabsStore.setActiveTab(tabId)
}

function onRename(tabId: string, alias: string) {
  tabsStore.setTabAlias(tabId, alias)
}

// ── 拖拽重排 ──────────────────────────────────────────────────────────────────
const scrollerEl = ref<HTMLElement | null>(null)
const pinnedCount = computed(() => tabsStore.tabs.filter(tb => tb.pinned).length)

const { dragState: drag, onTabPointerDown, shouldSuppressClick } = useTabDragReorder({
  scroller: () => scrollerEl.value,
  onReorder: (from, to) => tabsStore.moveTab(from, to),
  pinnedCount: () => pinnedCount.value
})

// ── 右键菜单 ──────────────────────────────────────────────────────────────────
const ctxMenu = ref<{ tab: Tab; x: number; y: number; hasOthers: boolean; hasRight: boolean } | null>(null)

function openContextMenu(e: MouseEvent, tab: Tab, index: number) {
  const closableOthers = tabsStore.tabs.some((tb, i) => i !== index && !tb.pinned)
  ctxMenu.value = {
    tab,
    x: e.clientX,
    y: e.clientY,
    hasOthers: closableOthers,
    hasRight: tabsStore.tabs.slice(index + 1).some(tb => !tb.pinned)
  }
}

async function onContextMenuAction(action: TabContextMenuAction, tabId: string) {
  switch (action) {
    case 'close': tabsStore.closeTab(tabId); break
    case 'closeOthers': tabsStore.closeOtherTabs(tabId); break
    case 'closeRight': tabsStore.closeTabsToRight(tabId); break
    case 'togglePin': tabsStore.togglePin(tabId); break
    case 'resetAlias': tabsStore.setTabAlias(tabId, undefined); break
    case 'copyPath': {
      const tab = tabsStore.tabs.find(tb => tb.id === tabId)
      const path = tab ? tabFullPath(tab) : ''
      if (path) {
        try {
          await navigator.clipboard.writeText(path)
        } catch (e) {
          console.warn('[AppTabBar] copy path failed', e)
        }
      }
      break
    }
  }
}

// ── 标签总览弹层 ──────────────────────────────────────────────────────────────
const overviewRect = ref<DOMRect | null>(null)
const overviewBtnEl = ref<HTMLElement | null>(null)

const overviewRows = computed<TabOverviewRow[]>(() =>
  tabsStore.tabs.map(tab => ({
    tab,
    icon: iconForTab(tab),
    title: tab.titleAlias ?? labelFor(tab).leaf,
    prefix: tab.titleAlias ? null : labelFor(tab).prefix,
    path: tabFullPath(tab),
    dirty: dirtyIds.value.has(tab.id),
    current: tab.id === tabsStore.activeTabId
  }))
)

function toggleOverview() {
  if (overviewRect.value) {
    closeOverview()
  } else {
    closeHistory() // 与历史弹层互斥，两个 fixed 浮层不可同屏
    const rect = overviewBtnEl.value?.getBoundingClientRect()
    if (rect) overviewRect.value = rect
  }
}

function closeOverview() {
  overviewRect.value = null
}

// ── 历史目录弹层（最近10条，点击在新标签页打开） ───────────────────────────────
// 数据来自 fileBrowser store 的 recentLocations（每次面板导航都会 remember），
// 点击后显式 rememberLocation 重新置顶——新 tab 打开本身不触发面板导航记录。
const historyRect = ref<DOMRect | null>(null)
const historyBtnEl = ref<HTMLElement | null>(null)

/** 展示条目推导（叶子名/父路径/设备前缀）与 ⌘⇧P 快速跳转面板共用同一 composable。 */
const historyEntries = computed<TabHistoryEntry[]>(() => recentLocationEntries.value)

function toggleHistory() {
  if (historyRect.value) {
    closeHistory()
  } else {
    closeOverview() // 与标签总览互斥
    const rect = historyBtnEl.value?.getBoundingClientRect()
    if (rect) historyRect.value = rect
  }
}

function closeHistory() {
  historyRect.value = null
}

function openHistoryEntry(entry: TabHistoryEntry) {
  tabsStore.openPathInNewTab(entry.deviceId, entry.path)
  browserStore.rememberLocation(entry.deviceId, entry.path)
  closeHistory()
}

// ── 滚动：溢出渐隐 + 激活标签滚入视区 ────────────────────────────────────────
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateEdgeFades() {
  const el = scrollerEl.value
  if (!el) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

const tabEls = new Map<string, HTMLElement>()
function setTabEl(id: string, el: unknown) {
  const root = (el as { $el?: HTMLElement } | null)?.$el
  if (root instanceof HTMLElement) tabEls.set(id, root)
  else tabEls.delete(id)
}

watch(
  () => [tabsStore.activeTabId, tabsStore.tabs.length, pinnedCount.value] as const,
  () => {
    nextTick(() => {
      tabEls.get(tabsStore.activeTabId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      updateEdgeFades()
    })
  }
)

// 窗口尺寸变化时重算渐隐
function onResize() {
  updateEdgeFades()
}

// ── 滚轮：溢出时垂直滚轮转横向滚动（Chrome 标签条语义） ──────────────────────
// Chromium 不把垂直 wheel 重定向到「仅横向可滚」的容器，横向滚动条又是隐藏的
// ——不接管时普通滚轮/触控板上下滑在标签溢出后完全无法移动标签条。真机已验证
// （CGEvent 实测 2026-08-19）：垂直滚轮 scrollLeft 纹丝不动。接管规则：
// ① 未溢出放行原生行为；② ctrl+滚轮（捏合缩放）放行；③ 溢出时 preventDefault
// 并把 deltaY（+ deltaX，shift+滚轮已被 Chromium 折算进 deltaX）累进 scrollLeft。
// 注意 app-drag 区（条上空白/tab 间隙）的 wheel 被 macOS 窗口层吞掉、根本进
// 不了渲染层——本处理实际覆盖 no-drag 的 tab 本体与 ⊕🕐⌄ 按钮簇，即条高
// 28px 的主命中带；空白区保留窗口拖拽语义，不动 app-region。
function onStripWheel(e: WheelEvent) {
  if (e.ctrlKey) return // 捏合缩放不劫持
  const el = scrollerEl.value
  if (!el || el.scrollWidth <= el.clientWidth + 1) return
  e.preventDefault()
  const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
  el.scrollLeft += (e.deltaY + e.deltaX) * unit
}

onMounted(() => {
  updateEdgeFades()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

// ── 键盘：标签聚焦时 ←/→ 切换（roving 活动位） ────────────────────────────────
function onStripKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.tab-item') || target.tagName === 'INPUT') return
  const tabs = tabsStore.tabs
  const index = tabs.findIndex(tb => tb.id === tabsStore.activeTabId)
  if (e.key === 'ArrowLeft' && index > 0) {
    e.preventDefault()
    tabsStore.setActiveTab(tabs[index - 1].id)
  } else if (e.key === 'ArrowRight' && index < tabs.length - 1) {
    e.preventDefault()
    tabsStore.setActiveTab(tabs[index + 1].id)
  }
}

// ── 拖文件夹到标签栏 → 新标签页打开 ───────────────────────────────────────────
// dragover 阶段读不到 dataTransfer 数据（浏览器限制），只能按 types 判断是否为
// app 内部拖拽；isDirectory 校验与开 tab 在 drop 时进行。
const folderDragOver = ref(false)

function onFolderDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/json')) {
    folderDragOver.value = true
  }
}

function onFolderDragLeave() {
  folderDragOver.value = false
}

async function onFolderDrop(event: DragEvent) {
  folderDragOver.value = false
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const payload = JSON.parse(raw) as InternalFileDragPayload
    const path = payload.files[0]
    if (!path || payload.files.length !== 1) return // 仅单个文件夹有"打开"语义
    const stats = await window.fileman.getStats(payload.deviceId, path)
    if (!stats.isDirectory) return
    tabsStore.openPathInNewTab(payload.deviceId, path)
  } catch (e) {
    console.warn('[AppTabBar] drop: not a folder or invalid payload', e)
  }
}
</script>

<style scoped>
.tab-scroll {
  @apply flex items-center gap-1 flex-1 min-w-0;
  overflow-x: auto;
  overflow-y: hidden;
}

.tab-scroll::-webkit-scrollbar {
  display: none;
}

.tab-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.edge-fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  z-index: 1;
  pointer-events: none;
  background-image: linear-gradient(90deg, var(--finder-chrome), transparent);
}

.edge-fade.is-left {
  left: 0;
}

.edge-fade.is-right {
  right: 0;
  background-image: linear-gradient(270deg, var(--finder-chrome), transparent);
}

.tab-cluster {
  @apply flex items-center gap-1 shrink-0;
  margin-left: 4px;
}

.tab-drop-indicator {
  width: 2px;
  height: 20px;
  border-radius: 1px;
  flex-shrink: 0;
  background: var(--finder-selection);
}

.action-button {
  @apply h-7 w-7 flex items-center justify-center text-text-secondary hover:text-accent-blue hover:bg-bg-hover rounded-md transition-all duration-150;
  @apply active:bg-bg-active;
  -webkit-app-region: no-drag; /* 标签栏整体可拖动窗口，按钮豁免 */
  flex-shrink: 0;
}
</style>
