<template>
  <Transition name="screenshot-fade">
    <div
      v-if="shot"
      class="fixed inset-0 z-[80] flex items-center justify-center"
    >
      <!-- 半透明遮罩：点击关闭(保存中禁点) -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] app-no-drag" @click="close" />

      <!-- 居中展示卡片 -->
      <div
        class="relative flex flex-col rounded-xl border border-border bg-bg-secondary shadow-2xl overflow-hidden app-no-drag"
        style="width: min(760px, 80%); height: min(560px, 76%)"
        role="dialog"
        aria-label="设备截图预览"
      >
        <!-- Header -->
        <div class="finder-preview-toolbar flex items-center justify-between border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-medium text-text-primary truncate">{{ shot.deviceName }} 截图</span>
            <span class="text-xs text-text-tertiary flex-shrink-0">{{ capturedAtLabel }}</span>
          </div>
          <div class="finder-control-group">
            <button class="finder-icon-button" title="Close (Esc)" :disabled="saving" @click="close">
              <IconfontIcon name="close" />
            </button>
          </div>
        </div>

        <!-- 图片体 -->
        <div class="flex-1 min-h-0 overflow-hidden bg-bg-primary flex items-center justify-center">
          <img
            v-if="objectUrl"
            :src="objectUrl"
            class="max-w-full max-h-full object-contain"
            alt="设备截图预览"
          />
        </div>

        <!-- Footer：保存 / 重新截取 / 关闭 -->
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            class="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-default"
            :disabled="saving"
            @click="close"
          >关闭</button>
          <button
            class="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-default"
            :disabled="saving || capturing"
            @click="retake"
          >{{ capturing ? '截图中…' : '重新截取' }}</button>
          <button
            class="px-3.5 py-1.5 text-sm rounded-md bg-accent-blue text-white hover:bg-accent-blue/85 transition-colors disabled:opacity-40 disabled:cursor-default"
            :disabled="saving"
            @click="save"
          >{{ saving ? '保存中…' : '保存…' }}</button>
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

const { shot, saving, capturingDeviceIds, close, retake, save } = useDeviceScreenshot()

const capturing = computed(() => shot.value !== null && capturingDeviceIds.value.includes(shot.value.deviceId))

const capturedAtLabel = computed(() => {
  const d = shot.value ? new Date(shot.value.capturedAt) : null
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
