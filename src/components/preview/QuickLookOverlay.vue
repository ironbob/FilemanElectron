<template>
  <Transition name="quicklook-fade">
    <div
      v-if="previewStore.quickLookOpen && currentFile"
      ref="overlayEl"
      class="absolute inset-0 z-[70] flex items-center justify-center"
    >
      <!-- 半透明遮罩：点击关闭 -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] app-no-drag" @click="close" />

      <!-- 居中预览卡片。文本类（2026-08-19 Finder Quick Look 重设计）：
           稳定响应式窗口 —— 宽 min(90vw, 1200px)、高 clamp(420px, 内容区70%, 760px)，
           高度不再由文本行数决定（一行/空文件不缩成矮条，长文本内部滚动）；
           半透明系统材质（blur 20px + saturate 150%），工具栏/内容/状态同属一张材质。
           图片/视频维持 70%×70% 实色画布（各自内容面自管背景）。 -->
      <div
        class="quick-look-card relative flex flex-col rounded-xl border overflow-hidden app-no-drag"
        :class="isTextKind ? 'quick-look-card--text' : 'border-border bg-bg-primary'"
        :style="cardStyle"
        role="dialog"
        :aria-label="$t('preview.quickLook.dialogAria')"
      >
        <!-- Header：仅非文本类（图片/视频/不支持态）。
             文本类头部已并入内容工具栏单行（2026-08-19 合并重设计）：
             文件名/元信息/查找/语法/操作/步进关闭全部同基线，右端三钮胶囊。 -->
        <div v-if="!isTextKind" class="finder-preview-toolbar flex items-center justify-between border-b border-border">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-[15px] font-medium text-text-primary truncate" data-testid="quick-look-name">{{ currentFile.name }}</span>
            <span
              v-if="headerMeta"
              class="text-xs whitespace-nowrap flex-shrink-0"
              style="color: var(--finder-secondary-label)"
              data-testid="quick-look-meta"
            >{{ headerMeta }}</span>
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
             的轻量定位，完整预览能力走预览 tab），其余类型直接呈现「不支持」。
             文本类不铺实色底——材质透出由 quick-look-card--text 统一提供。 -->
        <div v-if="kindSupported" class="flex-1 min-h-0 overflow-hidden" :class="isTextKind ? '' : 'bg-bg-primary'">
          <PreviewContentRouter
            :file="currentFile"
            :device-id="deviceId"
            :quick-look="isTextKind"
            :quick-look-controls="isTextKind ? qlControls : undefined"
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
import { getPreviewType, type PreviewType, type QuickLookControls } from '@/types/preview'

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

// ── 窗口几何（2026-08-19 稳定响应式）────────────────────────────────────────
// 文本卡片：宽 min(90vw, 1200px)；高 clamp(420px, 遮罩区 70%, 760px)。
// 高度与文本行数解耦（原 fit-height 收缩链已移除——短文件曾把浮层缩成矮条）；
// 遮罩区实测高度（ResizeObserver 维护）作为 70% 分母，随窗口尺寸变化。
const overlayEl = ref<HTMLElement | null>(null)
const overlayHeight = ref(0)
const isTextKind = computed(() =>
  kindSupported.value && !!currentFile.value && getPreviewType(currentFile.value) === 'text'
)

const TEXT_MIN_CARD_HEIGHT = 420
const TEXT_MAX_CARD_HEIGHT = 760

const cardStyle = computed<Record<string, string>>(() => {
  if (!isTextKind.value) {
    return { width: '70%', height: '70%' }
  }
  const cap = overlayHeight.value > 0 ? Math.floor(overlayHeight.value * 0.7) : 460
  const height = Math.max(TEXT_MIN_CARD_HEIGHT, Math.min(cap, TEXT_MAX_CARD_HEIGHT))
  // 宽度相对遮罩区取 90%（≈90vw，主区内不溢出），封顶 1200px
  return { width: 'min(90%, 1200px)', height: `${height}px` }
})

/** 头部元信息：大小 · n / n（单一低层级辅助文字；行数等细节归内容工具栏/状态区） */
const headerMeta = computed(() => {
  const parts: string[] = [sizeLabel.value]
  if (total.value > 1) parts.push(`${index.value + 1} / ${total.value}`)
  return parts.join(' · ')
})

/** 单行合并（2026-08-19）：文本类的步进/关闭控件经 Router 下发到内容工具栏右端胶囊 */
const qlControls = computed<QuickLookControls>(() => ({
  index: index.value,
  total: total.value,
  step: (delta: number) => step(delta),
  close: () => close()
}))

let overlayRo: ResizeObserver | null = null
watch(() => previewStore.quickLookOpen, (open) => {
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
   不用 Tailwind shadow-2xl 的硬投影。文本/非文本切换时几何平滑过渡。 */
.quick-look-card {
  box-shadow: var(--menu-shadow);
  transition: height 0.15s ease-out, width 0.15s ease-out;
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
