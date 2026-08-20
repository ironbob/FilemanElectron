<template>
  <div class="finder-preview h-full flex flex-col bg-bg-secondary relative overflow-hidden">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">{{ $t('preview.image.loading') }}</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">{{ $t('preview.image.loadFailed') }}</p>
      <p class="text-xs">{{ errorMessage }}</p>
    </div>

    <!-- 三区布局：① 顶部工具栏 ② 画布 + 右侧轨道列 ③ 底部状态栏 -->
    <div v-else class="flex-1 flex flex-col overflow-hidden min-h-0">
      <!-- ① Quick Look 单行合并工具栏（2026-08-20 Finder 化，对齐文本窗 08-19 先例）：
           名称/元信息 + 缩放组 + % 徽标 + 旋转组 + 步进/关闭胶囊同行；
           替代 编辑工具栏+底部状态栏 双 chrome。按钮全走 finder-control-group 家族。 -->
      <div v-if="quickLook" class="finder-preview-toolbar flex-shrink-0 flex items-center gap-2 px-3 border-b border-border" role="toolbar" :aria-label="$t('preview.editToolbar.toolbarAria')">
        <span class="text-[15px] font-medium text-text-primary truncate" data-testid="quick-look-name">{{ file.name }}</span>
        <span
          v-if="qlMeta"
          class="text-xs whitespace-nowrap flex-shrink-0"
          style="color: var(--finder-secondary-label)"
          data-testid="quick-look-meta"
        >{{ qlMeta }}</span>
        <div class="flex-1"></div>
        <div class="finder-control-group">
          <button class="finder-icon-button" :title="$t('preview.editToolbar.fitWindow')" :aria-label="$t('preview.editToolbar.fitWindow')" @click="setFitMode('contain')">
            <IconfontIcon name="fit" />
          </button>
          <button class="finder-icon-button" :title="$t('preview.common.zoomOutTip')" :aria-label="$t('preview.common.zoomOutTip')" @click="zoomOut">
            <IconfontIcon name="zoomOut" />
          </button>
          <button class="finder-icon-button" :title="$t('preview.common.zoomInTip')" :aria-label="$t('preview.common.zoomInTip')" @click="zoomIn">
            <IconfontIcon name="zoomIn" />
          </button>
        </div>
        <span class="finder-preview-badge tabular-nums" data-testid="quick-look-zoom">{{ displayScale }}</span>
        <div class="finder-control-group">
          <button class="finder-icon-button" :title="$t('preview.image.rotateLeftTip')" :aria-label="$t('preview.image.rotateLeftTip')" @click="rotateLeft">
            <IconfontIcon name="rotateLeft" />
          </button>
          <button class="finder-icon-button" :title="$t('preview.image.rotateLeftTip')" :aria-label="$t('preview.image.rotateLeftTip')" @click="rotateRight">
            <IconfontIcon name="rotateRight" />
          </button>
        </div>
        <div class="finder-control-group">
          <button
            class="finder-icon-button"
            :title="$t('preview.quickLook.prevTip')"
            :aria-label="$t('preview.quickLook.prevTip')"
            :disabled="!quickLookControls || quickLookControls.index <= 0"
            @click="quickLookControls?.step(-1)"
          >
            <IconfontIcon name="up" />
          </button>
          <button
            class="finder-icon-button"
            :title="$t('preview.quickLook.nextTip')"
            :aria-label="$t('preview.quickLook.nextTip')"
            :disabled="!quickLookControls || quickLookControls.index >= (quickLookControls.total ?? 1) - 1"
            @click="quickLookControls?.step(1)"
          >
            <IconfontIcon name="down" />
          </button>
          <button class="finder-icon-button" :title="$t('preview.quickLook.closeTip')" :aria-label="$t('preview.quickLook.closeTip')" @click="quickLookControls?.close()">
            <IconfontIcon name="close" />
          </button>
        </div>
      </div>

      <!-- ① 顶部工具栏（完整预览 tab；恒显——标注/裁剪中不再隐藏；集合导航收编于此） -->
      <ImageEditTopToolbar
        v-if="!quickLook"
        :mode="edit?.mode.value ?? 'idle'"
        :editable="edit?.editable.value ?? false"
        :collection="collection ?? null"
        :display-scale="displayScale"
        :annotations-visible="edit?.annotationsVisible.value ?? true"
        :running="edit?.batchRunning.value ?? false"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @fit-window="setFitMode('contain')"
        @actual-size="setFitMode('actual')"
        @zoom-to="zoomTo"
        @rotate-left="rotateLeft"
        @rotate-right="rotateRight"
        @crop="enterCropMode"
        @annotate="toggleAnnotateMode"
        @toggle-annotations="edit && (edit.annotationsVisible.value = !edit.annotationsVisible.value)"
        @done="onDone"
        @prev-image="stepCollection?.(-1)"
        @next-image="stepCollection?.(1)"
        @compress="edit?.requestCompress()"
        @batch-compress="edit?.openBatchCompress()"
        @batch-rename="edit?.openRename()"
      />

      <!-- ② 画布区 + 右侧标注轨道列（独占布局列，结构上不可能遮挡画布） -->
      <div class="flex-1 flex min-h-0 min-w-0">
        <div
          ref="imageContainerRef"
          class="image-container flex-1 overflow-hidden flex items-center justify-center p-4 cursor-grab relative min-w-0"
          @wheel="handleWheel"
          @mousedown="startDrag"
          @mousemove="handleDrag"
          @mouseup="endDrag"
          @mouseleave="endDrag"
          @pointerdown.capture="paramPopoverVisible = false"
        >
          <img
            v-if="imageSrc"
            ref="imageRef"
            :src="imageSrc"
            class="rounded-lg shadow-lg select-none"
            :class="[getImageClass, isDragging ? 'transition-none' : 'transition-transform duration-150']"
            :style="getImageStyle"
            @load="handleImageLoad"
            @error="handleImageError"
            draggable="false"
          />

          <!-- 裁剪浮层（自带底部比例/确认操作条；几何映射用实测 img rect） -->
          <ImageCropOverlay
            v-if="edit && edit.mode.value === 'crop'"
            v-model="cropDisplayRect"
            :layout="cropLayout"
            @cancel="edit.exitCrop()"
            @apply="edit.requestCropApply()"
          />

          <!-- 标注浮层（选择/绘制/缩放/文字编辑） -->
          <ImageAnnotateOverlay
            v-if="edit && edit.mode.value === 'annotate'"
            ref="annotateOverlayRef"
            :edit="edit"
            :layout="cropLayout"
          />

          <!-- 对象上下文工具条（选中包围盒上方浮动，画布内夹紧） -->
          <SelectionContextBar
            v-if="edit && edit.mode.value === 'annotate' && contextBarBox"
            class="absolute z-30"
            :style="contextBarStyle"
            :color="contextStyle.color"
            :width="contextStyle.width"
            :colors="ANNO_COLORS"
            :widths="ANNO_WIDTHS"
            @update="patch => edit?.setAnnoParam(patch)"
            @duplicate="edit?.duplicateShapes(edit.selectedIds.value)"
            @delete="edit?.deleteShapes(edit.selectedIds.value)"
          />
        </div>

        <!-- 右侧轨道列（64px：12 间距 + 52 面板） -->
        <div v-if="edit && edit.mode.value === 'annotate'" class="w-16 flex-shrink-0 flex items-center justify-center">
          <AnnotationRail
            :tool="edit.annoTool.value"
            :can-undo="edit.canUndo.value"
            :can-redo="edit.canRedo.value"
            :has-selection="edit.selectedIds.value.length > 0"
            @pick="pickTool"
            @undo="edit.undoAnno()"
            @redo="edit.redoAnno()"
            @delete="edit.deleteShapes(edit.selectedIds.value)"
          />
        </div>

        <!-- 绘制参数 Popover（轨道左侧，选中绘制工具弹出；画布交互自动收起） -->
        <ToolParamPopover
          v-if="edit && edit.mode.value === 'annotate' && paramPopoverVisible && edit.activeParam.value"
          class="absolute right-[76px] top-1/2 -translate-y-1/2 z-40"
          :param="edit.activeParam.value"
          :tool="edit.annoTool.value"
          :has-selection="edit.selectedIds.value.length > 0"
          :colors="ANNO_COLORS"
          :widths="ANNO_WIDTHS"
          @update="patch => edit?.setAnnoParam(patch)"
          @close="paramPopoverVisible = false"
        />
      </div>

      <!-- ③ 底部状态栏（完整预览 tab；Quick Look 下信息已并入单行工具栏） -->
      <div v-if="!quickLook" class="img-status-bar h-8 flex-shrink-0 flex items-center gap-3 px-3 text-[11px]">
        <!-- 辅助技术播报：当前工具 / 选中对象数（设计 §12） -->
        <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>
        <span class="font-semibold text-text-primary truncate max-w-[240px]" :title="file.name">{{ file.name }}</span>
        <span class="text-text-tertiary tabular-nums">{{ formatSize(file.size) }}</span>
        <span v-if="imageDimensions.width" class="text-text-tertiary tabular-nums">{{ imageDimensions.width }} × {{ imageDimensions.height }}</span>
        <span class="text-text-tertiary tabular-nums">{{ displayScale }}</span>
        <div class="flex-1"></div>
        <span v-if="edit?.flashMessage.value" class="text-text-secondary truncate max-w-[40%]">{{ edit.flashMessage.value }}</span>
        <span v-if="edit?.error.value" class="text-red-400 truncate max-w-[30%]" :title="edit.error.value">{{ edit.error.value }}</span>
        <template v-if="edit && edit.mode.value === 'annotate' && edit.annoDirty.value">
          <span class="edited-dot"></span>
          <span class="text-text-secondary">{{ $t('preview.editToolbar.editedBadge') }}</span>
        </template>
      </div>
    </div>

    <!-- 未保存确认（退出标注 / 集合切图共用；VM 持有开合与回调） -->
    <div
      v-if="edit?.unsavedPrompt.value"
      class="absolute inset-0 z-[70] flex items-center justify-center bg-black/35"
      role="alertdialog"
      :aria-label="$t('preview.editToolbar.unsavedAria')"
      @pointerdown.self.prevent
    >
      <div class="edit-panel p-5 w-[340px] text-center">
        <svg class="w-8 h-8 mx-auto mb-2 text-[color:var(--edit-warning)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        <h3 class="text-sm font-semibold text-text-primary">{{ $t('preview.editToolbar.unsavedTitle', { name: file.name }) }}</h3>
        <p class="mt-1.5 text-xs text-text-secondary">{{ $t('preview.editToolbar.unsavedBody') }}</p>
        <div class="mt-4 flex justify-center gap-2">
          <button class="edit-secondary-btn !h-7" @click="edit?.resolveUnsaved('discard')">{{ $t('preview.editToolbar.unsavedDiscard') }}</button>
          <button class="edit-secondary-btn !h-7" @click="edit?.resolveUnsaved('cancel')">{{ $t('preview.editToolbar.unsavedCancel') }}</button>
          <button class="edit-primary-btn !h-7" @click="edit?.resolveUnsaved('store')">{{ $t('preview.editToolbar.unsavedStore') }}</button>
        </div>
      </div>
    </div>

    <!-- 保存 Sheet（顶部吸附实色；导出副本默认） -->
    <ImageSaveSheet
      v-if="edit && edit.saveDialogVisible.value"
      :file-name="file.name"
      :file-dir="fileDir"
      :source-bytes="file.size"
      :dims="imageDimensions"
      :estimate="edit.estimate.value"
      :estimating="edit.estimating.value"
      :applying="edit.applying.value"
      :error="edit.error.value"
      :compress-default="edit.pendingCompress.value"
      :has-edits="!!(edit.pendingCrop.value || edit.pendingAnnotate.value)"
      @close="edit.closeSaveDialog()"
      @params-change="edit.refreshEstimate"
      @confirm="edit.confirmSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import type { ImageFitMode, QuickLookControls } from '@/types/preview'
import { needsNativeDecode } from '@/utils/fileTypes'
import { displayedToSourceRect, type ImageLayout, type Rect } from '@/utils/cropGeometry'
import type { ImageEditController } from '@/composables/useImageEdit'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { ANNO_COLORS, ANNO_WIDTHS, type AnnoTool } from '@/utils/annotationShapes'
import ImageEditTopToolbar from './ImageEditTopToolbar.vue'
import IconfontIcon from './IconfontIcon.vue'
import AnnotationRail from './AnnotationRail.vue'
import ToolParamPopover from './ToolParamPopover.vue'
import SelectionContextBar from './SelectionContextBar.vue'
import ImageCropOverlay from './ImageCropOverlay.vue'
import ImageAnnotateOverlay from './ImageAnnotateOverlay.vue'
import ImageSaveSheet from './ImageSaveSheet.vue'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewImageContent] ${message}`, ...args)
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 编辑控制器（PreviewView 创建，经 Router 下传；QuickLook 无） */
  edit?: ImageEditController
  /** 集合会话导航信息（多图；PreviewView 提供） */
  collection?: { index: number; total: number } | null
  /** 集合步进（PreviewView 提供；dirty 时由 VM 弹未保存确认） */
  stepCollection?: (delta: number) => void
  /** Quick Look 浮层模式：单行合并工具栏（编辑工具栏/状态栏退场） */
  quickLook?: boolean
  /** Quick Look 步进/关闭（经 Router 下传；仅 quickLook 模式消费） */
  quickLookControls?: QuickLookControls
}>()

// Loading state
const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const imageSrc = ref('')
const imageRef = ref<HTMLImageElement | null>(null)
const imageContainerRef = ref<HTMLElement | null>(null)
const imageDimensions = ref({ width: 0, height: 0 })

// Image manipulation state
const scale = ref(1)
const rotation = ref(0)
const translateX = ref(0)
const translateY = ref(0)
const fitMode = ref<ImageFitMode>('contain')
const isDragging = ref(false)

// Drag tracking
let dragStartX = 0
let dragStartY = 0
let lastTranslateX = 0
let lastTranslateY = 0

/** 真实像素百分比（contain 下 = 显示宽/自然宽；actual 下 = scale）。 */
const displayScale = computed(() => {
  if (fitMode.value === 'actual') return Math.round(scale.value * 100) + '%'
  const fitted = fittedSize.value
  const dims = imageDimensions.value
  if (!fitted || !dims.width) return '100%'
  return Math.round(((fitted.width * scale.value) / dims.width) * 100) + '%'
})

/** Quick Look 单行工具栏元信息：大小 · 尺寸 · n / n（单一低层级辅助文字）。 */
const qlMeta = computed(() => {
  const parts = [formatSize(props.file.size)]
  if (imageDimensions.value.width) {
    parts.push(`${imageDimensions.value.width} × ${imageDimensions.value.height}`)
  }
  const c = props.quickLookControls
  if (c && c.total > 1) parts.push(`${c.index + 1} / ${c.total}`)
  return parts.join(' · ')
})

const getImageClass = computed(() => {
  return {
    'object-contain': fitMode.value === 'contain',
    'object-cover': fitMode.value === 'cover',
    'object-none': fitMode.value === 'actual',
    'cursor-grabbing': isDragging.value
  }
})

/** contain 模式的短边适配边距（图像最长边 = 容器短边 − 2×margin）。 */
const FIT_MARGIN_PX = 24

/** 容器尺寸（ResizeObserver 维护；供短边适配与裁剪/标注布局）。 */
const containerSize = ref({ width: 0, height: 0 })

/** contain 显示尺寸：图像最长边适配容器短边（含 margin），居中由 flex 完成。 */
const fittedSize = computed(() => {
  const dims = imageDimensions.value
  const longest = Math.max(dims.width, dims.height)
  const shortSide = Math.min(containerSize.value.width, containerSize.value.height)
  if (!longest || !shortSide) return null
  const target = Math.max(1, shortSide - FIT_MARGIN_PX * 2)
  const ratio = target / longest
  return { width: Math.round(dims.width * ratio), height: Math.round(dims.height * ratio) }
})

const getImageStyle = computed(() => {
  const tx = translateX.value
  const ty = translateY.value
  const s = scale.value
  const r = rotation.value

  const style: Record<string, string> = {}
  // contain：显式设定短边适配尺寸（小图放大、大图缩小都以此为准）
  if (fitMode.value === 'contain' && fittedSize.value) {
    style.width = `${fittedSize.value.width}px`
    style.height = `${fittedSize.value.height}px`
  }
  if (tx !== 0 || ty !== 0 || s !== 1 || r !== 0) {
    // translate FIRST so pan is always in screen-space regardless of zoom level.
    style.transform = `translate(${tx}px, ${ty}px) scale(${s}) rotate(${r}deg)`
  }
  return style
})

const fileDir = computed(() => {
  const parts = props.file.path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '/'
})

// Helper functions
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

// Image loading
async function loadImage() {
  log('Loading image:', props.file.name, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  // Reset view state
  resetView()

  // Clean up previous image
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = ''
  }

  try {
    if (needsNativeDecode(props.file.extension || '')) {
      // HEIC/HEIF/TIFF/PSD/相机 RAW 等 Chromium 无法解码的格式：
      // 走主进程 sips（ImageDecodeService）转 JPEG 栅格。
      const decoded = await window.fileman.decodeNativeImage(
        props.deviceId,
        props.file.path,
        { maxDim: 4096 }
      )
      imageSrc.value = `data:${decoded.mime};base64,${decoded.buffer}`
    } else {
      const base64 = await window.fileman.readFile(props.deviceId, props.file.path)

      const buffer = base64ToArrayBuffer(base64)
      const mimeType = getMimeType(props.file.extension || '')

      const blob = new Blob([buffer], { type: mimeType })
      imageSrc.value = URL.createObjectURL(blob)
    }
  } catch (e) {
    console.error('[PreviewImageContent] Error loading image:', e)
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : t('preview.common.unknownError')
  } finally {
    loading.value = false
  }
}

// Event handlers
function handleImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imageDimensions.value = {
    width: img.naturalWidth,
    height: img.naturalHeight
  }
  props.edit?.setNaturalSize(img.naturalWidth, img.naturalHeight)
  layoutTick.value++
  log('Image loaded, dimensions:', imageDimensions.value)
}

function handleImageError(e: Event) {
  console.error('[PreviewImageContent] Image load error:', e)
  hasError.value = true
  errorMessage.value = t('preview.image.displayFailed')
}

// ── 裁剪接线（几何事实源 = 实测 img rect，规避 transform/object-fit 数学） ─────
const cropDisplayRect = ref<Rect | null>(null)
const layoutTick = ref(0)

const cropLayout = computed<ImageLayout>(() => {
  layoutTick.value // 依赖：加载/缩放/视口变化时 bump
  const container = imageContainerRef.value
  const img = imageRef.value
  const dims = imageDimensions.value
  if (!container || !img || dims.width === 0) {
    return { containerWidth: 1, containerHeight: 1, naturalWidth: dims.width || 1, naturalHeight: dims.height || 1, fitMode: fitMode.value }
  }
  const cRect = container.getBoundingClientRect()
  const iRect = img.getBoundingClientRect()
  return {
    containerWidth: cRect.width,
    containerHeight: cRect.height,
    naturalWidth: dims.width,
    naturalHeight: dims.height,
    fitMode: fitMode.value,
    displayedRect: {
      x: iRect.left - cRect.left,
      y: iRect.top - cRect.top,
      width: iRect.width,
      height: iRect.height
    }
  }
})

// 缩放/平移/旋转变换即时重算布局（标注/裁剪浮层随动，不再隐藏工具栏）
watch([scale, rotation, translateX, translateY], () => {
  layoutTick.value++
})

watch(cropDisplayRect, rect => {
  if (!rect || !props.edit) return
  props.edit.setCropRect(displayedToSourceRect(rect, cropLayout.value))
})

function enterCropMode() {
  // 裁剪前复位视图：旋转/缩放态下的裁剪几何不支持（已知限制）
  resetView()
  layoutTick.value++
  props.edit?.startCrop()
}

// ── 标注接线 ─────────────────────────────────────────────────────────────────
const annotateOverlayRef = ref<InstanceType<typeof ImageAnnotateOverlay> | null>(null)

/** 参数 Popover 开合：选绘制工具自动弹出；再点当前工具手动开合；画布交互收起。 */
const paramPopoverVisible = ref(false)

watch(
  () => props.edit?.annoTool.value,
  tool => {
    if (!props.edit || props.edit.mode.value !== 'annotate') return
    if (tool && tool !== 'select') paramPopoverVisible.value = true
  }
)

function pickTool(tool: 'select' | AnnoTool) {
  const edit = props.edit
  if (!edit) return
  if (edit.annoTool.value === tool) {
    if (tool !== 'select') paramPopoverVisible.value = !paramPopoverVisible.value
    return
  }
  edit.annoTool.value = tool
  paramPopoverVisible.value = tool !== 'select'
}

/** 标注模式进入/退出（进入复位视图：与裁剪同限制）。 */
function toggleAnnotateMode() {
  if (!props.edit) return
  if (props.edit.mode.value === 'annotate') {
    requestExitAnnotate()
    return
  }
  resetView()
  layoutTick.value++
  paramPopoverVisible.value = false
  props.edit.startAnnotate()
}

/** 完成：VM 统一入口（dirty → 保存 Sheet；clean → 直接退出标注）。 */
function onDone() {
  props.edit?.completeEdit()
}

/** 退出标注（dirty 时经未保存确认）。 */
function requestExitAnnotate() {
  const edit = props.edit
  if (!edit) return
  edit.requestAnnotateExit({
    onDiscard: () => edit.exitAnnotate(),
    onStore: () => applyAnnotate()
  })
}

/** 保存标注：VM 自含导出（shapes → 透明 PNG，natural 空间）→ 保存 Sheet。 */
function applyAnnotate() {
  props.edit?.requestAnnotateApply()
}

/** 上下文浮动条定位：选中包围盒（容器坐标）上方 12px，画布内夹紧。 */
const contextBarBox = computed(() => annotateOverlayRef.value?.selectionDisplayBox ?? null)

const contextBarStyle = computed(() => {
  const box = contextBarBox.value
  if (!box) return {}
  const barW = 210
  const left = Math.max(8, Math.min(box.x + box.width / 2 - barW / 2, containerSize.value.width - barW - 8))
  const top = box.y - 12 - 36 >= 8 ? box.y - 12 - 36 : box.y + box.height + 12
  return { left: `${left}px`, top: `${top}px` }
})

/** 上下文条显示的当前值（首个选中对象的样式）。 */
const contextStyle = computed(() => {
  const edit = props.edit
  if (!edit || edit.selectedIds.value.length === 0) return { color: '#FF3B30', width: 4 }
  const first = edit.shapes.value.find(s => s.id === edit.selectedIds.value[0])
  if (!first) return { color: '#FF3B30', width: 4 }
  return { color: first.color, width: first.strokeWidth }
})

/** 辅助技术播报（aria-live）：选中对象数优先，其次当前工具。 */
const TOOL_NAME_KEYS: Record<string, string> = {
  select: 'toolSelect',
  arrow: 'toolArrow',
  rect: 'toolRect',
  ellipse: 'toolEllipse',
  freehand: 'toolFreehand',
  text: 'toolText'
}
const liveAnnouncement = computed(() => {
  const edit = props.edit
  if (!edit || edit.mode.value !== 'annotate') return ''
  const sel = edit.selectedIds.value.length
  if (sel > 0) return t('preview.editToolbar.selectedCount', { n: sel })
  return t(`preview.editToolbar.${TOOL_NAME_KEYS[edit.annoTool.value] ?? 'toolSelect'}`)
})

// Esc 阶梯终点：浮层内层（文字/绘制/选中/Popover）已被消费，这里退出标注（dirty 先确认）
useKeyInterceptor(e => {
  if (!props.edit || e.key !== 'Escape') return false
  if (props.edit.mode.value !== 'annotate') return false
  e.preventDefault()
  requestExitAnnotate()
  return true
})

// 视口/缩放变化重算布局（ResizeObserver 兜底窗口拖拽；同步容器尺寸供短边适配）
let resizeObserver: ResizeObserver | null = null
watch(imageContainerRef, el => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (el) {
    resizeObserver = new ResizeObserver(entries => {
      const box = entries[0]?.target.getBoundingClientRect()
      if (box) containerSize.value = { width: box.width, height: box.height }
      layoutTick.value++
    })
    resizeObserver.observe(el)
    const rect = el.getBoundingClientRect()
    containerSize.value = { width: rect.width, height: rect.height }
  }
})
onUnmounted(() => resizeObserver?.disconnect())

// Zoom controls
function zoomIn() {
  if (scale.value < 10) {
    scale.value = Math.min(scale.value + 0.25, 10)
  }
}

function zoomOut() {
  if (scale.value > 0.1) {
    scale.value = Math.max(scale.value - 0.1, 0.1)
  }
}

/** 缩放菜单目标百分比（真实像素；居中还原平移）。 */
function zoomTo(pct: number) {
  const target = pct / 100
  if (fitMode.value === 'actual') {
    scale.value = Math.max(0.1, Math.min(target, 10))
  } else {
    const fitted = fittedSize.value
    const dims = imageDimensions.value
    if (fitted && dims.width) {
      scale.value = Math.max(0.1, Math.min((target * dims.width) / fitted.width, 10))
    }
  }
  translateX.value = 0
  translateY.value = 0
}

function resetView() {
  scale.value = 1
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  fitMode.value = 'contain'
}

// Rotation controls
function rotateLeft() {
  rotation.value = (rotation.value - 90 + 360) % 360
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
}

// Fit mode
function setFitMode(mode: ImageFitMode) {
  fitMode.value = mode
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

// Wheel zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault()

  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(scale.value + delta, 10))

  if (newScale !== scale.value) {
    // Zoom towards cursor position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const offsetX = mouseX - centerX
    const offsetY = mouseY - centerY

    const scaleFactor = newScale / scale.value

    translateX.value = offsetX - (offsetX - translateX.value) * scaleFactor
    translateY.value = offsetY - (offsetY - translateY.value) * scaleFactor

    scale.value = newScale
  }
}

// Drag handlers
function startDrag(e: MouseEvent) {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  lastTranslateX = translateX.value
  lastTranslateY = translateY.value
  ;(e.currentTarget as HTMLElement).style.cursor = 'grabbing'
}

function handleDrag(e: MouseEvent) {
  if (!isDragging.value) return

  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY

  translateX.value = lastTranslateX + dx
  translateY.value = lastTranslateY + dy
}

function endDrag() {
  isDragging.value = false
  const container = document.querySelector('.image-container')
  if (container) {
    ;(container as HTMLElement).style.cursor = ''
  }
}

// Watch for file changes
watch(() => props.file, (newFile, oldFile) => {
  // 覆盖保存后 path 不变但 size 变化 → 同样重载（IFC-7 后置条件）
  if (newFile && (newFile.path !== oldFile?.path || newFile.size !== oldFile?.size)) {
    loadImage()
  }
}, { immediate: true })

// Cleanup
onUnmounted(() => {
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})
</script>

<style scoped>
.image-container {
  user-select: none;
}

.select-none {
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}

.cursor-grab {
  cursor: grab;
}

.cursor-grabbing {
  cursor: grabbing;
}

.img-status-bar {
  background: var(--finder-chrome);
  border-top: 1px solid var(--finder-divider);
}

.edited-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--edit-warning);
  flex-shrink: 0;
}
</style>
