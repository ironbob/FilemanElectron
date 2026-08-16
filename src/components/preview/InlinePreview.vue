<template>
  <div class="h-full flex flex-col bg-bg-secondary border-l border-border">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border">
      <span class="text-xs font-medium text-text-primary truncate">{{ file?.name || $t('preview.inline.titleFallback') }}</span>
      <div class="flex items-center gap-1">
        <button
          class="p-1 rounded hover:bg-bg-hover text-text-secondary transition-colors"
          :title="$t('preview.common.closePreviewTip')"
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
      <!-- Empty placeholder：开启预览但无单个选中项 -->
      <div v-if="!file" class="flex flex-col items-center justify-center h-full text-text-tertiary">
        <svg class="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12h.01M12 12h.01M9 12h.01M7.5 5h9a2 2 0 012 2v10a2 2 0 01-2 2h-9a2 2 0 01-2-2V7a2 2 0 012-2z" />
        </svg>
        <p class="text-xs mt-2">{{ $t('preview.inline.selectFile') }}</p>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="flex items-center justify-center h-full">
        <div class="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Folder Info：选中文件夹时展示名称/日期/权限等元信息 -->
      <div v-else-if="file.isDirectory" class="flex flex-col h-full">
        <div class="flex flex-col items-center py-6 text-text-tertiary">
          <svg class="w-12 h-12 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p class="text-sm font-medium text-text-primary mt-2 text-center break-all px-2">{{ file.name }}</p>
          <p class="text-xs mt-1">{{ $t('preview.inline.folder') }}</p>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.kind') }}</span>
            <span class="text-text-secondary text-right">{{ $t('preview.inline.folder') }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.size') }}</span>
            <span class="text-text-secondary text-right">—</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.modified') }}</span>
            <span class="text-text-secondary text-right break-all">{{ formatDate(file.modifiedTime) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.created') }}</span>
            <span class="text-text-secondary text-right break-all">{{ formatDate(folderStats?.createdTime ?? file.createdTime) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.permissions') }}</span>
            <span class="text-text-secondary text-right font-mono">{{ formatPermissions(folderStats?.mode) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-text-tertiary flex-shrink-0">{{ $t('preview.inline.where') }}</span>
            <span class="text-text-secondary text-right break-all" :title="file.path">{{ parentPath(file.path) }}</span>
          </div>
        </div>
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
        <p class="text-xs text-center mb-2">{{ $t('preview.inline.fileTooLarge') }}</p>
        <p class="text-xs text-text-secondary">{{ formatSize(file.size) }}</p>
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
        <p class="text-xs mt-1">{{ $t('preview.inline.pdfDocument') }}</p>
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
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import { getPreviewType, getMimeType } from '@/types/preview'
import { formatSize } from '@/utils/media'
import { formatPermissions } from '@/utils/permissions'
import { formatDateTime } from '@/utils/formatDate'
import InlineMediaInfo from './InlineMediaInfo.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[InlinePreview] ${message}`, ...args)
}

const FILE_SIZE_LIMIT = 10 * 1024 * 1024 // 10MB

const props = defineProps<{
  file: FileInfo | null
  deviceId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const textContent = ref('')
const imageSrc = ref('')
const isFileTooLarge = ref(false)
// 文件夹元信息（createdTime/mode 来自 fs:stat，FileInfo 中未必有）
const folderStats = ref<FileStats | null>(null)

const previewType = computed(() => (props.file ? getPreviewType(props.file) : 'unknown'))

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

async function loadContent() {
  if (!props.file) {
    // 清空选中：释放残留的图片 blob URL
    if (imageSrc.value) {
      URL.revokeObjectURL(imageSrc.value)
      imageSrc.value = ''
    }
    return
  }
  log('Loading content for file:', props.file.name, 'size:', props.file.size)

  loading.value = true
  textContent.value = ''
  isFileTooLarge.value = false
  folderStats.value = null

  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = ''
  }

  // 文件夹：不读内容，改拉取元信息（createdTime/权限）
  if (props.file.isDirectory) {
    loading.value = false
    void loadFolderStats()
    return
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
    textContent.value = t('preview.inline.loadPreviewFailed')
  } finally {
    loading.value = false
  }
}

function handleImageError() {
  imageSrc.value = ''
}

/** 拉取文件夹元信息（失败时静默降级为仅显示 FileInfo 字段） */
async function loadFolderStats() {
  if (!props.file) return
  try {
    folderStats.value = await window.fileman.getStats(props.deviceId, props.file.path)
  } catch (e) {
    log('Failed to load folder stats:', e)
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return formatDateTime(iso) || '—'
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
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
