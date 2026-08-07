<template>
  <div class="h-full flex flex-col bg-bg-secondary relative overflow-hidden">
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
      <!-- Toolbar -->
      <div class="absolute top-2 right-2 z-10 flex items-center gap-1 bg-bg-tertiary/90 rounded-md p-1 backdrop-blur-sm">
        <!-- Zoom Controls -->
        <button
          class="p-1.5 rounded hover:bg-bg-hover transition-colors"
          @click="zoomIn"
          title="Zoom In"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded hover:bg-bg-hover transition-colors"
          @click="zoomOut"
          title="Zoom Out"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded hover:bg-bg-hover transition-colors"
          @click="resetView"
          title="Reset View"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <div class="w-px h-4 bg-border mx-1"></div>

        <!-- Rotation Controls -->
        <button
          class="p-1.5 rounded hover:bg-bg-hover transition-colors"
          @click="rotateLeft"
          title="Rotate Left"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded hover:bg-bg-hover transition-colors"
          @click="rotateRight"
          title="Rotate Right"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        <div class="w-px h-4 bg-border mx-1"></div>

        <!-- Fit Mode -->
        <button
          class="p-1.5 rounded transition-colors"
          :class="fitMode === 'contain' ? 'bg-accent-blue text-white' : 'hover:bg-bg-hover'"
          @click="setFitMode('contain')"
          title="Fit to Window"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          class="p-1.5 rounded transition-colors"
          :class="fitMode === 'actual' ? 'bg-accent-blue text-white' : 'hover:bg-bg-hover'"
          @click="setFitMode('actual')"
          title="Actual Size"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        <!-- Scale Display -->
        <span class="text-xs text-text-secondary px-2 min-w-[3rem] text-right">{{ displayScale }}</span>
      </div>

      <!-- Image Container -->
      <div
        class="flex-1 overflow-hidden flex items-center justify-center p-4 image-container cursor-grab"
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
          <button
            class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors"
            @click="openInFullPreview"
          >
            Open in Full Viewer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import type { ImageFitMode } from '@/types/preview'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewImageContent] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const emit = defineEmits<{
  openInFull: []
}>()

// Loading state
const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const imageSrc = ref('')
const imageRef = ref<HTMLImageElement | null>(null)
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
  log('Image loaded, dimensions:', imageDimensions.value)
}

function handleImageError(e: Event) {
  console.error('[PreviewImageContent] Image load error:', e)
  hasError.value = true
  errorMessage.value = 'Failed to display image'
}

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

function openInFullPreview() {
  emit('openInFull')
}

// Watch for file changes
watch(() => props.file, (newFile, oldFile) => {
  if (newFile && newFile.path !== oldFile?.path) {
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
