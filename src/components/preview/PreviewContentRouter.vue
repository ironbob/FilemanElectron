<template>
  <!-- 类型分派单一事实源：PreviewFullscreen / QuickLookOverlay 共用。
       各 Preview*Content 自行加载内容（仅依赖 file + deviceId）。 -->
  <PreviewTextContent
    v-if="type === 'text'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="() => {}"
  />
  <PreviewImageContent
    v-else-if="type === 'image'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="$emit('openInFull')"
  />
  <PreviewVideoContent
    v-else-if="type === 'video'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="() => {}"
  />
  <PreviewAudioContent
    v-else-if="type === 'audio'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="() => {}"
  />
  <PreviewPdfContent
    v-else-if="type === 'pdf'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="() => {}"
  />
  <PreviewZipContent
    v-else-if="type === 'zip'"
    :file="file"
    :device-id="deviceId"
    @open-in-full="() => {}"
  />
  <!-- Unknown file type -->
  <div
    v-else
    class="flex flex-col items-center justify-center h-full text-text-tertiary"
  >
    <svg class="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    <p class="text-sm font-medium text-text-primary">{{ file.name }}</p>
    <p class="text-xs mt-1">Cannot preview this file type</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FileInfo } from '@/types'
import { getPreviewType } from '@/types/preview'
import PreviewTextContent from './PreviewTextContent.vue'
import PreviewImageContent from './PreviewImageContent.vue'
import PreviewVideoContent from './PreviewVideoContent.vue'
import PreviewAudioContent from './PreviewAudioContent.vue'
import PreviewPdfContent from './PreviewPdfContent.vue'
import PreviewZipContent from './PreviewZipContent.vue'

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

defineEmits<{
  /** 目前仅 image 内容会发出（转 folder-aware 图片浏览器），语义由宿主定义 */
  openInFull: []
}>()

const type = computed(() => getPreviewType(props.file))
</script>
