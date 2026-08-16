<template>
  <Transition name="quicklook-fade">
    <div
      v-if="previewStore.quickLookOpen && currentFile"
      class="absolute inset-0 z-[70] flex items-center justify-center"
    >
      <!-- 半透明遮罩：点击关闭 -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] app-no-drag" @click="close" />

      <!-- 居中预览卡片 -->
      <div
        class="relative flex flex-col rounded-xl border border-border bg-bg-secondary shadow-2xl overflow-hidden app-no-drag"
        style="width: min(760px, 80%); height: min(540px, 72%)"
        role="dialog"
        :aria-label="$t('preview.quickLook.dialogAria')"
      >
        <!-- Header -->
        <div class="finder-preview-toolbar flex items-center justify-between border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-medium text-text-primary truncate">{{ currentFile.name }}</span>
            <span class="text-xs text-text-tertiary flex-shrink-0">{{ sizeLabel }}</span>
            <span v-if="total > 1" class="text-xs text-text-tertiary flex-shrink-0">{{ index + 1 }} / {{ total }}</span>
          </div>
          <div class="finder-control-group">
            <button
              class="finder-icon-button"
              :title="$t('preview.quickLook.prevTip')"
              :disabled="index <= 0"
              @click="step(-1)"
            >
              <IconfontIcon name="up" />
            </button>
            <button
              class="finder-icon-button"
              :title="$t('preview.quickLook.nextTip')"
              :disabled="index >= total - 1"
              @click="step(1)"
            >
              <IconfontIcon name="down" />
            </button>
            <button
              class="finder-icon-button"
              :title="$t('preview.quickLook.closeTip')"
              @click="close"
            >
              <IconfontIcon name="close" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-hidden bg-bg-primary">
          <PreviewContentRouter
            :file="currentFile"
            :device-id="deviceId"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import { useTabsStore } from '@/stores/tabs'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import PreviewContentRouter from './PreviewContentRouter.vue'
import IconfontIcon from './IconfontIcon.vue'

const previewStore = usePreviewStore()
const tabsStore = useTabsStore()

const session = computed(() => previewStore.quickLook)
const currentFile = computed(() => previewStore.quickLookFile)
const deviceId = computed(() => session.value?.deviceId || 'local')
const index = computed(() => session.value?.index ?? 0)
const total = computed(() => session.value?.files.length ?? 0)

const sizeLabel = computed(() => {
  const size = currentFile.value?.size ?? 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
})

// capture 阶段消费 Esc/Space/↑↓，保证 FileList / App.vue 的 bubble 监听不穿透。
// 组件常驻挂载（内部 v-if 控制显隐），注册顺序先于动态弹窗 → LIFO 下动态弹窗优先。
//
// 注意两点：
// 1. 消费时必须 preventDefault——stopImmediatePropagation 只拦截监听器，不阻止
//    浏览器默认行为（Space/方向键会滚动 FileList 虚拟列表）。
// 2. 不做 isTextEditingTarget 守卫：Quick Look 是模态浮层，点击文本预览会让
//    Monaco 的隐藏 textarea 获得焦点，若因此放行，Space/↑↓ 会落入编辑器而
//    无法关闭/步进。模态期间这三个键无条件归浮层所有（其它字符仍可输入）。
useKeyInterceptor((e) => {
  if (!previewStore.quickLookOpen) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return true
  }
  if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    close()
    return true
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    step(1)
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    step(-1)
    return true
  }
})

function close() {
  previewStore.closeQuickLook()
}

function step(delta: number) {
  previewStore.stepQuickLook(delta)
  // 同步选中到切换后的文件：关闭 Quick Look 后选中停留在最后浏览项
  const paneId = session.value?.paneId
  const path = currentFile.value?.path
  if (paneId && path) {
    tabsStore.setSelectedFiles(paneId, [path])
  }
}
</script>

<style scoped>
.quicklook-fade-enter-active,
.quicklook-fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.quicklook-fade-enter-from,
.quicklook-fade-leave-to {
  opacity: 0;
}
</style>
