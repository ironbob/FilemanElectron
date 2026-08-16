<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <!-- Media Preview -->
    <div class="flex-1 flex flex-col items-center justify-center p-3">
      <!-- Video Player -->
      <video
        v-if="type === 'video'"
        ref="videoRef"
        class="max-w-full max-h-full rounded shadow-md"
        controls
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @error="onError"
      >
        <source :src="mediaSrc" :type="mimeType" />
        {{ $t('preview.inline.noVideoSupport') }}
      </video>

      <!-- Audio Player -->
      <div v-else-if="type === 'audio'" class="w-full flex flex-col items-center gap-4">
        <!-- Audio Icon -->
        <div class="w-20 h-20 rounded-lg bg-bg-tertiary flex items-center justify-center">
          <svg class="w-10 h-10 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <!-- Audio Element -->
        <audio
          ref="audioRef"
          class="w-full"
          controls
          preload="metadata"
          @loadedmetadata="onLoadedMetadata"
          @error="onError"
        >
          <source :src="mediaSrc" :type="mimeType" />
          {{ $t('preview.audio.browserUnsupported') }}
        </audio>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-bg-secondary/80">
        <div class="flex flex-col items-center gap-2 text-text-tertiary">
          <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
          <span class="text-sm">{{ $t('preview.inline.mediaLoading') }}</span>
        </div>
      </div>

      <!-- Error State -->
      <div v-if="hasError" class="flex flex-col items-center gap-2 text-text-tertiary">
        <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span class="text-sm">{{ $t('preview.inline.mediaLoadFailed') }}</span>
        <span class="text-xs">{{ errorMessage }}</span>
      </div>
    </div>

    <!-- Media Info -->
    <div class="border-t border-border p-3 bg-bg-tertiary">
      <div class="text-xs space-y-1.5">
        <div class="flex justify-between">
          <span class="text-text-tertiary">{{ $t('preview.inline.mediaSize') }}</span>
          <span class="text-text-primary">{{ formatSize(file.size) }}</span>
        </div>
        <div v-if="duration > 0" class="flex justify-between">
          <span class="text-text-tertiary">{{ $t('preview.inline.mediaDuration') }}</span>
          <span class="text-text-primary">{{ formatDuration(duration) }}</span>
        </div>
        <div v-if="resolution.width && resolution.height" class="flex justify-between">
          <span class="text-text-tertiary">{{ $t('preview.inline.mediaResolution') }}</span>
          <span class="text-text-primary">{{ resolution.width }} x {{ resolution.height }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-tertiary">{{ $t('preview.inline.mediaFormat') }}</span>
          <span class="text-text-primary uppercase">{{ file.extension?.replace('.', '') || $t('preview.inline.formatUnknown') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import { formatSize } from '@/utils/media'

const log = (message: string, ...args: any[]) => {
  console.log(`[InlineMediaInfo] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
  type: 'video' | 'audio'
}>()

const emit = defineEmits<{
  mediaLoaded: [metadata: { duration: number; width?: number; height?: number }]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const mediaSrc = ref('')
const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const duration = ref(0)
const resolution = ref({ width: 0, height: 0 })

const mimeType = computed(() => getMimeType(props.file.extension || ''))

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

async function loadMedia() {
  log('Loading media:', props.file.name, 'type:', props.type, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  if (mediaSrc.value) {
    log('Revoking previous media source')
    URL.revokeObjectURL(mediaSrc.value)
    mediaSrc.value = ''
  }

  try {
    log('Reading file from device:', props.deviceId, 'path:', props.file.path)
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    log('File read successfully, base64 length:', base64.length)

    const buffer = base64ToArrayBuffer(base64)
    log('Buffer size:', buffer.byteLength, 'bytes')
    log('MIME type:', mimeType.value)

    const blob = new Blob([buffer], { type: mimeType.value })
    mediaSrc.value = URL.createObjectURL(blob)
    log('Blob URL created:', mediaSrc.value)

    // Need to call load() after changing source element's src
    await nextTick()
    const mediaEl = props.type === 'video' ? videoRef.value : audioRef.value
    if (mediaEl) {
      log('Calling load() on media element')
      mediaEl.load()
    }
  } catch (e) {
    console.error('[InlineMediaInfo] Failed to load media:', e)
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : t('preview.common.unknownError')
  } finally {
    loading.value = false
  }
}

function onLoadedMetadata() {
  log('Media metadata loaded')
  const mediaEl = props.type === 'video' ? videoRef.value : audioRef.value
  if (mediaEl) {
    duration.value = mediaEl.duration
    log('Duration:', duration.value)

    if (props.type === 'video' && videoRef.value) {
      resolution.value = {
        width: videoRef.value.videoWidth,
        height: videoRef.value.videoHeight
      }
      log('Resolution:', resolution.value)
    }

    emit('mediaLoaded', {
      duration: duration.value,
      ...resolution.value
    })
  }
}

function onError(e: Event) {
  console.error('[InlineMediaInfo] Media error:', e)
  hasError.value = true
  loading.value = false

  const media = e.target as HTMLVideoElement | HTMLAudioElement
  if (media && media.error) {
    switch (media.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorMessage.value = t('preview.inline.errAborted')
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorMessage.value = t('preview.inline.errNetwork')
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorMessage.value = t('preview.inline.errDecode')
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorMessage.value = t('preview.inline.errFormat')
        break
      default:
        errorMessage.value = t('preview.common.unknownError')
    }
    log('Error details:', errorMessage.value)
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

watch(() => props.file, (newFile, oldFile) => {
  if (newFile && newFile.path !== oldFile?.path) {
    loadMedia()
  }
}, { immediate: true })

onUnmounted(() => {
  log('Component unmounting, cleaning up')
  if (mediaSrc.value) {
    URL.revokeObjectURL(mediaSrc.value)
  }
})
</script>
