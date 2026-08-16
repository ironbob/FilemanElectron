<template>
  <!-- 类型分派单一事实源：PreviewView / QuickLookOverlay 共用。
       各 Preview*Content 自行加载内容（仅依赖 file + deviceId）。
       类型优先级：forceType（显式入口，如右键「以十六进制查看」）>
       initialLine（grep 命中跳入 → 强制 text）> 扩展名推断。 -->
  <PreviewHexContent
    v-if="type === 'hex'"
    :file="file"
    :device-id="deviceId"
  />
  <PreviewTextContent
    v-else-if="type === 'text'"
    :file="file"
    :device-id="deviceId"
    :initial-line="initialLine"
  />
  <PreviewImageContent
    v-else-if="type === 'image'"
    :file="file"
    :device-id="deviceId"
  />
  <PreviewVideoContent
    v-else-if="type === 'video'"
    :file="file"
    :device-id="deviceId"
  />
  <PreviewAudioContent
    v-else-if="type === 'audio'"
    :file="file"
    :device-id="deviceId"
  />
  <PreviewPdfContent
    v-else-if="type === 'pdf'"
    :file="file"
    :device-id="deviceId"
  />
  <PreviewZipContent
    v-else-if="type === 'zip'"
    :file="file"
    :device-id="deviceId"
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
import { getPreviewType, type PreviewType } from '@/types/preview'
import PreviewTextContent from './PreviewTextContent.vue'
import PreviewImageContent from './PreviewImageContent.vue'
import PreviewVideoContent from './PreviewVideoContent.vue'
import PreviewAudioContent from './PreviewAudioContent.vue'
import PreviewPdfContent from './PreviewPdfContent.vue'
import PreviewZipContent from './PreviewZipContent.vue'
import PreviewHexContent from './PreviewHexContent.vue'

const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 初始定位行号（grep 命中跳入；仅 text 内容消费）。 */
  initialLine?: number
  /** 强制内容类型（显式入口；覆盖扩展名推断与 initialLine）。 */
  forceType?: PreviewType
}>()

// 优先级：forceType > initialLine（grep 命中按文本渲染——grep 已证明内容
// 可读；且 `.ts` 这类扩展名在通用分类器里是 MPEG-TS 视频，是源码误判）> 推断。
const type = computed<PreviewType>(() => {
  if (props.forceType) return props.forceType
  if (props.initialLine) return 'text'
  return getPreviewType(props.file)
})
</script>
