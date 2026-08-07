<template>
  <div
    class="h-full flex flex-col overflow-hidden bg-bg-primary text-text-primary"
    @keydown="handleKeyDown"
    tabindex="0"
    @click.self="selectedPaths.clear()"
  >
    <DirCompareToolbar
      :rule="localSession.rule"
      :filter="localSession.filter"
      :is-loading="isLoading"
      @refresh="refresh"
      @expand-all="expandAll"
      @collapse-all="collapseAll"
      @next-diff="goNextDiff(scrollToIndex)"
      @prev-diff="goPrevDiff(scrollToIndex)"
      @copy-right="copySelectionToRight"
      @copy-left="copySelectionToLeft"
      @update:rule="onRuleChange"
      @update:filter="localSession.filter = $event"
    />

    <!-- Path Headers -->
    <div class="flex-shrink-0 flex items-stretch border-b border-border bg-bg-secondary/60 text-xs">
      <div class="flex-1 min-w-0 px-4 py-1.5 flex items-center gap-1.5 text-text-secondary font-medium truncate">
        <svg class="w-3.5 h-3.5 flex-shrink-0 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="truncate">{{ localSession.leftRootPath }}</span>
      </div>
      <div class="w-14 flex-shrink-0 border-x border-border" />
      <div class="flex-1 min-w-0 px-4 py-1.5 flex items-center gap-1.5 text-text-secondary font-medium truncate">
        <svg class="w-3.5 h-3.5 flex-shrink-0 text-accent-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="truncate">{{ localSession.rightRootPath }}</span>
      </div>
    </div>

    <!-- Column Headers -->
    <div class="flex-shrink-0 flex items-center border-b border-border bg-bg-secondary text-xs font-medium text-text-tertiary h-8">
      <div class="flex-1 min-w-0 flex items-center gap-2 px-4">
        <span class="flex-1">名称</span>
        <span class="w-16 text-right flex-shrink-0">大小</span>
        <span class="w-28 text-right flex-shrink-0">修改时间</span>
      </div>
      <div class="w-14 flex-shrink-0 text-center border-x border-border/50 self-stretch flex items-center justify-center">
        状态
      </div>
      <div class="flex-1 min-w-0 flex items-center gap-2 px-4">
        <span class="flex-1">名称</span>
        <span class="w-16 text-right flex-shrink-0">大小</span>
        <span class="w-28 text-right flex-shrink-0">修改时间</span>
      </div>
    </div>

    <!-- Loading State (initial) -->
    <div v-if="isLoading && flatEntries.length === 0" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-text-tertiary">
        <div class="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        <span class="text-sm">正在对比目录…</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!isLoading && flatEntries.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-text-tertiary">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm">{{ allEntriesCount === 0 ? '两个目录均为空' : '当前过滤条件下无匹配项' }}</p>
      </div>
    </div>

    <!-- Virtual Scroll List -->
    <RecycleScroller
      v-else
      ref="scrollerRef"
      class="flex-1 min-h-0"
      :items="flatEntries"
      :item-size="ITEM_HEIGHT"
      key-field="relativePath"
      v-slot="{ item: entry, index }"
    >
      <div
        class="compare-row flex items-center border-b border-border/20 cursor-pointer transition-colors duration-75 select-none"
        :style="{ height: ITEM_HEIGHT + 'px' }"
        :class="rowClass(entry, index)"
        :data-index="index"
        @click="handleRowClick(entry, $event)"
        @dblclick="handleRowDblClick(entry)"
        @contextmenu.prevent.stop="showContextMenu($event, entry)"
      >
        <!-- Left Side -->
        <div
          class="flex-1 min-w-0 flex items-center gap-1.5 px-2 h-full"
          :class="leftSideBg(entry)"
        >
          <!-- Indent spacer -->
          <div :style="{ width: entry.depth * 14 + 'px' }" class="flex-shrink-0" />
          <!-- Expand/collapse toggle -->
          <button
            v-if="entry.isDirectory"
            class="w-4 h-4 flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
            @click.stop="toggleExpand(entry)"
          >
            <svg class="w-4 h-4 transition-transform duration-150" :class="{ 'rotate-90': entry.expanded }"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-else class="w-4 flex-shrink-0" />
          <!-- Icon -->
          <component :is="fileIcon(entry, 'left')" class="w-4 h-4 flex-shrink-0" />
          <!-- Name + meta -->
          <template v-if="entry.left">
            <span class="flex-1 min-w-0 truncate text-[13px]">{{ entry.name }}</span>
            <span class="w-16 text-right text-xs flex-shrink-0 opacity-60">
              {{ entry.isDirectory ? '—' : formatSize(entry.left.size) }}
            </span>
            <span class="w-28 text-right text-xs flex-shrink-0 opacity-60">
              {{ formatDate(entry.left.modifiedTime) }}
            </span>
          </template>
          <template v-else>
            <span class="flex-1 min-w-0 truncate text-[13px] opacity-30 italic">（无）</span>
            <span class="w-16 flex-shrink-0" />
            <span class="w-28 flex-shrink-0" />
          </template>
        </div>

        <!-- Status Column -->
        <div class="w-14 flex-shrink-0 flex items-center justify-center border-x border-border/30 h-full">
          <span class="text-base font-bold leading-none" :class="statusTextClass(entry.status)">
            {{ statusSymbol(entry.status) }}
          </span>
        </div>

        <!-- Right Side -->
        <div
          class="flex-1 min-w-0 flex items-center gap-1.5 px-2 h-full"
          :class="rightSideBg(entry)"
        >
          <!-- Indent spacer (mirror left) -->
          <div :style="{ width: entry.depth * 14 + 'px' }" class="flex-shrink-0" />
          <div class="w-4 flex-shrink-0" />
          <component :is="fileIcon(entry, 'right')" class="w-4 h-4 flex-shrink-0" />
          <template v-if="entry.right">
            <span class="flex-1 min-w-0 truncate text-[13px]">{{ entry.name }}</span>
            <span class="w-16 text-right text-xs flex-shrink-0 opacity-60">
              {{ entry.isDirectory ? '—' : formatSize(entry.right.size) }}
            </span>
            <span class="w-28 text-right text-xs flex-shrink-0 opacity-60">
              {{ formatDate(entry.right.modifiedTime) }}
            </span>
          </template>
          <template v-else>
            <span class="flex-1 min-w-0 truncate text-[13px] opacity-30 italic">（无）</span>
            <span class="w-16 flex-shrink-0" />
            <span class="w-28 flex-shrink-0" />
          </template>
        </div>
      </div>
    </RecycleScroller>

    <DirCompareStatusBar :stats="stats" />

    <!-- Context Menu -->
    <div
      v-if="ctxMenu.visible"
      class="ctx-menu fixed z-50 animate-fade-in"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <template v-for="item in ctxMenu.items" :key="item.action">
        <hr v-if="item.action === '__divider__'" class="border-border my-1" />
        <div
          v-else
          class="ctx-menu-item"
          :class="{ 'opacity-40 pointer-events-none': item.disabled }"
          @click="handleCtxAction(item.action, item.entry)"
        >
          {{ item.label }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, h, type Component } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { DirCompareSession, CompareEntry, CompareStatus, CompareRule } from '@/types'
import { useDirCompare } from './useDirCompare'
import { useFileOperationsStore } from '@/stores/fileOperations'
import DirCompareToolbar from './DirCompareToolbar.vue'
import DirCompareStatusBar from './DirCompareStatusBar.vue'
import { useTabsStore } from '@/stores/tabs'

const props = defineProps<{
  session: DirCompareSession
}>()

const fileOpsStore = useFileOperationsStore()
const tabsStore = useTabsStore()

// Local reactive copy of session so filter/rule changes don't mutate the store's Tab
const localSession = reactive<DirCompareSession>({ ...props.session, filter: { ...props.session.filter } })

const sessionRef = computed(() => localSession as DirCompareSession)

const {
  flatEntries,
  isLoading,
  stats,
  refresh,
  toggleExpand,
  expandAll,
  collapseAll,
  goNextDiff,
  goPrevDiff,
  currentDiffIndex,
  rootEntries
} = useDirCompare(sessionRef)

const allEntriesCount = computed(() => rootEntries.value.length)

const ITEM_HEIGHT = 40

// ── Scroller ref ──────────────────────────────────────────────────────────────
const scrollerRef = ref<InstanceType<typeof RecycleScroller> | null>(null)

function scrollToIndex(index: number) {
  scrollerRef.value?.scrollToItem(index)
}

// ── Selection ─────────────────────────────────────────────────────────────────
const selectedPaths = reactive(new Set<string>())
const anchorPath = ref<string | null>(null)

function isSelected(entry: CompareEntry) {
  return selectedPaths.has(entry.relativePath)
}

function handleRowClick(entry: CompareEntry, event: MouseEvent) {
  if (event.detail === 2) return // handled by dblclick

  if (event.metaKey || event.ctrlKey) {
    if (selectedPaths.has(entry.relativePath)) {
      selectedPaths.delete(entry.relativePath)
    } else {
      selectedPaths.add(entry.relativePath)
    }
    anchorPath.value = entry.relativePath
  } else if (event.shiftKey && anchorPath.value) {
    const flat = flatEntries.value
    const anchorIdx = flat.findIndex(e => e.relativePath === anchorPath.value)
    const currIdx = flat.findIndex(e => e.relativePath === entry.relativePath)
    if (anchorIdx !== -1 && currIdx !== -1) {
      selectedPaths.clear()
      const [lo, hi] = anchorIdx < currIdx ? [anchorIdx, currIdx] : [currIdx, anchorIdx]
      for (let i = lo; i <= hi; i++) selectedPaths.add(flat[i].relativePath)
    }
  } else {
    selectedPaths.clear()
    selectedPaths.add(entry.relativePath)
    anchorPath.value = entry.relativePath
  }
}

async function handleRowDblClick(entry: CompareEntry) {
  if (entry.isDirectory) {
    await toggleExpand(entry)
    return
  }
  tabsStore.openFileDiffTab(
    localSession.leftDeviceId,
    entry.left,
    localSession.rightDeviceId,
    entry.right,
    entry.name,
    entry.status
  )
}

// ── Rule change triggers re-compare ──────────────────────────────────────────
async function onRuleChange(rule: CompareRule) {
  localSession.rule = rule
  await refresh()
}

// ── Row styling ───────────────────────────────────────────────────────────────
function rowClass(entry: CompareEntry, index: number): string[] {
  const classes: string[] = []
  if (isSelected(entry)) {
    classes.push('row-selected')
    return classes
  }
  if (index === currentDiffIndex.value) classes.push('ring-1 ring-inset ring-accent-blue/40')
  return classes
}

function leftSideBg(entry: CompareEntry): string {
  if (isSelected(entry)) return ''
  if (entry.status === 'left-only') return 'bg-orange-500/20'
  if (entry.status === 'right-only') return 'bg-bg-primary/0'
  if (entry.status === 'different') return 'bg-red-500/20'
  if (entry.status === 'left-newer' || entry.status === 'right-newer') return 'bg-blue-500/15'
  return ''
}

function rightSideBg(entry: CompareEntry): string {
  if (isSelected(entry)) return ''
  if (entry.status === 'right-only') return 'bg-orange-500/20'
  if (entry.status === 'left-only') return 'bg-bg-primary/0'
  if (entry.status === 'different') return 'bg-red-500/20'
  if (entry.status === 'left-newer' || entry.status === 'right-newer') return 'bg-blue-500/15'
  return ''
}

function statusTextClass(status: CompareStatus): string {
  switch (status) {
    case 'equal':       return 'text-text-tertiary'
    case 'different':   return 'text-red-400'
    case 'left-newer':  return 'text-blue-400'
    case 'right-newer': return 'text-blue-400'
    case 'left-only':   return 'text-orange-400'
    case 'right-only':  return 'text-orange-400'
  }
}

function statusSymbol(status: CompareStatus): string {
  switch (status) {
    case 'equal':       return '='
    case 'different':   return '≠'
    case 'left-newer':  return '◀'
    case 'right-newer': return '▶'
    case 'left-only':   return '◀'
    case 'right-only':  return '▶'
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const FolderIcon: Component = {
  render() {
    return h('img', { src: '/icons/ic_folder_mac.svg', class: 'w-4 h-4' })
  }
}
const FileIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', class: 'text-text-tertiary' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2',
        d: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' })
    ])
  }
}

function fileIcon(entry: CompareEntry, side: 'left' | 'right'): Component {
  const fi = side === 'left' ? entry.left : entry.right
  if (!fi && !entry.isDirectory) return FileIcon
  return entry.isDirectory ? FolderIcon : FileIcon
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const _dateCache = new Map<string, string>()
function formatDate(dateStr: string): string {
  const hit = _dateCache.get(dateStr)
  if (hit) return hit
  const result = new Date(dateStr).toLocaleDateString('zh-CN', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
  _dateCache.set(dateStr, result)
  return result
}

// ── Context Menu ──────────────────────────────────────────────────────────────
interface CtxItem {
  label: string
  action: string
  entry?: CompareEntry
  disabled?: boolean
}

const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  items: [] as CtxItem[]
})

function showContextMenu(event: MouseEvent, entry: CompareEntry) {
  if (!isSelected(entry)) {
    selectedPaths.clear()
    selectedPaths.add(entry.relativePath)
  }

  const canLeft  = !!entry.left
  const canRight = !!entry.right

  ctxMenu.items = [
    { label: '复制到右侧', action: 'copy-right', entry, disabled: !canLeft  },
    { label: '复制到左侧', action: 'copy-left',  entry, disabled: !canRight },
    { label: '---', action: '__divider__' },
    { label: '删除（左侧）', action: 'delete-left',  entry, disabled: !canLeft  },
    { label: '删除（右侧）', action: 'delete-right', entry, disabled: !canRight },
    { label: '删除（两侧）', action: 'delete-both',  entry, disabled: !canLeft || !canRight }
  ]
  ctxMenu.x = event.clientX
  ctxMenu.y = event.clientY
  ctxMenu.visible = true
}

function hideContextMenu() { ctxMenu.visible = false }

async function handleCtxAction(action: string, entry?: CompareEntry) {
  hideContextMenu()
  if (!entry) return

  switch (action) {
    case 'copy-right': await copySingleToRight(entry); break
    case 'copy-left':  await copySingleToLeft(entry);  break
    case 'delete-left':  await deleteSide(entry, 'left');  break
    case 'delete-right': await deleteSide(entry, 'right'); break
    case 'delete-both':  await deleteSide(entry, 'both');  break
  }
}

// ── Copy operations ───────────────────────────────────────────────────────────

function getSelectedEntries(): CompareEntry[] {
  return flatEntries.value.filter(e => selectedPaths.has(e.relativePath))
}

async function copySingleToRight(entry: CompareEntry) {
  if (!entry.left) return
  const destDir = dirOf(localSession.rightRootPath, entry.relativePath)
  await fileOpsStore.createCopyTask(
    localSession.leftDeviceId, [entry.left.path],
    localSession.rightDeviceId, destDir
  )
  fileOpsStore.showPanel()
  scheduleRefresh()
}

async function copySingleToLeft(entry: CompareEntry) {
  if (!entry.right) return
  const destDir = dirOf(localSession.leftRootPath, entry.relativePath)
  await fileOpsStore.createCopyTask(
    localSession.rightDeviceId, [entry.right.path],
    localSession.leftDeviceId, destDir
  )
  fileOpsStore.showPanel()
  scheduleRefresh()
}

async function copySelectionToRight() {
  const entries = getSelectedEntries().filter(e => e.left)
  for (const entry of entries) {
    await copySingleToRight(entry)
  }
}

async function copySelectionToLeft() {
  const entries = getSelectedEntries().filter(e => e.right)
  for (const entry of entries) {
    await copySingleToLeft(entry)
  }
}

async function deleteSide(entry: CompareEntry, side: 'left' | 'right' | 'both') {
  const names: string[] = []
  if (side === 'left' || side === 'both') names.push(`左侧: ${entry.left?.path ?? entry.name}`)
  if (side === 'right' || side === 'both') names.push(`右侧: ${entry.right?.path ?? entry.name}`)
  if (!confirm(`确认删除以下文件？\n\n${names.join('\n')}`)) return

  if ((side === 'left' || side === 'both') && entry.left) {
    await fileOpsStore.createDeleteTask(localSession.leftDeviceId, [entry.left.path])
  }
  if ((side === 'right' || side === 'both') && entry.right) {
    await fileOpsStore.createDeleteTask(localSession.rightDeviceId, [entry.right.path])
  }
  fileOpsStore.showPanel()
  scheduleRefresh()
}

/** Returns the parent directory path on the given root for a relative path */
function dirOf(root: string, relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf('/')
  if (lastSlash === -1) return root
  return `${root}/${relativePath.substring(0, lastSlash)}`
}

// ── Auto-refresh after operations ────────────────────────────────────────────
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh(delay = 1500) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { refreshTimer = null; refresh() }, delay)
}

// ── Keyboard ─────────────────────────────────────────────────────────────────
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'F5') { event.preventDefault(); refresh() }
  if (event.key === 'F7') {
    event.preventDefault()
    if (event.shiftKey) goPrevDiff(scrollToIndex)
    else goNextDiff(scrollToIndex)
  }
  if (event.key === 'Escape') { selectedPaths.clear() }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  refresh()
  document.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<style scoped>
.compare-row:hover {
  background-color: var(--bg-hover);
}
.row-selected {
  background-color: var(--bg-selected);
  @apply text-white;
}
.row-selected .opacity-60 {
  opacity: 0.75;
}

.ctx-menu {
  @apply min-w-[160px] bg-bg-secondary border border-border rounded-lg shadow-xl py-1;
}
.ctx-menu-item {
  @apply px-3 py-1.5 text-[13px] text-text-primary cursor-pointer hover:bg-accent-blue hover:text-white transition-colors;
}

.animate-fade-in {
  animation: fadeIn 0.1s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
