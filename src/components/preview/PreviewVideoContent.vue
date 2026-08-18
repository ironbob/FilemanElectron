<template>
  <div class="finder-preview h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">{{ $t('preview.video.loading') }}</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <CautionIcon class="w-12 h-12 mb-3 text-red-400" />
      <p class="text-sm font-medium text-text-primary mb-1">{{ $t('preview.video.playbackFailed') }}</p>
      <p class="text-xs">{{ errorMessage }}</p>
      <div class="flex items-center gap-2 mt-4">
        <button
          class="px-3 py-1.5 text-xs rounded bg-accent-blue text-white hover:opacity-90"
          @click="openAsHex"
        >{{ $t('preview.common.viewAsHex') }}</button>
        <button
          v-if="isLocal"
          class="px-3 py-1.5 text-xs rounded bg-bg-hover text-text-secondary hover:bg-bg-active"
          @click="openWithSystem"
        >{{ $t('preview.common.openWithSystem') }}</button>
      </div>
    </div>

    <!-- Video Player -->
    <div v-else class="flex-1 flex flex-col overflow-hidden relative min-h-0">
      <!-- Video Controls Toolbar -->
      <div
        v-show="showControls"
        class="finder-preview-floating-toolbar absolute top-2 right-2 z-10 flex items-center gap-1 transition-opacity"
      >
        <!-- Playback Speed -->
        <select
          v-model="playbackSpeed"
          class="h-7 text-xs bg-transparent text-text-secondary border-none outline-none px-1"
          @change="handleSpeedChange"
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>

        <div class="finder-toolbar-divider"></div>

        <!-- Picture-in-Picture -->
        <button
          class="finder-icon-button"
          :disabled="!isPiPSupported"
          @click="togglePiP"
          :title="$t('preview.video.pipTip')"
        >
          <PipIcon class="w-4 h-4" />
        </button>

        <div class="finder-toolbar-divider"></div>

        <!-- Fullscreen -->
        <button
          class="finder-icon-button"
          @click="toggleFullscreen"
          :title="$t('preview.video.fullscreenTip')"
        >
          <FullScreenIcon class="w-4 h-4" />
        </button>

        <div class="finder-toolbar-divider"></div>

        <!-- Resolution Info -->
        <div v-if="resolution.width && resolution.height" class="text-xs text-text-secondary px-1">
          {{ resolution.width }} x {{ resolution.height }}
        </div>
      </div>

      <!-- Video Element -->
      <div
        class="flex-1 min-h-0 flex items-center justify-center p-4"
        @keydown="handleKeydown"
        @click="toggleControlsVisibility"
      >
        <video
          ref="videoRef"
          :src="videoSrc"
          class="max-w-full max-h-full h-full object-contain rounded-lg shadow-md"
          preload="metadata"
          @loadedmetadata="handleVideoLoad"
          @error="handleVideoError"
          @timeupdate="handleTimeUpdate"
          @ended="handleVideoEnded"
          @play="handlePlay"
          @pause="handlePause"
          @volumechange="handleVolumeChange"
        ></video>
      </div>

      <!-- QuickTime-style Floating Controls -->
      <div
        v-show="showControls"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-xl transition-opacity"
      >
        <div class="backdrop-blur-xl bg-black/50 rounded-2xl p-3 shadow-lg">
          <!-- Progress Bar -->
          <div
            class="relative h-1 bg-white/20 rounded-full mb-3 group"
            @click="seekTo"
            @mousedown="startDrag"
          >
            <!-- Buffered -->
            <div
              v-if="bufferedPercent > 0"
              class="absolute h-full bg-white/30 rounded-full"
              :style="{ width: bufferedPercent + '%' }"
            ></div>
            <!-- Progress -->
            <div
              class="absolute h-full bg-white rounded-full transition-all"
              :style="{ width: progressPercent + '%' }"
            ></div>
            <!-- Draggable Thumb -->
            <div
              class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              :style="{ left: `calc(${progressPercent}% - 6px)` }"
            ></div>
          </div>

          <!-- Control Buttons Row -->
          <div class="flex items-center justify-center gap-2">
            <!-- Skip Backward -10s -->
            <button
              class="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/20 transition-all"
              @click="skipBackward"
              :title="$t('preview.video.back10Tip')"
            >
              <SkipBackIcon class="w-5 h-5" />
            </button>

            <!-- Play/Pause (prominent) -->
            <button
              class="w-10 h-10 rounded-full bg-white text-gray-900 flex items-center justify-center hover:bg-white/90 transition-all shadow-md"
              @click="togglePlay"
            >
              <PauseIcon v-if="isPlaying" class="w-5 h-5" />
              <PlayIcon v-else class="w-5 h-5 ml-0.5" />
            </button>

            <!-- Skip Forward +10s -->
            <button
              class="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/20 transition-all"
              @click="skipForward"
              :title="$t('preview.video.forward10Tip')"
            >
              <SkipForwardIcon class="w-5 h-5" />
            </button>

            <!-- Time Display -->
            <span class="text-xs text-white/70 font-mono mx-3 min-w-[80px]">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>

            <!-- Volume Control -->
            <div class="flex items-center gap-1 group/volume">
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/20 transition-all"
                @click="toggleMute"
                :title="$t('preview.video.muteTip')"
              >
                <VolumeMuteIcon v-if="isMuted || volume === 0" class="w-4 h-4" />
                <VolumeIcon v-else class="w-4 h-4" />
              </button>
              <input
                v-model="volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-0 group-hover/volume:w-16 h-1 bg-white/30 rounded-full appearance-none transition-all duration-200 overflow-hidden"
                @input="handleVolumeInput"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import { usePreviewStore } from '@/stores/preview'
import {
  CautionIcon,
  FullScreenIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMuteIcon
} from '@/components/icons/videoPlayerIcons'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewVideoContent] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

// State
const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const videoSrc = ref('')
const videoRef = ref<HTMLVideoElement | null>(null)
const duration = ref(0)
const currentTime = ref(0)
const bufferedPercent = ref(0)
const resolution = ref({ width: 0, height: 0 })

// Playback state
const isPlaying = ref(false)
const playbackSpeed = ref(1)
const volume = ref(1)
const isMuted = ref(false)
const showControls = ref(true)
const isDragging = ref(false)

// Constants
const VOLUME_STORAGE_KEY = 'fileman-video-volume'

// Computed
const progressPercent = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const isPiPSupported = computed(() => {
  return 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
})

// Helper functions
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

// Load saved volume
function loadSavedVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_STORAGE_KEY)
    if (saved !== null) {
      const vol = parseFloat(saved)
      if (!isNaN(vol) && vol >= 0 && vol <= 1) {
        volume.value = vol
        if (videoRef.value) {
          videoRef.value.volume = vol
        }
      }
    }
  } catch (e) {
    console.error('[PreviewVideoContent] Error loading saved volume:', e)
  }
}

// Save volume
function saveVolume(vol: number) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, vol.toString())
  } catch (e) {
    console.error('[PreviewVideoContent] Error saving volume:', e)
  }
}

/** 媒体预览整体载入上限（video/audio 走 readFile 全量 Blob，无流式）。 */
const MEDIA_PREVIEW_BYTE_LIMIT = 200 * 1024 * 1024

const previewStore = usePreviewStore()
const isLocal = computed(() => props.deviceId === 'local')

/** 就地切换当前 tab 为 hex（openPreview 按 path+deviceId 去重并更新 forceType）。 */
function openAsHex(): void {
  previewStore.openPreview(props.file, props.deviceId, undefined, 'hex')
}

function openWithSystem(): void {
  window.fileman.openDefault(props.file.path).catch(err => {
    console.error('[PreviewVideoContent] openDefault failed:', err)
  })
}

// Load video
async function loadContent() {
  log('Loading video:', props.file.name, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  // Clean up previous video source
  if (videoSrc.value) {
    URL.revokeObjectURL(videoSrc.value)
    videoSrc.value = ''
  }

  // Reset state
  currentTime.value = 0
  duration.value = 0
  bufferedPercent.value = 0
  isPlaying.value = false
  showControls.value = true

  // 整读进 Blob（无流式）：超大文件拒载，避免远程设备整读阻塞/内存暴涨
  if (props.file.size > MEDIA_PREVIEW_BYTE_LIMIT) {
    hasError.value = true
    errorMessage.value = t('preview.common.mediaOversized', {
      size: (props.file.size / 1024 / 1024).toFixed(0),
      limit: MEDIA_PREVIEW_BYTE_LIMIT / 1024 / 1024
    })
    loading.value = false
    return
  }

  try {
    log('Reading file from device:', props.deviceId, 'path:', props.file.path)
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    log('File read successfully, base64 length:', base64.length)

    const buffer = base64ToArrayBuffer(base64)
    log('Buffer size:', buffer.byteLength)

    const mimeType = getMimeType(props.file.extension || '')
    log('MIME type:', mimeType)

    const blob = new Blob([buffer], { type: mimeType })
    videoSrc.value = URL.createObjectURL(blob)
    log('Blob URL created:', videoSrc.value)
  } catch (e) {
    console.error('[PreviewVideoContent] Error loading video:', e)
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : t('preview.common.unknownError')
  } finally {
    loading.value = false
  }
}

// Video event handlers
function handleVideoLoad() {
  log('Video loaded metadata')
  if (videoRef.value) {
    duration.value = videoRef.value.duration
    resolution.value = {
      width: videoRef.value.videoWidth,
      height: videoRef.value.videoHeight
    }
    log('Video duration:', duration.value, 'resolution:', resolution.value)

    // Load saved volume
    loadSavedVolume()
  }
}

function handleVideoError(e: Event) {
  console.error('[PreviewVideoContent] Video error:', e)
  hasError.value = true
  const video = e.target as HTMLVideoElement
  if (video.error) {
    switch (video.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorMessage.value = t('preview.video.errAborted')
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorMessage.value = t('preview.video.errNetwork')
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorMessage.value = t('preview.video.errDecode')
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorMessage.value = t('preview.video.errUnsupported')
        break
      default:
        errorMessage.value = t('preview.video.errUnknown')
    }
  }
}

function handleTimeUpdate() {
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime

    // Update buffered percentage
    if (videoRef.value.buffered.length > 0) {
      const bufferedEnd = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
      bufferedPercent.value = (bufferedEnd / duration.value) * 100
    }
  }
}

function handleVideoEnded() {
  log('Video playback ended')
  isPlaying.value = false
}

function handlePlay() {
  isPlaying.value = true
}

function handlePause() {
  isPlaying.value = false
}

function handleVolumeChange() {
  if (videoRef.value) {
    isMuted.value = videoRef.value.muted
  }
}

// Playback controls
function togglePlay() {
  if (!videoRef.value) return

  if (videoRef.value.paused) {
    videoRef.value.play()
  } else {
    videoRef.value.pause()
  }
}

function toggleControlsVisibility() {
  showControls.value = !showControls.value
}

function handleSpeedChange() {
  if (videoRef.value) {
    videoRef.value.playbackRate = playbackSpeed.value
    log('Playback speed changed to:', playbackSpeed.value)
  }
}

function skipForward() {
  if (videoRef.value) {
    videoRef.value.currentTime = Math.min(videoRef.value.currentTime + 10, duration.value)
  }
}

function skipBackward() {
  if (videoRef.value) {
    videoRef.value.currentTime = Math.max(videoRef.value.currentTime - 10, 0)
  }
}

function seekTo(e: MouseEvent) {
  if (!videoRef.value) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  videoRef.value.currentTime = percent * duration.value
}

// Progress bar drag
function startDrag(e: MouseEvent) {
  if (!videoRef.value) return
  isDragging.value = true

  const onMove = (moveEvent: MouseEvent) => {
    if (!videoRef.value || !isDragging.value) return
    const progressBar = e.currentTarget as HTMLElement
    const rect = progressBar.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width))
    videoRef.value.currentTime = percent * duration.value
  }

  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function toggleMute() {
  if (videoRef.value) {
    videoRef.value.muted = !videoRef.value.muted
  }
}

function handleVolumeInput() {
  if (videoRef.value) {
    videoRef.value.volume = volume.value
    saveVolume(volume.value)

    if (volume.value > 0 && videoRef.value.muted) {
      videoRef.value.muted = false
    }
  }
}

async function togglePiP() {
  if (!videoRef.value || !isPiPSupported.value) return

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
      log('Exited Picture-in-Picture mode')
    } else {
      await videoRef.value.requestPictureInPicture()
      log('Entered Picture-in-Picture mode')
    }
  } catch (e) {
    console.error('[PreviewVideoContent] PiP error:', e)
  }
}

async function toggleFullscreen() {
  if (!videoRef.value) return

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      log('Exited fullscreen mode')
    } else {
      await videoRef.value.requestFullscreen()
      log('Entered fullscreen mode')
    }
  } catch (e) {
    console.error('[PreviewVideoContent] Fullscreen error:', e)
  }
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (!videoRef.value) return

  switch (e.key) {
    case ' ':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      skipBackward()
      break
    case 'ArrowRight':
      e.preventDefault()
      skipForward()
      break
    case 'ArrowUp':
      e.preventDefault()
      volume.value = Math.min(volume.value + 0.1, 1)
      handleVolumeInput()
      break
    case 'ArrowDown':
      e.preventDefault()
      volume.value = Math.max(volume.value - 0.1, 0)
      handleVolumeInput()
      break
    case 'f':
    case 'F':
      e.preventDefault()
      toggleFullscreen()
      break
    case 'm':
    case 'M':
      e.preventDefault()
      toggleMute()
      break
  }
}

// Watch for file changes
watch(() => props.file, (newFile, oldFile) => {
  if (newFile && newFile.path !== oldFile?.path) {
    loadContent()
  }
}, { immediate: true })

// Cleanup
onUnmounted(() => {
  log('Component unmounting, cleaning up')
  if (videoSrc.value) {
    URL.revokeObjectURL(videoSrc.value)
  }
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.src = ''
    videoRef.value.load()
  }
})

// Focus video container for keyboard events
onMounted(() => {
  // Set initial volume
  loadSavedVolume()
})
</script>

<style scoped>
/* Custom range slider for QuickTime-style controls */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}

input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  margin-top: -4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

input[type="range"]:focus {
  outline: none;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* Hide default video controls */
video::-webkit-media-controls {
  display: none !important;
}

video::-webkit-media-controls-enclosure {
  display: none !important;
}
</style>
