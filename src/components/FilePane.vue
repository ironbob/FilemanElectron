<template>
  <div
    v-if="pane"
    class="finder-pane file-pane h-full flex flex-col overflow-hidden bg-bg-primary"
    :class="{ 'bg-accent-blue/5': isDropTarget }"
    @mousedown.capture="handlePaneMouseDown"
    @dragenter.prevent="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Toolbar -->
    <!-- container-type 只放在工具栏容器上：若放在 .file-pane 上，containment 会让
         pane 成为 position:fixed 后代（右键菜单、模态弹窗）的包含块，
         导致 fixed 定位相对 pane 而非视口，菜单位置随侧边栏宽度偏移 -->
    <div class="file-pane-toolbar-container">
      <div class="finder-pane-toolbar file-pane-toolbar h-10 min-w-0 bg-bg-toolbar flex items-center px-2 gap-1.5 border-b border-border">
      <!-- Navigation Buttons -->
      <div class="file-pane-toolbar-nav flex flex-shrink-0 items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
        <button v-if="fileOpsStore.undoRecycle" class="toolbar-btn-enhanced text-accent-blue" title="Undo last remote delete" aria-label="Undo last remote delete" @click="undoRecycle">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 101.9-5.2M4 4v4h4"/></svg>
        </button>
        <button
          class="toolbar-btn-enhanced"
          :disabled="pane.historyIndex <= 0"
          @click="tabsStore.goBack(paneId)"
          title="Go Back"
          aria-label="Go Back"
        >
          <FinderIcon name="arrowLeft" />
        </button>
        <div ref="recentMenuRef" class="relative flex-shrink-0">
          <button class="toolbar-btn-enhanced" title="Recent locations" aria-label="Recent locations" :aria-expanded="recentMenuOpen" @click="recentMenuOpen = !recentMenuOpen">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>
          <div v-if="recentMenuOpen" class="recent-locations-menu absolute left-0 top-9 z-50 max-h-64 w-72 overflow-y-auto rounded-lg border border-border py-1 shadow-xl" role="menu" aria-label="Recent locations">
            <div v-if="browserStore.recent.length === 0" class="px-3 py-2 text-xs text-text-tertiary">No recent locations</div>
            <button v-for="location in browserStore.recent" :key="`${location.deviceId}:${location.path}`" class="block w-full px-3 py-2 text-left text-xs hover:bg-bg-hover" role="menuitem" @click="openRecentLocation(location.deviceId, location.path)">
              <span class="block truncate text-text-primary">{{ location.path }}</span><span class="block truncate text-text-tertiary">{{ location.deviceId }}</span>
            </button>
          </div>
        </div>
        <button
          class="toolbar-btn-enhanced"
          :disabled="pane.historyIndex >= pane.history.length - 1"
          @click="tabsStore.goForward(paneId)"
          title="Go Forward"
          aria-label="Go Forward"
        >
          <FinderIcon name="arrowRight" />
        </button>
        <button
          class="toolbar-btn-enhanced"
          @click="tabsStore.goUp(paneId)"
          title="Go to Parent Folder"
          aria-label="Go to Parent Folder"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      <!-- Path Breadcrumb -->
      <div class="file-pane-toolbar-breadcrumb min-w-0 flex-1 mx-2 flex items-center">
        <div class="file-pane-toolbar-breadcrumb-content min-w-0 w-full flex items-center gap-1 px-3 py-1.5 bg-bg-secondary/50 rounded-lg border border-border/50 hover:border-border transition-colors overflow-hidden">
          <!-- ZIP badge shown when browsing inside an archive -->
          <span
            v-if="isInsideZip"
            class="flex-shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-accent-orange/20 text-accent-orange dark:text-orange-300 border border-accent-orange/30 mr-1"
          >ZIP</span>
          <template v-for="(segment, index) in pathSegments" :key="index">
            <button
              class="max-w-32 truncate text-[13px] transition-colors font-medium flex-shrink-0"
              :class="isZipBoundarySegment(index) ? 'text-orange-400 hover:text-orange-300' : 'text-text-secondary hover:text-accent-blue'"
              @click="navigateToSegment(index)"
            >
              {{ segment }}
            </button>
            <span v-if="index < pathSegments.length - 1" class="text-text-tertiary mx-0.5 flex-shrink-0">/</span>
          </template>
        </div>
      </div>

      <!-- Search (含历史下拉:聚焦/输入时展示,点击回填) -->
      <div ref="searchBoxRef" class="file-pane-toolbar-search relative flex-shrink-0">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Search or tag:work"
          class="w-36 h-8 text-[13px] bg-bg-secondary/50 border border-border/50 rounded-lg focus:w-52 transition-all focus:border-accent-blue/50 focus:bg-bg-secondary focus:outline-none"
          :class="searchQuery ? 'pr-7 pl-3' : 'px-3'"
          @focus="searchHistoryOpen = true"
          @blur="searchHistoryOpen = false"
          @keydown.enter="commitSearch"
          @keydown.escape="clearSearch"
        />
        <button
          v-if="searchQuery"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
          title="Clear search"
          aria-label="Clear search"
          @mousedown.prevent
          @click="clearSearch"
        >
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div
          v-if="searchHistoryOpen && filteredSearchHistory.length > 0"
          class="search-history-menu absolute right-0 top-9 z-50 max-h-64 w-64 overflow-y-auto rounded-lg border border-border py-1 shadow-xl"
          role="menu"
          aria-label="Search history"
        >
          <div class="flex items-center justify-between px-3 py-1">
            <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">History</span>
            <button
              class="text-[10px] text-text-tertiary hover:text-red-500"
              title="Clear search history"
              @mousedown.prevent="browserStore.clearSearchHistory()"
            >Clear</button>
          </div>
          <button
            v-for="item in filteredSearchHistory"
            :key="item"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover"
            role="menuitem"
            @mousedown.prevent="applySearchHistory(item)"
          >
            <svg class="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="truncate">{{ item }}</span>
          </button>
        </div>
      </div>
      <button class="file-pane-toolbar-search-mode toolbar-btn-enhanced flex-shrink-0" :class="{ active: browserState.recursiveSearch }" title="Search recursively" aria-label="Search recursively" @click="browserStore.toggleRecursiveSearch(paneId)">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
      </button>

      <!-- View Mode -->
      <div class="file-pane-toolbar-view flex flex-shrink-0 items-center bg-bg-secondary/50 rounded-lg border border-border/50 p-0.5">
        <button
          v-for="mode in viewModes"
          :key="mode.value"
          class="w-7 h-7 flex items-center justify-center rounded-md text-xs transition-all"
          :class="pane.viewMode === mode.value ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
          :title="mode.value === 'grid' ? `${mode.label} (right-click for sizes)` : mode.label"
          :aria-label="mode.label"
          @click="tabsStore.setViewMode(paneId, mode.value)"
          @contextmenu.prevent="onViewButtonContextMenu(mode.value, $event)"
        >
          <component :is="mode.icon" class="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        class="file-pane-toolbar-optional toolbar-btn-enhanced flex-shrink-0"
        :disabled="!pane?.selectedFiles.length"
        title="Copy selected paths for sharing"
        aria-label="Copy selected paths for sharing"
        @click="copySelectedPaths"
      >
        <FinderIcon name="share" />
      </button>
      <button
        class="file-pane-toolbar-optional toolbar-btn-enhanced flex-shrink-0"
        :disabled="!pane?.selectedFiles.length"
        title="Edit selected item tags"
        aria-label="Edit selected item tags"
        @click="editSelectedTags"
      >
        <FinderIcon name="tags" />
      </button>

      <!-- Inline Preview Toggle -->
      <button
        class="file-pane-toolbar-optional toolbar-btn-enhanced flex-shrink-0"
        :class="{ active: inlinePreviewEnabled }"
        title="Toggle inline preview (single-click preview)"
        aria-label="Toggle inline preview"
        @click="toggleInlinePreview"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/>
          <line x1="15" y1="4" x2="15" y2="20" stroke-width="2"/>
        </svg>
      </button>

      <!-- Actions -->
      <div class="file-pane-toolbar-actions flex flex-shrink-0 items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
        <button v-if="canCaptureScreenshot" class="toolbar-btn-enhanced" title="Capture Android Screenshot" aria-label="Capture Android Screenshot" @click="captureScreenshot">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" stroke-width="2"/><path stroke-linecap="round" stroke-width="2" d="M8 5l1-2h6l1 2M12 10v4m-2-2h4"/></svg>
        </button>
        <button
          class="toolbar-btn-enhanced"
          :disabled="!canRevealInFinder"
          :title="canRevealInFinder ? 'Reveal in Finder' : 'Reveal in Finder (local folders only)'"
          aria-label="Reveal in Finder"
          @click="revealCurrentFolderInFinder"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v0" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v8a2 2 0 002 2h6" />
            <circle cx="16" cy="15.5" r="2.5" stroke-width="2" />
            <path stroke-linecap="round" stroke-width="2" d="M18 17.5l1.5 1.5" />
          </svg>
        </button>
        <button class="toolbar-btn-enhanced" title="New Folder" aria-label="New Folder" @click="openCreateDialog('folder')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        </button>
        <button class="toolbar-btn-enhanced" title="New File" aria-label="New File" @click="openCreateDialog('file')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      </div>
      </div>
    </div>

    <!-- Main Content Area with File List and Inline Preview -->
    <div class="flex-1 flex overflow-hidden">
      <!-- File List -->
      <FileList
        :key="directoryLoadKey"
        class="flex-1 min-w-0"
        :pane-id="paneId"
        :device-id="pane.deviceId"
        :path="pane.path"
        :view-mode="pane.viewMode"
        :grid-size="pane.gridSize"
        :selected-files="pane.selectedFiles"
        :search-query="searchQuery"
        :recursive-search="browserState.recursiveSearch"
        :sort="browserState.sort"
        @select="handleSelect"
        @navigate="handleNavigate"
        @preview="handlePreview"
        @operation="handleOperation"
        @loaded="handleFilesLoaded"
        @sort="browserStore.setSort(paneId, $event)"
      />

      <!-- Inline Preview Panel：开启时始终显示，选中文件夹时展示文件夹信息 -->
      <template v-if="inlinePreviewEnabled">
        <!-- Resize Handle -->
        <div
          class="w-1 bg-border hover:bg-accent-blue cursor-col-resize flex-shrink-0 transition-colors"
          :class="{ 'bg-accent-blue': isResizing }"
          @mousedown="startResize"
        ></div>
        <InlinePreview
          :file="inlinePreviewFile"
          :device-id="pane.deviceId"
          class="border-l border-border flex-shrink-0"
          :style="{ width: previewWidth + 'px' }"
          @close="closeInlinePreview"
        />
      </template>
    </div>

    <!-- Grid Size Menu (right-click on grid view button) -->
    <template v-if="gridSizeMenu.visible">
      <div
        class="fixed inset-0 z-40"
        @click="closeGridSizeMenu"
        @contextmenu.prevent="closeGridSizeMenu"
      ></div>
      <div
        ref="gridSizeMenuRef"
        class="fixed z-50 min-w-[170px] py-1 bg-bg-secondary border border-border rounded-lg shadow-lg animate-fade-in"
        :style="{ left: gridSizeMenu.x + 'px', top: gridSizeMenu.y + 'px' }"
      >
        <div class="px-3 py-1 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Icon Size</div>
        <div
          v-for="opt in gridSizeOptions"
          :key="opt.value"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-accent-blue hover:text-white transition-colors"
          @click="chooseGridSize(opt.value)"
        >
          <span class="w-4 text-xs">{{ activeGridSize === opt.value ? '✓' : '' }}</span>
          <span>{{ opt.label }}</span>
        </div>
      </div>
    </template>

    <!-- Operation Dialog -->
    <div v-if="createDialog.visible" class="fixed inset-0 z-modal flex items-center justify-center bg-black/50 animate-fade-in" @click.self="closeCreateDialog">
      <form class="w-80 rounded-lg border border-border bg-bg-secondary p-4 shadow-xl" role="dialog" :aria-label="createDialog.kind === 'file' ? 'Create File' : 'Create Folder'" @submit.prevent="confirmCreateDialog">
        <h3 class="mb-1 text-lg font-medium text-text-primary">{{ createDialog.kind === 'file' ? 'New File' : 'New Folder' }}</h3>
        <p class="mb-4 text-sm text-text-tertiary">Created in {{ pane?.path || '/' }}</p>
        <input ref="createNameInputRef" v-model="createDialog.name" class="h-9 w-full rounded border border-border bg-bg-tertiary px-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" :placeholder="createDialog.kind === 'file' ? 'example.txt' : 'Folder name'" @input="createDialog.error = ''" @keydown.escape.prevent="closeCreateDialog" />
        <p v-if="createDialog.error" class="mt-2 text-xs text-accent-red">{{ createDialog.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover" @click="closeCreateDialog">Cancel</button>
          <button type="submit" class="rounded bg-accent-blue px-3 py-1.5 text-sm text-white hover:bg-accent-hover">Create</button>
        </div>
      </form>
    </div>
    <!-- Go to Folder Dialog (⇧⌘G) -->
    <div v-if="goToDialog.visible" class="fixed inset-0 z-modal flex items-center justify-center bg-black/50 animate-fade-in" @click.self="closeGoToDialog">
      <form class="w-96 rounded-lg border border-border bg-bg-secondary p-4 shadow-xl" role="dialog" aria-label="Go to Folder" @submit.prevent="confirmGoToDialog">
        <h3 class="mb-1 text-lg font-medium text-text-primary">Go to Folder</h3>
        <p class="mb-4 text-sm text-text-tertiary">Enter an absolute path on {{ currentDeviceName || 'this device' }}</p>
        <input ref="goToNameInputRef" v-model="goToDialog.path" class="h-9 w-full rounded border border-border bg-bg-tertiary px-2 font-mono text-sm text-text-primary focus:border-accent-blue focus:outline-none" placeholder="/usr/local" @input="goToDialog.error = ''" @keydown.escape.prevent="closeGoToDialog" />
        <p v-if="goToDialog.error" class="mt-2 text-xs text-accent-red">{{ goToDialog.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover" @click="closeGoToDialog">Cancel</button>
          <button type="submit" class="rounded bg-accent-blue px-3 py-1.5 text-sm text-white hover:bg-accent-hover">Go</button>
        </div>
      </form>
    </div>
    <RenameDialog
      v-if="renameDialog.visible"
      :file-path="renameDialog.filePath"
      @close="renameDialog.visible = false"
      @confirm="doRename"
    />
    <TargetOperationDialog
      v-if="targetDialog.visible"
      :mode="targetDialog.mode"
      :count="targetDialog.files.length"
      :devices="targetDialog.devices"
      @close="targetDialog.visible = false"
      @confirm="confirmTargetOperation"
    />
    <FileInfoDialog
      v-if="infoDialog.files.length > 0"
      :device-id="pane?.deviceId || 'local'"
      :device-type="currentDevice?.type || 'local'"
      :device-name="currentDeviceName"
      :files="infoDialog.files"
      @close="infoDialog.files = []"
      @save-tags="saveTags"
    />
    <BatchRenameDialog
      v-if="batchRenameDialog.visible"
      :files="batchRenameDialog.files"
      @close="batchRenameDialog.visible = false"
      @confirm="confirmBatchRename"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, h, type Component, watch, onMounted, onUnmounted, nextTick } from 'vue'
import FinderIcon from './FinderIcon.vue'
import { useTabsStore } from '@/stores/tabs'
import { usePreviewStore } from '@/stores/preview'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useClipboardStore } from '@/stores/clipboard'
import { useDevicesStore } from '@/stores/devices'
import { useFileBrowserStore } from '@/stores/fileBrowser'
import FileList from './FileList.vue'
import InlinePreview from './preview/InlinePreview.vue'
import RenameDialog from './dialogs/RenameDialog.vue'
import TargetOperationDialog from './dialogs/TargetOperationDialog.vue'
import FileInfoDialog from './dialogs/FileInfoDialog.vue'
import BatchRenameDialog from './dialogs/BatchRenameDialog.vue'
import { isImageFile } from '@/utils/fileTypes'
import { parentDirectoryOf } from '@/utils/dragTransfer'
import { hideDropHint } from '@/utils/dropHint'
import { useDragSessionStore } from '@/stores/dragSession'
import { isZipVirtualPath, parseZipVirtualPath, joinZipPath, zipBreadcrumbSegments } from '@shared/zipPath'
import type { FileInfo } from '@/types'
import type { BatchRenameItem } from '@/types/fileBrowser'
import type { ConflictStrategy, FileOperationTask } from '@/types/fileOperation'

const log = console

const props = defineProps<{
  paneId: string
}>()

const tabsStore = useTabsStore()
const previewStore = usePreviewStore()
const fileOpsStore = useFileOperationsStore()
const clipboardStore = useClipboardStore()
const devicesStore = useDevicesStore()
const browserStore = useFileBrowserStore()
const dragSessionStore = useDragSessionStore()

const pane = computed(() => tabsStore.findPane(props.paneId))
const browserState = computed(() => browserStore.stateFor(props.paneId))
const currentDevice = computed(() => devicesStore.devices.find(device => device.id === pane.value?.deviceId))
const currentDeviceName = computed(() => currentDevice.value?.name || pane.value?.deviceId || 'Local')
const canCaptureScreenshot = computed(() => currentDevice.value?.type === 'android')

const searchQuery = ref('')
// ── 搜索历史下拉 ─────────────────────────────────────────────────────────────
const searchHistoryOpen = ref(false)
const searchBoxRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const filteredSearchHistory = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return browserStore.searchHistory
  return browserStore.searchHistory.filter(h => h.toLowerCase().includes(q))
})
function commitSearch() {
  browserStore.rememberSearch(searchQuery.value)
  searchHistoryOpen.value = false
}
function clearSearch() {
  searchQuery.value = ''
  searchHistoryOpen.value = false
}
function applySearchHistory(item: string) {
  searchQuery.value = item
  browserStore.rememberSearch(item)
  searchHistoryOpen.value = false
  searchInputRef.value?.focus()
}
function closeSearchHistoryOnOutsideClick(event: MouseEvent) {
  if (!searchHistoryOpen.value) return
  const target = event.target
  if (!(target instanceof Node) || !searchBoxRef.value?.contains(target)) {
    searchHistoryOpen.value = false
  }
}
const recentMenuOpen = ref(false)
const recentMenuRef = ref<HTMLElement | null>(null)
const loadedFiles = ref<FileInfo[]>([])
const directoryLoadKey = ref(0)
const createNameInputRef = ref<HTMLInputElement | null>(null)
const createDialog = reactive({
  visible: false,
  kind: 'file' as 'file' | 'folder',
  name: '',
  error: ''
})
// ⇧⌘G 前往文件夹对话框
const goToNameInputRef = ref<HTMLInputElement | null>(null)
const goToDialog = reactive({
  visible: false,
  path: '',
  error: ''
})
const pendingDirectoryRefreshes = new Set<string>()
let stopFileOperationUpdates: (() => void) | null = null

log.info('[FinderFilePane] initialized', { paneId: props.paneId })

// Inline preview state
const inlinePreviewFile = ref<FileInfo | null>(null)
const inlinePreviewEnabled = ref(false)
const previewWidth = ref(400) // Default preview width
const isResizing = ref(false)
const isDropTarget = ref(false)
let dragDepth = 0

function activatePane() {
  tabsStore.setActivePane(props.paneId)
}

function handlePaneMouseDown(event: MouseEvent) {
  activatePane()
  closeRecentMenuOnOutsideClick(event)
}

function handleDragEnter(event: DragEvent) {
  // 原生拖拽（local 文件走 startNativeDrag）没有 application/json 类型，
  // 以 dragSession 识别应用内拖拽，保证高亮环对所有内部拖拽生效
  const isInternalDrag =
    !!event.dataTransfer?.types.includes('application/json') || dragSessionStore.isActive
  if (!isInternalDrag && !(event.dataTransfer?.types.includes('Files'))) return
  if (dragDepth === 0) {
    log.info('[DnD][FilePane] dragenter', {
      paneId: props.paneId,
      isInternalDrag,
      sessionActive: dragSessionStore.isActive,
      types: event.dataTransfer ? [...event.dataTransfer.types] : []
    })
  }
  dragDepth += 1
  isDropTarget.value = true
}

function handleDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    isDropTarget.value = false
    hideDropHint()
  }
}

function toggleInlinePreview() {
  inlinePreviewEnabled.value = !inlinePreviewEnabled.value
  if (!inlinePreviewEnabled.value) {
    inlinePreviewFile.value = null
    previewStore.clearInlinePreview()
  } else {
    // When enabling, immediately show preview for current selection if any（含文件夹）
    const selectedFiles = pane.value?.selectedFiles || []
    if (selectedFiles.length === 1) {
      const file = loadedFiles.value.find(f => f.path === selectedFiles[0])
      if (file) {
        inlinePreviewFile.value = file
        previewStore.setInlinePreview(file, pane.value?.deviceId || 'local')
      }
    }
  }
}

const renameDialog = reactive({
  visible: false,
  filePath: ''
})
const targetDialog = reactive({
  visible: false,
  mode: 'copy' as 'copy' | 'move',
  files: [] as string[],
  devices: [] as Array<{ id: string; name: string; path?: string }>
})
const infoDialog = reactive<{ files: FileInfo[] }>({ files: [] })
const batchRenameDialog = reactive<{ visible: boolean; files: Array<{ path: string; name: string; isDirectory: boolean }> }>({ visible: false, files: [] })

const pathSegments = computed(() => {
  if (!pane.value) return []
  // ZIP 虚拟路径与普通路径统一经 @shared/zipPath 计算（单一事实源）。
  return zipBreadcrumbSegments(pane.value.path)
})

/** True when the current pane is browsing inside a ZIP archive. */
const isInsideZip = computed(() => isZipVirtualPath(pane.value?.path ?? ''))

/**
 * 宿主集成（Finder）是否可用：仅本地设备、且不在 ZIP 虚拟路径内。
 * 远程设备与 ZIP 内部路径在本机 Finder 中无对应实体。
 */
const canRevealInFinder = computed(() => pane.value?.deviceId === 'local' && !isInsideZip.value)

/** 工具栏按钮：在 Finder 中定位当前目录（shell.showItemInFolder 选中该目录于其父窗口）。 */
function revealCurrentFolderInFinder() {
  if (!canRevealInFinder.value) return
  const currentPath = pane.value?.path
  if (currentPath) {
    window.fileman.showInFolder(currentPath)
  }
}

/**
 * Returns true for the breadcrumb segment index that corresponds to the ZIP
 * file itself (the boundary between filesystem and archive internals).
 */
function isZipBoundarySegment(index: number): boolean {
  if (!isZipVirtualPath(pane.value?.path ?? '')) return false
  const fsSegmentCount = parseZipVirtualPath(pane.value!.path).zipFilePath.split('/').filter(Boolean).length
  // The ZIP file is the last filesystem segment
  return index === fsSegmentCount - 1
}

// View mode icons as components
const ListIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 6h16M4 10h16M4 14h16M4 18h16' })
    ])
  }
}

const GridIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' })
    ])
  }
}

const ColumnsIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' })
    ])
  }
}

const viewModes = [
  { value: 'list' as const, icon: ListIcon, label: 'List View' },
  { value: 'grid' as const, icon: GridIcon, label: 'Grid View' },
  { value: 'columns' as const, icon: ColumnsIcon, label: 'Columns View' }
]

// ── 网格规格（大/中/小）：右击网格按钮弹出选择 ────────────────────────────────
const gridSizeOptions = [
  { value: 'xlarge' as const, label: 'Extra Large Icons' },
  { value: 'large' as const, label: 'Large Icons' },
  { value: 'medium' as const, label: 'Medium Icons' },
  { value: 'small' as const, label: 'Small Icons' }
]
const gridSizeMenu = reactive({ visible: false, x: 0, y: 0 })
const gridSizeMenuRef = ref<HTMLElement | null>(null)
const activeGridSize = computed(() => pane.value?.gridSize ?? 'large')

const MENU_VIEWPORT_MARGIN = 8

/** 菜单默认向右/向下展开：渲染后测量实际尺寸，靠近视口边缘时回退到视口内 */
async function clampGridSizeMenuToViewport() {
  await nextTick()
  const el = gridSizeMenuRef.value
  if (!el || !gridSizeMenu.visible) return
  const rect = el.getBoundingClientRect()
  if (rect.right > window.innerWidth - MENU_VIEWPORT_MARGIN) {
    gridSizeMenu.x = Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - rect.width - MENU_VIEWPORT_MARGIN)
  }
  if (rect.bottom > window.innerHeight - MENU_VIEWPORT_MARGIN) {
    gridSizeMenu.y = Math.max(MENU_VIEWPORT_MARGIN, window.innerHeight - rect.height - MENU_VIEWPORT_MARGIN)
  }
}

function onViewButtonContextMenu(value: string, e: MouseEvent) {
  // 仅网格按钮响应右键 → 弹出规格菜单
  if (value !== 'grid') return
  gridSizeMenu.x = e.clientX
  gridSizeMenu.y = e.clientY
  gridSizeMenu.visible = true
  void clampGridSizeMenuToViewport()
}
function closeGridSizeMenu() {
  gridSizeMenu.visible = false
}
function chooseGridSize(size: 'xlarge' | 'large' | 'medium' | 'small') {
  tabsStore.setGridSize(props.paneId, size)
  // 选择规格即进入网格视图，让所选大/中/小立即生效
  if (pane.value?.viewMode !== 'grid') {
    tabsStore.setViewMode(props.paneId, 'grid')
  }
  closeGridSizeMenu()
}

function navigateToSegment(index: number) {
  if (!pane.value) return
  const path = pane.value.path

  // Virtual ZIP path: "<zipFilePath>::<innerPath>"（解析统一在 @shared/zipPath）
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const fsSegments  = zipFilePath.split('/').filter(Boolean)
    const innerSegs   = innerPath ? innerPath.split('/').filter(Boolean) : []

    if (index < fsSegments.length - 1) {
      // Navigate to a filesystem ancestor (exit the ZIP entirely)
      const newPath = '/' + fsSegments.slice(0, index + 1).join('/')
      tabsStore.navigatePane(props.paneId, newPath)
    } else if (index === fsSegments.length - 1) {
      // Click on the ZIP file itself → show ZIP root
      tabsStore.navigatePane(props.paneId, joinZipPath(zipFilePath, ''))
    } else {
      // Navigate within the ZIP
      const innerIdx  = index - fsSegments.length
      const newInner  = innerSegs.slice(0, innerIdx + 1).join('/')
      tabsStore.navigatePane(props.paneId, joinZipPath(zipFilePath, newInner))
    }
    return
  }

  const segments = pathSegments.value.slice(0, index + 1)
  const newPath = '/' + segments.join('/')
  tabsStore.navigatePane(props.paneId, newPath)
}

function handleSelect(files: string[]) {
  tabsStore.setSelectedFiles(props.paneId, files)

  if (!inlinePreviewEnabled.value) return

  // Show inline preview for single selection when enabled（文件夹也显示，展示其信息）
  if (files.length === 1) {
    const selectedPath = files[0]
    const file = loadedFiles.value.find(f => f.path === selectedPath)
    if (file) {
      inlinePreviewFile.value = file
      previewStore.setInlinePreview(file, pane.value?.deviceId || 'local')
    } else {
      inlinePreviewFile.value = null
      previewStore.clearInlinePreview()
    }
  } else {
    inlinePreviewFile.value = null
    previewStore.clearInlinePreview()
  }
}

function handleNavigate(path: string) {
  tabsStore.navigatePane(props.paneId, path)
  if (pane.value) browserStore.rememberLocation(pane.value.deviceId, path)
  // Close inline preview when navigating
  inlinePreviewFile.value = null
  previewStore.clearInlinePreview()
}

function openRecentLocation(deviceId: string, path: string) {
  if (!pane.value) return
  if (pane.value.deviceId !== deviceId) tabsStore.setPaneDevice(props.paneId, deviceId)
  tabsStore.navigatePane(props.paneId, path)
  browserStore.rememberLocation(deviceId, path)
  recentMenuOpen.value = false
}

function closeRecentMenuOnOutsideClick(event: MouseEvent) {
  if (!recentMenuOpen.value) return
  const target = event.target
  if (!(target instanceof Node) || !recentMenuRef.value?.contains(target)) {
    recentMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeRecentMenuOnOutsideClick, true)
  document.addEventListener('click', closeSearchHistoryOnOutsideClick, true)
  stopFileOperationUpdates = window.fileman.onFileOperationUpdated(task => {
    if (!pendingDirectoryRefreshes.has(task.id) && !taskTouchesThisDirectory(task)) return
    if (!['completed', 'failed', 'cancelled'].includes(task.status)) return
    pendingDirectoryRefreshes.delete(task.id)
    if (task.status === 'completed') {
      log.info('[DnD][FilePane] refreshing directory after task completion', {
        paneId: props.paneId,
        taskId: task.id,
        taskType: task.type,
        path: pane.value?.path
      })
      refreshCurrentDirectory()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', closeRecentMenuOnOutsideClick, true)
  document.removeEventListener('click', closeSearchHistoryOnOutsideClick, true)
  stopFileOperationUpdates?.()
  stopFileOperationUpdates = null
})

function openCreateDialog(kind: 'file' | 'folder') {
  createDialog.kind = kind
  createDialog.name = kind === 'file' ? 'untitled.txt' : 'New Folder'
  createDialog.error = ''
  createDialog.visible = true
  void nextTick(() => createNameInputRef.value?.select())
}

function closeCreateDialog() {
  createDialog.visible = false
  createDialog.error = ''
}

// ── ⇧⌘G 前往文件夹 ───────────────────────────────────────────────────────────

function openGoToDialog() {
  // Finder 行为：预填当前路径并全选，直接输入即替换
  goToDialog.path = pane.value?.path || '/'
  goToDialog.error = ''
  goToDialog.visible = true
  void nextTick(() => goToNameInputRef.value?.select())
}

function closeGoToDialog() {
  goToDialog.visible = false
  goToDialog.error = ''
}

async function confirmGoToDialog() {
  const raw = goToDialog.path.trim()
  if (!raw) {
    goToDialog.error = 'Enter a path.'
    return
  }
  // 规范化：去尾部斜杠（根目录除外）
  const path = raw === '/' ? '/' : raw.replace(/\/+$/, '')

  // ZIP 虚拟路径内：同一压缩包内跳转，无法用 exists 校验（inner 条目不是文件系统路径）
  if (isZipVirtualPath(path)) {
    if (!isZipVirtualPath(pane.value?.path ?? '')) {
      goToDialog.error = 'Enter a filesystem path (ZIP virtual paths only inside a ZIP).'
      return
    }
    tabsStore.navigatePane(props.paneId, path)
    closeGoToDialog()
    return
  }
  if (!path.startsWith('/')) {
    goToDialog.error = 'Enter an absolute path.'
    return
  }

  const deviceId = pane.value?.deviceId || 'local'
  try {
    const stats = await window.fileman.getStats(deviceId, path)
    if (!stats.isDirectory) {
      goToDialog.error = 'Not a folder.'
      return
    }
  } catch (e) {
    goToDialog.error = `Folder not found: ${path}`
    return
  }

  tabsStore.navigatePane(props.paneId, path)
  if (pane.value) browserStore.rememberLocation(pane.value.deviceId, path)
  closeGoToDialog()
}

function joinChildPath(directory: string, name: string): string {
  const normalizedDirectory = directory === '/' ? '' : directory.replace(/\/+$/, '')
  return `${normalizedDirectory}/${name}`
}

/**
 * 拖拽等非本面板排队的传输任务是否影响当前目录：
 * - copy/move 目标为本面板当前目录（含 App.vue 面板背景放置、其他面板排队）；
 * - move 源位于本面板当前目录（跨面板移动后源面板需要刷新）。
 */
function taskTouchesThisDirectory(task: FileOperationTask): boolean {
  if (task.type !== 'copy' && task.type !== 'move') return false
  const deviceId = pane.value?.deviceId
  const currentPath = pane.value?.path
  if (!deviceId || !currentPath) return false
  if (task.targetDeviceId === deviceId && task.targetPath === currentPath) return true
  if (task.type === 'move' && task.sourceDeviceId === deviceId) {
    return task.sourcePaths.some(sourcePath => parentDirectoryOf(sourcePath) === currentPath)
  }
  return false
}

function trackDirectoryRefresh(task: FileOperationTask) {
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    if (task.status === 'completed') refreshCurrentDirectory()
    return
  }
  pendingDirectoryRefreshes.add(task.id)
  // A user can create an item immediately after opening a tab, before this
  // pane's completion subscription is mounted. Refresh once shortly after
  // queueing as a fallback; the completion event remains the normal path.
  window.setTimeout(() => {
    if (pendingDirectoryRefreshes.has(task.id)) refreshCurrentDirectory()
  }, 150)
}

function refreshCurrentDirectory() {
  directoryLoadKey.value++
}

async function confirmCreateDialog() {
  const name = createDialog.name.trim()
  if (!name || name === '.' || name === '..' || name.includes('/')) {
    createDialog.error = 'Enter a valid name without a slash.'
    return
  }

  const deviceId = pane.value?.deviceId || 'local'
  const targetPath = joinChildPath(pane.value?.path || '/', name)
  try {
    const task = createDialog.kind === 'file'
      ? await fileOpsStore.createTouchTask(deviceId, targetPath)
      : await fileOpsStore.createMkdirTask(deviceId, targetPath)
    trackDirectoryRefresh(task)
    fileOpsStore.showPanel()
    closeCreateDialog()
  } catch (error) {
    createDialog.error = error instanceof Error ? error.message : 'Could not create the item.'
  }
}

function handlePreview(file: FileInfo) {
  if (!file.isDirectory) {
    // ZIP files: navigate into the archive instead of previewing
    if (file.extension?.toLowerCase() === '.zip') {
      // file.path may already be a virtual zip path if we're nested; just append '::'
      const virtualPath = isZipVirtualPath(file.path) ? file.path : file.path + '::'
      tabsStore.navigatePane(props.paneId, virtualPath)
      return
    }
    const deviceId = pane.value?.deviceId || 'local'
    // Images (outside ZIPs) open the folder-aware image browser instead of the
    // single-file preview tab. The sibling list comes from the pane's loaded
    // files so prev/next can walk the folder.
    if (isImageFile(file.extension || '') && !isZipVirtualPath(file.path)) {
      previewStore.openImageBrowser(file, deviceId, loadedFiles.value)
      return
    }
    previewStore.openPreview(file, deviceId)
  }
}

function closeInlinePreview() {
  // 面板开启期间常驻，关闭按钮直接关掉整个内联预览
  inlinePreviewEnabled.value = false
  inlinePreviewFile.value = null
  previewStore.clearInlinePreview()
}

// Resize preview panel
function startResize(event: MouseEvent) {
  isResizing.value = true
  event.preventDefault()

  const startX = event.clientX
  const startWidth = previewWidth.value

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return
    const diff = startX - e.clientX
    const newWidth = Math.max(300, Math.min(800, startWidth + diff))
    previewWidth.value = newWidth
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function handleFilesLoaded(files: FileInfo[]) {
  loadedFiles.value = files
}

async function copySelectedPaths() {
  const selectedPaths = pane.value?.selectedFiles ?? []
  if (!selectedPaths.length) return
  try {
    await navigator.clipboard.writeText(selectedPaths.join('\n'))
    log.info('[FinderFilePane] copied selected paths for sharing', { count: selectedPaths.length })
  } catch (error) {
    log.error('[FinderFilePane] failed to copy selected paths', { error })
  }
}

function editSelectedTags() {
  const selectedPath = pane.value?.selectedFiles[0]
  if (!selectedPath) return
  void handleOperation({ action: 'info', files: [selectedPath] })
}

// Clear inline preview when pane changes
watch(() => pane.value?.path, () => {
  inlinePreviewFile.value = null
})

async function handleOperation(op: { action: string; files: string[]; target?: string; targetDeviceId?: string; newName?: string; sourceDeviceId?: string; sourcePaneId?: string; mode?: 'copy' | 'move' }) {
  const targetPath = op.target || pane.value?.path || '/'
  const deviceId = pane.value?.deviceId || 'local'

  switch (op.action) {
    case 'goto':
      openGoToDialog()
      break

    case 'compare-dirs':
      if (op.files.length === 2) {
        tabsStore.openCompareTab(deviceId, op.files[0], deviceId, op.files[1])
      }
      break

    case 'drop-transfer': {
      // 拖放置放（文件夹行 / columns 列），mode 已经过能力校验
      const sourceDeviceId = op.sourceDeviceId || deviceId
      if (op.files.length === 0 || isZipVirtualPath(targetPath)) {
        log.info('[DnD][FilePane] drop-transfer skipped', { targetPath, fileCount: op.files.length })
        break
      }
      try {
        const task = op.mode === 'move'
          ? await fileOpsStore.createMoveTask(sourceDeviceId, op.files, deviceId, targetPath)
          : await fileOpsStore.createCopyTask(sourceDeviceId, op.files, deviceId, targetPath)
        log.info('[DnD][FilePane] drop-transfer → task queued', {
          taskId: task.id,
          type: task.type,
          sourceDeviceId,
          targetDeviceId: deviceId,
          targetPath,
          fileCount: op.files.length
        })
        fileOpsStore.showPanel()
        trackDirectoryRefresh(task)
      } catch (error) {
        log.error('[DnD][FilePane] Failed to queue drop transfer', {
          sourceDeviceId,
          targetDeviceId: deviceId,
          targetPath,
          mode: op.mode,
          error
        })
      }
      break
    }

    case 'copy':
      console.log('[FilePane] Copy action - setting clipboard:', {
        files: op.files,
        filesCount: op.files.length,
        sourcePaneId: props.paneId,
        sourceDeviceId: deviceId
      })
      clipboardStore.setClipboard(op.files, 'copy', props.paneId, deviceId)
      break

    case 'cut':
      console.log('[FilePane] Cut action - setting clipboard:', {
        files: op.files,
        filesCount: op.files.length,
        sourcePaneId: props.paneId,
        sourceDeviceId: deviceId
      })
      clipboardStore.setClipboard(op.files, 'cut', props.paneId, deviceId)
      break

    case 'paste':
      console.log('[FilePane] Paste action received:', {
        clipboardFiles: clipboardStore.files,
        clipboardFilesLength: clipboardStore.files.length,
        clipboardAction: clipboardStore.action,
        clipboardSourcePaneId: clipboardStore.sourcePaneId,
        clipboardSourceDeviceId: clipboardStore.sourceDeviceId,
        targetPath,
        currentDeviceId: deviceId
      })
      if (clipboardStore.files.length > 0) {
        console.log('[FilePane] Executing paste with files:', clipboardStore.files)
        if (clipboardStore.action === 'cut') {
          console.log('[FilePane] Paste as MOVE operation')
          await fileOpsStore.createMoveTask(
            clipboardStore.sourceDeviceId,
            clipboardStore.files,
            deviceId,
            targetPath
          )
          clipboardStore.clearClipboard()
        } else {
          console.log('[FilePane] Paste as COPY operation')
          await fileOpsStore.createCopyTask(
            clipboardStore.sourceDeviceId,
            clipboardStore.files,
            deviceId,
            targetPath
          )
        }
        fileOpsStore.showPanel()
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      } else {
        console.warn('[FilePane] Paste skipped: clipboard is empty')
      }
      break

    case 'delete':
      if (confirm(`Delete ${op.files.length} item(s)?`)) {
        await fileOpsStore.createRecycleTask(deviceId, op.files)
        fileOpsStore.showPanel()
        tabsStore.setSelectedFiles(props.paneId, [])
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
      break

    case 'info': {
      // 同步快照当前选中（单选/多选均支持），stats/tags/扫描由弹窗自行异步获取
      infoDialog.files = op.files
        .map(p => loadedFiles.value.find(item => item.path === p))
        .filter((item): item is FileInfo => !!item)
      break
    }

    case 'batch-rename':
      batchRenameDialog.files = op.files
        .map(path => loadedFiles.value.find(file => file.path === path))
        .filter((file): file is FileInfo => !!file)
      batchRenameDialog.visible = batchRenameDialog.files.length > 1
      break

    case 'archive': {
      const name = prompt('Archive name:', 'Archive.zip')
      if (name && op.files.length) {
        await window.fileman.createArchive(deviceId, op.files, targetPath, name)
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
      break
    }

    case 'extract-archive':
      if (op.files[0]) {
        await window.fileman.extractArchive(deviceId, op.files[0], targetPath)
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
      break

    case 'rename':
      if (op.files.length > 0) {
        // 如果 newName 存在，说明来自内联重命名，直接执行
        if (op.newName) {
          const filePath = op.files[0]
          await fileOpsStore.createRenameTask(deviceId, filePath, op.newName)
          fileOpsStore.showPanel()
          tabsStore.setSelectedFiles(props.paneId, [])
          tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
        } else {
          // 否则显示对话框（兼容其他调用方式）
          renameDialog.filePath = op.files[0]
          renameDialog.visible = true
        }
      }
      break

    case 'mkdir':
      openCreateDialog('folder')
      break

    case 'touch':
      openCreateDialog('file')
      break

    case 'open':
      if (op.files.length > 0) {
        const file = loadedFiles.value.find(f => f.path === op.files[0])
        if (file?.isDirectory) {
          handleNavigate(file.path)
        } else if (file) {
          handlePreview(file)
        }
      }
      break

    case 'copy-to-device':
      if (op.targetDeviceId && op.files.length > 0) openTargetDialog('copy', op.files, op.targetDeviceId)
      break

    case 'move-to-device':
      if (op.targetDeviceId && op.files.length > 0) openTargetDialog('move', op.files, op.targetDeviceId)
      break
  }
}

function openTargetDialog(mode: 'copy' | 'move', files: string[], preferredDeviceId: string) {
  const companionPanes = tabsStore.activeTab?.panes ?? []
  targetDialog.devices = devicesStore.connectedDevices
    .filter(device => device.id !== pane.value?.deviceId)
    .map(device => ({ id: device.id, name: device.name, path: companionPanes.find(other => other.deviceId === device.id)?.path || '/' }))
    .sort((left, right) => left.id === preferredDeviceId ? -1 : right.id === preferredDeviceId ? 1 : left.name.localeCompare(right.name))
  targetDialog.mode = mode
  targetDialog.files = files
  targetDialog.visible = targetDialog.devices.length > 0
}

async function confirmTargetOperation(value: { deviceId: string; targetPath: string; conflictStrategy: ConflictStrategy }) {
  const deviceId = pane.value?.deviceId || 'local'
  if (targetDialog.mode === 'copy') await fileOpsStore.createCopyTask(deviceId, targetDialog.files, value.deviceId, value.targetPath, value.conflictStrategy)
  else await fileOpsStore.createMoveTask(deviceId, targetDialog.files, value.deviceId, value.targetPath, value.conflictStrategy)
  targetDialog.visible = false
  log.info('[FilePane] target operation queued', { mode: targetDialog.mode, targetDeviceId: value.deviceId, targetPath: value.targetPath })
  fileOpsStore.showPanel()
  if (targetDialog.mode === 'move') tabsStore.setSelectedFiles(props.paneId, [])
}

async function saveTags(tags: string[]) {
  const file = infoDialog.files[0]
  if (!file || !pane.value) return
  // 持久化即可：弹窗内 tagText 是本地真源（乐观更新），无需回写
  await window.fileman.setFileTags(pane.value.deviceId, file.path, tags)
}

async function confirmBatchRename(items: BatchRenameItem[]) {
  const deviceId = pane.value?.deviceId || 'local'
  await fileOpsStore.createBatchRenameTask(deviceId, items)
  batchRenameDialog.visible = false
  fileOpsStore.showPanel()
  tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
}

async function captureScreenshot() {
  if (!pane.value || !canCaptureScreenshot.value) return
  try {
    await window.fileman.captureMobileScreenshot(pane.value.deviceId, pane.value.path)
    tabsStore.navigatePane(props.paneId, pane.value.path)
  } catch (error) {
    log.error('[FilePane] screenshot capture failed', { deviceId: pane.value.deviceId, error })
    alert(error instanceof Error ? error.message : 'Screenshot failed')
  }
}

async function undoRecycle() {
  await fileOpsStore.undoLastRecycle()
  fileOpsStore.showPanel()
  if (pane.value) tabsStore.navigatePane(props.paneId, pane.value.path)
}

async function doRename(newName: string) {
  if (renameDialog.filePath) {
    const deviceId = pane.value?.deviceId || 'local'
    await fileOpsStore.createRenameTask(deviceId, renameDialog.filePath, newName)
    fileOpsStore.showPanel()
    renameDialog.visible = false
    tabsStore.setSelectedFiles(props.paneId, [])
    tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
  }
}

function handleDrop() {
  // App.vue owns queue creation so a FilePane never duplicates a copy task.
  dragDepth = 0
  isDropTarget.value = false
}
</script>

<style scoped>
/* container-type 只挂在工具栏容器上（见模板注释），不要放回 .file-pane */
.file-pane-toolbar-container {
  container-type: inline-size;
}

.file-pane-toolbar {
  flex-wrap: nowrap;
}

@container (max-width: 760px) {
  .file-pane-toolbar {
    gap: 0.25rem;
    padding-inline: 0.5rem !important;
  }

  .file-pane-toolbar-breadcrumb,
  .file-pane-toolbar-optional {
    display: none;
  }

  .file-pane-toolbar-search input,
  .file-pane-toolbar-search input:focus {
    width: 7.5rem;
  }
}

@container (max-width: 540px) {
  .file-pane-toolbar-search-mode {
    display: none;
  }

  .file-pane-toolbar-search input,
  .file-pane-toolbar-search input:focus {
    width: 6rem;
  }
}

.recent-locations-menu {
  /* Do not use bg-bg-secondary here: Finder's toolbar skin intentionally makes
     that utility translucent for button groups, which makes a popup unreadable. */
  background: var(--finder-canvas, var(--bg-secondary));
  isolation: isolate;
}
</style>
