<template>
  <div class="finder-preview h-full flex flex-col bg-bg-secondary relative overflow-hidden">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">Loading image...</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">Failed to load image</p>
      <p class="text-xs">{{ errorMessage }}</p>
    </div>

    <!-- Image Content -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- 编辑工具条（左上；仅 local 可编辑图片显示；hover 显现） -->
      <ImageEditToolbar
        v-if="edit"
        class="absolute top-2 left-2"
        :editable="edit.editable.value"
        :collection="edit.hasCollection.value"
        :mode="edit.mode.value"
        :running="edit.batchRunning.value"
        @crop="enterCropMode"
        @compress="edit.requestCompress()"
        @batch-compress="edit.openBatchCompress()"
        @batch-rename="edit.openRename()"
      />

      <!-- Toolbar -->
      <div v-if="edit?.mode.value !== 'crop'" class="finder-preview-floating-toolbar absolute top-2 right-2 z-10 flex items-center gap-1">
        <!-- Zoom Controls -->
        <button
          class="finder-icon-button"
          @click="zoomIn"
          title="Zoom In"
        >
          <IconfontIcon name="zoomIn" />
        </button>
        <button
          class="finder-icon-button"
          @click="zoomOut"
          title="Zoom Out"
        >
          <IconfontIcon name="zoomOut" />
        </button>
        <button
          class="finder-icon-button"
          @click="resetView"
          title="Reset View"
        >
          <IconfontIcon name="reset" />
        </button>

        <div class="finder-toolbar-divider"></div>

        <!-- Rotation Controls -->
        <button
          class="finder-icon-button"
          @click="rotateLeft"
          title="Rotate Left"
        >
          <IconfontIcon name="rotateLeft" />
        </button>
        <button
          class="finder-icon-button"
          @click="rotateRight"
          title="Rotate Right"
        >
          <IconfontIcon name="rotateRight" />
        </button>

        <div class="finder-toolbar-divider"></div>

        <!-- Fit Mode -->
        <button
          class="finder-icon-button"
          :class="{ 'is-active': fitMode === 'contain' }"
          @click="setFitMode('contain')"
          title="Fit to Window"
        >
          <IconfontIcon name="fit" />
        </button>
        <button
          class="finder-icon-button"
          :class="{ 'is-active': fitMode === 'actual' }"
          @click="setFitMode('actual')"
          title="Actual Size"
        >
          <IconfontIcon name="actualSize" />
        </button>

        <!-- Scale Display -->
        <span class="text-xs text-text-secondary px-2 min-w-[3rem] text-right">{{ displayScale }}</span>
      </div>

      <!-- Image Container -->
      <div
        ref="imageContainerRef"
        class="flex-1 overflow-hidden flex items-center justify-center p-4 image-container cursor-grab relative"
        @wheel="handleWheel"
        @mousedown="startDrag"
        @mousemove="handleDrag"
        @mouseup="endDrag"
        @mouseleave="endDrag"
      >
        <img
          v-if="imageSrc"
          ref="imageRef"
          :src="imageSrc"
          class="rounded-lg shadow-lg select-none"
          :class="[getImageClass, isDragging ? 'transition-none' : 'transition-transform duration-150']"
          :style="getImageStyle"
          @load="handleImageLoad"
          @error="handleImageError"
          draggable="false"
        />

        <!-- 裁剪浮层（几何映射用实测 img rect，进入裁剪自动复位视图/旋转） -->
        <ImageCropOverlay
          v-if="edit && edit.mode.value === 'crop'"
          v-model="cropDisplayRect"
          :layout="cropLayout"
          @cancel="edit.exitCrop()"
          @apply="edit.requestCropApply()"
        />
      </div>

      <!-- File Info -->
      <div class="flex-shrink-0 px-4 py-2 bg-bg-tertiary border-t border-border">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary truncate max-w-xs">{{ file.name }}</span>
            <span class="text-xs text-text-tertiary">{{ formatSize(file.size) }}</span>
            <span v-if="imageDimensions.width" class="text-xs text-text-tertiary">
              {{ imageDimensions.width }} x {{ imageDimensions.height }}
            </span>
          </div>
          <span v-if="edit?.error.value" class="text-xs text-red-400 truncate max-w-[40%]" :title="edit.error.value">{{ edit.error.value }}</span>
        </div>
      </div>
    </div>

    <!-- 保存对话框（覆盖/另存 + 格式质量 + 预估体积） -->
    <SaveImageDialog
      v-if="edit && edit.saveDialogVisible.value"
      :file-name="file.name"
      :source-bytes="file.size"
      :estimate="edit.estimate.value"
      :estimating="edit.estimating.value"
      :applying="edit.applying.value"
      :error="edit.error.value"
      :compress-default="edit.pendingCompress.value"
      @close="edit.closeSaveDialog()"
      @params-change="edit.refreshEstimate"
      @confirm="edit.confirmSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import type { ImageFitMode } from '@/types/preview'
import { needsNativeDecode } from '@/utils/fileTypes'
import { displayedToSourceRect, type ImageLayout, type Rect } from '@/utils/cropGeometry'
import type { ImageEditController } from '@/composables/useImageEdit'
import IconfontIcon from './IconfontIcon.vue'
import ImageEditToolbar from './ImageEditToolbar.vue'
import ImageCropOverlay from './ImageCropOverlay.vue'
import SaveImageDialog from '../dialogs/SaveImageDialog.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewImageContent] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 编辑控制器（PreviewView 创建，经 Router 下传；QuickLook 无） */
  edit?: ImageEditController
}>()

// Loading state
const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const imageSrc = ref('')
const imageRef = ref<HTMLImageElement | null>(null)
const imageContainerRef = ref<HTMLElement | null>(null)
const imageDimensions = ref({ width: 0, height: 0 })

// Image manipulation state
const scale = ref(1)
const rotation = ref(0)
const translateX = ref(0)
const translateY = ref(0)
const fitMode = ref<ImageFitMode>('contain')
const isDragging = ref(false)

// Drag tracking
let dragStartX = 0
let dragStartY = 0
let lastTranslateX = 0
let lastTranslateY = 0

// Computed
const displayScale = computed(() => Math.round(scale.value * 100) + '%')

const getImageClass = computed(() => {
  return {
    'object-contain': fitMode.value === 'contain',
    'object-cover': fitMode.value === 'cover',
    'object-none': fitMode.value === 'actual',
    'cursor-grabbing': isDragging.value
  }
})

const getImageStyle = computed(() => {
  const tx = translateX.value
  const ty = translateY.value
  const s = scale.value
  const r = rotation.value

  if (tx === 0 && ty === 0 && s === 1 && r === 0) return {}

  // translate FIRST so pan is always in screen-space regardless of zoom level.
  // Order: translate → scale → rotate (applied right-to-left internally).
  return { transform: `translate(${tx}px, ${ty}px) scale(${s}) rotate(${r}deg)` }
})

// Helper functions
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

// Image loading
async function loadImage() {
  log('Loading image:', props.file.name, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  // Reset view state
  resetView()

  // Clean up previous image
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = ''
  }

  try {
    if (needsNativeDecode(props.file.extension || '')) {
      // HEIC/HEIF/TIFF/PSD/相机 RAW 等 Chromium 无法解码的格式：
      // 走主进程 sips（ImageDecodeService）转 JPEG 栅格。
      log('Native decode (sips):', props.file.extension)
      const decoded = await window.fileman.decodeNativeImage(
        props.deviceId,
        props.file.path,
        { maxDim: 4096 }
      )
      imageSrc.value = `data:${decoded.mime};base64,${decoded.buffer}`
      log('Native decode OK, jpeg base64 length:', decoded.buffer.length)
    } else {
      log('Reading file from device:', props.deviceId, 'path:', props.file.path)
      const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
      log('File read successfully, base64 length:', base64.length)

      const buffer = base64ToArrayBuffer(base64)
      log('Buffer size:', buffer.byteLength, 'bytes')

      const mimeType = getMimeType(props.file.extension || '')
      log('MIME type:', mimeType)

      const blob = new Blob([buffer], { type: mimeType })
      imageSrc.value = URL.createObjectURL(blob)
      log('Blob URL created:', imageSrc.value)
    }
  } catch (e) {
    console.error('[PreviewImageContent] Error loading image:', e)
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

// Event handlers
function handleImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imageDimensions.value = {
    width: img.naturalWidth,
    height: img.naturalHeight
  }
  props.edit?.setNaturalSize(img.naturalWidth)
  layoutTick.value++
  log('Image loaded, dimensions:', imageDimensions.value)
}

function handleImageError(e: Event) {
  console.error('[PreviewImageContent] Image load error:', e)
  hasError.value = true
  errorMessage.value = 'Failed to display image'
}

// ── 裁剪接线（几何事实源 = 实测 img rect，规避 transform/object-fit 数学） ─────
// 裁剪显示矩形（overlay v-model）；提交给 VM 的始终是源像素矩形。
const cropDisplayRect = ref<Rect | null>(null)
const layoutTick = ref(0)

const cropLayout = computed<ImageLayout>(() => {
  layoutTick.value // 依赖：加载/缩放/视口变化时 bump
  const container = imageContainerRef.value
  const img = imageRef.value
  const dims = imageDimensions.value
  if (!container || !img || dims.width === 0) {
    return { containerWidth: 1, containerHeight: 1, naturalWidth: dims.width || 1, naturalHeight: dims.height || 1, fitMode: fitMode.value }
  }
  const cRect = container.getBoundingClientRect()
  const iRect = img.getBoundingClientRect()
  return {
    containerWidth: cRect.width,
    containerHeight: cRect.height,
    naturalWidth: dims.width,
    naturalHeight: dims.height,
    fitMode: fitMode.value,
    displayedRect: {
      x: iRect.left - cRect.left,
      y: iRect.top - cRect.top,
      width: iRect.width,
      height: iRect.height
    }
  }
})

watch(cropDisplayRect, rect => {
  if (!rect || !props.edit) return
  props.edit.setCropRect(displayedToSourceRect(rect, cropLayout.value))
})

function enterCropMode() {
  // 裁剪前复位视图：旋转/缩放态下的裁剪几何不支持（已知限制）
  resetView()
  layoutTick.value++
  props.edit?.startCrop()
}

// 视口/缩放变化重算布局（ResizeObserver 兜底窗口拖拽）
let resizeObserver: ResizeObserver | null = null
watch(imageContainerRef, el => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (el) {
    resizeObserver = new ResizeObserver(() => { layoutTick.value++ })
    resizeObserver.observe(el)
  }
})
onUnmounted(() => resizeObserver?.disconnect())

// Zoom controls
function zoomIn() {
  if (scale.value < 10) {
    scale.value = Math.min(scale.value + 0.25, 10)
    log('Zoom in, scale:', scale.value)
  }
}

function zoomOut() {
  if (scale.value > 0.1) {
    scale.value = Math.max(scale.value - 0.25, 0.1)
    log('Zoom out, scale:', scale.value)
  }
}

function resetView() {
  scale.value = 1
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  fitMode.value = 'contain'
  log('View reset')
}

// Rotation controls
function rotateLeft() {
  rotation.value = (rotation.value - 90 + 360) % 360
  log('Rotate left, rotation:', rotation.value)
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
  log('Rotate right, rotation:', rotation.value)
}

// Fit mode
function setFitMode(mode: ImageFitMode) {
  fitMode.value = mode
  if (mode === 'contain' || mode === 'cover') {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
  } else if (mode === 'actual') {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
  }
  log('Fit mode changed to:', mode)
}

// Wheel zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault()

  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(scale.value + delta, 10))

  if (newScale !== scale.value) {
    // Zoom towards cursor position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate the offset from center to mouse
    const offsetX = mouseX - centerX
    const offsetY = mouseY - centerY

    // Calculate how much the point under cursor should move
    const scaleFactor = newScale / scale.value

    // Adjust translation to keep the point under cursor stationary
    translateX.value = offsetX - (offsetX - translateX.value) * scaleFactor
    translateY.value = offsetY - (offsetY - translateY.value) * scaleFactor

    scale.value = newScale
    log('Wheel zoom, scale:', scale.value)
  }
}

// Drag handlers
function startDrag(e: MouseEvent) {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  lastTranslateX = translateX.value
  lastTranslateY = translateY.value
  ;(e.currentTarget as HTMLElement).style.cursor = 'grabbing'
}

function handleDrag(e: MouseEvent) {
  if (!isDragging.value) return

  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY

  translateX.value = lastTranslateX + dx
  translateY.value = lastTranslateY + dy
}

function endDrag() {
  isDragging.value = false
  const container = document.querySelector('.image-container')
  if (container) {
    ;(container as HTMLElement).style.cursor = ''
  }
}

// Watch for file changes
watch(() => props.file, (newFile, oldFile) => {
  // 覆盖保存后 path 不变但 size 变化 → 同样重载（IFC-7 后置条件）
  if (newFile && (newFile.path !== oldFile?.path || newFile.size !== oldFile?.size)) {
    loadImage()
  }
}, { immediate: true })

// Cleanup
onUnmounted(() => {
  log('Component unmounting, cleaning up')
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})
</script>

<style scoped>
.image-container {
  user-select: none;
}

.select-none {
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}

.cursor-grab {
  cursor: grab;
}

.cursor-grabbing {
  cursor: grabbing;
}
</style>
