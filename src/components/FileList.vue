<template>
  <div ref="containerRef" class="flex-1 flex flex-col overflow-hidden relative" @contextmenu.prevent="showContextMenu" @mousedown="handleContainerMouseDown">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-text-tertiary">
        <div class="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm">Loading...</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedFiles.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-text-tertiary">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="text-sm">This folder is empty</span>
      </div>
    </div>

    <!-- List View -->
    <template v-else-if="viewMode === 'list'">
      <!-- Header 固定在顶部，不随列表滚动 -->
      <div class="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-bg-secondary border-b border-border text-xs font-medium text-text-tertiary">
        <span class="w-6"></span>
        <button class="flex-1 text-left hover:text-text-primary" @click="toggleSort('name')">Name {{ sortIndicator('name') }}</button>
        <button class="w-24 text-right hover:text-text-primary" @click="toggleSort('size')">Size {{ sortIndicator('size') }}</button>
        <button class="w-36 text-right hover:text-text-primary" @click="toggleSort('modifiedTime')">Date Modified {{ sortIndicator('modifiedTime') }}</button>
      </div>

      <!-- 虚拟滚动列表 -->
      <RecycleScroller
        class="flex-1 min-h-0"
        :items="displayedFiles"
        :item-size="LIST_ITEM_HEIGHT"
        key-field="path"
        v-slot="{ item: file }"
      >
        <div
          class="file-item flex items-center gap-3 px-4 cursor-pointer transition-colors duration-100"
          :data-file-path="file.path"
          :style="{ height: LIST_ITEM_HEIGHT + 'px' }"
          :class="isSelected(file.path) ? 'bg-accent-blue text-white' : 'text-text-primary hover:bg-bg-hover'"
          draggable="true"
          @click="handleClick(file, $event)"
          @dragstart="handleDragStart(file, $event)"
          @contextmenu.prevent.stop="showFileContextMenu($event, file)"
        >
          <div class="w-6 h-6 flex-shrink-0 flex items-center justify-center overflow-hidden rounded">
            <img
              v-if="getThumbnailUrl(file, 'small')"
              :src="getThumbnailUrl(file, 'small')!"
              class="w-full h-full object-cover"
              @error="thumbnailUrls.delete(`${file.path}:small`)"
            />
            <component v-else :is="getFileIconComponent(file)" class="w-6 h-6" />
          </div>
          <span class="flex-1 truncate text-base">{{ file.name }}</span>
          <span class="w-24 text-right text-sm" :class="isSelected(file.path) ? 'text-white/70' : 'text-text-tertiary'">
            {{ file.isDirectory ? '--' : formatSize(file.size) }}
          </span>
          <span class="w-36 text-right text-sm" :class="isSelected(file.path) ? 'text-white/70' : 'text-text-tertiary'">
            {{ formatDate(file.modifiedTime) }}
          </span>
        </div>
      </RecycleScroller>
    </template>

    <!-- Grid View: 按行分组虚拟滚动（支持大/中/小三档） -->
    <RecycleScroller
      v-else-if="viewMode === 'grid'"
      class="flex-1 min-h-0 px-4 pt-4"
      :items="gridRows"
      :item-size="gridCfg.rowHeight + gridCfg.rowGap"
      key-field="key"
      v-slot="{ item: row }"
    >
      <div
        class="grid"
        :style="{ gridTemplateColumns: `repeat(${itemsPerRow}, 1fr)`, height: gridCfg.rowHeight + 'px', columnGap: gridCfg.rowGap + 'px', rowGap: gridCfg.rowGap + 'px' }"
      >
        <div
          v-for="file in row.files"
          :key="file.path"
          class="file-item flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all duration-100 overflow-hidden"
          :data-file-path="file.path"
          :class="isSelected(file.path) ? 'bg-gray-300/40 dark:bg-gray-600/40' : 'hover:bg-gray-100/40 dark:hover:bg-gray-700/40'"
          draggable="true"
          @click="handleClick(file, $event)"
          @dragstart="handleDragStart(file, $event)"
          @contextmenu.prevent.stop="showFileContextMenu($event, file)"
        >
          <div :class="['flex items-center justify-center rounded-md mb-2 flex-shrink-0 overflow-hidden bg-bg-tertiary/50', gridCfg.thumbClass]">
            <img
              v-if="getThumbnailUrl(file, gridCfg.thumbKey)"
              :src="getThumbnailUrl(file, gridCfg.thumbKey)!"
              class="w-full h-full object-cover"
              @error="thumbnailUrls.delete(`${file.path}:${gridCfg.thumbKey}`)"
            />
            <component v-else :is="getFileIconComponent(file)" :class="gridCfg.iconClass" />
          </div>
          <span
            :class="[gridCfg.nameClass, 'text-center leading-tight line-clamp-2 w-full break-words px-2 py-1 rounded-md transition-colors', isSelected(file.path) ? 'bg-accent-blue text-white' : 'text-text-primary']"
          >
            {{ file.name }}
          </span>
        </div>
      </div>
    </RecycleScroller>

    <!-- Columns View -->
    <div v-else-if="viewMode === 'columns'" class="flex-1 flex min-h-0 overflow-x-auto">
      <div
        v-for="(column, index) in columns"
        :key="column.path"
        class="min-w-[220px] max-w-[320px] border-r border-border flex flex-col bg-bg-primary"
        @drop="handleDrop($event, column.path)"
        @dragover.prevent
      >
        <!-- Column Header -->
        <div class="px-3 py-2 bg-bg-secondary text-sm font-medium text-text-secondary border-b border-border truncate">
          {{ column.path.split('/').pop() || 'Root' }}
        </div>

        <!-- Column Content -->
        <div class="flex-1 overflow-auto py-1">
          <div
            v-for="file in column.files"
            :key="file.path"
            class="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors duration-100"
            :class="[
              column.selectedPath === file.path ? 'bg-accent-blue text-white' : 'hover:bg-bg-hover text-text-primary',
              isSelected(file.path) && column.selectedPath !== file.path ? 'bg-accent-blue/30' : ''
            ]"
            @click="handleColumnClick(index, file)"
            @dblclick="handleDoubleClick(file)"
          >
            <component :is="getFileIconComponent(file)" class="w-5 h-5 flex-shrink-0" />
            <span class="flex-1 truncate text-base">{{ file.name }}</span>
            <svg v-if="file.isDirectory" class="w-4 h-4" :class="column.selectedPath === file.path ? 'text-white/70' : 'text-text-tertiary'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Rubber Band Selection Rect -->
    <div v-if="rubberBand.active" class="rubber-band-rect pointer-events-none" :style="rubberBandStyle" />

    <!-- Inline Rename Bar -->
    <div
      v-if="renameState.active"
      class="rename-bar flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-bg-secondary border-t border-border"
      @mousedown.stop
    >
      <span class="text-sm text-text-secondary">Rename:</span>
      <input
        ref="renameInputRef"
        v-model="renameState.newName"
        type="text"
        class="flex-1 px-3 py-1.5 bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue"
        @keydown.enter="confirmRename"
        @keydown.esc="cancelRename"
        @mousedown.stop
      />
      <button
        class="px-3 py-1.5 bg-accent-blue text-white rounded text-sm hover:bg-accent-blue/90 transition-colors"
        @click="confirmRename"
      >
        Confirm
      </button>
      <button
        class="px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded text-sm hover:bg-bg-hover transition-colors"
        @click="cancelRename"
      >
        Cancel
      </button>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu fixed animate-fade-in"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <template v-for="item in contextMenu.items" :key="item.action">
        <!-- Menu item with submenu -->
        <div v-if="item.children && item.children.length > 0" class="context-menu-item has-submenu">
          <span>{{ item.label }}</span>
          <svg class="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <!-- Submenu -->
          <div class="context-submenu">
            <div
              v-for="child in item.children"
              :key="child.action"
              class="context-menu-item"
              @click="handleContextMenuAction(child.action)"
            >
              <span>{{ child.label }}</span>
            </div>
          </div>
        </div>
        <!-- Divider -->
        <hr v-else-if="item.action === '__divider__'" class="border-border my-1 mx-2" />
        <!-- Regular menu item -->
        <div
          v-else
          class="context-menu-item"
          :class="{ disabled: item.disabled }"
          @click="item.disabled ? null : handleContextMenuAction(item.action)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, reactive, h, type Component, onUnmounted, nextTick } from 'vue'
import type { FileInfo, Column } from '@/types'
import type { FileSortDescriptor } from '@/types/fileBrowser'
import type { DeviceCapabilities } from '@/types/fileOperation'
import { useDevicesStore } from '@/stores/devices'
import { useThumbnailStore } from '@/stores/thumbnail'
import { useTabsStore } from '@/stores/tabs'
import { useFavoritesStore } from '@/stores/favorites'
import { extensionCategories, extensionIconMap, isThumbnailable } from '@/utils/fileTypes'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const log = console

const props = defineProps<{
  paneId: string
  deviceId: string
  path: string
  viewMode: 'list' | 'grid' | 'columns'
  selectedFiles: string[]
  searchQuery?: string
  recursiveSearch?: boolean
  sort?: FileSortDescriptor
  gridSize?: 'xlarge' | 'large' | 'medium' | 'small'
}>()

const emit = defineEmits<{
  select: [files: string[]]
  navigate: [path: string]
  preview: [file: FileInfo]
  operation: [op: { action: string; files: string[]; target?: string; targetDeviceId?: string; newName?: string }]
  loaded: [files: FileInfo[]]
  sort: [sort: FileSortDescriptor]
}>()

const devicesStore = useDevicesStore()
const thumbnailStore = useThumbnailStore()
const tabsStore = useTabsStore()
const favoritesStore = useFavoritesStore()

const files = ref<FileInfo[]>([])
const searchResults = ref<FileInfo[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const loading = ref(false)
const columnFilesMap = ref<Map<string, FileInfo[]>>(new Map())
const deviceCapabilities = ref<DeviceCapabilities | null>(null)
const transferTargets = ref<Map<string, { copy: boolean; move: boolean }>>(new Map())

const pane = computed(() => tabsStore.findPane(props.paneId))

const columns = computed<Array<{ path: string; files: FileInfo[]; selectedPath?: string }>>({
  get() {
    const storedColumns = pane.value?.columns
    if (!storedColumns || storedColumns.length === 0) {
      return []
    }
    return storedColumns.map(col => ({
      path: col.path,
      files: columnFilesMap.value.get(col.path) || [],
      selectedPath: col.selectedPath
    }))
  },
  set(newColumns) {
    const columnsToStore: Column[] = newColumns.map(col => ({
      path: col.path,
      selectedPath: col.selectedPath
    }))
    tabsStore.setColumns(props.paneId, columnsToStore)
    for (const col of newColumns) {
      if (col.files.length > 0) {
        columnFilesMap.value.set(col.path, col.files)
      }
    }
  }
})

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  items: [] as Array<{ label: string; action: string; shortcut?: string; disabled?: boolean; children?: Array<{ label: string; action: string; deviceId?: string }> }>
})

// ── 内联重命名状态 ─────────────────────────────────────────────────────────────
const renameState = reactive({
  active: false,
  filePath: '',
  originalName: '',
  newName: '',
})
const renameInputRef = ref<HTMLInputElement | null>(null)

// ── 性能诊断日志 ───────────────────────────────────────────────────────────────
// 生产环境中可通过 window.__FILELIST_PERF__ = false 关闭
const _perf = {
  enabled: true,
  selectCount: 0,
  lastSelectTime: 0,
  renderCallCount: 0,
  lastRenderLogTime: 0,
}

function perfLog(label: string, ...args: unknown[]) {
  if (!_perf.enabled) return
  console.log(`[FileList:Perf] ${label}`, ...args)
}
// ─────────────────────────────────────────────────────────────────────────────

const selectedFilesSet = computed(() => new Set(props.selectedFiles))

// ── 选择状态 ──────────────────────────────────────────────────────────────────
// 锚点：最后一次不带 Shift 的点击项，供 Shift 范围选择使用
const anchorPath = ref<string | null>(null)

// 拖动框选状态
const rubberBand = reactive({
  active: false,
  startX: 0,       // 相对容器左上角（渲染矩形用）
  startY: 0,
  currentX: 0,
  currentY: 0,
  startClientX: 0, // 原始 clientX（判断是否真正拖动）
  startClientY: 0,
  cmdKey: false,   // 框选开始时是否按住 Cmd（追加模式）
})
const selectionBeforeDrag = ref<string[]>([])

// 框选矩形 CSS 样式
const rubberBandStyle = computed(() => {
  const x = Math.min(rubberBand.startX, rubberBand.currentX)
  const y = Math.min(rubberBand.startY, rubberBand.currentY)
  const w = Math.abs(rubberBand.currentX - rubberBand.startX)
  const h = Math.abs(rubberBand.currentY - rubberBand.startY)
  return { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }
})
// ─────────────────────────────────────────────────────────────────────────────

const filteredFiles = computed(() => {
  const source = (props.recursiveSearch || !!props.searchQuery?.trim().match(/^tag:(.+)$/i)) && searchResults.value ? searchResults.value : files.value
  if (!props.searchQuery?.trim()) return source
  const lowerFilter = props.searchQuery.toLowerCase().trim()
  return source.filter(file => file.name.toLowerCase().includes(lowerFilter))
})

const displayedFiles = computed(() => {
  const sort = props.sort ?? { field: 'name' as const, direction: 'asc' as const, foldersFirst: true }
  return [...filteredFiles.value].sort((left, right) => {
    if (sort.foldersFirst && left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
    const leftValue = sort.field === 'size' ? left.size : sort.field === 'modifiedTime' ? Date.parse(left.modifiedTime) : sort.field === 'extension' ? left.extension || '' : left.name
    const rightValue = sort.field === 'size' ? right.size : sort.field === 'modifiedTime' ? Date.parse(right.modifiedTime) : sort.field === 'extension' ? right.extension || '' : right.name
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' })
    return sort.direction === 'asc' ? comparison : -comparison
  })
})

function toggleSort(field: FileSortDescriptor['field']) {
  const current = props.sort ?? { field: 'name' as const, direction: 'asc' as const, foldersFirst: true }
  emit('sort', { field, direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc', foldersFirst: current.foldersFirst })
}

function sortIndicator(field: FileSortDescriptor['field']) {
  if ((props.sort?.field ?? 'name') !== field) return ''
  return (props.sort?.direction ?? 'asc') === 'asc' ? '↑' : '↓'
}

// ── 虚拟滚动配置 ──────────────────────────────────────────────────────────────
// List View: 每行固定高度 = py-2(16px) + text-base行高(24px) = 40px
const LIST_ITEM_HEIGHT = 40

// Grid View: 三档网格规格（大/中/小）。每档定义单元格宽度、行高、间距、
// 缩略图/图标/文件名字号，以及请求哪一档缩略图。'large' 与历史单档网格一致。
type GridSize = 'xlarge' | 'large' | 'medium' | 'small'
const GRID_SIZES: Record<GridSize, {
  itemWidth: number
  rowHeight: number
  rowGap: number
  thumbClass: string
  iconClass: string
  nameClass: string
  thumbKey: 'small' | 'large'
}> = {
  xlarge: { itemWidth: 168, rowHeight: 196, rowGap: 24, thumbClass: 'w-28 h-28', iconClass: 'w-24 h-24', nameClass: 'text-base',   thumbKey: 'large' },
  large: { itemWidth: 130, rowHeight: 150, rowGap: 20, thumbClass: 'w-20 h-20', iconClass: 'w-16 h-16', nameClass: 'text-sm',     thumbKey: 'large' },
  medium: { itemWidth: 104, rowHeight: 120, rowGap: 16, thumbClass: 'w-14 h-14', iconClass: 'w-12 h-12', nameClass: 'text-[13px]', thumbKey: 'small' },
  small: { itemWidth: 84,  rowHeight: 96,  rowGap: 12, thumbClass: 'w-10 h-10', iconClass: 'w-8 h-8',   nameClass: 'text-xs',     thumbKey: 'small' }
}

// 容器宽度追踪（供网格列数计算）
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(800)
let resizeObserver: ResizeObserver | null = null

// 当前生效的网格规格（默认 large，兼容历史未持久化的 pane）
const gridCfg = computed(() => GRID_SIZES[props.gridSize ?? 'large'])

// 计算网格列数：容器宽 - p-4 两侧 32px，按当前规格的 itemWidth + rowGap 排布
const itemsPerRow = computed(() => {
  const { itemWidth, rowGap } = gridCfg.value
  return Math.max(1, Math.floor((containerWidth.value - 32 + rowGap) / (itemWidth + rowGap)))
})

// 将 filteredFiles 按行分组，供 RecycleScroller 使用
const gridRows = computed(() => {
  const n = itemsPerRow.value
  const result: Array<{ key: string; files: FileInfo[] }> = []
  for (let i = 0; i < displayedFiles.value.length; i += n) {
    result.push({
      key: displayedFiles.value[i].path,
      files: displayedFiles.value.slice(i, i + n),
    })
  }
  return result
})
// ─────────────────────────────────────────────────────────────────────────────

// ── ZIP virtual path helpers ──────────────────────────────────────────────────
const ZIP_SEP = '::'
function isZipVirtualPath(path: string) { return path.includes(ZIP_SEP) }
function parseZipVirtualPath(path: string) {
  const idx = path.indexOf(ZIP_SEP)
  return { zipFilePath: path.slice(0, idx), innerPath: path.slice(idx + 2) }
}

function zipEntriesToFileInfo(entries: Array<{
  name: string; path: string; isDirectory: boolean; size: number;
  compressedSize: number; modifiedTime: string
}>, zipFilePath: string): FileInfo[] {
  return entries.map(e => ({
    name: e.name,
    // Virtual path so rest of app (preview, selection, etc.) can use it
    path: `${zipFilePath}${ZIP_SEP}${e.path}`,
    isDirectory: e.isDirectory,
    isFile: !e.isDirectory,
    size: e.size,
    modifiedTime: e.modifiedTime,
    extension: (!e.isDirectory && e.name.includes('.'))
      ? '.' + e.name.split('.').pop()!.toLowerCase()
      : undefined,
  }))
}
// ─────────────────────────────────────────────────────────────────────────────

let _loadCallSeq = 0

async function loadFiles() {
  const callId = ++_loadCallSeq
  const pathSnapshot = props.path
  console.log(`[FileList#${callId}] loadFiles() called — path="${pathSnapshot}" deviceId="${props.deviceId}"`)
  console.trace(`[FileList#${callId}] call stack`)

  loading.value = true
  try {
    // ── Virtual ZIP path ──────────────────────────────────────────────────────
    if (isZipVirtualPath(pathSnapshot)) {
      const { zipFilePath, innerPath } = parseZipVirtualPath(pathSnapshot)
      console.log(`[FileList#${callId}] ZIP branch: zipFile="${zipFilePath}" inner="${innerPath}"`)
      console.log(`[FileList#${callId}] window.fileman.zip available:`, !!(window.fileman as any).zip)
      const entries = await window.fileman.zip.listDirectory(zipFilePath, innerPath)
      console.log(`[FileList#${callId}] IPC returned ${entries.length} entries; props.path is now "${props.path}"`)
      if (props.path !== pathSnapshot) {
        console.warn(`[FileList#${callId}] PATH CHANGED DURING AWAIT (was "${pathSnapshot}", now "${props.path}") — discarding stale result`)
        return
      }
      const result = zipEntriesToFileInfo(entries, zipFilePath)
      console.log(`[FileList#${callId}] setting files.value → ${result.length} items`)
      files.value = result
      columnFilesMap.value.set(pathSnapshot, result)
      emit('loaded', result)
      if (props.viewMode === 'columns') {
        columns.value = [{ path: pathSnapshot, files: result }]
      }
      return
    }

    // ── Normal filesystem path ────────────────────────────────────────────────
    // Load device capabilities
    try {
      deviceCapabilities.value = await devicesStore.getDeviceCapabilities(props.deviceId)
      const checks = await Promise.all(devicesStore.connectedDevices
        .filter(device => device.id !== props.deviceId)
        .map(async device => [device.id, {
          copy: await window.fileman.canTransferBetween(props.deviceId, device.id, 'copy'),
          move: await window.fileman.canTransferBetween(props.deviceId, device.id, 'move')
        }] as const))
      transferTargets.value = new Map(checks)
    } catch (e) {
      console.warn(`[FileList#${callId}] Could not load device capabilities:`, e)
    }

    console.log(`[FileList#${callId}] normal FS branch: deviceId="${props.deviceId}" path="${pathSnapshot}"`)
    const result = await window.fileman.listFiles(props.deviceId, pathSnapshot)
    console.log(`[FileList#${callId}] FS listFiles returned ${result.length} items; props.path is now "${props.path}"`)
    if (props.path !== pathSnapshot) {
      console.warn(`[FileList#${callId}] PATH CHANGED DURING AWAIT (was "${pathSnapshot}", now "${props.path}") — discarding stale result`)
      return
    }
    console.log(`[FileList#${callId}] setting files.value → ${result.length} items`)
    files.value = result
    columnFilesMap.value.set(pathSnapshot, result)
    emit('loaded', result)

    if (props.viewMode === 'columns') {
      const storedColumns = pane.value?.columns
      if (storedColumns && storedColumns.length > 0 && storedColumns[0].path === props.path) {
        await loadMissingColumnFiles(storedColumns)
      } else {
        columns.value = [{ path: props.path, files: result }]
      }
    }
  } catch (error) {
    console.error(`[FileList#${callId}] ERROR for path="${pathSnapshot}":`, error)
    files.value = []
    emit('loaded', [])
  } finally {
    console.log(`[FileList#${callId}] finally — files.value.length=${files.value.length}`)
    loading.value = false
  }
}

async function loadMissingColumnFiles(cols: Column[]) {
  for (const col of cols) {
    if (!columnFilesMap.value.has(col.path)) {
      try {
        const colFiles = await window.fileman.listFiles(props.deviceId, col.path)
        columnFilesMap.value.set(col.path, colFiles)
      } catch (e) {
        console.error(`Failed to load column files for ${col.path}:`, e)
      }
    }
  }
}

watch(() => props.path, (newPath, oldPath) => {
  console.log(`[FileList] watch(path): "${oldPath}" → "${newPath}"`)
  loadFiles()
}, { immediate: true })
watch(() => props.deviceId, (newId, oldId) => {
  console.log(`[FileList] watch(deviceId): "${oldId}" → "${newId}"`)
  loadFiles()
})

watch([() => props.searchQuery, () => props.recursiveSearch, () => props.path, () => props.deviceId], () => {
  if (searchTimer) clearTimeout(searchTimer)
  const isTagCollection = !!props.searchQuery?.trim().match(/^tag:(.+)$/i)
  if ((!props.recursiveSearch && !isTagCollection) || !props.searchQuery?.trim()) {
    searchResults.value = null
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const rawQuery = props.searchQuery!.trim()
      const tagQuery = rawQuery.match(/^tag:(.+)$/i)
      const result = tagQuery
        ? (await window.fileman.findFilesByTags(tagQuery[1].split(','))).filter(item => item.deviceId === props.deviceId).map(item => ({
            name: item.path.split('/').pop() || item.path,
            path: item.path,
            isDirectory: false,
            isFile: true,
            size: 0,
            modifiedTime: new Date(item.updatedAt).toISOString(),
            extension: item.path.includes('.') ? `.${item.path.split('.').pop()!.toLowerCase()}` : undefined
          }))
        : await window.fileman.search(props.deviceId, props.path, { pattern: rawQuery })
      if ((props.recursiveSearch || isTagCollection) && props.searchQuery?.trim()) searchResults.value = result
    } catch (error) {
      log.warn('[FileList] recursive search failed', { deviceId: props.deviceId, path: props.path, error })
      searchResults.value = []
    }
  }, 250)
}, { immediate: true })

onMounted(() => {
  // loadFiles() 已由 watch(() => props.path, ..., { immediate: true }) 在挂载前调用，无需重复
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(containerRef.value)
    containerWidth.value = containerRef.value.clientWidth
  }
  document.addEventListener('click', hideContextMenu)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('keydown', handleKeyDown)
  // 确保 rubber-band 残留监听器被清理
  document.removeEventListener('mousemove', handleRubberBandMove)
  document.removeEventListener('mouseup', handleRubberBandUp)
})

function handleKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
  // Cmd/Ctrl + R: Refresh
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    loadFiles()
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && props.selectedFiles.length) {
    event.preventDefault(); emit('operation', { action: 'copy', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && props.selectedFiles.length) {
    event.preventDefault(); emit('operation', { action: 'cut', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault(); emit('operation', { action: 'paste', files: [], target: props.path }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i' && props.selectedFiles.length === 1) {
    event.preventDefault(); emit('operation', { action: 'info', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'r' && props.selectedFiles.length > 1) {
    event.preventDefault(); emit('operation', { action: 'batch-rename', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Backspace' && props.selectedFiles.length) {
    event.preventDefault(); emit('operation', { action: 'delete', files: props.selectedFiles }); return
  }

  // Enter: Start rename (when single file selected and not already renaming)
  if (event.key === 'Enter' && !renameState.active && props.selectedFiles.length === 1) {
    event.preventDefault()
    startRename(props.selectedFiles[0])
    return
  }

  // Escape: Cancel rename
  if (event.key === 'Escape' && renameState.active) {
    event.preventDefault()
    cancelRename()
    return
  }
}

const thumbnailUrls = ref<Map<string, string>>(new Map())
// 非响应式：追踪正在进行的 loadThumbnail 调用，防止同一 key 并发重复请求
const pendingLoads = new Set<string>()

async function loadThumbnail(file: FileInfo, size: 'small' | 'large'): Promise<void> {
  const ext = file.extension?.toLowerCase().replace('.', '') || ''
  if (!isThumbnailable(ext)) return

  const cacheKey = `${file.path}:${size}`
  // 已缓存（含 '' sentinel）或已有进行中的请求，直接跳过
  if (thumbnailUrls.value.has(cacheKey) || pendingLoads.has(cacheKey)) return

  pendingLoads.add(cacheKey)
  try {
    const base64 = await thumbnailStore.getThumbnail(props.deviceId, file, size)
    if (base64) {
      thumbnailUrls.value.set(cacheKey, `data:image/webp;base64,${base64}`)
    } else {
      // 写入空字符串 sentinel：标记"已尝试，无缩略图"，防止下次渲染重复触发 IPC
      thumbnailUrls.value.set(cacheKey, '')
    }
  } finally {
    pendingLoads.delete(cacheKey)
  }
}

function getThumbnailUrl(file: FileInfo, size: 'small' | 'large'): string | null {
  const ext = file.extension?.toLowerCase().replace('.', '') || ''
  if (!isThumbnailable(ext)) return null

  const cacheKey = `${file.path}:${size}`
  // 用 has() 检查：'' sentinel 也被识别为"已尝试"，不再触发 loadThumbnail
  if (thumbnailUrls.value.has(cacheKey)) {
    return thumbnailUrls.value.get(cacheKey) || null
  }

  // 按需触发加载：仅为 RecycleScroller 当前渲染的可见条目发起请求
  loadThumbnail(file, size)
  return null
}

watch(() => props.path, () => {
  thumbnailUrls.value.clear()
  pendingLoads.clear()
  anchorPath.value = null
  // 切换目录时重置诊断计数
  _perf.selectCount = 0
  _perf.renderCallCount = 0
})

// 监控 selectedFiles 变化频率（诊断用）
watch(() => props.selectedFiles, (newFiles, oldFiles) => {
  _perf.selectCount++
  const now = performance.now()
  const gap = now - _perf.lastSelectTime
  _perf.lastSelectTime = now
  // 连续更新间隔 < 50ms 时打印警告，说明 emit('select') 调用过于频繁
  if (_perf.selectCount > 1 && gap < 50) {
    perfLog(`selection update #${_perf.selectCount} gap=${gap.toFixed(1)}ms size=${newFiles.length} (prev=${oldFiles?.length ?? 0})`)
  }
}, { flush: 'sync' })

watch(() => props.viewMode, async (newMode) => {
  if (newMode === 'columns') {
    const storedColumns = pane.value?.columns
    if (storedColumns && storedColumns.length > 0 && storedColumns[0].path === props.path) {
      await loadMissingColumnFiles(storedColumns)
    } else {
      columns.value = [{ path: props.path, files: files.value }]
    }
  }
})

// ── 图标组件缓存（模块级，所有实例共享）────────────────────────────────────────
// getFileIconComponent 每次调用都创建新的 Component 对象，导致 Vue 在每次重渲染时
// 触发 unmount + remount 循环。缓存后同一扩展名复用同一对象，Vue 只做 patch。
const _fileIconCache = new Map<string, Component>()
// 日期格式化缓存：避免每次渲染都执行 new Date() + toLocaleDateString()
const _formattedDateCache = new Map<string, string>()

// Icon helper functions
function createSvgIcon(imagePath: string): Component {
  return {
    render() {
      // Let caller-provided classes (e.g. w-5 h-5, w-20 h-20) control icon size.
      return h('img', { src: imagePath, alt: 'file icon', style: { display: 'inline-block' } })
    }
  }
}

function createPathIcon(pathD: string, className: string = 'text-icon-folder'): Component {
  return {
    render() {
      return h('svg', { class: className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
        h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.5', d: pathD })
      ])
    }
  }
}

function getFileIconComponent(file: FileInfo): Component {
  // 以扩展名（或 __dir__）为 key，缓存 Component 对象
  // 避免每次渲染都创建新对象导致 Vue 触发 unmount/remount
  const cacheKey = file.isDirectory
    ? '__dir__'
    : (file.extension?.toLowerCase().replace('.', '') || '__default__')

  const cached = _fileIconCache.get(cacheKey)
  if (cached) return cached

  let component: Component
  if (file.isDirectory) {
    component = createSvgIcon('/icons/ic_folder_mac.svg')
  } else {
    const ext = cacheKey
    const iconFile = extensionIconMap[ext]

    if (iconFile) {
      component = createSvgIcon(`/icons/${iconFile}`)
    } else if (extensionCategories.image.has(ext)) {
      component = createPathIcon('M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', 'text-accent-teal')
    } else if (extensionCategories.video.has(ext)) {
      component = createPathIcon('M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', 'text-accent-red')
    } else if (extensionCategories.audio.has(ext)) {
      component = createPathIcon('M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', 'text-purple-500')
    } else if (extensionCategories.archive.has(ext)) {
      component = createPathIcon('M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4', 'text-icon-archive')
    } else {
      component = createPathIcon('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', 'text-icon-document')
    }
  }

  _fileIconCache.set(cacheKey, component)
  return component
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function formatDate(dateStr: string): string {
  const cached = _formattedDateCache.get(dateStr)
  if (cached !== undefined) return cached
  const date = new Date(dateStr)
  const result = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  _formattedDateCache.set(dateStr, result)
  return result
}

function isSelected(path: string): boolean {
  return selectedFilesSet.value.has(path)
}

function handleClick(file: FileInfo, event: MouseEvent) {
  // event.detail === 2 is reliable on draggable elements where @dblclick may not fire
  if (event.detail === 2) {
    handleDoubleClick(file)
    return
  }

  const t0 = performance.now()
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    // Cmd+Shift: add range from anchor to current item to existing selection
    const anchor = anchorPath.value
    if (anchor) {
      const anchorIndex = displayedFiles.value.findIndex(f => f.path === anchor)
      const currentIndex = displayedFiles.value.findIndex(f => f.path === file.path)
      const start = Math.min(anchorIndex, currentIndex)
      const end = Math.max(anchorIndex, currentIndex)
      const rangeFiles = displayedFiles.value.slice(start, end + 1).map(f => f.path)
      const merged = [...new Set([...props.selectedFiles, ...rangeFiles])]
      emit('select', merged)
    } else {
      anchorPath.value = file.path
      emit('select', [file.path])
    }
    // Don't update anchorPath for shift variants
  } else if (event.metaKey || event.ctrlKey) {
    const newSelection = [...props.selectedFiles]
    const index = newSelection.indexOf(file.path)
    if (index > -1) {
      newSelection.splice(index, 1)
    } else {
      newSelection.push(file.path)
    }
    anchorPath.value = file.path
    emit('select', newSelection)
  } else if (event.shiftKey) {
    const anchor = anchorPath.value
    if (anchor) {
      const anchorIndex = displayedFiles.value.findIndex(f => f.path === anchor)
      const currentIndex = displayedFiles.value.findIndex(f => f.path === file.path)
      const start = Math.min(anchorIndex, currentIndex)
      const end = Math.max(anchorIndex, currentIndex)
      const newSelection = displayedFiles.value.slice(start, end + 1).map(f => f.path)
      emit('select', newSelection)
    } else {
      anchorPath.value = file.path
      emit('select', [file.path])
    }
    // Don't update anchorPath for shift+click
  } else {
    anchorPath.value = file.path
    emit('select', [file.path])
  }
  const elapsed = performance.now() - t0
  if (elapsed > 4) {
    perfLog(`handleClick slow: ${elapsed.toFixed(1)}ms modifier=${event.shiftKey ? 'shift' : event.metaKey ? 'meta' : 'plain'}`)
  }
}

function handleDoubleClick(file: FileInfo) {
  if (file.isDirectory) {
    emit('navigate', file.path)
  } else if (file.extension?.toLowerCase() === '.zip') {
    // Navigate INTO the ZIP as a virtual filesystem
    emit('navigate', file.path + ZIP_SEP)
  } else {
    emit('preview', file)
  }
}

// ── 拖动框选 (Rubber-band Selection) ─────────────────────────────────────────

function handleContainerMouseDown(e: MouseEvent) {
  // 只处理左键；右键交给 context menu
  if (e.button !== 0) return
  // Columns 视图不支持框选
  if (props.viewMode === 'columns') return
  // 上下文菜单打开时，不触发框选（否则 mouseup 会因距离 < 4px 而清空选中）
  if (contextMenu.visible) return
  const target = e.target as Element
  if (!target.closest('.file-item')) {
    startRubberBand(e)
  }
}

function startRubberBand(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  rubberBand.startClientX = e.clientX
  rubberBand.startClientY = e.clientY
  rubberBand.startX = e.clientX - rect.left
  rubberBand.startY = e.clientY - rect.top
  rubberBand.currentX = rubberBand.startX
  rubberBand.currentY = rubberBand.startY
  rubberBand.cmdKey = e.metaKey || e.ctrlKey
  selectionBeforeDrag.value = rubberBand.cmdKey ? [...props.selectedFiles] : []
  rubberBand.active = true
  // 阻止默认行为，避免文字选中
  e.preventDefault()
  document.addEventListener('mousemove', handleRubberBandMove)
  document.addEventListener('mouseup', handleRubberBandUp)
}

// 非响应式：rAF 节流框选 selection 计算
let rbRafId: number | null = null
let rbLastClientX = 0
let rbLastClientY = 0

function handleRubberBandMove(e: MouseEvent) {
  if (!rubberBand.active || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  // 立即更新矩形坐标（保证视觉流畅）
  rubberBand.currentX = e.clientX - rect.left
  rubberBand.currentY = e.clientY - rect.top

  // 用 rAF 节流 selection 计算，避免每帧多次触发
  rbLastClientX = e.clientX
  rbLastClientY = e.clientY
  if (rbRafId !== null) return
  rbRafId = requestAnimationFrame(() => {
    rbRafId = null
    if (!rubberBand.active || !containerRef.value) return

    const t0 = performance.now()
    const cx = rbLastClientX
    const cy = rbLastClientY
    const selLeft   = Math.min(cx, rubberBand.startClientX)
    const selRight  = Math.max(cx, rubberBand.startClientX)
    const selTop    = Math.min(cy, rubberBand.startClientY)
    const selBottom = Math.max(cy, rubberBand.startClientY)

    const items = containerRef.value.querySelectorAll<HTMLElement>('[data-file-path]')
    const selected = new Set<string>(selectionBeforeDrag.value)

    for (const item of items) {
      const itemRect = item.getBoundingClientRect()
      const intersects = !(
        itemRect.right  < selLeft  ||
        itemRect.left   > selRight ||
        itemRect.bottom < selTop   ||
        itemRect.top    > selBottom
      )
      const path = item.dataset.filePath!
      if (intersects) {
        selected.add(path)
      } else if (!selectionBeforeDrag.value.includes(path)) {
        selected.delete(path)
      }
    }

    emit('select', Array.from(selected))
    const elapsed = performance.now() - t0
    if (elapsed > 8) {
      perfLog(`rubber-band rAF slow: ${elapsed.toFixed(1)}ms items=${items.length} selected=${selected.size}`)
    }
  })
}

function handleRubberBandUp(e: MouseEvent) {
  document.removeEventListener('mousemove', handleRubberBandMove)
  document.removeEventListener('mouseup', handleRubberBandUp)
  // 取消未执行的 rAF
  if (rbRafId !== null) {
    cancelAnimationFrame(rbRafId)
    rbRafId = null
  }
  const dx = e.clientX - rubberBand.startClientX
  const dy = e.clientY - rubberBand.startClientY
  const dist = Math.sqrt(dx * dx + dy * dy)
  rubberBand.active = false
  if (dist < 4) {
    // 拖动距离很小，视为点击空白区域，取消所有选中
    emit('select', [])
    anchorPath.value = null
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function handleDragStart(file: FileInfo, event: DragEvent) {
  if (event.dataTransfer) {
    const dragData = {
      paneId: props.paneId,
      files: isSelected(file.path) ? props.selectedFiles : [file.path]
    }
    event.dataTransfer.setData('application/json', JSON.stringify(dragData))
    event.dataTransfer.effectAllowed = 'copyMove'

    // Electron can hand an existing *local* path to Finder through
    // webContents.startDrag. Remote/mobile files do not have a local path and
    // deliberately retain the existing in-app drag behaviour instead.
    if (props.deviceId === 'local' && !dragData.files.some(filePath => filePath.includes('::'))) {
      event.preventDefault()
      window.fileman.startNativeDrag(dragData.files)
    }
  }
}

function handleDrop(event: DragEvent, targetPath: string) {
  event.preventDefault()
  if (event.dataTransfer) {
    // Native Finder drops bubble to App.vue, which can route the local source
    // paths into any connected target device via the transfer queue.
    if (event.dataTransfer.files.length > 0) return

    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'))
      emit('operation', {
        action: 'copy',
        files: data.files,
        target: targetPath
      })
    } catch (e) {
      console.error('Failed to parse drag data:', e)
    }
  }
}

async function handleColumnClick(columnIndex: number, file: FileInfo) {
  if (file.isDirectory) {
    try {
      const subFiles = await window.fileman.listFiles(props.deviceId, file.path)
      const newColumns = columns.value.slice(0, columnIndex + 1)
      newColumns[columnIndex] = { ...newColumns[columnIndex], selectedPath: file.path }
      newColumns.push({ path: file.path, files: subFiles })
      columns.value = newColumns
    } catch (e) {
      console.error('Failed to load column:', e)
    }
  } else {
    const newColumns = [...columns.value]
    newColumns[columnIndex] = { ...newColumns[columnIndex], selectedPath: file.path }
    columns.value = newColumns
    emit('preview', file)
  }
  emit('select', [file.path])
}

/**
 * Get available target devices for cross-device operations
 */
function getTargetDevices(operation: 'copy' | 'move'): Array<{ label: string; action: string; deviceId: string }> {
  const targets: Array<{ label: string; action: string; deviceId: string }> = []

  for (const device of devicesStore.connectedDevices) {
    // Skip the current device
    if (device.id === props.deviceId) continue
    if (!transferTargets.value.get(device.id)?.[operation]) continue

    targets.push({
      label: device.name,
      action: `copy-to-device:${device.id}`,
      deviceId: device.id
    })
  }

  return targets
}

/**
 * Build context menu items based on device capabilities
 */
function buildContextMenuItems(isBackground: boolean): Array<{ label: string; action: string; shortcut?: string; disabled?: boolean; children?: Array<{ label: string; action: string; deviceId?: string }> }> {
  const caps = deviceCapabilities.value
  const items: Array<{ label: string; action: string; shortcut?: string; disabled?: boolean; children?: Array<{ label: string; action: string; deviceId?: string }> }> = []

  if (isBackground) {
    // Background context menu (empty area)
    items.push({ label: 'Refresh', action: 'refresh', shortcut: '⌘R' })
    
    if (caps?.canMkdir) {
      items.push({ label: 'New Folder', action: 'mkdir', shortcut: '⇧⌘N' })
    }
    if (caps?.canWrite) {
      items.push({ label: 'New File', action: 'touch' })
    }
    if (caps?.canWrite) {
      items.push({ label: 'Paste', action: 'paste', shortcut: '⌘V' })
    }

    // 收藏当前文件夹（本地/远程均可，含 ZIP 内部路径）
    items.push({ label: '---', action: '__divider__' })
    items.push({ label: '添加到收藏夹', action: 'add-favorite-current' })

    // 宿主集成：在终端打开当前目录（仅本地、非 ZIP）
    if (isHostShellAvailable()) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: 'Open in Terminal', action: 'open-in-terminal' })
    }
  } else {
    // File/folder context menu
    items.push({ label: 'Open', action: 'open' })

    if (caps?.canCopyFrom) {
      items.push({ label: 'Copy', action: 'copy', shortcut: '⌘C' })
    }

    if (caps?.canMoveFrom) {
      items.push({ label: 'Cut', action: 'cut', shortcut: '⌘X' })
    }

    // Add cross-device copy submenu if there are other connected devices
    const targetDevices = getTargetDevices('copy')
    if (caps?.canCopyFrom && targetDevices.length > 0) {
      items.push({
        label: 'Copy to Device',
        action: 'copy-to-device-menu',
        children: targetDevices
      })
    }

    // Add cross-device move submenu
    const moveTargetDevices = getTargetDevices('move')
    if (caps?.canMoveFrom && moveTargetDevices.length > 0) {
      items.push({
        label: 'Move to Device',
        action: 'move-to-device-menu',
        children: moveTargetDevices.map(t => ({
          ...t,
          action: `move-to-device:${t.deviceId}`
        }))
      })
    }

    if (caps?.canRename) {
      items.push({ label: 'Rename', action: 'rename', shortcut: 'Enter' })
    }

    if (caps?.canDelete) {
      items.push({ label: 'Delete', action: 'delete', shortcut: '⌘⌫' })
    }

    items.push({ label: 'Get Info', action: 'info', shortcut: '⌘I' })
    if (props.selectedFiles.length > 1 && caps?.canRename) {
      items.push({ label: 'Batch Rename', action: 'batch-rename', shortcut: '⇧⌘R' })
    }
    if (caps?.canArchive) {
      items.push({ label: 'Compress to ZIP', action: 'archive' })
    }
    if (contextMenuTargetFile.value?.extension?.toLowerCase() === '.zip' && caps?.canArchive) {
      items.push({ label: 'Extract ZIP', action: 'extract-archive' })
    }

    // Compare two directories: only when exactly 2 directories are selected
    if (props.selectedFiles.length === 2) {
      const selectedInfos = props.selectedFiles
        .map(p => files.value.find(f => f.path === p))
        .filter(Boolean) as FileInfo[]
      if (selectedInfos.length === 2 && selectedInfos.every(f => f.isDirectory)) {
        items.push({ label: '---', action: '__divider__' })
        items.push({ label: '对比目录', action: 'compare-dirs', shortcut: '⌘⇧D' })
      }
    }

    // 收藏夹：右键命中的是文件夹时可收藏（本地/远程均可）
    if (contextMenuTargetFile.value?.isDirectory) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: '添加到收藏夹', action: 'add-favorite' })
    }

    // 宿主集成：在 Finder 中显示 / 在终端打开（仅本地、非 ZIP）
    if (isHostShellAvailable()) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: 'Reveal in Finder', action: 'reveal-in-finder' })
      items.push({ label: 'Open in Terminal', action: 'open-in-terminal' })
    }
  }

  return items
}

// 上下文菜单打开时对选中文件的快照，防止 mouseup 清空选中后 action 拿不到文件
const contextMenuSelectedFiles = ref<string[]>([])
// 右键命中的具体文件（reveal/terminal 针对它）；空白菜单时为 null（terminal 改用当前目录）
const contextMenuTargetFile = ref<FileInfo | null>(null)

/**
 * 宿主集成（Finder/Terminal）是否可用：仅本地设备、且当前目录不在 ZIP 虚拟路径内。
 * 远程设备(SMB/SSH/Android/iOS)与 ZIP 内部条目在本机无 Finder/Terminal 语义。
 */
function isHostShellAvailable(): boolean {
  return props.deviceId === 'local' && !isZipVirtualPath(props.path)
}

/** POSIX 父目录：/a/b -> /a；/a -> /。仅用于 host-shell（已门控排除 zip 路径）。 */
function parentDirectory(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

function showContextMenu(event: MouseEvent) {
  contextMenuSelectedFiles.value = [...props.selectedFiles]
  // 空白右键：terminal 目标为当前目录
  contextMenuTargetFile.value = null
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = buildContextMenuItems(true)
}

function showFileContextMenu(event: MouseEvent, file: FileInfo) {
  if (!isSelected(file.path)) {
    emit('select', [file.path])
    contextMenuSelectedFiles.value = [file.path]
  } else {
    contextMenuSelectedFiles.value = [...props.selectedFiles]
  }
  // 文件/文件夹右键：reveal/terminal 针对命中的这一项
  contextMenuTargetFile.value = file

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = buildContextMenuItems(false)
}

function hideContextMenu() {
  contextMenu.visible = false
}

// ── 内联重命名功能 ─────────────────────────────────────────────────────────────
function startRename(filePath: string) {
  const file = files.value.find(f => f.path === filePath)
  if (!file) return

  renameState.filePath = filePath
  renameState.originalName = file.name
  renameState.newName = file.name
  renameState.active = true

  // Focus input on next tick
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function cancelRename() {
  renameState.active = false
  renameState.filePath = ''
  renameState.originalName = ''
  renameState.newName = ''
}

function confirmRename() {
  const newName = renameState.newName.trim()
  if (!newName || newName === renameState.originalName) {
    cancelRename()
    return
  }

  emit('operation', {
    action: 'rename',
    files: [renameState.filePath],
    newName
  })
  cancelRename()
}
// ─────────────────────────────────────────────────────────────────────────────

function handleContextMenuAction(action: string) {
  console.log('[FileList] handleContextMenuAction called:', {
    action,
    selectedFiles: props.selectedFiles,
    selectedFilesLength: props.selectedFiles.length,
    path: props.path,
    deviceId: props.deviceId
  })
  hideContextMenu()

  if (action === 'refresh') {
    console.log('[FileList] Action: refresh - calling loadFiles()')
    loadFiles()
    return
  }

  if (action === 'rename') {
    // 使用内联重命名而不是弹出对话框
    if (props.selectedFiles.length === 1) {
      startRename(props.selectedFiles[0])
    }
    return
  }

  // 宿主集成（即时调用，不经文件操作队列）：在 Finder 中显示
  if (action === 'reveal-in-finder') {
    const target = contextMenuTargetFile.value?.path
    if (target) {
      window.fileman.showInFolder(target)
    } else {
      console.warn('[FileList] reveal-in-finder: no target file (background menu should not show this action)')
    }
    return
  }

  // 宿主集成：在终端打开。文件菜单→文件夹进其内部 / 文件进其所在目录；空白菜单→当前目录
  if (action === 'open-in-terminal') {
    const file = contextMenuTargetFile.value
    const dir = file
      ? (file.isDirectory ? file.path : parentDirectory(file.path))
      : props.path
    window.fileman.openInTerminal(dir).catch(err => {
      console.error('[FileList] openInTerminal failed for', dir, err)
    })
    return
  }

  if (action === 'compare-dirs') {
    emit('operation', { action: 'compare-dirs', files: contextMenuSelectedFiles.value })
    return
  }

  // 收藏夹：收藏右键命中的文件夹
  if (action === 'add-favorite') {
    const file = contextMenuTargetFile.value
    if (file && file.isDirectory) {
      favoritesStore.add({ deviceId: props.deviceId, path: file.path, name: file.name })
    }
    return
  }

  // 收藏夹：收藏当前目录（空白菜单）
  if (action === 'add-favorite-current') {
    const segs = props.path.split('/').filter(Boolean)
    const name = segs.length > 0 ? segs[segs.length - 1] : (props.path || '/')
    favoritesStore.add({ deviceId: props.deviceId, path: props.path, name })
    return
  }

  // Check for cross-device copy action
  if (action.startsWith('copy-to-device:')) {
    const targetDeviceId = action.substring('copy-to-device:'.length)
    console.log('[FileList] Action: copy-to-device', {
      targetDeviceId,
      files: props.selectedFiles
    })
    emit('operation', {
      action: 'copy-to-device',
      files: props.selectedFiles,
      targetDeviceId
    })
    return
  }

  // Check for cross-device move action
  if (action.startsWith('move-to-device:')) {
    const targetDeviceId = action.substring('move-to-device:'.length)
    console.log('[FileList] Action: move-to-device', {
      targetDeviceId,
      files: props.selectedFiles
    })
    emit('operation', {
      action: 'move-to-device',
      files: props.selectedFiles,
      targetDeviceId
    })
    return
  }

  console.log('[FileList] Emitting operation:', {
    action,
    files: props.selectedFiles,
    filesCount: props.selectedFiles.length
  })
  emit('operation', { action, files: props.selectedFiles })
}
</script>

<style scoped>
.context-menu {
  @apply min-w-[180px] bg-bg-secondary border border-border rounded-lg shadow-lg py-1 z-50;
}

.context-menu-item {
  @apply flex items-center justify-between px-3 py-2 text-base text-text-primary cursor-pointer hover:bg-accent-blue hover:text-white transition-colors relative;
}

.context-menu-item.disabled {
  @apply opacity-50 cursor-not-allowed hover:bg-transparent hover:text-text-primary;
}

.context-menu-item .shortcut {
  @apply text-sm text-text-tertiary ml-4;
}

.context-menu-item:hover .shortcut {
  @apply text-white/70;
}

/* Submenu styles */
.context-menu-item:has(.context-submenu) {
  @apply relative;
}

.context-submenu {
  @apply hidden absolute left-full top-0 min-w-[160px] bg-bg-secondary border border-border rounded-lg shadow-lg py-1;
}

.context-menu-item:hover .context-submenu {
  @apply block;
}

.animate-fade-in {
  animation: fadeIn 0.1s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Rubber-band selection rectangle */
.rubber-band-rect {
  position: absolute;
  border: 1px solid #60a5fa;
  background-color: rgba(96, 165, 250, 0.12);
  z-index: 10;
}
</style>
