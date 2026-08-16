<template>
  <!-- 类型分派单一事实源：PreviewView / QuickLookOverlay 共用。
       各 Preview*Content 自行加载内容（仅依赖 file + deviceId）。
       类型优先级：forceType（显式入口，如右键「以十六进制查看」）>
       initialLine（grep 命中跳入 → 强制 text）> 扩展名推断。 -->
  <PreviewHexContent
    v-if="type === 'hex'"
    :file="file"
    :device-id="deviceId"
    :session-id="sessionId"
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
    :edit="edit"
    :collection="collection"
    :step-collection="stepCollection"
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
  <!-- Unknown file type（嗅探细化期间的瞬态；仍提供显式动作） -->
  <div
    v-else
    class="flex flex-col items-center justify-center h-full text-text-tertiary"
  >
    <svg class="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    <p class="text-sm font-medium text-text-primary">{{ file.name }}</p>
    <p class="text-xs mt-1 mb-4">{{ $t('preview.common.detectingType') }}</p>
    <div class="flex items-center gap-2">
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
import { usePreviewStore } from '@/stores/preview'
import type { ImageEditController } from '@/composables/useImageEdit'

const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 预览会话 id（PreviewView 传入；hex 内容用于注册关闭守卫，QuickLook 不传）。 */
  sessionId?: string
  /** 初始定位行号（grep 命中跳入；仅 text 内容消费）。 */
  initialLine?: number
  /** 强制内容类型（显式入口；覆盖扩展名推断与 initialLine）。 */
  forceType?: PreviewType
  /** 图片编辑控制器（PreviewView 创建；仅图片内容消费，QuickLook 不传）。 */
  edit?: ImageEditController
  /** 图片集合导航信息（多图会话；转发给图片内容顶栏）。 */
  collection?: { index: number; total: number } | null
  /** 集合步进（dirty 标注由 VM 弹未保存确认后执行）。 */
  stepCollection?: (delta: number) => void
}>()

// 优先级：forceType > initialLine（grep 命中按文本渲染——grep 已证明内容
// 可读；且 `.ts` 这类扩展名在通用分类器里是 MPEG-TS 视频，是源码误判）> 推断。
const previewStore = usePreviewStore()
const isLocal = computed(() => props.deviceId === 'local')

/** 就地切换当前 tab 为 hex（openPreview 按 path+deviceId 去重并更新 forceType）。 */
function openAsHex(): void {
  previewStore.openPreview(props.file, props.deviceId, undefined, 'hex')
}

function openWithSystem(): void {
  window.fileman.openDefault(props.file.path).catch(err => {
    console.error('[PreviewContentRouter] openDefault failed:', err)
  })
}

const type = computed<PreviewType>(() => {
  if (props.forceType) return props.forceType
  if (props.initialLine) return 'text'
  return getPreviewType(props.file)
})
</script>
