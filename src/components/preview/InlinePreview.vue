<template>
  <div v-if="file" class="h-full flex flex-col bg-bg-secondary border-l border-border">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border">
      <span class="text-xs font-medium text-text-primary truncate">{{ file.name }}</span>
      <div class="flex items-center gap-1">
        <button
          class="p-1 rounded hover:bg-bg-hover text-text-secondary transition-colors"
          title="Open in full preview"
          @click="openInFullPreview"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4m4 0h4m4-4v4m0 4v4m-4 0h4m-4 0H4m4-4v4" />
          </svg>
        </button>
        <button
          class="p-1 rounded hover:bg-bg-hover text-text-secondary transition-colors"
          title="Close preview"
          @click="close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-3">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Image Preview -->
      <div v-else-if="previewType === 'image'" class="flex items-center justify-center h-full">
        <img
          v-if="imageSrc"
          :src="imageSrc"
          class="max-w-full max-h-full object-contain rounded"
          @error="handleImageError"
        />
      </div>

      <!-- File Too Large -->
      <div v-else-if="isFileTooLarge" class="flex flex-col items-center justify-center h-full text-text-tertiary">
        <svg class="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-xs text-center mb-2">File too large for preview</p>
        <p class="text-xs text-text-secondary">{{ formatSize(file.size) }}</p>
        <button
          class="mt-2 px-2 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80"
          @click="openInFullPreview"
        >
          Open in viewer
        </button>
      </div>

      <!-- Text Preview -->
      <div v-else-if="previewType === 'text'" class="h-full overflow-auto">
        <pre class="text-xs font-mono whitespace-pre-wrap text-text-primary bg-bg-primary p-3 rounded h-full overflow-auto">{{ textContent }}</pre>
      </div>

      <!-- Media Info (Video/Audio) -->
      <InlineMediaInfo
        v-else-if="previewType === 'video' || previewType === 'audio'"
        :file="file"
        :device-id="deviceId"
        :type="previewType"
      />

      <!-- PDF Preview -->
      <div v-else-if="previewType === 'pdf'" class="flex flex-col items-center justify-center h-full text-text-tertiary">
        <svg class="w-12 h-12 text-[#ef4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <p class="text-sm font-medium text-text-primary mt-2">{{ file.name }}</p>
        <p class="text-xs mt-1">PDF Document</p>
        <button
          class="mt-3 px-3 py-1.5 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors"
          @click="openInFullPreview"
        >
          Open in viewer
        </button>
      </div>

      <!-- Unknown Preview -->
      <div v-else class="flex flex-col items-center justify-center h-full text-text-tertiary">
        <svg class="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <p class="text-sm font-medium text-text-primary mt-2">{{ file.name }}</p>
        <p class="text-xs mt-1">{{ formatSize(file.size) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import { getPreviewType, getMimeType } from '@/types/preview'
import { formatSize } from '@/utils/media'
import InlineMediaInfo from './InlineMediaInfo.vue'
import { usePreviewStore } from '@/stores/preview'

const log = (message: string, ...args: any[]) => {
  console.log(`[InlinePreview] ${message}`, ...args)
}

const FILE_SIZE_LIMIT = 10 * 1024 * 1024 // 10MB

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const previewStore = usePreviewStore()

const loading = ref(false)
const textContent = ref('')
const imageSrc = ref('')
const isFileTooLarge = ref(false)

const previewType = computed(() => getPreviewType(props.file))

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

async function loadContent() {
  log('Loading content for file:', props.file.name, 'size:', props.file.size)

  loading.value = true
  textContent.value = ''
  isFileTooLarge.value = false

  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = ''
  }

  // Check file size for text files
  if (previewType.value === 'text' && props.file.size > FILE_SIZE_LIMIT) {
    log('File too large for inline preview:', props.file.size, '>', FILE_SIZE_LIMIT)
    isFileTooLarge.value = true
    loading.value = false
    return
  }

  try {
    log('Reading file from device:', props.deviceId, 'path:', props.file.path)
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    log('File read successfully, base64 length:', base64.length)

    const buffer = base64ToArrayBuffer(base64)
    log('Buffer size:', buffer.byteLength, 'bytes')

    if (previewType.value === 'text') {
      const decoder = new TextDecoder('utf-8')
      let text = decoder.decode(buffer.slice(0, 20480)) // 20KB limit for inline
      if (buffer.byteLength > 20480) text += '\n\n... (truncated)'
      textContent.value = text
      log('Text content loaded, length:', text.length)
    } else if (previewType.value === 'image') {
      const blob = new Blob([buffer], { type: getMimeType(props.file.extension || '') })
      imageSrc.value = URL.createObjectURL(blob)
      log('Image blob URL created:', imageSrc.value)
    }
  } catch (e) {
    console.error('[InlinePreview] Error loading content:', e)
    textContent.value = 'Error loading preview'
  } finally {
    loading.value = false
  }
}

function handleImageError() {
  imageSrc.value = ''
}

function openInFullPreview() {
  previewStore.openPreview(props.file, props.deviceId)
}

function close() {
  emit('close')
}

watch(() => props.file, loadContent, { immediate: true })

onUnmounted(() => {
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})
</script>
