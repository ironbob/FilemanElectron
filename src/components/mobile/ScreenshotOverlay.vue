<template>
  <Transition name="screenshot-fade">
    <div
      v-if="shot"
      class="fixed inset-0 z-[80] flex items-center justify-center"
    >
      <!-- 半透明遮罩：点击关闭(保存中禁点) -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] app-no-drag" @click="close" />

      <!-- 居中展示卡片（2026-08-19 Finder 化）：Sheet 形材质卡——
           finder-sheet 提供 popover 材质/12px 圆角/窗口阴影，头部工具栏与
           底栏透明化，全卡一张材质（见 finder-ui.css screenshot-card 节）。 -->
      <div
        class="screenshot-card finder-sheet relative flex flex-col overflow-hidden app-no-drag"
        style="width: min(760px, 80%); height: min(560px, 76%)"
        role="dialog"
        :aria-label="$t('mobile.screenshot.previewAria')"
      >
        <!-- Header -->
        <div class="finder-preview-toolbar flex items-center justify-between border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-medium text-text-primary truncate">{{ $t('mobile.screenshot.title', { name: shot.deviceName }) }}</span>
            <span class="text-xs text-text-tertiary flex-shrink-0">{{ capturedAtLabel }}</span>
          </div>
          <div class="finder-control-group">
            <button class="finder-icon-button" :title="$t('mobile.screenshot.closeTip')" :disabled="saving" @click="close">
              <IconfontIcon name="close" />
            </button>
          </div>
        </div>

        <!-- 图片体：材质透出，不加实色底（一张材质规则） -->
        <div class="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4">
          <img
            v-if="objectUrl"
            :src="objectUrl"
            class="max-w-full max-h-full object-contain rounded-[4px]"
            :alt="$t('mobile.screenshot.previewAria')"
          />
        </div>

        <!-- Footer：Sheet 规格按钮组（次=描边+control 底 / 主=系统蓝，右对齐） -->
        <div class="screenshot-footer flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            class="finder-btn-secondary gap-1.5"
            :disabled="copying || saving"
            data-testid="screenshot-copy"
            @click="copy"
          >
            <IconfontIcon name="copy" size="sm" />
            <span>{{ justCopied ? $t('mobile.screenshot.copied') : $t('mobile.screenshot.copy') }}</span>
          </button>
          <button
            class="finder-btn-secondary"
            :disabled="saving || capturing"
            @click="retake"
          >{{ capturing ? $t('mobile.screenshot.capturing') : $t('mobile.screenshot.retake') }}</button>
          <button
            class="finder-btn-secondary"
            :disabled="saving"
            @click="close"
          >{{ $t('common.close') }}</button>
          <button
            class="finder-btn-primary"
            :disabled="saving"
            data-testid="screenshot-save"
            @click="save"
          >{{ saving ? $t('mobile.screenshot.saving') : $t('mobile.screenshot.save') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useDeviceScreenshot } from '@/composables/useDeviceScreenshot'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import IconfontIcon from '@/components/preview/IconfontIcon.vue'
import { formatDateTime } from '@/utils/formatDate'

const { shot, saving, copying, copiedAt, capturingDeviceIds, close, retake, copy, save } = useDeviceScreenshot()

const capturing = computed(() => shot.value !== null && capturingDeviceIds.value.includes(shot.value.deviceId))

const capturedAtLabel = computed(() => {
  return shot.value ? formatDateTime(shot.value.capturedAt) : ''
})

// ── 拷贝成功反馈：文案短暂切「已拷贝」（1.5s，同 ChecksumDialog 先例）──
const justCopied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

watch(copiedAt, (stamp) => {
  if (!stamp) return
  justCopied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { justCopied.value = false }, 1500)
})

// ── blob URL 生命周期：shot 变化重建，旧的立即 revoke，卸载兜底 revoke ──
const objectUrl = ref<string | null>(null)

watch(() => shot.value, (newShot, oldShot) => {
  if (oldShot === newShot) return
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
  if (newShot) {
    objectUrl.value = URL.createObjectURL(new Blob([base64ToArrayBuffer(newShot.base64)], { type: newShot.mime }))
  }
}, { immediate: true })

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
})

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

// capture 阶段消费 Esc,保证 App.vue 的 bubble 监听不穿透(模态期间该键归浮层所有)。
useKeyInterceptor((e) => {
  if (!shot.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return true
  }
})
</script>

<style scoped>
.screenshot-fade-enter-active,
.screenshot-fade-leave-active {
  transition: opacity 0.15s ease;
}
.screenshot-fade-enter-from,
.screenshot-fade-leave-to {
  opacity: 0;
}
</style>
