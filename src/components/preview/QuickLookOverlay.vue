<template>
  <Transition name="quicklook-fade">
    <div
      v-if="previewStore.quickLookOpen && currentFile"
      ref="overlayEl"
      class="absolute inset-0 z-[70] flex items-center justify-center"
    >
      <!-- 半透明遮罩：点击关闭 -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] app-no-drag" @click="close" />

      <!-- 居中预览卡片：占内容区 70% 宽高；文本类按内容自适应高度
           （Fit：短文件收缩贴合、长文件封顶 70%，对齐 Finder 空格预览行为）。
           表面语言对齐 finder-ui-standard：canvas 实色内容面 + chrome 工具栏 +
           1px 发丝线 + 12px 圆角 + NSMenu 柔和双影（--menu-shadow）。 -->
      <div
        class="quick-look-card relative flex flex-col rounded-xl border border-border bg-bg-primary overflow-hidden app-no-drag"
        :style="cardStyle"
        role="dialog"
        :aria-label="$t('preview.quickLook.dialogAria')"
      >
        <!-- Header -->
        <div ref="headerEl" class="finder-preview-toolbar flex items-center justify-between border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-medium text-text-primary truncate">{{ currentFile.name }}</span>
            <span class="finder-preview-badge flex-shrink-0">{{ sizeLabel }}</span>
            <span v-if="total > 1" class="finder-preview-badge flex-shrink-0">{{ index + 1 }} / {{ total }}</span>
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

        <!-- Content：Quick Look 只承载 文本/图片/视频 三类（对齐 Finder 空格预览
             的轻量定位，完整预览能力走预览 tab），其余类型直接呈现「不支持」。 -->
        <div v-if="kindSupported" class="flex-1 min-h-0 overflow-hidden bg-bg-primary">
          <PreviewContentRouter
            :file="currentFile"
            :device-id="deviceId"
            :fit-content="isTextKind"
            @fit-height="onFitHeight"
          />
        </div>
        <div v-else class="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center bg-bg-primary select-none">
          <svg class="w-16 h-16 mb-4 text-text-tertiary opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-sm text-text-primary break-all">{{ currentFile.name }}</p>
          <p class="text-xs text-text-tertiary mt-1.5">{{ $t('preview.quickLook.unsupported') }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { usePreviewStore } from '@/stores/preview'
import { useTabsStore } from '@/stores/tabs'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import PreviewContentRouter from './PreviewContentRouter.vue'
import IconfontIcon from './IconfontIcon.vue'
import { getPreviewType, type PreviewType } from '@/types/preview'

const previewStore = usePreviewStore()
const tabsStore = useTabsStore()

const session = computed(() => previewStore.quickLook)
const currentFile = computed(() => previewStore.quickLookFile)
const deviceId = computed(() => session.value?.deviceId || 'local')
const index = computed(() => session.value?.index ?? 0)
const total = computed(() => session.value?.files.length ?? 0)

/** Quick Look 仅承载 文本/图片/视频；其余（目录、音频、PDF、ZIP、二进制…）显示「不支持」。 */
const QUICK_LOOK_KINDS: ReadonlySet<PreviewType> = new Set(['text', 'image', 'video'])
const kindSupported = computed(() => {
  const file = currentFile.value
  return !!file && QUICK_LOOK_KINDS.has(getPreviewType(file))
})

// ── 文本卡片高度贴合内容（Fit）──────────────────────────────────────────────
// PreviewTextContent（fit 模式）上报「chrome + Monaco 内容高度」；
// 此处加上浮层自身 header 实测高度，在 [MIN, 70% 封顶] 内取值。
// 图片/视频/非 source 视图上报 null → 回退固定 70%。
const overlayEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement | null>(null)
const fitHeight = ref<number | null>(null)
/** 遮罩区实测高度（ResizeObserver 维护；封顶 70% 的分母须随窗口变化） */
const overlayHeight = ref(0)
const isTextKind = computed(() =>
  kindSupported.value && !!currentFile.value && getPreviewType(currentFile.value) === 'text'
)
const MIN_CARD_HEIGHT = 160

const cardStyle = computed<Record<string, string>>(() => {
  const width = '70%'
  if (!isTextKind.value || fitHeight.value == null || overlayHeight.value <= 0) {
    return { width, height: '70%' }
  }
  const cap = Math.floor(overlayHeight.value * 0.7)
  const headerH = headerEl.value?.offsetHeight ?? 0
  const height = Math.max(MIN_CARD_HEIGHT, Math.min(fitHeight.value + headerH, cap))
  return { width, height: `${height}px` }
})

function onFitHeight(height: number | null): void {
  fitHeight.value = height
}

let overlayRo: ResizeObserver | null = null
watch(() => previewStore.quickLookOpen, (open) => {
  fitHeight.value = null
  overlayRo?.disconnect()
  overlayRo = null
  if (open) {
    void nextTick(() => {
      const el = overlayEl.value
      if (!el || typeof ResizeObserver === 'undefined') {
        overlayHeight.value = el?.clientHeight ?? 0
        return
      }
      overlayRo = new ResizeObserver(() => {
        overlayHeight.value = overlayEl.value?.clientHeight ?? 0
      })
      overlayRo.observe(el)
      overlayHeight.value = el.clientHeight
    })
  }
})

onUnmounted(() => {
  overlayRo?.disconnect()
  overlayRo = null
})

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
/* 浮层卡片投影：沿用 NSMenu 的柔和扩散双影（finder-ui-standard §11.1），
   不用 Tailwind shadow-2xl 的硬投影。 */
.quick-look-card {
  box-shadow: var(--menu-shadow);
  /* 文本 fit 收缩/封顶切换时高度平滑过渡（宽度恒为 70% 不参与） */
  transition: height 0.15s ease-out;
}

.quicklook-fade-enter-active,
.quicklook-fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.quicklook-fade-enter-from,
.quicklook-fade-leave-to {
  opacity: 0;
}
</style>
