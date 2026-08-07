<template>
  <Transition name="preview-fade">
    <div
      v-if="previewStore.imageBrowserOpen"
      class="absolute inset-0 z-[60] flex flex-col bg-bg-primary"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border app-no-drag">
        <div class="flex items-center gap-2 min-w-0">
          <svg class="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.87-1.87a2 2 0 012.83 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="text-sm font-medium text-text-primary truncate">{{ currentFile?.name || 'Image' }}</span>
          <span class="text-xs text-text-tertiary flex-shrink-0">{{ indexLabel }}</span>
        </div>
        <button
          class="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Close (Esc)"
          @click="close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body: canvas + side panel -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Canvas -->
        <div class="flex-1 relative overflow-hidden flex items-center justify-center">
          <!-- Prev / Next arrows -->
          <button
            v-if="canPrev"
            class="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-bg-tertiary/80 hover:bg-bg-tertiary text-text-secondary hover:text-text-primary backdrop-blur-sm transition-colors"
            title="Previous (←)"
            @click="goPrev"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            v-if="canNext"
            class="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-bg-tertiary/80 hover:bg-bg-tertiary text-text-secondary hover:text-text-primary backdrop-blur-sm transition-colors"
            title="Next (→)"
            @click="goNext"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <!-- Loading -->
          <div v-if="loading" class="flex flex-col items-center gap-2 text-text-secondary">
            <div class="w-7 h-7 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs">Loading…</span>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="flex flex-col items-center gap-2 text-text-tertiary p-6 text-center">
            <svg class="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-sm font-medium text-text-primary">Cannot display image</p>
            <p class="text-xs">{{ error }}</p>
          </div>

          <!-- Image -->
          <div
            v-else
            class="w-full h-full overflow-hidden flex items-center justify-center image-canvas"
            :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
            @wheel="handleWheel"
            @mousedown="startDrag"
            @mousemove="handleDrag"
            @mouseup="endDrag"
            @mouseleave="endDrag"
          >
            <img
              v-if="blobUrl"
              :src="blobUrl"
              class="rounded-lg shadow-lg select-none max-w-full max-h-full transition-transform duration-150"
              :class="[isDragging ? 'transition-none' : '', fitMode === 'contain' ? 'object-contain' : fitMode === 'cover' ? 'object-cover' : 'object-none']"
              :style="imageStyle"
              draggable="false"
              @load="handleImageLoad"
            />
          </div>

          <!-- Floating toolbar -->
          <div class="absolute top-2 right-2 z-10 flex items-center gap-1 bg-bg-tertiary/90 rounded-md p-1 backdrop-blur-sm">
            <button class="ib-btn" title="Zoom Out (-)" @click="zoomOut">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
            <button class="ib-btn" title="Zoom In (+)" @click="zoomIn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </button>
            <button class="ib-btn" title="Reset View (0)" @click="resetView">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <span class="text-xs text-text-secondary px-1 min-w-[3rem] text-right">{{ displayScale }}</span>

            <div class="w-px h-4 bg-border mx-1"></div>

            <button class="ib-btn" title="Rotate Left" @click="rotateLeft">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button class="ib-btn" title="Rotate Right" @click="rotateRight">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
              </svg>
            </button>
            <button class="ib-btn" :class="flipH ? 'text-accent-blue' : ''" title="Flip Horizontal" @click="flipHorizontal">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5" />
              </svg>
            </button>
            <button class="ib-btn" :class="flipV ? 'text-accent-blue' : ''" title="Flip Vertical" @click="flipVertical">
              <svg class="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5" />
              </svg>
            </button>

            <div class="w-px h-4 bg-border mx-1"></div>

            <button class="ib-btn" :class="fitMode === 'contain' ? 'bg-accent-blue text-white' : ''" title="Fit to Window" @click="setFitMode('contain')">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button class="ib-btn" :class="fitMode === 'actual' ? 'bg-accent-blue text-white' : ''" title="Actual Size" @click="setFitMode('actual')">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" stroke-width="2" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>

            <div class="w-px h-4 bg-border mx-1"></div>

            <button class="ib-btn" :class="showExif ? 'text-accent-blue' : ''" title="EXIF Info (I)" @click="showExif = !showExif">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- EXIF side panel -->
        <div
          v-if="showExif"
          class="w-64 flex-shrink-0 border-l border-border bg-bg-secondary overflow-y-auto p-3 text-xs space-y-2"
        >
          <div class="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Image Info</div>
          <div v-if="currentFile" class="space-y-1">
            <div class="flex justify-between gap-2"><span class="text-text-tertiary">Name</span><span class="text-text-primary truncate text-right">{{ currentFile.name }}</span></div>
            <div v-if="imageDimensions.width" class="flex justify-between gap-2"><span class="text-text-tertiary">Dimensions</span><span class="text-text-primary">{{ imageDimensions.width }} × {{ imageDimensions.height }}</span></div>
            <div class="flex justify-between gap-2"><span class="text-text-tertiary">Size</span><span class="text-text-primary">{{ formatSize(currentFile.size) }}</span></div>
            <div class="flex justify-between gap-2"><span class="text-text-tertiary">Modified</span><span class="text-text-primary">{{ formatDate(currentFile.modifiedTime) }}</span></div>
          </div>

          <template v-if="exif">
            <div class="pt-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider border-t border-border">Camera</div>
            <div v-if="cameraLabel" class="text-text-primary">{{ cameraLabel }}</div>
            <div v-if="exif.lensModel" class="flex justify-between gap-2"><span class="text-text-tertiary">Lens</span><span class="text-text-primary text-right">{{ exif.lensModel }}</span></div>

            <div class="pt-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider border-t border-border">Exposure</div>
            <div v-if="exif.fNumber != null" class="flex justify-between gap-2"><span class="text-text-tertiary">Aperture</span><span class="text-text-primary">ƒ/{{ exif.fNumber }}</span></div>
            <div v-if="exif.exposureTime != null" class="flex justify-between gap-2"><span class="text-text-tertiary">Shutter</span><span class="text-text-primary">{{ formatExposure(exif.exposureTime) }}</span></div>
            <div v-if="exif.iso != null" class="flex justify-between gap-2"><span class="text-text-tertiary">ISO</span><span class="text-text-primary">{{ exif.iso }}</span></div>
            <div v-if="exif.focalLength != null" class="flex justify-between gap-2"><span class="text-text-tertiary">Focal</span><span class="text-text-primary">{{ exif.focalLength }} mm</span></div>

            <div v-if="exif.dateTimeOriginal" class="pt-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider border-t border-border">Date</div>
            <div v-if="exif.dateTimeOriginal" class="text-text-primary">{{ formatDate(exif.dateTimeOriginal) }}</div>

            <div v-if="exif.gpsLatitude != null && exif.gpsLongitude != null" class="pt-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider border-t border-border">GPS</div>
            <div v-if="exif.gpsLatitude != null && exif.gpsLongitude != null" class="text-text-primary">
              {{ exif.gpsLatitude.toFixed(5) }}, {{ exif.gpsLongitude.toFixed(5) }}
            </div>
          </template>
          <div v-else-if="!loading && !error" class="pt-2 text-text-tertiary">No EXIF data</div>
        </div>
      </div>

      <!-- Footer info bar -->
      <div class="flex-shrink-0 px-4 py-1.5 bg-bg-tertiary border-t border-border text-xs text-text-tertiary flex items-center justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <span v-if="currentFile" class="truncate">{{ currentFile.name }}</span>
          <span v-if="currentFile">{{ formatSize(currentFile.size) }}</span>
          <span v-if="imageDimensions.width">{{ imageDimensions.width }} × {{ imageDimensions.height }}</span>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span>← → navigate</span>
          <span>{{ indexLabel }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useImageBrowser } from './composables/useImageBrowser'

const previewStore = usePreviewStore()

const {
  blobUrl,
  loading,
  error,
  exif,
  imageDimensions,
  nativeDecoded,
  currentFile,
  canPrev,
  canNext,
  indexLabel,
  transformStyle,
  displayScale,
  fitMode,
  flipH,
  flipV,
  isDragging,
  zoomIn,
  zoomOut,
  resetView,
  rotateLeft,
  rotateRight,
  flipHorizontal,
  flipVertical,
  setFitMode,
  handleWheel,
  startDrag,
  handleDrag,
  endDrag,
  handleImageLoad,
  goNext,
  goPrev,
  close
} = useImageBrowser()

const showExif = ref(false)

// Apply EXIF auto-orientation only for renderer-decoded images; sips output is
// already oriented (nativeDecoded === true), so don't double-apply.
const imageStyle = computed<Record<string, string>>(() => {
  const base = transformStyle.value || {}
  return nativeDecoded.value ? base : { ...base, 'image-orientation': 'from-image' }
})

const cameraLabel = computed(() => {
  const e = exif.value
  if (!e) return ''
  return [e.make, e.model].filter(Boolean).join(' ') || ''
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return String(d)
  return date.toLocaleString()
}

function formatExposure(t: number): string {
  if (t >= 1) return t + 's'
  return '1/' + Math.round(1 / t) + 's'
}

// Capture-phase keyboard. Gate on imageBrowserOpen; return true to consume so
// App.vue's bubble-phase Esc handler is skipped while the browser is open.
useKeyInterceptor((e) => {
  if (!previewStore.imageBrowserOpen) return
  switch (e.key) {
    case 'ArrowLeft':
      goPrev()
      return true
    case 'ArrowRight':
      goNext()
      return true
    case 'Escape':
      close()
      return true
    case '+':
    case '=':
      zoomIn()
      return true
    case '-':
      zoomOut()
      return true
    case '0':
      resetView()
      return true
    case 'i':
    case 'I':
      showExif.value = !showExif.value
      return true
  }
})
</script>

<style scoped>
.image-canvas {
  user-select: none;
  -webkit-user-select: none;
}

.ib-btn {
  padding: 0.375rem;
  border-radius: 0.25rem;
  color: inherit;
  transition: background-color 0.15s, color 0.15s;
}
.ib-btn:hover {
  background-color: var(--color-bg-hover, rgba(255, 255, 255, 0.06));
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: all 0.2s ease-out;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
