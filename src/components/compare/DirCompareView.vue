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
      :is-verifying="isVerifying"
      @refresh="refresh"
      @go-parent="goParent"
      @swap-sides="swapSides"
      @verify="verifySelection"
      @cancel-verify="cancelVerification"
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
        <span class="truncate">{{ leftDeviceName }} · {{ localSession.leftRootPath }}</span>
      </div>
      <div class="w-28 flex-shrink-0 border-x border-border" />
      <div class="flex-1 min-w-0 px-4 py-1.5 flex items-center gap-1.5 text-text-secondary font-medium truncate">
        <svg class="w-3.5 h-3.5 flex-shrink-0 text-accent-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="truncate">{{ rightDeviceName }} · {{ localSession.rightRootPath }}</span>
      </div>
    </div>

    <!-- Column Headers -->
    <div class="flex-shrink-0 flex items-center border-b border-border bg-bg-secondary text-xs font-medium text-text-tertiary h-8">
      <div class="flex-1 min-w-0 flex items-center gap-2 px-4">
        <span class="flex-1">名称</span>
        <span class="w-16 text-right flex-shrink-0">大小</span>
        <span class="w-28 text-right flex-shrink-0">修改时间</span>
      </div>
      <div class="w-28 flex-shrink-0 text-center border-x border-border/50 self-stretch flex items-center justify-center">
        状态
      </div>
      <div class="flex-1 min-w-0 flex items-center gap-2 px-4">
        <span class="flex-1">名称</span>
        <span class="w-16 text-right flex-shrink-0">大小</span>
        <span class="w-28 text-right flex-shrink-0">修改时间</span>
      </div>
    </div>

    <div v-if="filterActive" class="flex items-center gap-2 border-b border-border bg-accent-blue/10 px-4 py-1.5 text-xs text-text-secondary">
      <svg class="h-3.5 w-3.5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18l-7 8v5l-4 3v-8L3 4z" /></svg>
      <span>已过滤：显示 {{ stats.visible }} 项，隐藏 {{ stats.hidden }} 项</span>
      <button class="ml-1 text-accent-blue hover:underline" @click="clearFilter">清除过滤</button>
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
        <div class="w-28 flex-shrink-0 flex items-center justify-center gap-1.5 border-x border-border/30 h-full px-1">
          <span class="flex-shrink-0 text-xs font-medium leading-none" :class="statusTextClass(displayStatus(entry))" :title="statusLabel(displayStatus(entry))">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path v-if="isEqualStatus(displayStatus(entry))" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12l4 4L19 6" />
              <path v-else-if="displayStatus(entry) === 'left-only'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 6l-6 6 6 6M9 12h10" />
              <path v-else-if="displayStatus(entry) === 'right-only'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6l6 6-6 6m5-6H5" />
              <path v-else-if="displayStatus(entry) === 'verifying'" stroke-linecap="round" stroke-width="2" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36l-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0l-2.12-2.12M7.76 7.76L5.64 5.64" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7l10 10M17 7L7 17" />
            </svg>
          </span>
          <span class="min-w-0 truncate text-[11px]" :class="statusTextClass(displayStatus(entry))">{{ statusLabel(displayStatus(entry)) }}</span>
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

    <DirCompareStatusBar :stats="stats" :selected-count="selectedPaths.size" :verification-progress="verificationProgress" />

    <DirCompareCopyDialog
      v-if="copyPlan"
      :plan="copyPlan"
      @cancel="copyPlan = null"
      @confirm="executeCopyPlan"
    />

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
import type { DirCompareSession, CompareEntry, CompareStatus, CompareRule, CopyConflictStrategy, DirCompareCopyPlan } from '@/types'
import { useDirCompare } from './useDirCompare'
import { buildCopyPlan, displayStatus } from './compareDomain'
import { useFileOperationsStore } from '@/stores/fileOperations'
import DirCompareToolbar from './DirCompareToolbar.vue'
import DirCompareStatusBar from './DirCompareStatusBar.vue'
import { useTabsStore } from '@/stores/tabs'
import { useDevicesStore } from '@/stores/devices'
import DirCompareCopyDialog from './DirCompareCopyDialog.vue'

const props = defineProps<{
  session: DirCompareSession
}>()

const fileOpsStore = useFileOperationsStore()
const tabsStore = useTabsStore()
const devicesStore = useDevicesStore()

// Local reactive copy of session so filter/rule changes don't mutate the store's Tab
const localSession = reactive<DirCompareSession>({ ...props.session, filter: { ...props.session.filter } })

const sessionRef = computed(() => localSession as DirCompareSession)

const {
  flatEntries,
  isLoading,
  isVerifying,
  verificationProgress,
  stats,
  refresh,
  toggleExpand,
  expandAll,
  collapseAll,
  goNextDiff,
  goPrevDiff,
  currentDiffIndex,
  rootEntries,
  dataRevision,
  verifyContent,
  cancelVerification,
  dispose
} = useDirCompare(sessionRef)

const leftDeviceName = computed(() => devicesStore.getDevice(localSession.leftDeviceId)?.name ?? '左侧设备')
const rightDeviceName = computed(() => devicesStore.getDevice(localSession.rightDeviceId)?.name ?? '右侧设备')
const filterActive = computed(() => !(localSession.filter.showEqual && localSession.filter.showDifferent && localSession.filter.showLeftOnly && localSession.filter.showRightOnly))

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

function clearFilter() {
  localSession.filter = { showEqual: true, showDifferent: true, showLeftOnly: true, showRightOnly: true }
}

async function verifySelection() {
  const selected = getSelectedEntries()
  await verifyContent(selected.length ? selected : flatEntries.value.filter(entry => !entry.isDirectory))
}

async function goParent() {
  const parent = (path: string) => {
    const normalized = path.replace(/\/+$/, '')
    const index = normalized.lastIndexOf('/')
    return index > 0 ? normalized.slice(0, index) : normalized || '/'
  }
  const nextLeft = parent(localSession.leftRootPath)
  const nextRight = parent(localSession.rightRootPath)
  if (nextLeft === localSession.leftRootPath && nextRight === localSession.rightRootPath) return
  localSession.leftRootPath = nextLeft
  localSession.rightRootPath = nextRight
  selectedPaths.clear()
  await refresh()
}

async function swapSides() {
  await cancelVerification()
  ;[localSession.leftDeviceId, localSession.rightDeviceId] = [localSession.rightDeviceId, localSession.leftDeviceId]
  ;[localSession.leftRootPath, localSession.rightRootPath] = [localSession.rightRootPath, localSession.leftRootPath]
  selectedPaths.clear()
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
  if (displayStatus(entry) === 'different' || displayStatus(entry) === 'verification-failed') return 'bg-red-500/20'
  if (entry.status === 'left-newer' || entry.status === 'right-newer') return 'bg-blue-500/15'
  return ''
}

function rightSideBg(entry: CompareEntry): string {
  if (isSelected(entry)) return ''
  if (entry.status === 'right-only') return 'bg-orange-500/20'
  if (entry.status === 'left-only') return 'bg-bg-primary/0'
  if (displayStatus(entry) === 'different' || displayStatus(entry) === 'verification-failed') return 'bg-red-500/20'
  if (entry.status === 'left-newer' || entry.status === 'right-newer') return 'bg-blue-500/15'
  return ''
}

function statusTextClass(status: CompareStatus): string {
  switch (status) {
    case 'metadata-equal': return 'text-text-tertiary'
    case 'content-equal': return 'text-green-400'
    case 'different':   return 'text-red-400'
    case 'left-newer':  return 'text-blue-400'
    case 'right-newer': return 'text-blue-400'
    case 'left-only':   return 'text-orange-400'
    case 'right-only':  return 'text-orange-400'
    case 'verifying': return 'text-blue-400 animate-pulse'
    case 'verification-failed':
    case 'uncomparable': return 'text-orange-400'
    case 'type-mismatch': return 'text-red-400'
  }
}

function statusLabel(status: CompareStatus): string {
  switch (status) {
    case 'metadata-equal': return '元数据相同'
    case 'content-equal': return '内容相同'
    case 'different': return '内容不同'
    case 'left-newer': return '左侧较新'
    case 'right-newer': return '右侧较新'
    case 'left-only': return '仅左侧'
    case 'right-only': return '仅右侧'
    case 'type-mismatch': return '类型不同'
    case 'verifying': return '正在校验'
    case 'verification-failed': return '校验失败'
    case 'uncomparable': return '无法比较'
  }
}

function isEqualStatus(status: CompareStatus) {
  return status === 'metadata-equal' || status === 'content-equal'
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
const TextFileIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', class: 'text-blue-400' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M7 4h10v16H7zM9 9h6m-6 3h6m-6 3h4' })
    ])
  }
}
const ImageFileIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', class: 'text-purple-400' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 5h16v14H4zM8 10h.01M5 17l5-5 3 3 2-2 4 4' })
    ])
  }
}

function fileIcon(entry: CompareEntry, side: 'left' | 'right'): Component {
  const fi = side === 'left' ? entry.left : entry.right
  if (!fi && !entry.isDirectory) return FileIcon
  if (entry.isDirectory) return FolderIcon
  const extension = fi?.extension?.toLowerCase() ?? fi?.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic'].includes(extension.replace('.', ''))) return ImageFileIcon
  if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'ts', 'js', 'vue', 'css', 'html', 'py', 'java', 'swift'].includes(extension.replace('.', ''))) return TextFileIcon
  return FileIcon
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
    { label: entry.verification?.status === 'failed' ? '重试内容校验' : '校验内容', action: 'verify', entry, disabled: !entry.left || !entry.right || entry.isDirectory },
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
    case 'verify': await verifyContent([entry]); break
    case 'copy-right': openCopyPlan('left-to-right'); break
    case 'copy-left':  openCopyPlan('right-to-left');  break
    case 'delete-left':  await deleteSide(entry, 'left');  break
    case 'delete-right': await deleteSide(entry, 'right'); break
    case 'delete-both':  await deleteSide(entry, 'both');  break
  }
}

// ── Copy operations ───────────────────────────────────────────────────────────

function getSelectedEntries(): CompareEntry[] {
  return flatEntries.value.filter(e => selectedPaths.has(e.relativePath))
}

const copyPlan = ref<DirCompareCopyPlan | null>(null)

function openCopyPlan(direction: DirCompareCopyPlan['direction']) {
  copyPlan.value = buildCopyPlan({
    direction, entries: rootEntries.value, visibleEntries: flatEntries.value,
    filterActive: !(localSession.filter.showEqual && localSession.filter.showDifferent && localSession.filter.showLeftOnly && localSession.filter.showRightOnly),
    selectedPaths,
    leftDeviceId: localSession.leftDeviceId, leftRootPath: localSession.leftRootPath,
    rightDeviceId: localSession.rightDeviceId, rightRootPath: localSession.rightRootPath,
    revision: dataRevision.value
  })
}

async function executeCopyPlan(strategy: Exclude<CopyConflictStrategy, 'ask'>) {
  const plan = copyPlan.value
  if (!plan || plan.revision !== dataRevision.value) {
    copyPlan.value = null
    return
  }
  for (const item of plan.items) {
    await fileOpsStore.createCopyTask(item.sourceDeviceId, [item.sourcePath], item.targetDeviceId, item.targetDirectory, strategy)
  }
  copyPlan.value = null
  if (plan.items.length) fileOpsStore.showPanel()
  scheduleRefresh()
}

async function copySelectionToRight() {
  openCopyPlan('left-to-right')
}

async function copySelectionToLeft() {
  openCopyPlan('right-to-left')
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
  dispose()
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
