<template>
  <div class="finder-preview h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">Loading audio...</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">无法播放音频</p>
      <p class="text-xs">{{ errorMessage }}</p>
      <div class="flex items-center gap-2 mt-4">
        <button
          class="px-3 py-1.5 text-xs rounded bg-accent-blue text-white hover:opacity-90"
          @click="openAsHex"
        >以十六进制查看</button>
        <button
          v-if="isLocal"
          class="px-3 py-1.5 text-xs rounded bg-bg-hover text-text-secondary hover:bg-bg-active"
          @click="openWithSystem"
        >用系统默认应用打开</button>
      </div>
    </div>

    <!-- Audio Player -->
    <div v-else class="flex-1 flex flex-col items-center justify-center p-6">
      <!-- Audio Icon -->
      <div class="w-32 h-32 rounded-2xl bg-accent-blue/10 flex items-center justify-center mb-6 shadow-sm border border-border">
        <IconfontIcon name="play" size="lg" class="text-accent-blue text-5xl" />
      </div>

      <!-- File Name -->
      <p class="text-lg font-medium text-text-primary mb-2 text-center max-w-md truncate">{{ file.name }}</p>

      <!-- Audio Element -->
      <audio
        ref="audioRef"
        :src="audioSrc"
        class="w-full max-w-md"
        controls
        preload="metadata"
        @loadedmetadata="handleAudioLoad"
        @error="handleAudioError"
        @timeupdate="handleTimeUpdate"
        @ended="handleAudioEnded"
      >
        Your browser does not support audio playback.
      </audio>

      <!-- Audio Info -->
      <div class="mt-4 text-center text-text-tertiary text-sm">
        <span>{{ formatSize(file.size) }}</span>
        <span v-if="duration > 0" class="mx-2">|</span>
        <span v-if="duration > 0">{{ formatTime(duration) }}</span>
        <span class="mx-2">|</span>
        <span class="uppercase">{{ file.extension?.replace('.', '') || 'Audio' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import { usePreviewStore } from '@/stores/preview'
import IconfontIcon from './IconfontIcon.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewAudioContent] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const audioSrc = ref('')
const audioRef = ref<HTMLAudioElement | null>(null)
const duration = ref(0)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
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

/** 媒体预览整体载入上限（与 PreviewVideoContent 一致）。 */
const MEDIA_PREVIEW_BYTE_LIMIT = 200 * 1024 * 1024

const previewStore = usePreviewStore()
const isLocal = computed(() => props.deviceId === 'local')

/** 就地切换当前 tab 为 hex（openPreview 按 path+deviceId 去重并更新 forceType）。 */
function openAsHex(): void {
  previewStore.openPreview(props.file, props.deviceId, undefined, 'hex')
}

function openWithSystem(): void {
  window.fileman.openDefault(props.file.path).catch(err => {
    console.error('[PreviewAudioContent] openDefault failed:', err)
  })
}

async function loadContent() {
  log('Loading audio:', props.file.name, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  // Clean up previous audio source
  if (audioSrc.value) {
    URL.revokeObjectURL(audioSrc.value)
    audioSrc.value = ''
  }

  // 整读进 Blob（无流式）：超大文件拒载
  if (props.file.size > MEDIA_PREVIEW_BYTE_LIMIT) {
    hasError.value = true
    errorMessage.value = `文件 ${(props.file.size / 1024 / 1024).toFixed(0)} MB 超过媒体预览上限 ${MEDIA_PREVIEW_BYTE_LIMIT / 1024 / 1024} MB（整体载入无流式）`
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
    audioSrc.value = URL.createObjectURL(blob)
    log('Blob URL created:', audioSrc.value)
  } catch (e) {
    console.error('[PreviewAudioContent] Error loading audio:', e)
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

function handleAudioLoad() {
  log('Audio loaded metadata')
  if (audioRef.value) {
    duration.value = audioRef.value.duration
    log('Audio duration:', duration.value)
  }
}

function handleAudioError(e: Event) {
  console.error('[PreviewAudioContent] Audio error:', e)
  hasError.value = true
  const audio = e.target as HTMLAudioElement
  if (audio.error) {
    switch (audio.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorMessage.value = 'Audio playback was aborted'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorMessage.value = 'Network error occurred'
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorMessage.value = 'Audio decoding failed'
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorMessage.value = 'Audio format not supported'
        break
      default:
        errorMessage.value = 'Unknown audio error'
    }
  }
}

function handleTimeUpdate() {
  // Time update handler - can be used for progress tracking
}

function handleAudioEnded() {
  log('Audio playback ended')
}

watch(() => props.file, (newFile, oldFile) => {
  if (newFile && newFile.path !== oldFile?.path) {
    loadContent()
  }
}, { immediate: true })

onUnmounted(() => {
  log('Component unmounting, cleaning up')
  if (audioSrc.value) {
    URL.revokeObjectURL(audioSrc.value)
  }
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.src = ''
    audioRef.value.load()
  }
})
</script>
