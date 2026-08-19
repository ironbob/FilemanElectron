<template>
  <div class="finder-preview video-page h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="video-stage flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">{{ $t('preview.video.loading') }}</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="video-stage flex flex-col items-center justify-center h-full text-text-tertiary p-4">
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

    <!-- Video Player（Quick Look 式舞台：中性色画布 + 精确贴合视频的浮层控件） -->
    <div
      v-else
      ref="stageRef"
      class="video-stage relative flex-1 min-h-0 flex items-center justify-center outline-none"
      :class="{ 'is-idle': !controlsVisible }"
      tabindex="0"
      :aria-label="props.file.name"
      @keydown="handleKeydown"
      @pointermove="wakeControls"
      @pointerdown.capture="handleStagePointerDown"
    >
      <!-- 舞台内嵌 12px 呼吸边距；stage 本体无 padding，保证 frameBox 计算确定性 -->
      <div
        v-show="frameBox"
        ref="frameRef"
        class="video-frame relative flex-none"
        :style="frameBox ? { width: frameBox.w + 'px', height: frameBox.h + 'px' } : undefined"
      >
        <!-- Video Element（圆角 12px + 发丝线 + 柔和投影，弱卡片感） -->
        <video
          ref="videoRef"
          :src="videoSrc"
          class="video-media w-full h-full object-contain"
          preload="metadata"
          @loadedmetadata="handleVideoLoad"
          @error="handleVideoError"
          @timeupdate="handleTimeUpdate"
          @ended="handleVideoEnded"
          @play="handlePlay"
          @pause="handlePause"
          @volumechange="handleVolumeChange"
          @click="toggleControlsVisibility"
        ></video>

        <!-- 右上工具栏：倍速 / 画中画 / 全屏 / 分辨率（半透明材质浮层） -->
        <div
          ref="toolbarRef"
          class="video-fade video-topbar absolute top-2 right-2 z-10"
          :class="{ 'is-hidden': !controlsVisible }"
          @pointerenter="controlsHovered = true"
          @pointerleave="controlsHovered = false"
        >
          <div class="video-glass video-glass-chip flex items-center gap-0.5 px-1">
            <!-- Playback Speed（紧凑下拉，NSMenu 观感） -->
            <div ref="speedAnchor" class="relative">
              <button
                ref="speedTriggerRef"
                class="video-tool-button video-speed-trigger"
                :title="$t('preview.video.speedTip')"
                :aria-label="$t('preview.video.speedTip')"
                aria-haspopup="menu"
                :aria-expanded="speedMenuOpen"
                @click="toggleSpeedMenu"
              >
                <span class="tabular-nums">{{ playbackSpeed }}x</span>
                <svg class="video-speed-caret" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                  <path d="M512 661.333333a42.666667 42.666667 0 0 1-30.165333-12.501333l-298.666667-298.666667a42.666667 42.666667 0 0 1 60.330667-60.330666L512 588.501333l268.501333-268.666666a42.666667 42.666667 0 0 1 60.330667 60.330666l-298.666667 298.666667A42.666667 42.666667 0 0 1 512 661.333333z" />
                </svg>
              </button>

              <!-- 倍速菜单（Finder 半透明 NSMenu 材质；当前档位打勾）——锚定弹层防裁剪 -->
              <AnchoredPopover v-if="speedMenuOpen" :anchor="speedAnchor" align="right" class="video-menu" role="menu" :aria-label="$t('preview.video.speedTip')">
                <button
                  v-for="rate in SPEED_OPTIONS"
                  :key="rate"
                  class="video-menu-item"
                  role="menuitemradio"
                  :aria-checked="playbackSpeed === rate"
                  @click="selectSpeed(rate)"
                >
                  <svg
                    class="video-menu-check"
                    :class="{ 'is-on': playbackSpeed === rate }"
                    viewBox="0 0 1024 1024"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="100"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M240 544l192 192 352-448" />
                  </svg>
                  <span class="tabular-nums">{{ rate }}x</span>
                </button>
              </AnchoredPopover>
            </div>

            <!-- Picture-in-Picture -->
            <button
              class="video-tool-button"
              :disabled="!isPiPSupported"
              :title="$t('preview.video.pipTip')"
              :aria-label="$t('preview.video.pipTip')"
              @click="togglePiP"
            >
              <PipIcon class="video-tool-icon" />
            </button>

            <!-- Fullscreen -->
            <button
              class="video-tool-button"
              :title="$t('preview.video.fullscreenTip')"
              :aria-label="$t('preview.video.fullscreenTip')"
              @click="toggleFullscreen"
            >
              <FullScreenIcon class="video-tool-icon" />
            </button>

            <!-- Resolution（次要信息，低视觉权重） -->
            <span
              v-if="resolution.width && resolution.height"
              class="video-resolution tabular-nums"
            >{{ resolution.width }} × {{ resolution.height }}</span>
          </div>
        </div>

        <!-- 底部播放控制条（Quick Look 半透明材质，宽度跟随视频区域） -->
        <div
          ref="barRef"
          class="video-fade video-controls absolute bottom-2 left-2 right-2 z-10"
          :class="{ 'is-hidden': !controlsVisible }"
          @pointerenter="controlsHovered = true"
          @pointerleave="controlsHovered = false"
        >
          <div class="video-glass video-glass-bar">
            <!-- Progress（细 scrubber：蓝=已播 / 浅灰=未播 / 更亮=已缓冲） -->
            <div
              class="video-scrubber"
              :class="{ 'is-dragging': isDragging }"
              role="slider"
              tabindex="0"
              :aria-label="$t('preview.video.progressAria')"
              :aria-valuemin="0"
              :aria-valuemax="Math.round(duration) || 0"
              :aria-valuenow="Math.round(currentTime)"
              :aria-valuetext="`${formatTime(currentTime)} / ${formatTime(duration)}`"
              @pointerdown="startScrub"
              @keydown="handleScrubberKeydown"
            >
              <div class="video-scrubber-rail">
                <div
                  v-if="bufferedPercent > 0"
                  class="video-scrubber-buffered"
                  :style="{ width: bufferedPercent + '%' }"
                ></div>
                <div
                  class="video-scrubber-played"
                  :style="{ width: progressPercent + '%' }"
                ></div>
                <div
                  class="video-scrubber-thumb"
                  :style="{ left: `calc(${progressPercent}% - 6px)` }"
                ></div>
              </div>
              <!-- 拖动时的当前时间气泡 -->
              <div v-if="isDragging" class="video-scrubber-bubble" :style="{ left: progressPercent + '%' }">
                {{ formatTime(currentTime) }}
              </div>
            </div>

            <!-- Control Buttons Row（28-32px 热区 + 17-18px 图标，间距分组） -->
            <div class="flex items-center gap-1 mt-1">
              <button
                class="video-ctl-button"
                :title="$t('preview.video.back10Tip')"
                :aria-label="$t('preview.video.back10Tip')"
                @click="skipBackward"
              >
                <SkipBackIcon class="video-ctl-icon" />
              </button>

              <button
                class="video-ctl-play"
                :title="isPlaying ? $t('preview.video.pauseTip') : $t('preview.video.playTip')"
                :aria-label="isPlaying ? $t('preview.video.pauseTip') : $t('preview.video.playTip')"
                @click="togglePlay"
              >
                <PauseIcon v-if="isPlaying" class="video-ctl-icon-play" />
                <PlayIcon v-else class="video-ctl-icon-play video-ctl-icon-play-offset" />
              </button>

              <button
                class="video-ctl-button"
                :title="$t('preview.video.forward10Tip')"
                :aria-label="$t('preview.video.forward10Tip')"
                @click="skipForward"
              >
                <SkipForwardIcon class="video-ctl-icon" />
              </button>

              <!-- Time Display -->
              <span class="video-time tabular-nums ml-1.5">
                {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
              </span>

              <div class="flex-1"></div>

              <!-- Volume Control（hover / 聚焦展开滑条） -->
              <div class="video-volume flex items-center group/volume">
                <button
                  class="video-ctl-button"
                  :title="$t('preview.video.muteTip')"
                  :aria-label="$t('preview.video.muteTip')"
                  @click="toggleMute"
                >
                  <VolumeMuteIcon v-if="isMuted || volume === 0" class="video-ctl-icon" />
                  <VolumeIcon v-else class="video-ctl-icon" />
                </button>
                <input
                  v-model.number="volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="video-volume-slider"
                  :style="{ '--video-volume-fill': volumeFill + '%' }"
                  :aria-label="$t('preview.video.volumeAria')"
                  @input="handleVolumeInput"
                  @keydown.stop
                />
              </div>
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
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import AnchoredPopover from '@/components/menu/AnchoredPopover.vue'
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
const stageRef = ref<HTMLElement | null>(null)
const frameRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const barRef = ref<HTMLElement | null>(null)
const speedTriggerRef = ref<HTMLButtonElement | null>(null)
const duration = ref(0)
const currentTime = ref(0)
const bufferedPercent = ref(0)
const resolution = ref({ width: 0, height: 0 })

// Playback state
const isPlaying = ref(false)
const playbackSpeed = ref(1)
const volume = ref(1)
const isMuted = ref(false)
const isDragging = ref(false)
const controlsVisible = ref(true)
// 倍速菜单锚点（触发钮外包 .relative 容器）——AnchoredPopover 以其 rect 定位
const speedAnchor = ref<HTMLElement | null>(null)
const controlsHovered = ref(false)
const speedMenuOpen = ref(false)
/** 舞台内视频贴合框（contain 计算；null = 元数据未就绪不渲染） */
const frameBox = ref<{ w: number; h: number } | null>(null)

// Constants
const VOLUME_STORAGE_KEY = 'fileman-video-volume'
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
/** 控件静止自动淡出延迟（播放中）；Quick Look ≈ 3s */
const CONTROLS_IDLE_MS = 2600
/** 舞台到视频贴合框的呼吸边距（frameBox 计算用，stage 本体无 padding） */
const STAGE_MARGIN = 12

// Computed
const progressPercent = computed(() => {
  if (duration.value === 0) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})

const volumeFill = computed(() => Math.round((isMuted.value ? 0 : volume.value) * 100))

const isPiPSupported = computed(() => {
  return 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
})

// ── 舞台贴合布局：视频原始宽高比 + contain 进舞台（减呼吸边距） ──────────────
let resizeObserver: ResizeObserver | null = null

function layoutFrame(): void {
  const stage = stageRef.value
  const video = videoRef.value
  if (!stage || !video || !video.videoWidth || !video.videoHeight) return
  const aspect = video.videoWidth / video.videoHeight
  const availW = Math.max(0, stage.clientWidth - STAGE_MARGIN * 2)
  const availH = Math.max(0, stage.clientHeight - STAGE_MARGIN * 2)
  let w = availW
  let h = w / aspect
  if (h > availH) {
    h = availH
    w = h * aspect
  }
  frameBox.value = { w: Math.floor(w), h: Math.floor(h) }
}

// ── 控件淡入淡出：播放中静止 CONTROLS_IDLE_MS 后隐藏，指针移动/暂停即唤醒 ────
let hideTimer: number | undefined

function wakeControls(): void {
  if (controlsVisible.value && hideTimer !== undefined) return
  controlsVisible.value = true
  scheduleHide()
}

function scheduleHide(): void {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined
    // 暂停/停止：保持常显，不再排程（避免空转定时器）
    if (!isPlaying.value) return
    // 瞬态在场（菜单/拖拽/悬停/控件焦点）：稍后再试
    if (!canAutoHide()) {
      scheduleHide()
      return
    }
    controlsVisible.value = false
  }, CONTROLS_IDLE_MS)
}

/** 自动隐藏的门槛：播放中，且菜单/拖拽/悬停/控件焦点任一在场则保持可见 */
function canAutoHide(): boolean {
  if (!isPlaying.value) return false
  if (speedMenuOpen.value || isDragging.value || controlsHovered.value) return false
  if (toolbarRef.value?.matches(':focus-within')) return false
  if (barRef.value?.matches(':focus-within')) return false
  return true
}

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
  frameBox.value = null
  controlsVisible.value = true

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
    layoutFrame()
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
  controlsVisible.value = true
}

function handlePlay() {
  isPlaying.value = true
  scheduleHide()
}

function handlePause() {
  isPlaying.value = false
  controlsVisible.value = true
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
  controlsVisible.value = !controlsVisible.value
  if (controlsVisible.value) scheduleHide()
}

// ── 倍速菜单 ────────────────────────────────────────────────────────────────
function toggleSpeedMenu() {
  speedMenuOpen.value = !speedMenuOpen.value
}

function selectSpeed(rate: number) {
  playbackSpeed.value = rate
  applySpeed()
  closeSpeedMenu()
}

function applySpeed() {
  if (videoRef.value) {
    videoRef.value.playbackRate = playbackSpeed.value
    log('Playback speed changed to:', playbackSpeed.value)
  }
}

function closeSpeedMenu(): void {
  if (!speedMenuOpen.value) return
  speedMenuOpen.value = false
  // 归还焦点给触发钮，键盘链路不断线
  speedTriggerRef.value?.focus()
}

/** 舞台捕获阶段 pointerdown：倍速菜单外点击收起菜单 */
function handleStagePointerDown(e: PointerEvent) {
  if (!speedMenuOpen.value) return
  const target = e.target as HTMLElement
  if (target.closest('.video-menu') || target.closest('.video-speed-trigger')) return
  speedMenuOpen.value = false
}

// Esc 关闭倍速菜单（捕获阶段消费，优先于 App/预览层快捷键）
useKeyInterceptor(e => {
  if (!speedMenuOpen.value) return false
  if (e.key === 'Escape') {
    e.preventDefault()
    closeSpeedMenu()
    return true
  }
  return false
})

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

// ── 进度 scrubber：pointer 捕获式拖动（按下即定位，移动实时 seek） ────────────
function seekByClientX(x: number, rail: HTMLElement) {
  if (!videoRef.value) return
  const rect = rail.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
  videoRef.value.currentTime = percent * duration.value
}

function startScrub(e: PointerEvent) {
  if (!videoRef.value || duration.value <= 0) return
  const scrubber = e.currentTarget as HTMLElement
  const rail = scrubber.querySelector('.video-scrubber-rail') as HTMLElement | null
  if (!rail) return

  isDragging.value = true
  scrubber.setPointerCapture(e.pointerId)
  seekByClientX(e.clientX, rail)

  const onMove = (moveEvent: PointerEvent) => {
    if (!isDragging.value) return
    seekByClientX(moveEvent.clientX, rail)
  }
  const onUp = () => {
    isDragging.value = false
    scrubber.removeEventListener('pointermove', onMove)
    scrubber.removeEventListener('pointerup', onUp)
    scrubber.removeEventListener('pointercancel', onUp)
    // 拖完继续走自动隐藏计时
    scheduleHide()
  }
  scrubber.addEventListener('pointermove', onMove)
  scrubber.addEventListener('pointerup', onUp)
  scrubber.addEventListener('pointercancel', onUp)
}

/** scrubber 聚焦时的键盘步进（±5s；stopPropagation 防与舞台级按键叠加） */
function handleScrubberKeydown(e: KeyboardEvent) {
  if (duration.value <= 0) return
  const step = e.shiftKey ? 1 : 5
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    e.stopPropagation()
    if (videoRef.value) videoRef.value.currentTime = Math.max(videoRef.value.currentTime - step, 0)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    e.stopPropagation()
    if (videoRef.value) videoRef.value.currentTime = Math.min(videoRef.value.currentTime + step, duration.value)
  }
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
  if (!frameRef.value) return

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      log('Exited fullscreen mode')
    } else {
      // 对贴合框全屏（含控制条），而不是裸 video——控件在全屏中仍然在场
      await frameRef.value.requestFullscreen()
      log('Entered fullscreen mode')
    }
  } catch (e) {
    console.error('[PreviewVideoContent] Fullscreen error:', e)
  }
}

// Keyboard shortcuts（舞台聚焦时；表单控件内的按键交给控件自身）
function handleKeydown(e: KeyboardEvent) {
  if (!videoRef.value) return
  const target = e.target as HTMLElement
  if (target !== stageRef.value) return

  switch (e.key) {
    case ' ':
      e.preventDefault()
      wakeControls()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      wakeControls()
      skipBackward()
      break
    case 'ArrowRight':
      e.preventDefault()
      wakeControls()
      skipForward()
      break
    case 'ArrowUp':
      e.preventDefault()
      wakeControls()
      volume.value = Math.min(volume.value + 0.1, 1)
      handleVolumeInput()
      break
    case 'ArrowDown':
      e.preventDefault()
      wakeControls()
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

// Watch for play state: re-arm auto-hide when resuming
watch(isPlaying, playing => {
  if (playing) scheduleHide()
})

// 舞台在 v-else 分支渲染（loading/error 期间不存在）：ref 就绪即挂观察器
watch(stageRef, el => {
  resizeObserver?.disconnect()
  if (el) {
    resizeObserver = new ResizeObserver(() => layoutFrame())
    resizeObserver.observe(el)
    layoutFrame()
  }
})

// Cleanup
onUnmounted(() => {
  log('Component unmounting, cleaning up')
  window.clearTimeout(hideTimer)
  resizeObserver?.disconnect()
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
/* ── Quick Look 式舞台：窗口同材质的中性画布（暗色与 --finder-canvas 无缝，
      浅色用克制系统灰，避免纵向视频两侧出现大面积纯白） ──────────────────── */
.video-stage {
  background: var(--finder-canvas);
}

[data-theme='light'] .video-stage {
  background: #ececf1;
}

/* 控件静止隐藏时同步藏光标（Quick Look 语义） */
.video-stage.is-idle {
  cursor: none;
}

/* ── 视频本体：12px 圆角 + 发丝线 + 柔和投影（弱卡片感） ───────────────────── */
.video-media {
  border-radius: 12px;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.10), 0 8px 24px rgba(0, 0, 0, 0.14);
  background: #000;
}

/* ── 半透明 macOS 材质（控制条 / 工具栏共用） ──────────────────────────────── */
.video-glass {
  background: rgba(35, 35, 37, 0.72);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.92);
}

.video-glass-bar {
  border-radius: 12px;
  padding: 7px 10px 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
}

.video-glass-chip {
  border-radius: 10px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.20);
}

/* ── 控件淡入淡出（160-220ms，无跳变；隐藏态不拦截指针） ──────────────────── */
.video-fade {
  transition: opacity 200ms ease, transform 200ms ease;
}

.video-fade.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.video-controls.video-fade {
  transform: translateY(0);
}

.video-controls.video-fade.is-hidden {
  transform: translateY(6px);
}

.video-topbar.video-fade {
  transform: translateY(0);
}

.video-topbar.video-fade.is-hidden {
  transform: translateY(-4px);
}

/* ── 底部按钮：28-32px 热区 + 17-18px 图标，低对比度 Hover/Pressed ─────────── */
.video-ctl-button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.88);
  background: transparent;
  transition: background-color 130ms ease, color 130ms ease;
}

.video-ctl-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.video-ctl-button:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.20);
}

.video-ctl-button:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

.video-ctl-icon {
  width: 17px;
  height: 17px;
}

/* 播放钮：克制的圆形强调（半透明白底，不做实心白钮） */
.video-ctl-play {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  transition: background-color 130ms ease, transform 130ms ease;
}

.video-ctl-play:hover {
  background: rgba(255, 255, 255, 0.22);
}

.video-ctl-play:active {
  background: rgba(255, 255, 255, 0.28);
  transform: scale(0.96);
}

.video-ctl-icon-play {
  width: 18px;
  height: 18px;
}

.video-ctl-icon-play-offset {
  margin-left: 2px;
}

/* 时间：系统字体 + tabular-nums，高对比浅色 */
.video-time {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
}

/* ── 进度 scrubber：细轨 + 系统蓝已播 + 悬停/拖动显 thumb ──────────────────── */
.video-scrubber {
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.video-scrubber-rail {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  overflow: visible;
}

.video-scrubber-buffered {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.30);
}

.video-scrubber-played {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: #0a84ff;
}

.video-scrubber-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  transform: translateY(-50%) scale(0.4);
  opacity: 0;
  transition: opacity 140ms ease, transform 140ms ease;
}

.video-scrubber:hover .video-scrubber-thumb,
.video-scrubber:focus-visible .video-scrubber-thumb,
.video-scrubber.is-dragging .video-scrubber-thumb {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.video-scrubber:focus {
  outline: none;
}

.video-scrubber:focus-visible .video-scrubber-rail {
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.35);
}

/* 拖动时间气泡 */
.video-scrubber-bubble {
  position: absolute;
  bottom: 100%;
  margin-bottom: 6px;
  transform: translateX(-50%);
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(35, 35, 37, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* ── 右上工具栏按钮 ────────────────────────────────────────────────────────── */
.video-tool-button {
  height: 28px;
  min-width: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0 5px;
  border: 0;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.88);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  transition: background-color 130ms ease, color 130ms ease;
}

.video-tool-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.video-tool-button:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.20);
}

.video-tool-button:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

.video-tool-icon {
  width: 17px;
  height: 17px;
}

.video-speed-caret {
  width: 9px;
  height: 9px;
  color: rgba(255, 255, 255, 0.55);
}

.video-resolution {
  padding: 0 6px 0 4px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.58);
  white-space: nowrap;
}

/* ── 倍速菜单：NSMenu 材质（半透明 + blur(28px) saturate(1.8)，蓝底白字选中） ─ */
.video-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 92px;
  padding: 5px 0;
  border-radius: 12px;
  background: rgba(44, 44, 48, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5), 0 3px 10px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(28px) saturate(1.8);
  -webkit-backdrop-filter: blur(28px) saturate(1.8);
  animation: video-menu-in 90ms ease-out;
}

@keyframes video-menu-in {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.video-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 12px 0 10px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  transition: background-color 90ms ease, color 90ms ease;
}

.video-menu-item:hover {
  background: #0a84ff;
  color: #fff;
}

.video-menu-check {
  width: 12px;
  height: 12px;
  flex: none;
  opacity: 0;
}

.video-menu-check.is-on {
  opacity: 1;
}

.video-menu-item:hover .video-menu-check {
  color: rgba(255, 255, 255, 0.92);
}

/* ── 音量滑条：hover/聚焦展开；填充随值 ────────────────────────────────────── */
.video-volume-slider {
  width: 0;
  height: 14px;
  margin: 0;
  opacity: 0;
  appearance: none;
  -webkit-appearance: none;
  background: linear-gradient(to right, rgba(255, 255, 255, 0.95) var(--video-volume-fill, 100%), rgba(255, 255, 255, 0.28) var(--video-volume-fill, 100%));
  background-size: 100% 3px;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 2px;
  cursor: pointer;
  transition: width 200ms ease, opacity 200ms ease;
}

.group\/volume:hover .video-volume-slider,
.video-volume-slider:focus-visible,
.video-volume-slider:focus {
  width: 64px;
  opacity: 1;
}

.video-volume-slider::-webkit-slider-runnable-track {
  height: 3px;
  background: transparent;
}

.video-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  margin-top: -4px;
}

.video-volume-slider:focus {
  outline: none;
}

.video-volume-slider:focus-visible {
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.35);
  border-radius: 3px;
}

/* ── 键盘焦点环（macOS 低对比度强调） ─────────────────────────────────────── */
.video-ctl-button:focus-visible,
.video-ctl-play:focus-visible,
.video-tool-button:focus-visible {
  outline: 2px solid rgba(10, 132, 255, 0.9);
  outline-offset: 1px;
}

/* Hide default video controls */
video::-webkit-media-controls {
  display: none !important;
}

video::-webkit-media-controls-enclosure {
  display: none !important;
}
</style>
