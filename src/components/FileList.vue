<template>
  <div ref="containerRef" class="flex-1 flex flex-col overflow-hidden relative" @contextmenu.prevent="showContextMenu" @mousedown="handleContainerMouseDown" @dragover="clearDropTargetHighlight">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-text-tertiary">
        <div class="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm">{{ $t('fileList.loading') }}</span>
      </div>
    </div>

    <!-- Error State (directory moved/renamed/deleted externally, or load failure) -->
    <div v-else-if="loadError" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md px-6">
        <svg
          class="w-12 h-12 mx-auto mb-3"
          :class="loadError.pathMissing ? 'text-accent-red' : 'text-accent-yellow'"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div class="text-sm font-medium text-text-primary mb-1">
          {{ loadError.pathMissing ? $t('fileList.loadError.missingTitle') : $t('fileList.loadError.failedTitle') }}
        </div>
        <div class="text-xs text-text-tertiary mb-4 break-all">
          {{ loadError.pathMissing ? $t('fileList.loadError.missingHint', { path }) : loadError.message }}
        </div>
        <div class="flex items-center justify-center gap-2">
          <button type="button" class="rounded bg-accent-blue px-3 py-1.5 text-sm text-white hover:bg-accent-hover" @click="retryFromLoadError">
            {{ $t('fileList.loadError.retry') }}
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!nearestExistingAncestor"
            @click="goToExistingAncestor"
          >
            {{ $t('fileList.loadError.goParent') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedFiles.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-text-tertiary">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="text-sm">{{ $t('fileList.emptyFolder') }}</span>
      </div>
    </div>

    <!-- List View -->
    <template v-else-if="viewMode === 'list'">
      <!-- Header 固定在顶部，不随列表滚动 -->
      <div class="finder-list-header flex-shrink-0 flex items-center gap-2 px-4 bg-bg-secondary border-b border-border text-xs font-medium text-text-tertiary">
        <span class="w-6"></span>
        <button class="flex-1 text-left hover:text-text-primary" @click="toggleSort('name')">{{ $t('fileList.columns.name') }} {{ sortIndicator('name') }}</button>
        <button class="w-40 text-left hover:text-text-primary" @click="toggleSort('modifiedTime')">{{ $t('fileList.columns.dateModified') }} {{ sortIndicator('modifiedTime') }}</button>
        <button class="w-20 text-right hover:text-text-primary" @click="toggleSort('size')">{{ $t('fileList.columns.size') }} {{ sortIndicator('size') }}</button>
        <span class="w-24 text-left">{{ $t('fileList.columns.kind') }}</span>
        <span v-if="showPermissions" class="w-28 text-left">{{ $t('fileList.columns.permissions') }}</span>
      </div>

      <!-- 虚拟滚动列表 -->
      <RecycleScroller
        ref="listScrollerRef"
        class="flex-1 min-h-0"
        :items="displayedFiles"
        :item-size="LIST_ITEM_HEIGHT"
        key-field="path"
        v-slot="{ item: file }"
      >
        <div
          class="finder-list-row file-item flex items-center gap-2 px-4 rounded-md transition-colors duration-100 text-text-primary"
          :data-file-path="file.path"
          :style="{ height: LIST_ITEM_HEIGHT + 'px' }"
          :class="dropTargetPath === file.path ? 'drop-target-row' : ''"
          draggable="true"
          @click="handleClick(file, $event)"
          @dragstart="handleDragStart(file, $event)"
          @dragover="handleRowDragOver(file, $event)"
          @drop="handleRowDrop(file, $event)"
          @contextmenu.prevent.stop="showFileContextMenu($event, file)"
        >
          <!-- Finder 式选中（与 grid/分栏统一）：图标一圈略大浅灰圆角底 + 名称蓝底白字 -->
          <div
            class="w-6 h-6 flex-shrink-0 flex items-center justify-center overflow-hidden rounded p-0.5 transition-colors"
            :class="isSelected(file.path) ? 'finder-selected' : ''"
          >
            <img
              v-if="getThumbnailUrl(file, 'small')"
              :src="getThumbnailUrl(file, 'small')!"
              class="w-full h-full object-cover"
              @error="thumbnailUrls.delete(`${file.path}:small`)"
            />
            <component v-else :is="getFileIconComponent(file)" class="w-full h-full" />
          </div>
          <FileNameMatchLabel
            class="finder-name-label flex-1 truncate text-base rounded px-1 transition-colors"
            :class="isSelected(file.path) ? 'finder-selected-label finder-selected-text' : 'text-text-primary'"
            :name="file.name"
            :highlight-indices="typeaheadHighlightFor(file)"
            :selected="isSelected(file.path)"
          />
          <FileGitBadge v-if="gitStatusOf(file)" :x="gitStatusOf(file)!.x" :y="gitStatusOf(file)!.y" />
          <svg
            v-if="file.isSymlink"
            class="w-3 h-3 flex-shrink-0 text-accent-teal"
            :title="$t('fileList.symlinkTitle', { target: file.symlinkTarget ?? '' })"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span class="w-40 text-left text-sm" :class="isSelected(file.path) ? 'opacity-70' : 'text-text-tertiary'">
            {{ formatDate(file.modifiedTime) }}
          </span>
          <span class="w-20 text-right text-sm" :class="isSelected(file.path) ? 'opacity-70' : 'text-text-tertiary'">
            {{ file.isDirectory ? '--' : formatSize(file.size) }}
          </span>
          <span class="w-24 truncate text-left text-sm" :class="isSelected(file.path) ? 'opacity-70' : 'text-text-tertiary'">
            {{ fileKind(file) }}
          </span>
          <span
            v-if="showPermissions"
            class="w-28 truncate text-left text-sm font-mono"
            :class="isSelected(file.path) ? 'opacity-70' : 'text-text-tertiary'"
          >
            {{ formatPermissions(file.mode) }}
          </span>
          <!-- 行尾框选留白（Finder 的「行后空白区」）：行内其余区域（图标/文件名/
               元数据列/行内间隙）按下拖动即拖拽文件，框选仅从本留白或行外空白
               （表头/列表下方/grid 空轨）发起。固定宽度保证行填满视口时框选
               仍有起点。 -->
          <span class="finder-rubber-tail self-stretch w-12 flex-shrink-0" aria-hidden="true"></span>
        </div>
      </RecycleScroller>
    </template>

    <!-- Grid View: 按行分组虚拟滚动（支持大/中/小三档） -->
    <RecycleScroller
      ref="gridScrollerRef"
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
          class="file-item relative flex flex-col items-center p-2 rounded-lg overflow-hidden"
          :data-file-path="file.path"
          :class="dropTargetPath === file.path ? 'drop-target-row' : ''"
          draggable="true"
          @click="handleClick(file, $event)"
          @dragstart="handleDragStart(file, $event)"
          @dragover="handleRowDragOver(file, $event)"
          @drop="handleRowDrop(file, $event)"
          @contextmenu.prevent.stop="showFileContextMenu($event, file)"
        >
          <!-- Finder 式选中：仅图标周围一圈略大的灰色圆角底，未选中时无底色；文字底为系统蓝 -->
          <div
            class="flex items-center justify-center rounded-lg mb-2 flex-shrink-0 p-1.5 transition-colors duration-100"
            :class="isSelected(file.path) ? 'finder-selected' : ''"
          >
            <div :class="['flex items-center justify-center rounded-md overflow-hidden', gridCfg.thumbClass]">
              <img
                v-if="getThumbnailUrl(file, gridCfg.thumbKey)"
                :src="getThumbnailUrl(file, gridCfg.thumbKey)!"
                class="w-full h-full object-cover"
                @error="thumbnailUrls.delete(`${file.path}:${gridCfg.thumbKey}`)"
              />
              <component v-else :is="getFileIconComponent(file)" :class="gridCfg.iconClass" />
            </div>
          </div>
          <FileNameMatchLabel
            :class="[gridCfg.nameClass, 'finder-name-label text-center leading-tight line-clamp-2 w-full break-words px-2 py-1 rounded-md transition-colors', isSelected(file.path) ? 'finder-selected-label finder-selected-text' : 'text-text-primary']"
            :name="file.name"
            :highlight-indices="typeaheadHighlightFor(file)"
            :selected="isSelected(file.path)"
          />
          <FileGitBadge v-if="gitStatusOf(file)" class="absolute top-1 right-1" :x="gitStatusOf(file)!.x" :y="gitStatusOf(file)!.y" />
          <svg
            v-if="file.isSymlink"
            class="absolute bottom-1 right-1 w-3.5 h-3.5 text-accent-teal bg-bg-secondary/70 rounded"
            :title="$t('fileList.symlinkTitle', { target: file.symlinkTarget ?? '' })"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
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
          {{ column.path.split('/').pop() || $t('fileList.columns.root') }}
        </div>

        <!-- Column Content -->
        <div class="flex-1 overflow-auto py-1">
          <div
            v-for="file in column.files"
            :key="file.path"
            class="flex items-center gap-2.5 px-3 py-2 transition-colors duration-100 text-text-primary"
            :data-file-path="file.path"
            :class="isSelected(file.path) && column.selectedPath !== file.path ? 'bg-bg-active' : ''"
            @click="handleColumnClick(index, file)"
            @dblclick="handleDoubleClick(file)"
          >
            <!-- Finder 式选中（与 list/grid 统一）：图标一圈略大浅灰圆角底 + 名称蓝底白字 -->
            <div
              class="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded p-0.5 transition-colors"
              :class="column.selectedPath === file.path ? 'finder-selected' : ''"
            >
              <component :is="getFileIconComponent(file)" class="w-full h-full" />
            </div>
            <FileNameMatchLabel
              class="finder-name-label flex-1 truncate text-base rounded px-1 transition-colors"
              :class="column.selectedPath === file.path ? 'finder-selected-label finder-selected-text' : 'text-text-primary'"
              :name="file.name"
              :highlight-indices="typeaheadHighlightFor(file)"
              :selected="isSelected(file.path)"
            />
            <FileGitBadge v-if="gitStatusOf(file)" :x="gitStatusOf(file)!.x" :y="gitStatusOf(file)!.y" />
            <svg
              v-if="file.isSymlink"
              class="w-3 h-3 flex-shrink-0 text-accent-teal"
              :title="$t('fileList.symlinkTitle', { target: file.symlinkTarget ?? '' })"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            <svg v-if="file.isDirectory" class="w-4 h-4" :class="column.selectedPath === file.path ? 'opacity-70' : 'text-text-tertiary'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- This feedback lives in the content area so it does not compete with the filter field. -->
    <div
      v-if="typeahead.query.value"
      class="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
      :class="viewMode === 'list' ? 'top-12' : 'top-3'"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-center gap-2 rounded-full border border-border bg-bg-secondary/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
        <span class="max-w-48 truncate font-medium text-text-primary">{{ typeahead.query.value }}</span>
        <span class="text-text-tertiary">{{ typeahead.matches.value.length ? $t('fileList.typeahead.matches', typeahead.matches.value.length) : $t('fileList.typeahead.noMatches') }}</span>
        <span class="border-l border-border pl-2 text-text-tertiary">{{ $t('fileList.typeahead.escClear') }}</span>
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
      <span class="text-sm text-text-secondary">{{ $t('fileList.renameBar.label') }}</span>
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
        {{ $t('fileList.renameBar.confirm') }}
      </button>
      <button
        class="px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded text-sm hover:bg-bg-hover transition-colors"
        @click="cancelRename"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>

    <!-- Context Menu（Finder/NSMenu 风格：定位、钳制、键盘导航都在组件内） -->
    <FinderContextMenu
      v-if="contextMenu.visible"
      :items="contextMenu.items"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @select="handleContextMenuAction"
      @close="hideContextMenu"
    />
  </div>
</template>

<script lang="ts">
// 模块级（跨 FileList 实例共享）：同一时刻只保留一个打开的右键菜单。
// document click 只监听左键，跨窗格右键不会关掉旧菜单，这里显式互斥，
// 也避免两个菜单组件同时注册键盘拦截器导致按键双响应。
let _closeActiveContextMenu: (() => void) | null = null
</script>

<script setup lang="ts">
import { ref, onMounted, watch, computed, reactive, h, type Component, onUnmounted, nextTick } from 'vue'
import type { FileInfo, Column } from '@/types'
import type { FileSortDescriptor } from '@/types/fileBrowser'
import type { DeviceCapabilities, InternalFileDragPayload } from '@/types/fileOperation'
import { useDevicesStore } from '@/stores/devices'
import { useThumbnailStore } from '@/stores/thumbnail'
import { useTabsStore } from '@/stores/tabs'
import { useFavoritesStore } from '@/stores/favorites'
import { useSettingsStore } from '@/stores/settings'
import { usePreviewStore } from '@/stores/preview'
import { useDragSessionStore } from '@/stores/dragSession'
import {
  extractDragSource,
  isFolderDropTarget,
  isSelfOrDescendant,
  resolveDropAction
} from '@/utils/dragTransfer'
import { showDropHint, hideDropHint, type DropHintAction } from '@/utils/dropHint'
import { extensionCategories, extensionIconMap, isThumbnailable, isImageFile, IMAGE_EXTENSIONS_WITH_DOT } from '@/utils/fileTypes'
import { useTypeaheadLocator } from '@/composables/useTypeaheadLocator'
import { isZipVirtualPath, parseZipVirtualPath, joinZipPath } from '@shared/zipPath'
import { resolveFileKind } from '@shared/fileKinds'
import { listingDiffers } from '@/utils/listingDiff'
import { toRelativePath, toFileUri, getBaseName, paneParentPath } from '@/utils/path'
import { copyToClipboard } from '@/utils/clipboard'
import { formatPermissions } from '@/utils/permissions'
import { formatDateTime } from '@/utils/formatDate'
import { i18n, t } from '@/i18n'
import FileNameMatchLabel from '@/components/FileNameMatchLabel.vue'
import FileGitBadge from '@/components/FileGitBadge.vue'
import FinderContextMenu, { type FinderMenuItem } from '@/components/menu/FinderContextMenu.vue'
import { useGitStatusStore } from '@/stores/gitStatus'
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
  operation: [op: { action: string; files: string[]; target?: string; targetDeviceId?: string; newName?: string; sourceDeviceId?: string; sourcePaneId?: string; mode?: 'copy' | 'move'; checksumItems?: Array<{ deviceId: string; path: string; name: string; size: number }> }]
  loaded: [files: FileInfo[]]
  sort: [sort: FileSortDescriptor]
}>()

const devicesStore = useDevicesStore()
const thumbnailStore = useThumbnailStore()
const tabsStore = useTabsStore()
const favoritesStore = useFavoritesStore()
const settingsStore = useSettingsStore()
const gitStatusStore = useGitStatusStore()
const previewStore = usePreviewStore()
const dragSessionStore = useDragSessionStore()

const files = ref<FileInfo[]>([])
const searchResults = ref<FileInfo[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// ── Git 状态徽标（只读，仅本地）────────────────────────────────────────────
// 目录/设备变化时触发查询；非仓库目录拿到 isRepo:false 后零渲染开销。
const gitEntryMap = computed(() => gitStatusStore.entryMapFor(props.deviceId, props.path))
function gitStatusOf(file: FileInfo): { x: string; y: string } | undefined {
  return gitEntryMap.value?.get(file.path)
}
watch(
  () => [props.deviceId, props.path] as const,
  ([deviceId, path]) => {
    if (deviceId === 'local' && !isZipVirtualPath(path)) {
      void gitStatusStore.fetch(deviceId, path)
    }
  },
  { immediate: true }
)
const loading = ref(false)
const columnFilesMap = ref<Map<string, FileInfo[]>>(new Map())
const deviceCapabilities = ref<DeviceCapabilities | null>(null)
/** 当前拖拽悬停的文件夹行（放置目标高亮） */
const dropTargetPath = ref<string | null>(null)

const pane = computed(() => tabsStore.findPane(props.paneId))
const showPermissions = computed(() => settingsStore.settings.showPermissions)

// ── 目录加载错误状态（pane.loadError 上提至 tabs store：tab 栏据此打 ⚠）──────
const loadError = computed(() => pane.value?.loadError ?? null)
/** 错误判定后探测出的最近存在的祖先目录（「转到上级文件夹」按钮目标）。 */
const nearestExistingAncestor = ref<string | null>(null)

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 失败判别：exists 确认不存在 → pathMissing（文案「文件夹已不存在」）；
 * exists 抛错或返回 true → 视为瞬态/未知失败（通用失败文案 + 原始错误消息）。
 * 成功恢复（目录回来了）的情况由 loadFiles 成功路径自然清除。
 */
async function classifyLoadError(deviceId: string, path: string, raw: unknown): Promise<{ message: string; pathMissing: boolean }> {
  try {
    const stillExists = await window.fileman.exists(deviceId, path)
    return { message: errorMessageOf(raw), pathMissing: !stillExists }
  } catch {
    return { message: errorMessageOf(raw), pathMissing: false }
  }
}

/**
 * 逐级向上探测最近的存在祖先（zip-aware；上限 20 级防御病态路径）。
 * 全部不存在（或 IPC 失败）→ null（按钮禁用）。仅当最终结果仍属于当前
 * (deviceId, path) 会话时写入 ref，避免竞态污染新目录的错误态。
 */
async function probeNearestAncestor(deviceId: string, path: string): Promise<void> {
  let current = path
  for (let depth = 0; depth < 20; depth++) {
    const parent = paneParentPath(current)
    if (parent === current) break
    current = parent
    try {
      if (await window.fileman.exists(deviceId, current)) {
        if (props.deviceId === deviceId && props.path === path) {
          nearestExistingAncestor.value = current
        }
        return
      }
    } catch {
      // exists 本身失败（设备瞬断等）：探测作罢，按钮禁用
      return
    }
  }
}

/** 隐藏文件开关关闭时过滤 dotfile（'..' 是 ZIP 视图的父目录项，始终保留） */
function filterHiddenFiles(list: FileInfo[]): FileInfo[] {
  if (settingsStore.settings.showHiddenFiles) return list
  return list.filter(file => file.name === '..' || !file.name.startsWith('.'))
}

const columns = computed<Array<{ path: string; files: FileInfo[]; selectedPath?: string }>>({
  get() {
    const storedColumns = pane.value?.columns
    if (!storedColumns || storedColumns.length === 0) {
      return []
    }
    return storedColumns.map(col => ({
      path: col.path,
      files: filterHiddenFiles(columnFilesMap.value.get(col.path) || []),
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
  items: [] as FinderMenuItem[]
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
// Keep diagnostics out of production interaction paths.
const _perf = {
  enabled: import.meta.env.DEV,
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
const listScrollerRef = ref<{ scrollToItem?: (index: number) => void } | null>(null)
const gridScrollerRef = ref<{ scrollToItem?: (index: number) => void } | null>(null)

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
/** 框选真实拖动（≥4px）结束后，若按下/释放在同一行内浏览器仍会派发 click——
 *  吞掉该 click，避免 handleClick 的单选冲掉框选结果 */
let suppressNextClick = false

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
  const visible = filterHiddenFiles(source)
  if (!props.searchQuery?.trim()) return visible
  const lowerFilter = props.searchQuery.toLowerCase().trim()
  return visible.filter(file => file.name.toLowerCase().includes(lowerFilter))
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

const typeahead = useTypeaheadLocator(() => displayedFiles.value)
const typeaheadHighlights = computed(() => new Map(typeahead.matches.value.map(match => [match.file.path, match.highlightIndices])))

function typeaheadHighlightFor(file: FileInfo): readonly number[] {
  return typeaheadHighlights.value.get(file.path) ?? []
}

/** 将 displayedFiles[index] 滚动到可见位置（list/grid 虚拟滚动） */
async function revealIndex(index: number): Promise<void> {
  if (index < 0) return
  await nextTick()
  if (props.viewMode === 'list') {
    listScrollerRef.value?.scrollToItem?.(index)
  } else if (props.viewMode === 'grid') {
    gridScrollerRef.value?.scrollToItem?.(Math.floor(index / itemsPerRow.value))
  }
}

/** columns 视图：将指定 data-file-path 元素滚动到可见 */
function revealColumnItem(path: string): void {
  void nextTick(() => {
    const element = Array.from(containerRef.value?.querySelectorAll<HTMLElement>('[data-file-path]') ?? [])
      .find(el => el.dataset.filePath === path)
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

async function revealTypeaheadMatch(file: FileInfo) {
  anchorPath.value = file.path
  emit('select', [file.path])
  const index = displayedFiles.value.findIndex(item => item.path === file.path)
  if (index < 0) return

  if (props.viewMode === 'columns') {
    revealColumnItem(file.path)
    return
  }
  await revealIndex(index)
}

watch(typeahead.activeMatch, match => {
  if (match) void revealTypeaheadMatch(match.file)
})

// Quick Look ↑↓ 步进时列表滚动跟随（仅 session 归属的 pane 响应）
watch(() => (previewStore.quickLookOpen ? previewStore.quickLookFile?.path ?? null : null), path => {
  if (!path || !previewStore.quickLookOpen) return
  if (previewStore.quickLook?.paneId !== props.paneId) return
  if (props.viewMode === 'columns') {
    revealColumnItem(path)
  } else {
    const index = displayedFiles.value.findIndex(item => item.path === path)
    if (index >= 0) void revealIndex(index)
  }
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
const LIST_ITEM_HEIGHT = 26

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

// ── ZIP virtual path helpers（协议解析统一在 @shared/zipPath，此处仅组装）──
function zipEntriesToFileInfo(entries: Array<{
  name: string; path: string; isDirectory: boolean; size: number;
  compressedSize: number; modifiedTime: string
}>, zipFilePath: string): FileInfo[] {
  return entries.map(e => ({
    name: e.name,
    // Virtual path so rest of app (preview, selection, etc.) can use it
    path: joinZipPath(zipFilePath, e.path),
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

async function loadDeviceCapabilities(deviceId: string) {
  try {
    const capabilities = await devicesStore.getDeviceCapabilities(deviceId)

    // A later navigation can switch devices while these background checks run.
    if (props.deviceId !== deviceId) return
    deviceCapabilities.value = capabilities
  } catch (error) {
    // Capabilities only affect contextual actions; a failure must not block the
    // directory listing itself.
    log.warn('[FileList] Could not load device capabilities', { deviceId, error })
  }
}

async function loadFiles() {
  const pathSnapshot = props.path
  const deviceSnapshot = props.deviceId

  loading.value = true
  tabsStore.setPaneLoadError(props.paneId, null)
  nearestExistingAncestor.value = null
  try {
    // ── Virtual ZIP path ──────────────────────────────────────────────────────
    if (isZipVirtualPath(pathSnapshot)) {
      const { zipFilePath, innerPath } = parseZipVirtualPath(pathSnapshot)
      const entries = await window.fileman.zip.listDirectory(zipFilePath, innerPath)
      if (props.path !== pathSnapshot) {
        return
      }
      const result = zipEntriesToFileInfo(entries, zipFilePath)
      files.value = result
      columnFilesMap.value.set(pathSnapshot, result)
      emit('loaded', result)
      if (props.viewMode === 'columns') {
        columns.value = [{ path: pathSnapshot, files: result }]
      }
      return
    }

    // ── Normal filesystem path ────────────────────────────────────────────────
    // Context-menu capabilities are not required to render the directory. Keep
    // them off the critical path so navigation paints as soon as listFiles ends.
    void loadDeviceCapabilities(props.deviceId)
    const result = await window.fileman.listFiles(props.deviceId, pathSnapshot)
    if (props.path !== pathSnapshot) {
      return
    }
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
    console.error('[FileList] Failed to load directory', { deviceId: props.deviceId, path: pathSnapshot, error })
    files.value = []
    emit('loaded', [])
    // 双快照守卫：导航/切设备竞态下不把旧目录的错误写到新会话上
    if (props.path === pathSnapshot && props.deviceId === deviceSnapshot) {
      const classified = await classifyLoadError(deviceSnapshot, pathSnapshot, error)
      if (props.path === pathSnapshot && props.deviceId === deviceSnapshot) {
        tabsStore.setPaneLoadError(props.paneId, classified)
        if (classified.pathMissing) {
          void probeNearestAncestor(deviceSnapshot, pathSnapshot)
        }
      }
    }
  } finally {
    loading.value = false
  }
}

/** 错误态「重试」按钮：等价手动刷新。 */
function retryFromLoadError() {
  void loadFiles()
}

/** 错误态「转到上级文件夹」按钮：导航到探测到的最近存在祖先。 */
function goToExistingAncestor() {
  const target = nearestExistingAncestor.value
  if (!target) return
  emit('navigate', target)
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

watch(() => props.path, () => {
  loadFiles()
}, { immediate: true })
watch(() => props.deviceId, () => {
  loadFiles()
})

// ── 自动刷新（watch:changed 订阅）───────────────────────────────────────────
// FileList 的挂载周期与「某目录正被展示」精确对齐，因此由它（而非 FilePane）
// 持有订阅；设备/路径切换时重订（引用计数，双面板同目录只一个 watcher）。
// ZIP 虚拟路径不支持监听（主进程无对应实体目录）。
watch(
  () => [props.deviceId, props.path] as const,
  ([deviceId, path], _prev, onCleanup) => {
    if (isZipVirtualPath(path)) return
    void window.fileman.watchSubscribe(deviceId, path).catch(() => {
      // 订阅失败（目录已删等）不致命：退化为手动 Cmd+R 刷新
    })
    onCleanup(() => {
      void window.fileman.watchUnsubscribe(deviceId, path).catch(() => {})
    })
  },
  { immediate: true }
)

let unsubscribeWatchChanged: (() => void) | null = null
let watchRefreshTimer: ReturnType<typeof setTimeout> | null = null

/** watch 事件到达：300ms 合并后，diff 守卫（签名无变化不打扰选区/滚动）再重载。 */
async function refreshAfterWatchEvent(): Promise<void> {
  if (isZipVirtualPath(props.path)) return
  const pathSnapshot = props.path
  const deviceSnapshot = props.deviceId
  try {
    const fresh = await window.fileman.listFiles(deviceSnapshot, pathSnapshot)
    if (props.path !== pathSnapshot || props.deviceId !== deviceSnapshot) return
    // autoRefresh=false：内容不自动重载（不打扰选区/滚动）；目录消失检测仍生效
    if (settingsStore.settings.autoRefresh === false) return
    if (!listingDiffers(files.value, fresh)) return
    await loadFiles()
  } catch (error) {
    // 设备瞬断容忍：仅在 exists 确认目录已消失时才翻转错误态，其余保持静默
    try {
      const stillExists = await window.fileman.exists(deviceSnapshot, pathSnapshot)
      if (!stillExists && props.path === pathSnapshot && props.deviceId === deviceSnapshot) {
        files.value = []
        emit('loaded', [])
        tabsStore.setPaneLoadError(props.paneId, { message: errorMessageOf(error), pathMissing: true })
        void probeNearestAncestor(deviceSnapshot, pathSnapshot)
      }
    } catch { /* exists 也失败：瞬断，静默 */ }
  }
}

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
  document.addEventListener('compositionend', handleCompositionEnd)
  unsubscribeWatchChanged = window.fileman.onWatchChanged(event => {
    // autoRefresh 开关的裁决移入 refreshAfterWatchEvent：目录失效检测不受开关影响
    if (event.deviceId !== props.deviceId || event.dirPath !== props.path) return
    if (watchRefreshTimer) clearTimeout(watchRefreshTimer)
    watchRefreshTimer = setTimeout(() => { void refreshAfterWatchEvent() }, 300)
  })
  // 预热「打开方式」：挂载即查当前目录（主进程 '<dir>' 缓存键），右键空白菜单即时可用；
  // 文件菜单在右键时按命中条目再查（主进程按扩展名 memoize，多面板重复调用无害）
  if (isHostShellAvailable()) refreshOpenWithApps(props.path)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('compositionend', handleCompositionEnd)
  // 确保 rubber-band 残留监听器被清理
  document.removeEventListener('mousemove', handleRubberBandMove)
  document.removeEventListener('mouseup', handleRubberBandUp)
  unsubscribeWatchChanged?.()
  if (watchRefreshTimer) clearTimeout(watchRefreshTimer)
})

function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || !!element?.isContentEditable
}

function handleCompositionEnd(event: CompositionEvent) {
  if (isTextEditingTarget(event.target)) return
  typeahead.append(event.data)
}

function handleKeyDown(event: KeyboardEvent) {
  if (isTextEditingTarget(event.target)) return
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i' && props.selectedFiles.length >= 1) {
    event.preventDefault(); emit('operation', { action: 'info', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'r' && props.selectedFiles.length > 1) {
    event.preventDefault(); emit('operation', { action: 'batch-rename', files: props.selectedFiles }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Backspace' && props.selectedFiles.length) {
    event.preventDefault(); emit('operation', { action: 'delete', files: props.selectedFiles }); return
  }
  // ⌘⇧.: 显示/隐藏隐藏文件。开关型操作必须带活动窗格守卫——
  // 每个 FileList 都在 document 上挂了监听，双触发会互相抵消。
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey
      && (event.key === '.' || event.key === '>' || event.code === 'Period')) {
    if (tabsStore.activePane?.id !== props.paneId) return
    event.preventDefault()
    void settingsStore.toggleShowHiddenFiles()
    return
  }
  // ⌘O：打开当前项（与 ⌘↓ 同义）
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
      && event.key.toLowerCase() === 'o') {
    if (tabsStore.activePane?.id !== props.paneId) return
    if (renameState.active) return
    event.preventDefault()
    openCurrentItem()
    return
  }
  // ⇧⌘G：前往文件夹
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey
      && event.key.toLowerCase() === 'g') {
    if (tabsStore.activePane?.id !== props.paneId) return
    event.preventDefault()
    emit('operation', { action: 'goto', files: [] })
    return
  }

  // ── 方向键文件导航（Finder 语义；仅活动窗格响应）──────────────────────────
  if (ARROW_KEYS.has(event.key) || event.key === 'Home' || event.key === 'End') {
    if (renameState.active) return                         // 内联重命名中不响应
    if (tabsStore.activePane?.id !== props.paneId) return   // 双窗格/多标签：仅活动窗格
    const t = event.target as Node | null                  // 焦点在其它可交互元素（如视频播放器）上时不抢占
    if (t && t !== document.body && !containerRef.value?.contains(t)) return
    event.preventDefault()
    handleArrowNavigation(event)
    return
  }

  // Enter: Start rename (when single file selected and not already renaming)
  if (event.key === 'Enter' && !renameState.active && props.selectedFiles.length === 1) {
    event.preventDefault()
    startRename(props.selectedFiles[0])
    return
  }

  if (event.key === 'Escape' && typeahead.query.value) {
    event.preventDefault()
    typeahead.clear()
    return
  }

  // Escape: Cancel rename
  if (event.key === 'Escape' && renameState.active) {
    event.preventDefault()
    cancelRename()
    return
  }

  // Space：Quick Look（无修饰、非 IME 合成、typeahead 未激活；必须在 typeahead
  // 分支之前——连续输入中的空格属于 query 的一部分）
  if (event.code === 'Space' && !event.metaKey && !event.ctrlKey && !event.altKey
      && !event.shiftKey && !event.isComposing && !typeahead.query.value) {
    if (renameState.active) return
    if (tabsStore.activePane?.id !== props.paneId) return
    let file: FileInfo | null = null
    // ↑↓ 步进必须跟随可见顺序：columns 取当前列，其余取排序后的 displayedFiles
    let list: FileInfo[] = displayedFiles.value
    if (props.viewMode === 'columns') {
      const cur = getColumnsCursor()
      if (cur && cur.row >= 0) {
        list = columns.value[cur.col].files
        file = list[cur.row] ?? null
      }
    } else {
      file = getOpenTarget()
    }
    if (file) {
      event.preventDefault()
      previewStore.openQuickLook(file, props.deviceId, props.paneId, list)
    }
    return
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing && event.key.length === 1) {
    if (typeahead.append(event.key)) event.preventDefault()
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
  typeahead.clear()
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
// 日期格式化缓存：键为 `${locale}:${dateStr}`（避免每次渲染都执行 Intl 格式化，
// 且语言切换后不会命中旧语言的缓存条目）
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
      // stroke-width 1.75：对齐 SF Symbols 的视觉笔画重量，1.5 在非 retina 下偏细
      return h('svg', { class: className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
        h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.75', d: pathD })
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
    // 相对 URL:dev(http://localhost:5173/)与打包态(file://…/out/renderer/)都以
    // index.html 所在目录解析,icons/ 由 copyRootIconsPlugin 拷进产物。勿用 '/icons' ——
    // file:// 下绝对路径会指向磁盘根目录,打包后 404。
    component = createSvgIcon('./icons/ic_folder_mac.svg')
  } else {
    const ext = cacheKey
    const iconFile = extensionIconMap[ext]

    if (iconFile) {
      component = createSvgIcon(`./icons/${iconFile}`)
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

function fileKind(file: FileInfo): string {
  if (file.isDirectory) return t('fileList.kind.folder')
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : ''
  return extension ? t('fileList.kind.extDocument', { ext: extension }) : t('fileList.kind.document')
}

// mtime 列格式：locale 参与缓存键，切换语言后旧缓存不命中、按新语言重算。
// 读取 i18n locale ref 发生在渲染函数内 → 语言切换会触发重渲染（响应式依赖）。
const DATE_COLUMN_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}

function formatDate(dateStr: string): string {
  if (Number.isNaN(new Date(dateStr).getTime())) return dateStr
  const cacheKey = `${i18n.global.locale.value}:${dateStr}`
  const cached = _formattedDateCache.get(cacheKey)
  if (cached !== undefined) return cached
  const result = formatDateTime(dateStr, DATE_COLUMN_OPTS)
  _formattedDateCache.set(cacheKey, result)
  return result
}

function isSelected(path: string): boolean {
  return selectedFilesSet.value.has(path)
}

function handleClick(file: FileInfo, event: MouseEvent) {
  // 框选拖动结束后的余波 click（mousedown preventDefault 不抑制 click 派发）
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
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
    // Nested ZIP ('a.zip::inner.zip'): the '::' protocol has no second level —
    // open the archive in tree preview instead of a broken virtual path.
    if (isZipVirtualPath(file.path)) {
      previewStore.openPreview(file, props.deviceId, undefined, 'zip')
      return
    }
    // Navigate INTO the ZIP as a virtual filesystem
    emit('navigate', joinZipPath(file.path, ''))
  } else if (
    props.deviceId === 'local'
    && !isZipVirtualPath(file.path)
    && resolveFileKind(file.name, file.extension ?? '') === 'zip'
  ) {
    // ZIP 容器格式（pptx/docx/aar/jar…）：实为 zip 但属于其他应用的格式。
    // 本机有实体与专属应用，双击交给系统默认应用（Finder 语义）；想看内部
    // 结构走右键 ZIP 子菜单。ZIP 内部的同名条目无本地实体，继续应用内预览。
    window.fileman.openDefault(file.path).catch(err => {
      console.error('[FileList] openDefault failed for', file.path, err)
    })
  } else {
    emit('preview', file)
  }
}

// ── 方向键文件导航（Finder 语义） ────────────────────────────────────────────

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** 键盘导航光标索引：anchorPath → 选中项 → 首项 */
function getCursorIndex(): number {
  const list = displayedFiles.value
  if (!list.length) return -1
  if (anchorPath.value) {
    const i = list.findIndex(f => f.path === anchorPath.value)
    if (i >= 0) return i
  }
  for (const p of props.selectedFiles) {
    const i = list.findIndex(f => f.path === p)
    if (i >= 0) return i
  }
  return 0
}

/** 普通方向键的目标索引（list/grid；边界处返回 current 表示原地不动） */
function computeTargetIndex(current: number, key: string): number {
  const len = displayedFiles.value.length
  if (props.viewMode === 'grid') {
    const per = itemsPerRow.value
    if (key === 'ArrowLeft') return current % per > 0 ? current - 1 : current
    if (key === 'ArrowRight') return current < len - 1 ? current + 1 : current
    if (key === 'ArrowUp') return Math.max(0, current - per)
    if (key === 'ArrowDown') return Math.min(len - 1, current + per)
    return current
  }
  // list 视图：仅上下移动
  if (key === 'ArrowUp') return Math.max(0, current - 1)
  if (key === 'ArrowDown') return Math.min(len - 1, current + 1)
  return current
}

/** 普通方向键：移动光标并单选 */
function moveCursorTo(target: number): void {
  const file = displayedFiles.value[target]
  if (!file) return
  anchorPath.value = file.path
  emit('select', [file.path])
  void revealIndex(target)
}

/**
 * Shift+方向键：以 anchorPath 为锚点，向按键方向扩展/收缩选区。
 * 始终把选区替换为 anchor→focus 的连续区间：远离锚点时扩展，
 * 折返时 focus 越过当前选区边缘向锚点靠拢即收缩。
 */
function extendRangeSelection(key: string, cursor: number): void {
  const list = displayedFiles.value
  if (!list.length || cursor < 0) return
  if (!ARROW_KEYS.has(key) && key !== 'Home' && key !== 'End') return
  // 锚点缺失时，以当前光标为锚点（与 Shift+Click 的兜底行为一致）
  if (!anchorPath.value) {
    anchorPath.value = list[cursor]?.path ?? null
    if (!anchorPath.value) return
  }
  const anchorIdx = list.findIndex(f => f.path === anchorPath.value)
  if (anchorIdx < 0) {
    anchorPath.value = null
    return
  }

  const step = (key === 'ArrowUp' || key === 'ArrowDown') && props.viewMode === 'grid'
    ? itemsPerRow.value
    : 1
  let focus: number
  if (key === 'Home') {
    focus = 0
  } else if (key === 'End') {
    focus = list.length - 1
  } else {
    // 当前选区的活动边缘：向下扩展取 hi，向上收缩/扩展取 lo
    const selectedIdx = props.selectedFiles
      .map(p => list.findIndex(f => f.path === p))
      .filter(i => i >= 0)
    const lo = selectedIdx.length ? Math.min(anchorIdx, ...selectedIdx) : anchorIdx
    const hi = selectedIdx.length ? Math.max(anchorIdx, ...selectedIdx) : anchorIdx
    const downward = key === 'ArrowDown' || key === 'ArrowRight'
    focus = Math.max(0, Math.min(list.length - 1, (downward ? hi : lo) + (downward ? step : -step)))
  }
  const [start, end] = [Math.min(anchorIdx, focus), Math.max(anchorIdx, focus)]
  emit('select', list.slice(start, end + 1).map(f => f.path))
  void revealIndex(focus)
}

/** Cmd+Down 的打开目标（需已有选中/锚点，与 Finder 一致不在无选中时打开） */
function getOpenTarget(): FileInfo | null {
  const path = anchorPath.value ?? props.selectedFiles[props.selectedFiles.length - 1]
  if (!path) return null
  const idx = displayedFiles.value.findIndex(f => f.path === path)
  return idx >= 0 ? displayedFiles.value[idx] : null
}

/** columns 视图光标：[列索引, 行索引]；row 为 -1 表示尚未定位 */
function getColumnsCursor(): { col: number; row: number } | null {
  const cols = columns.value
  if (!cols.length) return null
  const candidates = [anchorPath.value, ...props.selectedFiles].filter(Boolean) as string[]
  for (const p of candidates) {
    for (let c = cols.length - 1; c >= 0; c--) {
      const r = cols[c].files.findIndex(f => f.path === p)
      if (r >= 0) return { col: c, row: r }
    }
  }
  for (let c = cols.length - 1; c >= 0; c--) {
    const sp = cols[c].selectedPath
    if (sp) {
      const r = cols[c].files.findIndex(f => f.path === sp)
      if (r >= 0) return { col: c, row: r }
    }
  }
  return { col: cols.length - 1, row: -1 }
}

/** 更新某列的高亮（经 columns computed setter 写回 store，files 自动保留） */
function setColumnSelectedPath(colIdx: number, path: string): void {
  columns.value = columns.value.map((c, i) => (i === colIdx ? { ...c, selectedPath: path } : c))
}

/** columns 视图方向键导航 */
function handleColumnsArrow(event: KeyboardEvent): void {
  const cur = getColumnsCursor()
  if (!cur) return
  const cols = columns.value
  const rows = cols[cur.col].files.length
  const key = event.key

  // Right：目录 → 展开下一列（等价单击）；文件/未定位 → 无操作
  if (key === 'ArrowRight' && !event.shiftKey) {
    const file = cur.row >= 0 ? cols[cur.col].files[cur.row] : null
    if (file?.isDirectory) void handleColumnClick(cur.col, file)
    return
  }
  // Left：收起到上一列，选中上一列中展开的文件夹
  if (key === 'ArrowLeft' && !event.shiftKey) {
    if (cur.col === 0) return
    const parentPath = cols[cur.col - 1].selectedPath
    if (!parentPath) return
    columns.value = cols.slice(0, cur.col)
    anchorPath.value = parentPath
    emit('select', [parentPath])
    revealColumnItem(parentPath)
    return
  }
  if (!ARROW_KEYS.has(key) && key !== 'Home' && key !== 'End') return

  // Up/Down（含 Shift 列内范围）；未定位时 Up 取末行、Down 取首行
  let row = cur.row
  if (row < 0) {
    row = key === 'ArrowUp' ? rows - 1 : 0
    const first = cols[cur.col].files[row]
    if (first) {
      anchorPath.value = first.path
      setColumnSelectedPath(cur.col, first.path)
      emit('select', [first.path])
      revealColumnItem(first.path)
    }
    return
  }
  const target = key === 'Home' ? 0
    : key === 'End' ? rows - 1
    : key === 'ArrowUp' ? Math.max(0, row - 1)
    : Math.min(rows - 1, row + 1)
  if (target === row) return
  const file = cols[cur.col].files[target]

  if (event.shiftKey) {
    // 锚点不在本列时，以当前行为锚重新开始
    if (!anchorPath.value) anchorPath.value = cols[cur.col].files[row]?.path ?? null
    let anchorRow = cols[cur.col].files.findIndex(f => f.path === anchorPath.value)
    if (anchorRow < 0) {
      anchorPath.value = cols[cur.col].files[row]?.path ?? null
      anchorRow = row
    }
    const [start, end] = [Math.min(anchorRow, target), Math.max(anchorRow, target)]
    emit('select', cols[cur.col].files.slice(start, end + 1).map(f => f.path))
  } else {
    anchorPath.value = file.path
    setColumnSelectedPath(cur.col, file.path)
    emit('select', [file.path])
  }
  revealColumnItem(file.path)
}

/** 打开当前项（⌘↓ / ⌘O 共用）：columns 视图走列光标，其余走选中目标 */
function openCurrentItem(): void {
  if (props.viewMode === 'columns') {
    const cur = getColumnsCursor()
    const file = cur && cur.row >= 0 ? columns.value[cur.col].files[cur.row] : null
    if (!cur || !file) return
    if (file.isDirectory) {
      void handleColumnClick(cur.col, file)
    } else {
      handleDoubleClick(file)
    }
  } else {
    const file = getOpenTarget()
    if (file) handleDoubleClick(file)
  }
}

/** 方向键导航总入口（Finder 语义） */
function handleArrowNavigation(event: KeyboardEvent): void {
  const key = event.key
  // Cmd/Ctrl+Up：返回上级目录（goUp 内部处理 ZIP '::' 虚拟路径）
  if ((event.metaKey || event.ctrlKey) && key === 'ArrowUp') {
    tabsStore.goUp(props.paneId)
    return
  }
  // Cmd/Ctrl+Down：打开当前项
  if ((event.metaKey || event.ctrlKey) && key === 'ArrowDown') {
    openCurrentItem()
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return

  if (props.viewMode === 'columns') {
    handleColumnsArrow(event)
    return
  }

  const list = displayedFiles.value
  if (!list.length) return
  const cursor = getCursorIndex()
  if (event.shiftKey) {
    extendRangeSelection(key, cursor)
    return
  }

  // 无选中时：Down/Home 选首项，Up/End 选末项
  if (props.selectedFiles.length === 0 && anchorPath.value === null) {
    moveCursorTo(key === 'ArrowUp' || key === 'End' ? list.length - 1 : 0)
    return
  }
  if (key === 'Home') {
    moveCursorTo(0)
    return
  }
  if (key === 'End') {
    moveCursorTo(list.length - 1)
    return
  }
  const target = computeTargetIndex(cursor, key)
  if (target !== cursor) moveCursorTo(target)
}
// ─────────────────────────────────────────────────────────────────────────────

// ── 拖动框选 (Rubber-band Selection) ─────────────────────────────────────────

function handleContainerMouseDown(e: MouseEvent) {
  // 只处理左键；右键交给 context menu
  if (e.button !== 0) return
  // Columns 视图不支持框选
  if (props.viewMode === 'columns') return
  // 上下文菜单打开时，不触发框选（否则 mouseup 会因距离 < 4px 而清空选中）
  if (contextMenu.visible) return
  const target = e.target as Element
  // Finder 语义：行内任意内容（图标/文件名/元数据列/行内间隙）按下拖动 =
  // 拖拽该文件——行本身 draggable，mousedown 不 preventDefault 即自然发起
  // dragstart。框选仅从「行尾留白（finder-rubber-tail）」或行外空白（表头/
  // 列表下方/grid 空轨）发起；startRubberBand 的 preventDefault 会抑制留白
  // 按势触发的原生 dragstart。
  // （ae16fc2 曾把元数据列划为框选背景，但 Finder 从元数据列同样能拖动文件，
  //   且双面板窄行下图标+文件名热点仅占行宽约三成，大量落点拖拽无反应；
  //   行尾留白取代元数据列承担「行填满视口时的框选起点」。）
  const onFileItem = target.closest('.file-item')
  const onRubberTail = target.closest('.finder-rubber-tail')
  if (!onFileItem || onRubberTail) {
    startRubberBand(e)
  }
}

function startRubberBand(e: MouseEvent) {
  if (!containerRef.value) return
  suppressNextClick = false
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
  } else {
    // 真实框选拖动：随后同元素上的 click 是同一手势的余波，需吞掉
    suppressNextClick = true
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function handleDragStart(file: FileInfo, event: DragEvent) {
  // 框选手势进行中（从行元数据列发起）：取消拖拽。mousedown preventDefault
  // 之外的双保险——两者任一生效都能保证框选与文件拖拽不互相竞争。
  if (rubberBand.active) {
    event.preventDefault()
    return
  }
  const dragData: InternalFileDragPayload = {
    paneId: props.paneId,
    deviceId: props.deviceId,
    // 展开成普通数组：props.selectedFiles 是 store 里的 reactive Proxy，
    // 直接传给 ipcRenderer.send 会在 contextBridge 结构化克隆时抛
    // "An object could not be cloned"（选中态拖拽无声死亡的根因）
    files: isSelected(file.path) ? [...props.selectedFiles] : [file.path]
  }

  // 本地实体文件（非 ZIP 虚拟路径）→ 原生拖拽接管，可拖出到 Finder / VSCode 等
  // 外部应用。官方模式要求在 dragstart 内 preventDefault 取消 HTML5 拖拽、同一
  // 手势内立即 IPC——HTML5 会话进行中无法开启第二个原生会话（electron#13083，
  // 「拖出窗口再转换」不可行）。应用内回落：原生拖拽落回本窗口时表现为
  // dataTransfer.files，dragSession + 文件名匹配识别源（见 dragTransfer.ts）。
  // supportsNativeDrag === true 严格判定：e2e mock 的 Proxy 对缺失属性返回
  // truthy 的 async 函数，宽松判定会让合成拖拽走进死路。
  if (
    window.fileman.supportsNativeDrag === true &&
    props.deviceId === 'local' &&
    dragData.files.every(filePath => !isZipVirtualPath(filePath))
  ) {
    dragSessionStore.begin(dragData)
    event.preventDefault()
    window.fileman.startNativeDrag(dragData.files, buildNativeDragIcon(event, dragData.files.length))
    log.info('[DnD][FileList] dragstart (native takeover)', {
      paneId: props.paneId,
      fileCount: dragData.files.length,
      files: dragData.files
    })
    return
  }

  // 远程设备 / ZIP 内部 / e2e mock：维持 HTML5 拖拽（应用内链路）
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(dragData))
    event.dataTransfer.effectAllowed = 'copyMove'
    // 原生拖拽的 payload 在落点不可读，会话记录是应用内识别源的唯一途径
    dragSessionStore.begin(dragData)
    applyFinderDragImage(event, dragData.files.length)
    log.info('[DnD][FileList] dragstart (html5)', {
      paneId: props.paneId,
      deviceId: props.deviceId,
      fileCount: dragData.files.length,
      files: dragData.files
    })
  }
}

// ── Finder 式拖拽图标 ─────────────────────────────────────────────────────────
// HTML5 默认拖拽快照是整行 DOM，这里换成「跟随鼠标的小图标 + 多选数量角标」。
// setDragImage 要求元素已渲染：先挂在 body 上（移出视口），拖拽结束后移除。

let dragImageCleanupTimer: ReturnType<typeof setTimeout> | null = null

function removeDragImage(dragImage: HTMLElement | null) {
  dragImage?.remove()
  if (dragImageCleanupTimer) {
    clearTimeout(dragImageCleanupTimer)
    dragImageCleanupTimer = null
  }
}

function applyFinderDragImage(event: DragEvent, fileCount: number) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  const row = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const iconClone = row?.querySelector('img, svg')?.cloneNode(true) ?? null
  const iconSize = 48

  const wrap = document.createElement('div')
  wrap.style.cssText =
    `position:fixed;left:-9999px;top:-9999px;pointer-events:none;z-index:2147483647;` +
    `display:flex;align-items:center;justify-content:center;width:${iconSize + 16}px;height:${iconSize + 16}px;opacity:0.9;`

  const iconBox = document.createElement('div')
  iconBox.style.cssText = `position:relative;width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;`

  if (iconClone instanceof HTMLElement || iconClone instanceof SVGElement) {
    iconClone.style.width = `${iconSize}px`
    iconClone.style.height = `${iconSize}px`
    iconClone.style.objectFit = 'contain'
    iconBox.appendChild(iconClone)
  } else {
    // 兜底：没有可克隆的图标时显示占位方块
    const fallback = document.createElement('div')
    fallback.style.cssText =
      `width:${iconSize}px;height:${iconSize}px;border-radius:8px;background:var(--bg-tertiary);border:1px solid var(--border);`
    iconBox.appendChild(fallback)
  }

  if (fileCount > 1) {
    const badge = document.createElement('div')
    badge.textContent = String(fileCount)
    badge.style.cssText =
      'position:absolute;right:-9px;bottom:-9px;min-width:20px;height:20px;padding:0 5px;' +
      'border-radius:9999px;background:var(--accent-blue);color:#fff;font-size:12px;font-weight:600;' +
      'display:flex;align-items:center;justify-content:center;box-sizing:border-box;'
    iconBox.appendChild(badge)
  }

  wrap.appendChild(iconBox)
  document.body.appendChild(wrap)

  const size = iconSize + 16
  dataTransfer.setDragImage(wrap, size / 2, size / 2)

  // 快照在拖拽启动后的一帧生成，dragend（含拖出转换后回不到窗口的情况）+
  // 超时兜底移除，避免泄漏到下一次拖拽
  removeDragImage(document.body.querySelector('.fileman-drag-image'))
  wrap.className = 'fileman-drag-image'
  const remove = () => {
    removeDragImage(wrap)
    window.removeEventListener('dragend', remove)
  }
  window.addEventListener('dragend', remove)
  dragImageCleanupTimer = setTimeout(remove, 10_000)
}

// ── 原生拖拽图标 ──────────────────────────────────────────────────────────────
// startDrag 只接受 NativeImage（DOM 快照/setDragImage 不可用），用 canvas 同步
// 合成 Finder 式「图标 + 多选数量角标」。不能异步——await 图片解码会错过
// dragstart 手势窗口：缩略图仅在已解码（img.complete）时绘制，SVG 类型图标
// 退化为通用文档图形（预热缓存列为后续打磨项）。

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function buildNativeDragIcon(event: DragEvent, fileCount: number): string {
  const iconSize = 64
  const pad = 8
  const total = iconSize + pad * 2
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(total * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(dpr, dpr)

  const row = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const iconEl = row?.querySelector('img, svg')
  if (iconEl instanceof HTMLImageElement && iconEl.complete && iconEl.naturalWidth > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(pad, pad, iconSize, iconSize, 10)
    ctx.clip()
    ctx.drawImage(iconEl, pad, pad, iconSize, iconSize)
    ctx.restore()
  } else {
    // 通用文档图形：圆角底 + 三条示意文本线
    ctx.beginPath()
    ctx.roundRect(pad, pad, iconSize, iconSize, 10)
    ctx.fillStyle = cssVar('--bg-tertiary', '#3a3a3c')
    ctx.fill()
    ctx.strokeStyle = cssVar('--border', '#5a5a5e')
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.strokeStyle = cssVar('--text-tertiary', '#9a9a9e')
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const y = pad + 26 + i * 10
      ctx.beginPath()
      ctx.moveTo(pad + 16, y)
      ctx.lineTo(pad + iconSize - 16, y)
      ctx.stroke()
    }
  }

  // 多选角标：右下 --accent-blue 圆 + 白字计数（对齐 applyFinderDragImage 观感）
  if (fileCount > 1) {
    const badgeR = 11
    const cx = total - badgeR - 1
    const cy = total - badgeR - 1
    ctx.beginPath()
    ctx.arc(cx, cy, badgeR, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--accent-blue', '#2f6fed')
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '600 13px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(fileCount), cx, cy + 0.5)
  }

  return canvas.toDataURL('image/png')
}

function clearDropTargetHighlight() {
  dropTargetPath.value = null
}

/** dragover 高频触发，仅在判定变化时输出日志 */
let lastRowDragOverDecision = ''

function handleRowDragOver(file: FileInfo, event: DragEvent) {
  const reason = !isFolderDropTarget(file)
    ? 'not-a-folder'
    : isZipVirtualPath(props.path)
      ? 'pane-inside-zip'
      : !dragSessionStore.isActive
        ? 'external-drag'
        : ''
  if (reason) {
    if (lastRowDragOverDecision !== reason) {
      lastRowDragOverDecision = reason
      log.info('[DnD][FileList] row dragover skipped', { reason, path: file.path })
    }
    hideDropHint()
    return
  }
  lastRowDragOverDecision = ''

  event.preventDefault()
  event.stopPropagation()
  dropTargetPath.value = file.path

  // 光标反馈：同设备默认 move / 跨设备 copy（drop 时按 altKey 重新判定）
  const source = dragSessionStore.peek()
  const action: DropHintAction = event.altKey || !source || source.deviceId !== props.deviceId ? 'copy' : 'move'
  if (event.dataTransfer) event.dataTransfer.dropEffect = action
  showDropHint(event.clientX, event.clientY, action, file.name)
}

async function handleRowDrop(file: FileInfo, event: DragEvent) {
  log.info('[DnD][FileList] row drop', { targetPath: file.path, paneId: props.paneId, deviceId: props.deviceId })
  hideDropHint()
  if (!isFolderDropTarget(file) || isZipVirtualPath(props.path)) {
    log.info('[DnD][FileList] row drop skipped: not a valid folder target', { path: file.path })
    return
  }

  const source = extractDragSource(event, dragSessionStore)
  if (!source) return // 外部 Finder 拖入或无法识别，放行冒泡到面板背景

  event.preventDefault()
  event.stopPropagation()
  dropTargetPath.value = null

  if (isSelfOrDescendant(source.files, file.path)) {
    log.info('[DnD][FileList] row drop rejected: target is self/descendant', { targetPath: file.path })
    return
  }

  const action = await resolveDropAction(source.deviceId, props.deviceId, event)
  if (!action) {
    log.warn('[DnD][FileList] row drop rejected: no action resolved', { targetPath: file.path })
    return
  }

  log.info('[DnD][FileList] row drop accepted → emit drop-transfer', {
    targetPath: file.path,
    mode: action,
    sourceDeviceId: source.deviceId,
    fileCount: source.files.length
  })
  emit('operation', {
    action: 'drop-transfer',
    files: source.files,
    target: file.path,
    sourceDeviceId: source.deviceId,
    sourcePaneId: source.paneId,
    mode: action
  })
}

async function handleDrop(event: DragEvent, targetPath: string) {
  event.preventDefault()
  hideDropHint()
  if (event.dataTransfer) {
    // Native Finder drops bubble to App.vue, which can route the local source
    // paths into any connected target device via the transfer queue.
    if (event.dataTransfer.files.length > 0) return

    const source = extractDragSource(event, dragSessionStore)
    if (!source) return

    if (isSelfOrDescendant(source.files, targetPath)) return

    const action = await resolveDropAction(source.deviceId, props.deviceId, event)
    if (!action) return

    event.stopPropagation()
    emit('operation', {
      action: 'drop-transfer',
      files: source.files,
      target: targetPath,
      sourceDeviceId: source.deviceId,
      sourcePaneId: source.paneId,
      mode: action
    })
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
    // 文件单击仅选中（预览交给 @dblclick 的 handleDoubleClick）
    const newColumns = [...columns.value]
    newColumns[columnIndex] = { ...newColumns[columnIndex], selectedPath: file.path }
    columns.value = newColumns
  }
  emit('select', [file.path])
}

/**
 * Build context menu items based on device capabilities
 *
 * 信息架构对齐 macOS Finder（文件菜单）：
 *   1 打开类（打开/新标签页/双面板/图片集合）
 *   2 危险操作（移到废纸篓）
 *   3 文件管理（显示简介/重新命名/压缩/拷贝/剪切/制作替身/快速查看）
 *   6 扩展能力统一收纳进「快速操作」子菜单（不与基础操作混排）
 *   7 「打开方式」保留为末尾的右箭头子菜单
 * 各项能力的门控条件与旧版一致，只调整了排布与文案。
 */
function buildContextMenuItems(isBackground: boolean): FinderMenuItem[] {
  const caps = deviceCapabilities.value
  const items: FinderMenuItem[] = []
  // 菜单打开瞬间的选中快照（showFileContextMenu/showContextMenu 已先行写入）。
  // 选中区隔项（校验和/对比/批量重命名/压缩文案）一律以它为准：右键未选中
  // 文件时 emit('select') 的 props 回填是异步的，同步构建读 props 会拿到旧选中集
  const selectedAtMenuOpen = contextMenuSelectedFiles.value

  if (isBackground) {
    // Background context menu (empty area)
    items.push({ label: t('fileList.menu.refresh'), action: 'refresh', shortcut: '⌘R', icon: 'refresh' })

    if (caps?.canMkdir) {
      items.push({ label: t('fileList.menu.newFolder'), action: 'mkdir', shortcut: '⇧⌘N', icon: 'newFolder' })
    }
    if (caps?.canWrite) {
      items.push({ label: t('fileList.menu.newFile'), action: 'touch', icon: 'newFile' })
    }
    if (!caps || caps.canSymlink) {
      items.push({ label: t('fileList.menu.newSymlink'), action: 'new-symlink', icon: 'link' })
    }
    if (caps?.canWrite) {
      items.push({ label: t('fileList.menu.paste'), action: 'paste', shortcut: '⌘V', icon: 'paste' })
    }

    // 收藏当前文件夹（本地/远程均可，含 ZIP 内部路径）
    items.push({ label: '---', action: '__divider__' })
    items.push({ label: t('fileList.menu.addFavorite'), action: 'add-favorite-current', icon: 'star' })
    items.push({
      label: settingsStore.settings.showHiddenFiles ? t('fileList.menu.hideHidden') : t('fileList.menu.showHidden'),
      action: 'toggle-hidden',
      shortcut: '⌘⇧.',
      icon: 'hidden'
    })
    items.push({ label: t('fileList.menu.goToFolder'), action: 'goto', shortcut: '⇧⌘G', icon: 'goto' })

    // 目录级工具页（瞬态工具 tab）；grep 与查重/空间同组，组内不再插分隔线
    let toolsDividerPushed = false
    if (!caps || (caps.canList && caps.canStat)) {
      items.push({ label: '---', action: '__divider__' })
      toolsDividerPushed = true
      items.push({ label: t('fileList.menu.findDuplicates'), action: 'find-duplicates', icon: 'duplicates' })
      items.push({ label: t('fileList.menu.analyzeSpace'), action: 'analyze-space', icon: 'treemap' })
    }
    if (!caps || caps.canGrepContent !== false) {
      if (!toolsDividerPushed) items.push({ label: '---', action: '__divider__' })
      items.push({ label: t('fileList.menu.grepHere'), action: 'grep-here', icon: 'grep' })
    }

    // 宿主集成：在终端打开当前目录（仅本地、非 ZIP）
    if (isHostShellAvailable()) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: t('fileList.menu.openInTerminal'), action: 'open-in-terminal', icon: 'terminal' })
    }

    // 拷贝路径（当前目录）+ 打开方式（当前目录）
    items.push(...buildCopyPathMenuItems())
    if (isHostShellAvailable()) {
      items.push(...buildOpenWithMenuItems())
    }
  } else {
    // File/folder context menu
    // 本地 ZIP 族（.zip 及 zip 容器格式 pptx/docx/aar…，判定源 @shared/fileKinds
    // 的 zipOf 注册表）：以 ZIP 子菜单替代「打开/解压/十六进制」顶层项。
    // .zip 双击进虚拟目录；容器格式双击走系统默认应用——ZIP 子菜单是它们
    // 浏览内部结构的入口（浏览 = 新标签页进虚拟目录）。
    const target = contextMenuTargetFile.value
    const isLocalZipFamily = !!target
      && !target.isDirectory
      && props.deviceId === 'local'
      && resolveFileKind(target.name, target.extension ?? '') === 'zip'
    if (isLocalZipFamily) {
      // 嵌套 zip（'a.zip::inner.zip'）协议无二级 '::'：不提供「浏览/解压」，树形/hex 仍可
      const nested = isZipVirtualPath(contextMenuTargetFile.value!.path)
      items.push({
        label: t('fileList.menu.zipMenu'),
        action: 'zip-menu',
        icon: 'zip',
        children: [
          ...(nested ? [] : [{ label: t('fileList.menu.browseZip'), action: 'zip-browse', shortcut: '⌘O', icon: 'open' }]),
          { label: t('fileList.menu.treePreviewZip'), action: 'zip-tree-preview', icon: 'tree' },
          ...(caps?.canArchive && !nested ? [{ label: t('fileList.menu.extractZip'), action: 'extract-archive', icon: 'extract' }] : []),
          { label: t('fileList.menu.openAsHex'), action: 'zip-hex', icon: 'hex' },
        ],
      })
    } else {
      items.push({ label: t('fileList.menu.open'), action: 'open', shortcut: '⌘O', icon: 'open' })
    }

    // 目录：新标签页 / 并列双面板标签页打开
    if (contextMenuTargetFile.value?.isDirectory) {
      items.push({ label: t('fileList.menu.openInNewTab'), action: 'open-in-new-tab', icon: 'tab' })
      items.push({ label: t('fileList.menu.openInSplitTab'), action: 'open-in-split-tab', icon: 'split' })
      // 图片集合预览（ZIP 虚拟目录不适用：search/listFiles 语义不符）
      if (!isZipVirtualPath(contextMenuTargetFile.value.path)) {
        items.push({
          label: t('fileList.menu.images'),
          action: 'images-menu',
          icon: 'images',
          children: [
            { label: t('fileList.menu.previewImages'), action: 'preview-images', icon: 'quickLook' },
            { label: t('fileList.menu.previewImagesRecursive'), action: 'preview-images-recursive', icon: 'tree' }
          ]
        })
      }
    }

    // ── 危险操作：移到废纸篓（delete 动作走回收站任务，可撤销还原） ──
    if (caps?.canDelete) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: t('fileList.menu.moveToTrash'), action: 'delete', shortcut: '⌘⌫', icon: 'trash' })
    }

    // ── 文件管理 ──
    items.push({ label: '---', action: '__divider__' })
    items.push({ label: t('fileList.menu.info'), action: 'info', shortcut: '⌘I', icon: 'info' })

    if (caps?.canRename) {
      items.push({ label: t('fileList.menu.rename'), action: 'rename', shortcut: 'Return', icon: 'rename' })
    }
    if (selectedAtMenuOpen.length > 1 && caps?.canRename) {
      items.push({ label: t('fileList.menu.batchRename'), action: 'batch-rename', shortcut: '⇧⌘R', icon: 'batchRename' })
    }

    if (caps?.canArchive) {
      // Finder 文案：单选括注文件名（压缩“report.txt”），多选括注数量
      const single = selectedAtMenuOpen.length === 1
        ? (files.value.find(f => f.path === selectedAtMenuOpen[0])?.name ?? getBaseName(selectedAtMenuOpen[0]))
        : null
      items.push({
        label: single
          ? t('fileList.menu.archiveItem', { name: single })
          : t('fileList.menu.archiveMulti', { count: selectedAtMenuOpen.length }),
        action: 'archive',
        icon: 'compress'
      })
    }
    if (!isLocalZipFamily && contextMenuTargetFile.value?.extension?.toLowerCase() === '.zip' && caps?.canArchive) {
      items.push({ label: t('fileList.menu.extractZip'), action: 'extract-archive', icon: 'extract' })
    }

    if (caps?.canCopyFrom) {
      items.push({ label: t('fileList.menu.copy'), action: 'copy', shortcut: '⌘C', icon: 'copy' })
    }
    if (caps?.canMoveFrom) {
      items.push({ label: t('fileList.menu.cut'), action: 'cut', shortcut: '⌘X', icon: 'cut' })
    }

    // 制作替身：同目录创建指向该条目的符号链接（Finder「xxx 的替身」语义；
    // 复用 createSymlink，本地/SSH 等 canSymlink 设备，ZIP 虚拟目录内不适用）
    if ((!caps || caps.canSymlink) && !isZipVirtualPath(props.path) && selectedAtMenuOpen.length === 1) {
      items.push({ label: t('fileList.menu.makeAlias'), action: 'make-alias', icon: 'alias' })
    }

    // 快速查看（与空格键同链路：openQuickLook 集合预览 tab）
    items.push({ label: t('fileList.menu.quickLook'), action: 'quick-look', shortcut: 'Space', icon: 'quickLook' })

    // ── 快速操作：扩展能力统一收纳，不与基础操作混排 ──
    const quickActions: FinderMenuItem[] = []
    // 宿主集成：在 Finder 中显示 / 在终端打开（仅本地、非 ZIP）
    if (isHostShellAvailable()) {
      quickActions.push({ label: t('fileList.menu.revealInFinder'), action: 'reveal-in-finder', icon: 'finder' })
      quickActions.push({ label: t('fileList.menu.openInTerminal'), action: 'open-in-terminal', icon: 'terminal' })
    }
    // 显式 hex 入口：任意文件强制以十六进制查看（不受扩展名白名单限制；
    // 本地 ZIP 族已并入 ZIP 子菜单）
    if (!contextMenuTargetFile.value?.isDirectory && !isLocalZipFamily) {
      quickActions.push({ label: t('fileList.menu.openAsHex'), action: 'open-as-hex', icon: 'hex' })
    }
    // 校验和：恰好选中 1-2 个文件（单哈希 / 对比）。
    // 用打开瞬间的快照而非 props.selectedFiles：右键未选中文件时
    // emit('select') 的 prop 回填是异步的，同步构建会读到旧值漏掉本项
    if (selectedAtMenuOpen.length >= 1 && selectedAtMenuOpen.length <= 2) {
      const selectedInfos = selectedAtMenuOpen
        .map(p => files.value.find(f => f.path === p))
        .filter(Boolean) as FileInfo[]
      if (selectedInfos.length === selectedAtMenuOpen.length && selectedInfos.every(f => !f.isDirectory)) {
        quickActions.push({
          label: selectedAtMenuOpen.length === 2 ? t('fileList.menu.checksumCompare') : t('fileList.menu.checksumSingle'),
          action: 'checksum',
          icon: 'checksum'
        })
      }
    }
    // Compare two directories: only when exactly 2 directories are selected
    if (selectedAtMenuOpen.length === 2) {
      const selectedInfos = selectedAtMenuOpen
        .map(p => files.value.find(f => f.path === p))
        .filter(Boolean) as FileInfo[]
      if (selectedInfos.length === 2 && selectedInfos.every(f => f.isDirectory)) {
        quickActions.push({ label: t('fileList.menu.compareDirs'), action: 'compare-dirs', shortcut: '⌘⇧D', icon: 'compare' })
      }
    }
    // 收藏夹：右键命中的是文件夹时可收藏（本地/远程均可）
    if (contextMenuTargetFile.value?.isDirectory) {
      quickActions.push({ label: t('fileList.menu.addFavorite'), action: 'add-favorite', icon: 'star' })
    }
    // 拷贝路径（选中条目；作为「快速操作」内的嵌套子菜单）
    quickActions.push(...buildCopyPathMenuItems())

    if (quickActions.length > 0) {
      items.push({ label: '---', action: '__divider__' })
      items.push({ label: t('fileList.menu.quickActions'), action: 'quick-actions', icon: 'quickActions', children: quickActions })
    }

    // ── 打开方式（保留为带右箭头的子菜单） ──
    if (isHostShellAvailable()) {
      items.push({ label: '---', action: '__divider__' })
      items.push(...buildOpenWithMenuItems())
    }
  }

  return items
}

// 上下文菜单打开时对选中文件的快照，防止 mouseup 清空选中后 action 拿不到文件
const contextMenuSelectedFiles = ref<string[]>([])
// 右键命中的具体文件（reveal/terminal 针对它）；空白菜单时为 null（terminal 改用当前目录）
const contextMenuTargetFile = ref<FileInfo | null>(null)
// 菜单打开时「另一面板」路径快照（同设备才有相对路径语义），供「相对另一面板复制」
const contextMenuOtherPanePath = ref<string | null>(null)
// 右键目标的 LaunchServices 适用应用（含默认应用标记）；按目标文件异步拉取
const openWithApps = ref<OpenWithApp[]>([])
// 最近一次菜单构建是否为空白菜单（应用列表异步回填后重建 items 时复用）
const contextMenuLastIsBackground = ref(true)

/** 按目标文件拉取「打开方式」应用列表（主进程按目录/扩展名 memoize）。 */
function refreshOpenWithApps(targetPath: string): void {
  // Array.isArray 守卫：桥接异常/返回异常值时保持原列表（子菜单保底默认应用入口）
  window.fileman.getOpenWithApps(targetPath).then(apps => {
    if (Array.isArray(apps)) openWithApps.value = apps
  }).catch(err => {
    console.warn('[FileList] getOpenWithApps failed for', targetPath, err)
  })
}

// 菜单 items 是打开瞬间的快照；应用列表异步回填后若菜单仍开着则按原菜单类型重建，
// 让「打开方式」子菜单从「保底默认应用」补全为完整列表
watch(openWithApps, () => {
  if (contextMenu.visible) {
    contextMenu.items = buildContextMenuItems(contextMenuLastIsBackground.value)
  }
})

/** 拷贝路径子菜单（本地/远程通用——路径字符串无宿主依赖）。 */
function buildCopyPathMenuItems(): FinderMenuItem[] {
  const otherPane = tabsStore.activeTab?.panes.find(p => p.id !== props.paneId && p.deviceId === props.deviceId)
  contextMenuOtherPanePath.value = otherPane?.path ?? null
  const children: FinderMenuItem[] = [
    { label: t('fileList.menu.copyPathPosix'), action: 'copy-path:posix' },
    { label: t('fileList.menu.copyPathUri'), action: 'copy-path:uri' },
    { label: t('fileList.menu.copyPathName'), action: 'copy-path:name' }
  ]
  if (otherPane) children.splice(2, 0, { label: t('fileList.menu.copyPathRelative'), action: 'copy-path:relative' })
  return [{ label: t('fileList.menu.copyPath'), action: 'copy-path-menu', icon: 'copyPath', children }]
}

/** 「打开方式」子菜单（仅本地非 ZIP；列表 = 右键目标的 LaunchServices 适用应用）。 */
function buildOpenWithMenuItems(): FinderMenuItem[] {
  const apps = openWithApps.value
  // 列表为空（查询失败/首查回填前）：保底提供默认应用入口（open <path>）
  const children: FinderMenuItem[] = apps.length > 0
    ? apps.map(app => ({
        // 默认应用置顶展示并标注，其余为备选（主进程已排序：默认 → 名称序）
        label: app.isDefault ? `${app.name}${t('fileList.menu.openWithDefaultSuffix')}` : app.name,
        action: `open-with:${app.bundlePath}`
      }))
    : [{ label: t('fileList.menu.openWithDefault'), action: 'open-default' }]
  return [{ label: t('fileList.menu.openWith'), action: 'open-with-menu', icon: 'openWith', children }]
}

/** 复制路径动作（多选时按行拼接；name/relative 针对右键命中的文件）。 */
async function handleCopyPath(kind: string): Promise<void> {
  const targets = contextMenuSelectedFiles.value.length > 0
    ? contextMenuSelectedFiles.value
    : (contextMenuTargetFile.value ? [contextMenuTargetFile.value.path] : [props.path])
  let text = ''
  if (kind === 'posix') {
    text = targets.join('\n')
  } else if (kind === 'uri') {
    text = targets.map(toFileUri).join('\n')
  } else if (kind === 'name') {
    const target = contextMenuTargetFile.value ?? files.value.find(f => f.path === targets[0])
    text = target?.name ?? getBaseName(targets[0])
  } else if (kind === 'relative') {
    const fromDir = contextMenuOtherPanePath.value
    const target = contextMenuTargetFile.value?.path ?? targets[0]
    text = fromDir ? toRelativePath(fromDir, target) : target
  }
  if (text) await copyToClipboard(text)
}

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

// 视口钳制与子菜单翻转已移入 FinderContextMenu 组件（渲染后自测量）

function showContextMenu(event: MouseEvent) {
  // 跨窗格互斥：先关掉其它 FileList 实例仍打开的菜单
  _closeActiveContextMenu?.()
  _closeActiveContextMenu = hideContextMenu
  contextMenuSelectedFiles.value = [...props.selectedFiles]
  // 空白右键：terminal 目标为当前目录
  contextMenuTargetFile.value = null
  contextMenuLastIsBackground.value = true
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = buildContextMenuItems(true)
  // 「打开方式」按当前目录拉取（异步回填，菜单可见期间由 watch 重建补全）
  if (isHostShellAvailable()) refreshOpenWithApps(props.path)
}

function showFileContextMenu(event: MouseEvent, file: FileInfo) {
  // 跨窗格互斥：先关掉其它 FileList 实例仍打开的菜单
  _closeActiveContextMenu?.()
  _closeActiveContextMenu = hideContextMenu
  if (!isSelected(file.path)) {
    emit('select', [file.path])
    contextMenuSelectedFiles.value = [file.path]
  } else {
    contextMenuSelectedFiles.value = [...props.selectedFiles]
  }
  // 文件/文件夹右键：reveal/terminal 针对命中的这一项
  contextMenuTargetFile.value = file
  contextMenuLastIsBackground.value = false

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = buildContextMenuItems(false)
  // 「打开方式」按命中条目拉取（不同扩展名列表不同；主进程按扩展名 memoize）
  if (isHostShellAvailable()) refreshOpenWithApps(file.path)
}

function hideContextMenu() {
  contextMenu.visible = false
  // 释放跨窗格互斥句柄（仅当仍是自己持有时）
  if (_closeActiveContextMenu === hideContextMenu) _closeActiveContextMenu = null
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

/**
 * 收集目录下的图片并以集合预览 tab 打开（右键「图片」子菜单入口）。
 * 非递归 = 该目录直接子级；递归 = 主进程 search 一次收集（空 pattern 匹配全部）。
 * 空结果 / 远程设备不支持 search 时不开 tab（log 后静默返回）。
 */
async function openFolderImagePreview(folderPath: string, recursive: boolean) {
  try {
    const entries = recursive
      ? await window.fileman.search(props.deviceId, folderPath, {
          pattern: '',
          fileTypes: IMAGE_EXTENSIONS_WITH_DOT
        })
      : await window.fileman.listFiles(props.deviceId, folderPath)
    const images = entries
      .filter(entry => !entry.isDirectory && isImageFile(entry.extension || ''))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))

    if (images.length === 0) {
      log.info('[FileList] no images found for collection preview', { folderPath, recursive })
      return
    }
    previewStore.openImageCollection(
      props.deviceId,
      images,
      `${props.deviceId}:${folderPath}:${recursive ? 'recursive' : 'flat'}`
    )
  } catch (error) {
    log.warn('[FileList] image collection preview failed', { folderPath, recursive, error })
  }
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

  // 快速查看（右键菜单入口）：与空格键同链路，集合预览 tab 带上/下一张导航。
  // 列表跟随可见顺序（分栏视图取目标所在列，其余取排序后的 displayedFiles）。
  if (action === 'quick-look') {
    const file = contextMenuTargetFile.value
    if (file) {
      const list = props.viewMode === 'columns'
        ? (columns.value.find(c => c.files.some(f => f.path === file.path))?.files ?? [file])
        : displayedFiles.value
      previewStore.openQuickLook(file, props.deviceId, props.paneId, list)
    }
    return
  }

  // 制作替身：在目标所在目录创建「xxx 的替身」符号链接（即时调用 createSymlink；
  // 本地设备有 watch 自动刷新，远程设备手动补一次 loadFiles）
  if (action === 'make-alias') {
    const file = contextMenuTargetFile.value
    if (file) {
      const parent = parentDirectory(file.path)
      const linkPath = parent === '/' ? `/${file.name} 的替身` : `${parent}/${file.name} 的替身`
      window.fileman.createSymlink(props.deviceId, file.path, linkPath)
        .then(() => { loadFiles() })
        .catch(err => {
          console.error('[FileList] make-alias failed for', file.path, err)
        })
    }
    return
  }

  // 宿主集成（即时调用，不经文件操作队列）：在 Finder 中显示
  if (action === 'reveal-in-finder') {
    const target = contextMenuTargetFile.value?.path
    if (target) {
      window.fileman.showInFolder(target).catch(err => {
        console.error('[FileList] showInFolder failed for', target, err)
      })
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

  // 复制路径变体（posix / uri / relative / name）——剪贴板即时写入，不经操作队列
  if (action.startsWith('copy-path:')) {
    void handleCopyPath(action.slice('copy-path:'.length))
    return
  }

  // 校验和（1-2 个文件）——经 FilePane 弹窗呈现进度与结果
  if (action === 'checksum') {
    const infos = contextMenuSelectedFiles.value
      .map(p => files.value.find(f => f.path === p))
      .filter((f): f is FileInfo => !!f && !f.isDirectory)
    if (infos.length >= 1 && infos.length <= 2) {
      emit('operation', {
        action: 'checksum',
        files: [],
        checksumItems: infos.map(f => ({ deviceId: props.deviceId, path: f.path, name: f.name, size: f.size }))
      })
    }
    return
  }

  // 显式 hex 入口：右键命中的文件强制以十六进制预览（只读）
  if (action === 'open-as-hex') {
    const file = contextMenuTargetFile.value
    if (file && !file.isDirectory) {
      previewStore.openPreview(file, props.deviceId, undefined, 'hex')
    }
    return
  }

  // ZIP 子菜单：浏览 = 在新标签页进入虚拟目录（双击仍在当前面板内导航）；
  // 树形/hex = 打开对应预览 tab
  if (action === 'zip-browse') {
    const file = contextMenuTargetFile.value
    if (file && !isZipVirtualPath(file.path)) {
      tabsStore.openPathInNewTab(props.deviceId, joinZipPath(file.path, ''))
    }
    return
  }
  if (action === 'zip-tree-preview' || action === 'zip-hex') {
    const file = contextMenuTargetFile.value
    if (file && !file.isDirectory) {
      previewStore.openPreview(file, props.deviceId, undefined, action === 'zip-hex' ? 'hex' : 'zip')
    }
    return
  }

  // 图片集合预览：右键命中的目录 → 收集图片 → 集合预览 tab（可上一张/下一张）
  if (action === 'preview-images' || action === 'preview-images-recursive') {
    const folder = contextMenuTargetFile.value
    if (folder?.isDirectory && !isZipVirtualPath(folder.path)) {
      const recursive = action === 'preview-images-recursive'
      void openFolderImagePreview(folder.path, recursive)
    }
    return
  }

  // 系统默认应用打开（open <path>；本地设备，目录=Finder）
  if (action === 'open-default') {
    const target = contextMenuTargetFile.value?.path ?? props.path
    window.fileman.openDefault(target).catch(err => {
      console.error('[FileList] openDefault failed for', target, err)
    })
    return
  }

  // 打开方式（本地开发者应用，action 携带 .app 包路径）
  if (action.startsWith('open-with:')) {
    const appPath = action.slice('open-with:'.length)
    const target = contextMenuTargetFile.value?.path ?? props.path
    window.fileman.openWith(appPath, target).catch(err => {
      console.error('[FileList] openWith failed for', target, err)
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

  // 显示/隐藏隐藏文件（空白菜单）
  if (action === 'toggle-hidden') {
    void settingsStore.toggleShowHiddenFiles()
    return
  }

  // 目录在新标签页打开（右键菜单）
  if (action === 'open-in-new-tab') {
    const file = contextMenuTargetFile.value
    if (file?.isDirectory) tabsStore.openPathInNewTab(props.deviceId, file.path)
    return
  }

  // 目录在并列双面板标签页打开：目标目录占左面板，当前面板位置作参照占右面板
  if (action === 'open-in-split-tab') {
    const file = contextMenuTargetFile.value
    if (file?.isDirectory) {
      tabsStore.openPathInSplitTab(props.deviceId, file.path, pane.value?.deviceId, pane.value?.path)
    }
    return
  }

  // 前往文件夹（空白菜单）
  if (action === 'goto') {
    emit('operation', { action: 'goto', files: [] })
    return
  }

  // 重复文件查找（空白菜单）：当前目录开瞬态工具页
  if (action === 'find-duplicates') {
    tabsStore.openDuplicatesTab(props.deviceId, props.path)
    return
  }

  // 新建符号链接（空白菜单，本地/SSH）
  if (action === 'new-symlink') {
    emit('operation', { action: 'new-symlink', files: [] })
    return
  }

  // 空间分析（空白菜单）：当前目录开 treemap 工具页
  if (action === 'analyze-space') {
    tabsStore.openSpaceTab(props.deviceId, props.path)
    return
  }

  // 内容搜索（空白菜单）：当前目录开 grep 工具页
  if (action === 'grep-here') {
    tabsStore.openGrepTab({
      deviceId: props.deviceId,
      rootPath: props.path,
      pattern: '',
      isRegex: false,
      caseSensitive: false
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
/* Finder 式选中（与 Finder 图标视图一致，三视图统一）：
   图标底浅灰圆角（finder-selected）+ 名称文字底系统蓝圆角白字
   （finder-selected-label / finder-selected-text），颜色随主题变量 */
.finder-selected {
  background-color: var(--finder-selection-bg);
}

.finder-selected-label {
  background-color: var(--finder-selection-text-bg);
}

.finder-selected-text {
  color: var(--finder-selection-text);
}

/* 拖拽悬停的文件夹行高亮：Finder 选中式圆角蓝底 + 内侧微光（描边/光晕用 inset，
   兼容 grid 单元格的 overflow-hidden 裁剪） */
.drop-target-row {
  background-color: color-mix(in srgb, var(--accent-blue) 16%, transparent);
  box-shadow:
    inset 0 0 0 1.5px color-mix(in srgb, var(--accent-blue) 55%, transparent),
    inset 0 1px 10px color-mix(in srgb, var(--accent-blue) 20%, transparent);
}

/* 右键菜单的视觉/交互样式已随组件迁至 menu/FinderContextMenu.vue + FinderMenuNode.vue */


/* Rubber-band selection rectangle */
.rubber-band-rect {
  position: absolute;
  border: 1px solid #60a5fa;
  background-color: rgba(96, 165, 250, 0.12);
  z-index: 10;
}
</style>
