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
           不支持态（2026-08-20）共用同一材质（--plain）+ 紧凑固定几何。
           图片/视频维持 70%×70% 实色画布（各自内容面自管背景）。 -->
      <div
        class="quick-look-card relative flex flex-col rounded-xl border overflow-hidden app-no-drag"
        :class="cardClass"
        :style="cardStyle"
        role="dialog"
        :aria-label="$t('preview.quickLook.dialogAria')"
      >
        <!-- Header：仅视频/不支持态。文本与图片类头部已并入内容工具栏单行
             （文本 2026-08-19、图片 2026-08-20 合并重设计）：
             文件名/元信息/内容动作/步进关闭全部同基线，右端胶囊组。
             不支持态（2026-08-20）加高 52px（is-tall）：名称 + 大小·类型·第n项共m项，
             右侧步进组｜细分隔线｜独立关闭钮（28px 热区，组间不混排）。
             三钮图标 = IconPark 描边组 StepUp/StepDown/CloseX（iconfont.cn
             cid=48811，previewToolIcons 提取），与文本/图片窗 QL 三钮同源同重量。 -->
        <div
          v-if="!isMergedKind"
          class="finder-preview-toolbar flex items-center justify-between border-b border-border"
          :class="isUnsupportedKind ? 'is-tall' : ''"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-[15px] font-medium text-text-primary truncate" data-testid="quick-look-name">{{ currentFile.name }}</span>
            <span
              v-if="headerMeta"
              class="text-xs whitespace-nowrap flex-shrink-0"
              style="color: var(--finder-secondary-label)"
              data-testid="quick-look-meta"
            >{{ headerMeta }}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="finder-control-group">
              <button
                class="finder-icon-button"
                :title="$t('preview.quickLook.prevTip')"
                :disabled="index <= 0"
                data-testid="ql-step-prev"
                @click="step(-1)"
              >
                <StepUpIcon class="w-[18px] h-[18px]" />
              </button>
              <button
                class="finder-icon-button"
                :title="$t('preview.quickLook.nextTip')"
                :disabled="index >= total - 1"
                data-testid="ql-step-next"
                @click="step(1)"
              >
                <StepDownIcon class="w-[18px] h-[18px]" />
              </button>
            </div>
            <span class="finder-toolbar-divider" aria-hidden="true" />
            <button
              class="finder-icon-button"
              :title="$t('preview.quickLook.closeTip')"
              data-testid="ql-close"
              @click="close"
            >
              <CloseXIcon class="w-[18px] h-[18px]" />
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
            :quick-look="isMergedKind"
            :quick-look-controls="isMergedKind ? qlControls : undefined"
          />
        </div>
        <!-- 不支持态空状态（2026-08-20 Finder 化）：层级 名称 → 类型·大小 → 说明，
             视觉中心略上抬（pb-14 抵消下方空区）；通用文档图标 52px/1.25 描边。
             仅渲染有真实能力的辅助钮（完整预览 tab / Finder 定位）——
             远程设备、ZIP 内条目（"zip::inner"）、目录相应不出现，不加假按钮。 -->
        <div v-else class="flex-1 min-h-0 flex flex-col items-center justify-center px-8 pb-14 text-center select-none">
          <svg class="w-[52px] h-[52px] mb-5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-[15px] font-semibold text-text-primary break-all" data-testid="quick-look-unsupported-title">
            {{ $t('preview.quickLook.unsupportedTitle', { name: currentFile.name }) }}
          </p>
          <p class="text-[13px] mt-1.5 whitespace-nowrap max-w-full truncate" style="color: var(--finder-secondary-label)">
            {{ kindText }} · {{ sizeLabel }}
          </p>
          <p class="text-[13px] mt-1 text-text-tertiary" data-testid="quick-look-unsupported-desc">{{ unsupportedDesc }}</p>
          <div v-if="canOpenFullPreview || canRevealInFinder" class="flex items-center gap-2.5 mt-6">
            <button
              v-if="canOpenFullPreview"
              class="finder-btn-secondary"
              data-testid="quick-look-open-full"
              @click="openFullPreview"
            >{{ $t('preview.quickLook.openFullPreview') }}</button>
            <button
              v-if="canRevealInFinder"
              class="finder-btn-secondary"
              data-testid="quick-look-reveal"
              @click="revealInFinder"
            >{{ $t('preview.quickLook.revealInFinder') }}</button>
          </div>
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
import { t } from '@/i18n'
import PreviewContentRouter from './PreviewContentRouter.vue'
import { StepUpIcon, StepDownIcon, CloseXIcon } from '@/components/icons/previewToolIcons'
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

/** 不支持态（目录/音频/PDF/ZIP/二进制…）：材质空窗（quick-look-card--plain）。 */
const isUnsupportedKind = computed(() => !kindSupported.value)

/** 类型标签：与 FileList「种类」列同一词表（文件夹 / {EXT} 文档 / 文档）。 */
const kindText = computed(() => {
  const file = currentFile.value
  if (!file) return ''
  if (file.isDirectory) return t('fileList.kind.folder')
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toUpperCase() : ''
  return ext ? t('fileList.kind.extDocument', { ext }) : t('fileList.kind.document')
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

/** 单行合并类（文本 08-19 / 图片 08-20）：头部让位，工具栏由内容组件承载。 */
const isMergedKind = computed(() =>
  kindSupported.value && !!currentFile.value && ['text', 'image'].includes(getPreviewType(currentFile.value))
)

/** 卡片外观：文本/不支持态走系统材质窗（--text/--plain 规则同源），视频/图片实色画布。 */
const cardClass = computed(() => {
  if (isTextKind.value) return 'quick-look-card--text'
  if (isUnsupportedKind.value) return 'quick-look-card--plain'
  return 'border-border bg-bg-primary'
})

const TEXT_MIN_CARD_HEIGHT = 420
const TEXT_MAX_CARD_HEIGHT = 760

const cardStyle = computed<Record<string, string>>(() => {
  // 不支持态：紧凑固定窗（min(70%, 620×440)）——空状态在 70% 大窗里
  // 只会退化成大面积留白，收小后层级与留白才成立
  if (isUnsupportedKind.value) {
    return { width: 'min(70%, 620px)', height: 'min(70%, 440px)' }
  }
  if (!isTextKind.value) {
    return { width: '70%', height: '70%' }
  }
  const cap = overlayHeight.value > 0 ? Math.floor(overlayHeight.value * 0.7) : 460
  const height = Math.max(TEXT_MIN_CARD_HEIGHT, Math.min(cap, TEXT_MAX_CARD_HEIGHT))
  // 宽度相对遮罩区取 90%（≈90vw，主区内不溢出），封顶 1200px
  return { width: 'min(90%, 1200px)', height: `${height}px` }
})

/** 头部元信息（视频/不支持态共享）：大小 · [类型] · 第 n 项，共 m 项
     （不支持态多给类型——它没有内容面可承载该信息；单文件不显序号）。 */
const headerMeta = computed(() => {
  const parts: string[] = [sizeLabel.value]
  if (isUnsupportedKind.value) parts.push(kindText.value)
  if (total.value > 1) {
    parts.push(t('preview.quickLook.itemOfTotal', { index: index.value + 1, total: total.value }))
  }
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

/** 空状态说明：目录 / 未知格式 / 已知但不支持的类型 三档文案。 */
const unsupportedDesc = computed(() => {
  const file = currentFile.value
  if (!file) return t('preview.quickLook.unsupportedDesc')
  if (file.isDirectory) return t('preview.quickLook.unsupportedFolderDesc')
  return getPreviewType(file) === 'unknown'
    ? t('preview.quickLook.unsupportedUnknownDesc')
    : t('preview.quickLook.unsupportedDesc')
})

// ── 空状态辅助动作（只挂真实能力，勿加假按钮）────────────────────────────────
// 完整预览 tab：音频/PDF/ZIP/十六进制（未知格式嗅探后兜底 hex）均有内容面。
const canOpenFullPreview = computed(() => !!currentFile.value && !currentFile.value.isDirectory)
// Finder 定位：shell.showInFolder 只接受本机实路径——远程设备与 ZIP 虚拟
// 路径（"<zip>::<inner>"）不适用。
const canRevealInFinder = computed(() => {
  const file = currentFile.value
  return deviceId.value === 'local' && !!file && !file.path.includes('::')
})

function openFullPreview() {
  const file = currentFile.value
  if (!file) return
  previewStore.openPreview(file, deviceId.value)
  close()
}

function revealInFinder() {
  const path = currentFile.value?.path
  if (!path) return
  window.fileman.showInFolder(path).catch((err) => {
    console.error('[QuickLookOverlay] showInFolder failed for', path, err)
  })
}

// capture 阶段消费 Esc/Space/↑↓（+ 不支持态的 ←→），保证 FileList / App.vue 的
// bubble 监听不穿透。组件常驻挂载（内部 v-if 控制显隐），注册顺序先于动态弹窗
// → LIFO 下动态弹窗优先。
//
// 注意三点：
// 1. 消费时必须 preventDefault——stopImmediatePropagation 只拦截监听器，不阻止
//    浏览器默认行为（Space/方向键会滚动 FileList 虚拟列表）。
// 2. 不做 isTextEditingTarget 守卫：Quick Look 是模态浮层，点击文本预览会让
//    Monaco 的隐藏 textarea 获得焦点，若因此放行，Space/↑↓ 会落入编辑器而
//    无法关闭/步进。模态期间这三个键无条件归浮层所有（其它字符仍可输入）。
// 3. ←→ 仅在不支持态消费——文本/图片窗的编辑器与选区交互仍需要左右键；
//    不支持态无内容面，左右键步进与 Finder 语义一致（2026-08-20）。
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
  if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isUnsupportedKind.value)) {
    e.preventDefault()
    step(1)
    return true
  }
  if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && isUnsupportedKind.value)) {
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
