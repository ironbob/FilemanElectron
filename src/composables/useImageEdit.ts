import { ref, shallowRef, computed, watch, onUnmounted, type Ref } from 'vue'
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import type {
  EditAnnotate,
  EditCompressParams,
  EditEstimateResult,
  EditOps,
  EditSaveSpec,
  ImageEditBatchProgress
} from '@shared/types'
import { isEditableImageExt } from '@shared/fileKinds'
import { usePreviewStore } from '@/stores/preview'
import type { Rect } from '@/utils/cropGeometry'
import { ANNO_COLORS, ANNO_WIDTHS, type AnnoShape, type AnnoTool } from '@/utils/annotationShapes'

const log = console

export type ImageEditMode = 'idle' | 'crop' | 'annotate'

/** PreviewView 创建后经 PreviewContentRouter 下传给图片内容的编辑控制器。 */
export type ImageEditController = ReturnType<typeof useImageEdit>

export interface UseImageEditOptions {
  /** 当前图片（集合会话步进时变化） */
  file: Ref<FileInfo | null>
  deviceId: string
  /** 图片集合预览会话 id（保存后同步刷新；单文件预览可不传） */
  sessionId?: string
  /** 批量目标（集合全部图片路径）；无集合为 null */
  collectionPaths?: () => string[] | null
}

/**
 * 图片编辑会话 ViewModel（feature-scoped，对齐 useHexViewer 先例）。
 *
 * 职责：编辑模式状态机（裁剪/标注）、裁剪矩形与标注形状持有、压缩参数预估
 * （300ms 节流）、apply 编排与错误呈现、批量压缩任务订阅/取消、底部工具条
 * 开合状态（纯手动，任何模式/换图/保存事件都不自动改变）。
 * View（Toolbar/Overlay/Dialogs）只渲染与转发意图。
 */
export function useImageEdit(options: UseImageEditOptions) {
  const { file, deviceId, sessionId, collectionPaths } = options
  const previewStore = usePreviewStore()

  const mode = ref<ImageEditMode>('idle')
  const aspect = ref<number | null>(null)
  /** 裁剪矩形（显示 natural 空间，源像素坐标；apply 时附 referenceWidth） */
  const cropRect = ref<Rect | null>(null)
  /** 待保存对话框确认的 ops（裁剪 Apply / 标注 Apply / 压缩入口置入） */
  const saveDialogVisible = ref(false)
  const pendingCrop = ref<Rect | null>(null)
  const pendingAnnotate = shallowRef<EditAnnotate | null>(null)
  const pendingCompress = ref(false)
  const estimate = ref<EditEstimateResult | null>(null)
  const estimating = ref(false)
  const applying = ref(false)
  const error = ref('')

  /** 底部工具条开合：默认收起，仅由用户点击右下角按钮切换（严格无自动行为）。 */
  const toolbarExpanded = ref(false)
  function toggleToolbar() {
    toolbarExpanded.value = !toolbarExpanded.value
  }

  const editable = computed(() => {
    const f = file.value
    return !!f && !f.isDirectory && deviceId === 'local' && isEditableImageExt(f.extension || '')
  })

  /** 是否处于集合会话（决定工具条是否显示批量入口）。 */
  const hasCollection = computed(() => {
    const items = collectionPaths?.()
    return !!items && items.length > 0
  })

  const batchProgress = ref<ImageEditBatchProgress | null>(null)
  const batchRunning = computed(() => batchProgress.value?.status === 'running')
  let batchTaskId: string | null = null

  /** 集合级对话框开关（渲染在 PreviewView，入口在图片内容工具条） */
  const batchDialogVisible = ref(false)
  const renameDialogVisible = ref(false)

  function openBatchCompress() {
    batchProgress.value = null
    error.value = ''
    batchDialogVisible.value = true
  }

  function closeBatchCompress() {
    if (batchRunning.value) return // 进行中不允许误关
    batchDialogVisible.value = false
  }

  function openRename() {
    renameDialogVisible.value = true
  }

  function closeRename() {
    renameDialogVisible.value = false
  }

  // ── 裁剪 ────────────────────────────────────────────────────────────────────
  function startCrop() {
    if (!editable.value) return
    mode.value = 'crop'
    cropRect.value = null
    aspect.value = null
    error.value = ''
  }

  function exitCrop() {
    mode.value = 'idle'
    cropRect.value = null
  }

  function setCropRect(rect: Rect | null) {
    cropRect.value = rect
  }

  function requestCropApply() {
    if (!cropRect.value || !file.value) return
    pendingCrop.value = cropRect.value
    pendingCompress.value = false
    openSaveDialog()
  }

  // ── 标注 ────────────────────────────────────────────────────────────────────
  const annoTool = ref<AnnoTool>('arrow')
  const annoColor = ref<string>(ANNO_COLORS[0])
  const annoWidth = ref<number>(ANNO_WIDTHS[1])
  /** 标注形状（显示 natural 空间）；深结构不可变替换以便 overlay 重绘 */
  const shapes = shallowRef<AnnoShape[]>([])
  let shapeSeq = 1

  function startAnnotate() {
    if (!editable.value) return
    mode.value = 'annotate'
    error.value = ''
  }

  function exitAnnotate() {
    mode.value = 'idle'
  }

  function addShape(shape: Omit<AnnoShape, 'id'> & { id?: number }): void {
    const withId = { ...shape, id: shape.id ?? shapeSeq++ } as AnnoShape
    shapes.value = [...shapes.value, withId]
  }

  function replaceShape(id: number, shape: Omit<AnnoShape, 'id'>): void {
    shapes.value = shapes.value.map(s => (s.id === id ? ({ ...shape, id } as AnnoShape) : s))
  }

  function undoAnno() {
    shapes.value = shapes.value.slice(0, -1)
  }

  function clearAnno() {
    shapes.value = []
  }

  /** 标注应用：宿主从 overlay 导出 base64 后调用，进入保存对话框。 */
  function requestAnnotateApply(overlay: EditAnnotate | null) {
    if (!overlay || !file.value) return
    pendingAnnotate.value = overlay
    pendingCompress.value = false
    openSaveDialog()
  }

  // ── 压缩 ────────────────────────────────────────────────────────────────────
  function requestCompress() {
    if (!editable.value) return
    pendingCrop.value = null
    pendingAnnotate.value = null
    pendingCompress.value = true
    openSaveDialog()
  }

  function openSaveDialog() {
    estimate.value = null
    error.value = ''
    saveDialogVisible.value = true
  }

  function closeSaveDialog() {
    saveDialogVisible.value = false
    pendingCrop.value = null
    pendingAnnotate.value = null
    pendingCompress.value = false
    if (mode.value === 'crop') exitCrop()
  }

  /** 保存对话框参数变化时预估（调用方 300ms 节流）。 */
  async function refreshEstimate(params: EditCompressParams) {
    const f = file.value
    if (!f || !pendingCompress.value) return
    estimating.value = true
    try {
      estimate.value = await window.fileman.imageEdit.estimate(f.path, params)
    } catch (err) {
      log.warn('[useImageEdit] estimate failed', { path: f.path, error: err })
      estimate.value = null // 降级：显示「无法预估」，允许继续执行
    } finally {
      estimating.value = false
    }
  }

  async function confirmSave(save: EditSaveSpec, params?: EditCompressParams | null) {
    const f = file.value
    if (!f) return
    const ops: EditOps = {}
    if (pendingCrop.value) {
      // referenceWidth = 用户看到的 naturalWidth（SIPS 图 = 光栅宽度；见 EditCrop 注释）
      if (!naturalWidthCache.value) {
        error.value = t('preview.image.sizeNotReady')
        return
      }
      ops.crop = { ...pendingCrop.value, referenceWidth: naturalWidthCache.value }
    }
    if (pendingAnnotate.value) {
      ops.annotate = pendingAnnotate.value
    }
    if (params) ops.compress = params

    applying.value = true
    error.value = ''
    try {
      const result = await window.fileman.imageEdit.apply(f.path, ops, save)
      log.info('[useImageEdit] saved', { path: f.path, written: result.writtenPath, bytes: result.bytes, mode: save.mode, annotate: !!ops.annotate })
      previewStore.applyEditResult(sessionId, f.path, result)
      // 标注已烘焙：清空形状并退出标注模式（工具条开合不受影响）
      if (ops.annotate) {
        clearAnno()
        exitAnnotate()
      }
      closeSaveDialog()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      log.error('[useImageEdit] apply failed', { path: f.path, error: err })
    } finally {
      applying.value = false
    }
  }

  // 由宿主（PreviewImageContent）注入 displayed natural 尺寸（onLoad 时）
  const naturalWidthCache = ref(0)
  function setNaturalSize(width: number) {
    naturalWidthCache.value = width
  }

  // ── 批量压缩 ────────────────────────────────────────────────────────────────
  async function startBatch(ops: EditOps, save: EditSaveSpec): Promise<boolean> {
    const items = collectionPaths?.() ?? null
    if (!items || items.length === 0) return false
    try {
      const { taskId } = await window.fileman.imageEdit.batchStart({ items, ops, save })
      batchTaskId = taskId
      batchProgress.value = null
      log.info('[useImageEdit] batch started', { taskId, items: items.length })
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      log.error('[useImageEdit] batch start failed', { error: err })
      return false
    }
  }

  function cancelBatch() {
    if (batchTaskId) window.fileman.imageEdit.batchCancel(batchTaskId)
  }

  // e2e mock 等环境可能缺少 imageEdit 面——订阅容错，缺失时不启用批量
  const stopProgress = window.fileman.imageEdit?.onBatchProgress?.(progress => {
    if (!batchTaskId || progress.taskId !== batchTaskId) return
    batchProgress.value = progress
    if (progress.status !== 'running') {
      log.info('[useImageEdit] batch done', { taskId: progress.taskId, status: progress.status, index: progress.index, total: progress.total })
      batchTaskId = null
    }
  }) ?? null
  onUnmounted(() => stopProgress?.())

  // 步进换图：退出编辑模式、清标注形状与错误（预估随保存对话框重新触发）；
  // 注意：不动 toolbarExpanded（严格手动开合，不随换图折叠）
  watch(file, () => {
    if (mode.value === 'crop') exitCrop()
    if (mode.value === 'annotate') {
      exitAnnotate()
      clearAnno()
    }
    error.value = ''
    estimate.value = null
  })

  return {
    // state
    mode,
    aspect,
    cropRect,
    editable,
    hasCollection,
    toolbarExpanded,
    saveDialogVisible,
    pendingCrop,
    pendingAnnotate,
    pendingCompress,
    estimate,
    estimating,
    applying,
    error,
    shapes,
    annoTool,
    annoColor,
    annoWidth,
    batchProgress,
    batchRunning,
    batchDialogVisible,
    renameDialogVisible,
    // intents
    toggleToolbar,
    startCrop,
    exitCrop,
    setCropRect,
    requestCropApply,
    startAnnotate,
    exitAnnotate,
    addShape,
    replaceShape,
    undoAnno,
    clearAnno,
    requestAnnotateApply,
    requestCompress,
    closeSaveDialog,
    refreshEstimate,
    confirmSave,
    startBatch,
    cancelBatch,
    openBatchCompress,
    closeBatchCompress,
    openRename,
    closeRename,
    setNaturalSize
  }
}
