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
    :session-id="sessionId"
    :initial-line="initialLine"
    :quick-look="quickLook"
    :quick-look-controls="quickLookControls"
  />
  <PreviewImageContent
    v-else-if="type === 'image'"
    :file="file"
    :device-id="deviceId"
    :edit="edit"
    :collection="collection"
    :step-collection="stepCollection"
    :quick-look="quickLook"
    :quick-look-controls="quickLookControls"
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
    class="preview-fallback flex flex-col items-center justify-center h-full px-6 text-center"
  >
    <div class="preview-fallback-badge">
      <AppIcon name="fileText" :stroke="1.5" class="w-8 h-8" />
    </div>
    <p class="mt-4 max-w-[340px] break-all text-[15px] font-semibold text-text-primary">{{ file.name }}</p>
    <p class="mt-1.5 flex items-center gap-1.5 text-xs text-text-tertiary">
      <span class="preview-fallback-pulse" aria-hidden="true" />
      {{ $t('preview.common.detectingType') }}
    </p>
    <div class="mt-5 flex items-center gap-2.5">
      <button class="finder-btn-primary gap-1.5" @click="openAsHex">
        <AppIcon name="hex" class="w-4 h-4" />
        {{ $t('preview.common.viewAsHex') }}
      </button>
      <button v-if="isLocal" class="finder-btn-secondary gap-1.5" @click="openWithSystem">
        <AppIcon name="openWith" class="w-4 h-4" />
        {{ $t('preview.common.openWithSystem') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { FileInfo } from '@/types'
import { getPreviewType, type PreviewType, type QuickLookControls } from '@/types/preview'
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
  /** Quick Look 浮层模式（材质透明、工具栏元信息收纳、保存入口上移等）。 */
  quickLook?: boolean
  /** Quick Look 步进/关闭控件（单行合并后经工具栏右端胶囊呈现；仅 text 消费）。 */
  quickLookControls?: QuickLookControls
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

<style scoped>
/* 未知类型兜底：文件徽标（一张材质 + 发丝内环 + 柔和投影）+ 识别中脉冲。
   颜色走 finder token，亮/暗主题自适应；动作钮复用 .finder-btn-primary/secondary。 */
.preview-fallback-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 18px;
  color: var(--finder-secondary-label);
  background: linear-gradient(160deg, var(--finder-control-strong), var(--finder-control));
  box-shadow: inset 0 0 0 1px var(--finder-divider), 0 6px 16px rgba(0, 0, 0, 0.08);
}

.preview-fallback-pulse {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--finder-selection);
  animation: preview-fallback-pulse 1.2s ease-in-out infinite;
}

@keyframes preview-fallback-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .preview-fallback-pulse { animation: none; }
}
</style>
