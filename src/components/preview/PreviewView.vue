<template>
  <!-- 预览 tab 的主内容视图（非浮层）：头部工具栏 + 类型分派内容。
       tab 的切换/关闭由顶部统一 AppTabBar 拥有，本组件只负责当前会话。 -->
  <div class="h-full flex flex-col overflow-hidden bg-bg-primary">
    <!-- Header toolbar -->
    <div class="flex items-center justify-between gap-2 px-4 py-2 bg-bg-tertiary border-b border-border">
      <div class="flex items-center gap-2 min-w-0">
        <svg class="w-4 h-4 flex-shrink-0 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span class="truncate text-sm font-medium text-text-primary">{{ session.file.name }}</span>
        <span class="truncate text-xs text-text-tertiary">{{ session.file.path }}</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button
          class="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Copy file path"
          aria-label="Copy file path"
          @click="copyFilePath"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>
        <button
          v-if="canRevealInFinder"
          class="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Reveal in Finder"
          aria-label="Reveal in Finder"
          @click="revealInFinder"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v0" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v8a2 2 0 002 2h6" />
            <circle cx="16" cy="15.5" r="2.5" stroke-width="2" />
            <path stroke-linecap="round" stroke-width="2" d="M18 17.5l1.5 1.5" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden">
      <PreviewContentRouter
        :file="session.file"
        :device-id="session.deviceId"
        :initial-line="session.initialLine"
        :force-type="session.forceType"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PreviewTab } from '@/types/preview'
import PreviewContentRouter from './PreviewContentRouter.vue'

const props = defineProps<{
  session: PreviewTab
}>()

/** 仅本地设备可在 Finder 中定位；远程设备文件在本机无实体。 */
const canRevealInFinder = props.session.deviceId === 'local'

function copyFilePath() {
  navigator.clipboard.writeText(props.session.file.path)
}

function revealInFinder() {
  window.fileman.showInFolder(props.session.file.path)
}
</script>
