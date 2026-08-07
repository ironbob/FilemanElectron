<template>
  <div class="h-full flex items-center justify-center bg-bg-primary">
    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center gap-3 text-text-tertiary">
      <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      <span class="text-sm">Loading preview...</span>
    </div>

    <!-- Image Preview -->
    <img
      v-else-if="previewType === 'image'"
      :src="imageSrc"
      class="max-w-full max-h-full object-contain rounded-lg shadow-md"
      @error="handleImageError"
    />

    <!-- Text/Code Preview -->
    <div
      v-else-if="previewType === 'text'"
      class="w-full h-full overflow-auto p-4"
    >
      <pre class="text-xs font-mono whitespace-pre-wrap text-text-primary bg-bg-secondary p-4 rounded-lg">{{ textContent }}</pre>
    </div>

    <!-- PDF Preview -->
    <div v-else-if="previewType === 'pdf'" class="flex flex-col items-center gap-4 text-text-tertiary">
      <svg class="w-16 h-16 text-[#ef4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <div class="text-center">
        <p class="font-medium text-text-primary">{{ file.name }}</p>
        <p class="text-sm mt-1">PDF Document</p>
      </div>
    </div>

    <!-- Video Preview -->
    <div v-else-if="previewType === 'video'" class="flex flex-col items-center gap-4 text-text-tertiary">
      <svg class="w-16 h-16 text-[#ff5f57]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <div class="text-center">
        <p class="font-medium text-text-primary">{{ file.name }}</p>
        <p class="text-sm mt-1">Video File</p>
      </div>
    </div>

    <!-- Audio Preview -->
    <div v-else-if="previewType === 'audio'" class="flex flex-col items-center gap-4 text-text-tertiary">
      <svg class="w-16 h-16 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      <div class="text-center">
        <p class="font-medium text-text-primary">{{ file.name }}</p>
        <p class="text-sm mt-1">Audio File</p>
      </div>
    </div>

    <!-- Unknown Preview -->
    <div v-else class="flex flex-col items-center gap-4 text-text-tertiary">
      <svg class="w-16 h-16 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <div class="text-center">
        <p class="font-medium text-text-primary">{{ file.name }}</p>
        <p class="text-sm mt-1">{{ formatSize(file.size) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import { getPreviewType, getMimeType } from '@/types/preview'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewContent] ${message}`, ...args)
}

const FILE_SIZE_LIMIT = 10 * 1024 * 1024 // 10MB

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const loading = ref(false)
const textContent = ref('')
const imageSrc = ref('')

const previewType = computed(() => {
  if (props.file.isDirectory) return 'folder'
  return getPreviewType(props.file)
})

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function handleImageError(e: Event) {
  console.error('[PreviewContent] Image load error:', e)
}

async function loadContent(newFile: FileInfo) {
  if (!newFile) return

  log('Loading content for file:', newFile.name, 'type:', previewType.value)

  loading.value = true
  textContent.value = ''
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = ''
  }

  try {
    if (previewType.value === 'text') {
      // Check file size
      if (newFile.size > FILE_SIZE_LIMIT) {
        log('File too large for simple preview:', newFile.size, '>', FILE_SIZE_LIMIT)
        textContent.value = `File too large for preview (${formatSize(newFile.size)}). Use full preview.`
        loading.value = false
        return
      }

      log('Reading text file:', newFile.path)
      const base64 = await window.fileman.readFile(props.deviceId, newFile.path)
      log('File read successfully, base64 length:', base64.length)

      const buffer = base64ToArrayBuffer(base64)
      const decoder = new TextDecoder('utf-8')
      let text = decoder.decode(buffer.slice(0, 10240))
      if (buffer.byteLength > 10240) text += '\n\n... (truncated)'
      textContent.value = text
      log('Text content loaded, length:', text.length)
    } else if (previewType.value === 'image') {
      log('Reading image file:', newFile.path)
      const base64 = await window.fileman.readFile(props.deviceId, newFile.path)
      log('File read successfully, base64 length:', base64.length)

      const buffer = base64ToArrayBuffer(base64)
      const blob = new Blob([buffer], { type: getMimeType(newFile.extension || '') })
      imageSrc.value = URL.createObjectURL(blob)
      log('Image blob URL created:', imageSrc.value)
    }
  } catch (e) {
    console.error('[PreviewContent] Preview error:', e)
    textContent.value = 'Error loading preview'
  } finally {
    loading.value = false
  }
}

watch(() => props.file, (newFile, oldFile) => {
  if (newFile && newFile.path !== oldFile?.path) {
    loadContent(newFile)
  }
}, { immediate: true })

onUnmounted(() => {
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})
</script>
