<template>
  <div
    v-if="pane"
    class="h-full flex flex-col overflow-hidden bg-bg-primary"
    @drop="handleDrop"
    @dragover.prevent
  >
    <!-- Toolbar -->
    <div class="h-10 bg-bg-toolbar flex items-center px-2 gap-1.5 border-b border-border">
      <!-- Navigation Buttons -->
      <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
        <button
          class="toolbar-btn-enhanced"
          :disabled="pane.historyIndex <= 0"
          @click="tabsStore.goBack(paneId)"
          title="Go Back"
          aria-label="Go Back"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          class="toolbar-btn-enhanced"
          :disabled="pane.historyIndex >= pane.history.length - 1"
          @click="tabsStore.goForward(paneId)"
          title="Go Forward"
          aria-label="Go Forward"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
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
      <div class="flex-1 mx-2 flex items-center">
        <div class="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary/50 rounded-lg border border-border/50 hover:border-border transition-colors overflow-hidden">
          <!-- ZIP badge shown when browsing inside an archive -->
          <span
            v-if="isInsideZip"
            class="flex-shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 mr-1"
          >ZIP</span>
          <template v-for="(segment, index) in pathSegments" :key="index">
            <button
              class="text-[13px] transition-colors cursor-pointer font-medium flex-shrink-0"
              :class="isZipBoundarySegment(index) ? 'text-orange-400 hover:text-orange-300' : 'text-text-secondary hover:text-accent-blue'"
              @click="navigateToSegment(index)"
            >
              {{ segment }}
            </button>
            <span v-if="index < pathSegments.length - 1" class="text-text-tertiary mx-0.5 flex-shrink-0">/</span>
          </template>
        </div>
      </div>

      <!-- Search -->
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search"
          class="w-36 h-8 pl-8 pr-3 text-[13px] bg-bg-secondary/50 border border-border/50 rounded-lg focus:w-52 transition-all focus:border-accent-blue/50 focus:bg-bg-secondary focus:outline-none"
          @keydown.escape="searchQuery = ''"
        />
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <!-- View Mode -->
      <div class="flex items-center bg-bg-secondary/50 rounded-lg border border-border/50 p-0.5">
        <button
          v-for="mode in viewModes"
          :key="mode.value"
          class="w-7 h-7 flex items-center justify-center rounded-md text-xs transition-all cursor-pointer"
          :class="pane.viewMode === mode.value ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
          :title="mode.label"
          :aria-label="mode.label"
          @click="tabsStore.setViewMode(paneId, mode.value)"
        >
          <component :is="mode.icon" class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Inline Preview Toggle -->
      <button
        class="toolbar-btn-enhanced"
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
      <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
        <button class="toolbar-btn-enhanced" title="New Folder" aria-label="New Folder" @click="handleOperation({ action: 'mkdir', files: [] })">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        </button>
        <button class="toolbar-btn-enhanced" title="New File" aria-label="New File" @click="handleOperation({ action: 'touch', files: [] })">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Main Content Area with File List and Inline Preview -->
    <div class="flex-1 flex overflow-hidden">
      <!-- File List -->
      <FileList
        class="flex-1 min-w-0"
        :pane-id="paneId"
        :device-id="pane.deviceId"
        :path="pane.path"
        :view-mode="pane.viewMode"
        :selected-files="pane.selectedFiles"
        :search-query="searchQuery"
        @select="handleSelect"
        @navigate="handleNavigate"
        @preview="handlePreview"
        @operation="handleOperation"
        @loaded="handleFilesLoaded"
      />

      <!-- Inline Preview Panel -->
      <template v-if="inlinePreviewFile && !inlinePreviewFile.isDirectory">
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

    <!-- Operation Dialog -->
    <RenameDialog
      v-if="renameDialog.visible"
      :file-path="renameDialog.filePath"
      @close="renameDialog.visible = false"
      @confirm="doRename"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, h, type Component, watch } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { usePreviewStore } from '@/stores/preview'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useClipboardStore } from '@/stores/clipboard'
import FileList from './FileList.vue'
import InlinePreview from './preview/InlinePreview.vue'
import RenameDialog from './dialogs/RenameDialog.vue'
import type { FileInfo } from '@/types'

const props = defineProps<{
  paneId: string
}>()

const tabsStore = useTabsStore()
const previewStore = usePreviewStore()
const fileOpsStore = useFileOperationsStore()
const clipboardStore = useClipboardStore()

const pane = computed(() => tabsStore.findPane(props.paneId))

const searchQuery = ref('')
const loadedFiles = ref<FileInfo[]>([])

// Inline preview state
const inlinePreviewFile = ref<FileInfo | null>(null)
const inlinePreviewEnabled = ref(false)
const previewWidth = ref(400) // Default preview width
const isResizing = ref(false)

function toggleInlinePreview() {
  inlinePreviewEnabled.value = !inlinePreviewEnabled.value
  if (!inlinePreviewEnabled.value) {
    inlinePreviewFile.value = null
    previewStore.clearInlinePreview()
  } else {
    // When enabling, immediately show preview for current selection if any
    const selectedFiles = pane.value?.selectedFiles || []
    if (selectedFiles.length === 1) {
      const file = loadedFiles.value.find(f => f.path === selectedFiles[0])
      if (file && !file.isDirectory) {
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

const pathSegments = computed(() => {
  if (!pane.value) return []
  const path = pane.value.path

  // Virtual ZIP path: "<zipFilePath>::<innerPath>"
  if (path.includes('::')) {
    const sepIdx = path.indexOf('::')
    const zipFilePath = path.slice(0, sepIdx)
    const innerPath   = path.slice(sepIdx + 2)
    const fsSegments  = zipFilePath.split('/').filter(Boolean)
    const innerSegs   = innerPath ? innerPath.split('/').filter(Boolean) : []
    return [...fsSegments, ...innerSegs]
  }

  return path.split('/').filter(Boolean)
})

/** True when the current pane is browsing inside a ZIP archive. */
const isInsideZip = computed(() => pane.value?.path.includes('::') ?? false)

/**
 * Returns true for the breadcrumb segment index that corresponds to the ZIP
 * file itself (the boundary between filesystem and archive internals).
 */
function isZipBoundarySegment(index: number): boolean {
  if (!pane.value?.path.includes('::')) return false
  const zipFilePath = pane.value.path.slice(0, pane.value.path.indexOf('::'))
  const fsSegmentCount = zipFilePath.split('/').filter(Boolean).length
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

function navigateToSegment(index: number) {
  if (!pane.value) return
  const path = pane.value.path

  // Virtual ZIP path: "<zipFilePath>::<innerPath>"
  if (path.includes('::')) {
    const sepIdx     = path.indexOf('::')
    const zipFilePath = path.slice(0, sepIdx)
    const innerPath   = path.slice(sepIdx + 2)
    const fsSegments  = zipFilePath.split('/').filter(Boolean)
    const innerSegs   = innerPath ? innerPath.split('/').filter(Boolean) : []

    if (index < fsSegments.length - 1) {
      // Navigate to a filesystem ancestor (exit the ZIP entirely)
      const newPath = '/' + fsSegments.slice(0, index + 1).join('/')
      tabsStore.navigatePane(props.paneId, newPath)
    } else if (index === fsSegments.length - 1) {
      // Click on the ZIP file itself → show ZIP root
      tabsStore.navigatePane(props.paneId, `${zipFilePath}::`)
    } else {
      // Navigate within the ZIP
      const innerIdx  = index - fsSegments.length
      const newInner  = innerSegs.slice(0, innerIdx + 1).join('/')
      tabsStore.navigatePane(props.paneId, `${zipFilePath}::${newInner}`)
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

  // Show inline preview for single-file selection when enabled
  if (files.length === 1) {
    const selectedPath = files[0]
    const file = loadedFiles.value.find(f => f.path === selectedPath)
    if (file && !file.isDirectory) {
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
  // Close inline preview when navigating
  inlinePreviewFile.value = null
  previewStore.clearInlinePreview()
}

function handlePreview(file: FileInfo) {
  if (!file.isDirectory) {
    // ZIP files: navigate into the archive instead of previewing
    if (file.extension?.toLowerCase() === '.zip') {
      // file.path may already be a virtual zip path if we're nested; just append '::'
      const virtualPath = file.path.includes('::') ? file.path : file.path + '::'
      tabsStore.navigatePane(props.paneId, virtualPath)
      return
    }
    previewStore.openPreview(file, pane.value?.deviceId || 'local')
    previewStore.openFullscreen()
  }
}

function closeInlinePreview() {
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

// Clear inline preview when pane changes
watch(() => pane.value?.path, () => {
  inlinePreviewFile.value = null
})

async function handleOperation(op: { action: string; files: string[]; target?: string; targetDeviceId?: string; newName?: string }) {
  const targetPath = op.target || pane.value?.path || '/'
  const deviceId = pane.value?.deviceId || 'local'

  switch (op.action) {
    case 'compare-dirs':
      if (op.files.length === 2) {
        tabsStore.openCompareTab(deviceId, op.files[0], deviceId, op.files[1])
      }
      break

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
        await fileOpsStore.createDeleteTask(deviceId, op.files)
        fileOpsStore.showPanel()
        tabsStore.setSelectedFiles(props.paneId, [])
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
      const folderName = prompt('New folder name:')
      if (folderName) {
        const newPath = targetPath + '/' + folderName
        await fileOpsStore.createMkdirTask(deviceId, newPath)
        fileOpsStore.showPanel()
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
      break

    case 'touch':
      const fileName = prompt('New file name:')
      if (fileName) {
        const newPath = targetPath + '/' + fileName
        await fileOpsStore.createTouchTask(deviceId, newPath)
        fileOpsStore.showPanel()
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
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
      if (op.targetDeviceId && op.files.length > 0) {
        await fileOpsStore.createCopyTask(
          deviceId,
          op.files,
          op.targetDeviceId,
          '/' // Root path of target device
        )
        fileOpsStore.showPanel()
      }
      break

    case 'move-to-device':
      if (op.targetDeviceId && op.files.length > 0) {
        await fileOpsStore.createMoveTask(
          deviceId,
          op.files,
          op.targetDeviceId,
          '/' // Root path of target device
        )
        fileOpsStore.showPanel()
        tabsStore.setSelectedFiles(props.paneId, [])
      }
      break
  }
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

function handleDrop(event: DragEvent) {
  if (event.dataTransfer) {
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'))
      handleOperation({
        action: 'copy',
        files: data.files,
        target: pane.value?.path
      })
    } catch (e) {
      console.error('Failed to parse drag data:', e)
    }
  }
}
</script>
