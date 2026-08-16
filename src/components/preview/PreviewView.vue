<template>
  <!-- 预览 tab 的主内容视图（非浮层）：内容占满整个区域，无头部工具栏。
       tab 的切换/关闭由顶部统一 AppTabBar 拥有，本组件只负责当前会话。
       图片集合会话（文件夹右键预览）叠加浮动 ‹ › 导航与计数徽标。 -->
  <div class="finder-preview h-full relative flex flex-col overflow-hidden bg-bg-primary">
    <!-- Content Area -->
    <div class="flex-1 overflow-hidden">
      <PreviewContentRouter
        :file="session.file"
        :device-id="session.deviceId"
        :initial-line="session.initialLine"
        :force-type="session.forceType"
      />
    </div>

    <!-- 图片集合导航：仅多图会话渲染；浮层不拦截内容交互（pointer-events 只在按钮上） -->
    <template v-if="isCollection">
      <button
        class="finder-icon-button absolute left-3 top-1/2 -translate-y-1/2 z-10 !rounded-full !bg-black/35 hover:!bg-black/55 !text-white disabled:opacity-25"
        title="Previous (←)"
        aria-label="Previous image"
        :disabled="index <= 0"
        @click="step(-1)"
      >
        <IconfontIcon name="previous" />
      </button>
      <button
        class="finder-icon-button absolute right-3 top-1/2 -translate-y-1/2 z-10 !rounded-full !bg-black/35 hover:!bg-black/55 !text-white disabled:opacity-25"
        title="Next (→)"
        aria-label="Next image"
        :disabled="index >= total - 1"
        @click="step(1)"
      >
        <IconfontIcon name="next" />
      </button>
      <!-- 计数徽标 -->
      <div class="absolute right-3 bottom-3 z-10 px-2.5 py-0.5 rounded-full bg-black/45 text-white text-xs font-medium tabular-nums pointer-events-none">
        {{ index + 1 }} / {{ total }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PreviewTab } from '@/types/preview'
import { usePreviewStore } from '@/stores/preview'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import PreviewContentRouter from './PreviewContentRouter.vue'
import IconfontIcon from './IconfontIcon.vue'

const props = defineProps<{
  session: PreviewTab
}>()

const previewStore = usePreviewStore()

const isCollection = computed(() => (props.session.files?.length ?? 0) > 1)
const index = computed(() => props.session.index ?? 0)
const total = computed(() => props.session.files?.length ?? 1)

// 集合会话消费 ←/→（capture、preventDefault + return true，避免方向键落回全局处理）。
// 单文件预览不拦截。
useKeyInterceptor((e) => {
  if (!isCollection.value) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    step(-1)
    return true
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    step(1)
    return true
  }
})

function step(delta: number) {
  previewStore.stepImageCollection(props.session.id, delta)
}
</script>
