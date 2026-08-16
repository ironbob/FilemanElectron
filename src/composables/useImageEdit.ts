import { ref, shallowRef, reactive, computed, watch, onUnmounted, type Ref } from 'vue'
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
import {
  ANNO_COLORS,
  ANNO_WIDTHS,
  moveShape,
  shapesToOverlayBase64,
  type AnnoFillMode,
  type AnnoShape,
  type AnnoTool,
  type AnnoToolKey
} from '@/utils/annotationShapes'

const log = console

export type ImageEditMode = 'idle' | 'crop' | 'annotate'

/** 工具参数记忆（颜色/线宽/填充/透明度，按工具独立保持）。 */
export interface AnnoToolParam {
  color: string
  width: number
  fill: AnnoFillMode
  opacity: number
}

/** 参数面板 / 上下文条的样式增量（width 映射到 shape.strokeWidth）。 */
export interface AnnoStylePatch {
  color?: string
  width?: number
  fill?: AnnoFillMode
  opacity?: number
}

function defaultAnnoParam(): AnnoToolParam {
  return { color: ANNO_COLORS[0], width: ANNO_WIDTHS[1], fill: 'stroke', opacity: 1 }
}

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
 * 职责：编辑模式状态机（裁剪/标注）、裁剪矩形与标注形状持有（undo/redo 双栈、
 * 多选、按工具参数记忆）、压缩参数预估（300ms 节流，Sheet 打开期间恒常请求）、
 * apply 编排与错误呈现、批量压缩任务订阅/取消、保存结果 flash 提示。
 * View（TopToolbar/Rail/Popover/Overlay/Sheet）只渲染与转发意图。
 */
export function useImageEdit(options: UseImageEditOptions) {
  const { file, deviceId, sessionId, collectionPaths } = options
  const previewStore = usePreviewStore()

  const mode = ref<ImageEditMode>('idle')
  const aspect = ref<number | null>(null)
  /** 裁剪矩形（显示 natural 空间，源像素坐标；apply 时附 referenceWidth） */
  const cropRect = ref<Rect | null>(null)
  /** 待保存 Sheet 确认的 ops（裁剪 Apply / 标注 Apply / 压缩入口置入） */
  const saveDialogVisible = ref(false)
  const pendingCrop = ref<Rect | null>(null)
  const pendingAnnotate = shallowRef<EditAnnotate | null>(null)
  const pendingCompress = ref(false)
  const estimate = ref<EditEstimateResult | null>(null)
  const estimating = ref(false)
  const applying = ref(false)
  const error = ref('')

  /** 保存成功后的短暂状态栏提示（4s 自动消失）。 */
  const flashMessage = ref('')
  /** 保存完成信号（自增；守卫「存储后续动作」watch 它触发）。 */
  const savedSeq = ref(0)
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  function flash(message: string) {
    flashMessage.value = message
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flashMessage.value = ''
    }, 4000)
  }

  const editable = computed(() => {
    const f = file.value
    return !!f && !f.isDirectory && deviceId === 'local' && isEditableImageExt(f.extension || '')
  })

  /** 是否处于集合会话（决定工具栏是否显示批量入口）。 */
  const hasCollection = computed(() => {
    const items = collectionPaths?.()
    return !!items && items.length > 0
  })

  const batchProgress = ref<ImageEditBatchProgress | null>(null)
  const batchRunning = computed(() => batchProgress.value?.status === 'running')
  let batchTaskId: string | null = null

  /** 集合级对话框开关（渲染在 PreviewView，入口在顶栏集合菜单） */
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
  /** 当前工具：'select'（选择/移动）或绘制工具；进入标注模式默认 'select'。 */
  const annoTool = ref<AnnoToolKey>('select')
  /** 各绘制工具的参数记忆（会话内独立，参数面板响应式读写）。 */
  const annoParams = reactive<Record<AnnoTool, AnnoToolParam>>({
    arrow: defaultAnnoParam(),
    rect: defaultAnnoParam(),
    ellipse: defaultAnnoParam(),
    freehand: defaultAnnoParam(),
    text: defaultAnnoParam()
  })
  /** 当前绘制工具的参数（select 工具无参数）。 */
  const activeParam = computed<AnnoToolParam | null>(() =>
    annoTool.value === 'select' ? null : annoParams[annoTool.value]
  )

  /** 标注可见性（顶栏眼睛开关：预览不含标注的最终效果）。 */
  const annotationsVisible = ref(true)

  /** 标注形状（显示 natural 空间）；深结构不可变替换以便 overlay 重绘。 */
  const shapes = shallowRef<AnnoShape[]>([])
  const selectedIds = ref<number[]>([])
  let shapeSeq = 1

  // undo/redo 双栈（所有提交型变更入口都走 commit）。栈本体是普通数组，
  // computed 借道 shapes（每次 commit/undo/redo 必然整表替换）获得响应性。
  const undoStack: AnnoShape[][] = []
  const redoStack: AnnoShape[][] = []
  const canUndo = computed(() => {
    void shapes.value
    return undoStack.length > 0
  })
  const canRedo = computed(() => {
    void shapes.value
    return redoStack.length > 0
  })

  function commit(next: AnnoShape[]) {
    undoStack.push(shapes.value)
    if (undoStack.length > 100) undoStack.shift()
    redoStack.length = 0
    shapes.value = next
  }

  /**
   * 手势编辑（拖动/缩放手柄/滑杆连拨）：起点入历史一帧，过程中的变更走
   * applyShapesLive / setAnnoParam(live) 免历史替换，保证一次手势 = 一条历史。
   */
  function beginShapeGesture() {
    undoStack.push(shapes.value)
    if (undoStack.length > 100) undoStack.shift()
    redoStack.length = 0
  }

  /** 手势过程中的免历史整表替换（id 保持由调用方保证）。 */
  function applyShapesLive(next: AnnoShape[]) {
    shapes.value = next
  }

  /** 形状集变化后收敛选中集（删除/撤销后引用失效的 id）。 */
  watch(shapes, () => {
    if (selectedIds.value.length === 0) return
    const alive = new Set(shapes.value.map(s => s.id))
    const next = selectedIds.value.filter(id => alive.has(id))
    if (next.length !== selectedIds.value.length) selectedIds.value = next
  })

  function undoAnno() {
    if (!undoStack.length) return
    redoStack.push(shapes.value)
    shapes.value = undoStack.pop()!
  }

  function redoAnno() {
    if (!redoStack.length) return
    undoStack.push(shapes.value)
    shapes.value = redoStack.pop()!
  }

  function selectShape(id: number, additive = false) {
    if (additive) {
      if (!selectedIds.value.includes(id)) selectedIds.value = [...selectedIds.value, id]
    } else {
      selectedIds.value = [id]
    }
  }

  function selectMany(ids: number[]) {
    selectedIds.value = [...new Set(ids)]
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function addShape(shape: Omit<AnnoShape, 'id'> & { id?: number }): void {
    const withId = { ...shape, id: shape.id ?? shapeSeq++ } as AnnoShape
    commit([...shapes.value, withId])
  }

  function replaceShape(id: number, shape: Omit<AnnoShape, 'id'>): void {
    commit(shapes.value.map(s => (s.id === id ? ({ ...shape, id } as AnnoShape) : s)))
  }

  function moveShapes(ids: number[], dx: number, dy: number): void {
    if (!dx && !dy) return
    const set = new Set(ids)
    commit(shapes.value.map(s => (set.has(s.id) ? moveShape(s, dx, dy) : s)))
  }

  function deleteShapes(ids: number[]): void {
    if (!ids.length) return
    const set = new Set(ids)
    commit(shapes.value.filter(s => !set.has(s.id)))
  }

  function duplicateShapes(ids: number[]): void {
    const set = new Set(ids)
    // 偏移量随图幅缩放（大图固定 12px 不可见）
    const offset = Math.max(12, Math.round((naturalWidthCache.value || 1000) * 0.012))
    const copies = shapes.value
      .filter(s => set.has(s.id))
      .map(s => ({ ...moveShape(s, offset, offset), id: shapeSeq++ }) as AnnoShape)
    if (!copies.length) return
    commit([...shapes.value, ...copies])
    selectedIds.value = copies.map(c => c.id)
  }

  function applyPatch(shape: AnnoShape, patch: AnnoStylePatch): AnnoShape {
    const next = { ...shape } as AnnoShape & { strokeWidth: number; color: string }
    if (patch.color !== undefined) next.color = patch.color
    if (patch.width !== undefined) next.strokeWidth = patch.width
    if (patch.fill !== undefined && (shape.kind === 'rect' || shape.kind === 'ellipse')) {
      next.fill = patch.fill
    }
    if (patch.opacity !== undefined) next.opacity = patch.opacity
    return next
  }

  function restyleShapes(ids: number[], patch: AnnoStylePatch): void {
    if (!ids.length) return
    const set = new Set(ids)
    commit(shapes.value.map(s => (set.has(s.id) ? applyPatch(s, patch) : s)))
  }

  /**
   * 参数面板唯一入口：更新当前工具默认值；有选中对象时同时即时作用于选中对象
   * （可撤销）——与 Preview「改颜色即改选中」一致。
   * live=true 供滑杆连拨帧使用（历史已在手势起点由 beginShapeGesture 记录）。
   */
  function setAnnoParam(patch: AnnoStylePatch, live = false) {
    const tool = annoTool.value
    if (tool !== 'select') {
      const p = annoParams[tool]
      if (patch.color !== undefined) p.color = patch.color
      if (patch.width !== undefined) p.width = patch.width
      if (patch.fill !== undefined) p.fill = patch.fill
      if (patch.opacity !== undefined) p.opacity = patch.opacity
    }
    if (selectedIds.value.length > 0) {
      if (live) {
        const set = new Set(selectedIds.value)
        applyShapesLive(shapes.value.map(s => (set.has(s.id) ? applyPatch(s, patch) : s)))
      } else {
        restyleShapes(selectedIds.value, patch)
      }
    }
  }

  function startAnnotate() {
    if (!editable.value) return
    mode.value = 'annotate'
    annoTool.value = 'select'
    error.value = ''
  }

  function exitAnnotate() {
    mode.value = 'idle'
  }

  /** 编辑会话完成（顶栏「完成」）：有标注 → 统一保存 Sheet；无标注 → 直接退出。 */
  function completeEdit() {
    if (mode.value !== 'annotate') return
    if (annoDirty.value) {
      requestAnnotateApply()
      return
    }
    exitAnnotate()
  }

  /** 丢弃全部标注（「不保存」路径）：形状/历史/选中清空并退出模式。 */
  function discardAnnotate() {
    shapes.value = []
    undoStack.length = 0
    redoStack.length = 0
    selectedIds.value = []
    mode.value = 'idle'
  }

  /** 保存成功后：标注已烘焙，整体复位（形状/历史/选中）。 */
  function resetAnnoAfterSave() {
    shapes.value = []
    undoStack.length = 0
    redoStack.length = 0
    selectedIds.value = []
    annotationsVisible.value = true
  }

  /** 存在未保存标注（退出前确认依据）。 */
  const annoDirty = computed(() => shapes.value.length > 0)

  /**
   * 未保存确认（退出标注 / 集合切图共用）：dirty 时弹「取消 / 不保存 / 存储」；
   * clean 时直接执行 onDiscard（无标注无需确认）。「存储」回调由宿主注入
   * （overlay 导出 → 保存 Sheet）；保存成功后由 confirmSave 复位标注状态。
   */
  const unsavedPrompt = ref(false)
  let unsavedHandlers: { onDiscard: () => void; onStore?: () => void } | null = null
  function requestAnnotateExit(handlers: { onDiscard: () => void; onStore?: () => void }) {
    if (!annoDirty.value) {
      handlers.onDiscard()
      return
    }
    unsavedHandlers = handlers
    unsavedPrompt.value = true
  }
  function resolveUnsaved(choice: 'cancel' | 'discard' | 'store') {
    if (!unsavedPrompt.value) return
    unsavedPrompt.value = false
    const handlers = unsavedHandlers
    unsavedHandlers = null
    if (choice === 'discard') {
      discardAnnotate()
      handlers?.onDiscard()
    } else if (choice === 'store') {
      handlers?.onStore?.()
    }
  }

  /** 标注应用：VM 自含导出（shapes → 透明 PNG，natural 空间），进入保存 Sheet。 */
  function requestAnnotateApply() {
    if (!file.value || !shapes.value.length) return
    if (!naturalWidthCache.value || !naturalHeightCache.value) return
    const overlayBase64 = shapesToOverlayBase64(shapes.value, naturalWidthCache.value, naturalHeightCache.value)
    if (!overlayBase64) return
    pendingAnnotate.value = { overlayBase64, referenceWidth: naturalWidthCache.value }
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

  /**
   * Sheet 参数变化时预估（调用方 300ms 节流）。Sheet 打开期间恒常请求——
   * 纯标注保存也必然重编码（修复旧版仅压缩入口才有预估的缺口）。
   */
  async function refreshEstimate(params: EditCompressParams) {
    const f = file.value
    if (!f || !saveDialogVisible.value) return
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
      savedSeq.value++
      if (ops.annotate) {
        // 标注已烘焙：复位标注状态并退出标注模式
        resetAnnoAfterSave()
        exitAnnotate()
      }
      closeSaveDialog()
      flash(
        save.mode === 'overwrite'
          ? t('preview.editToolbar.flashSavedReplace')
          : t('preview.editToolbar.flashSavedCopy', { name: result.writtenPath.split('/').pop() || f.name })
      )
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      log.error('[useImageEdit] apply failed', { path: f.path, error: err })
    } finally {
      applying.value = false
    }
  }

  // 由宿主（PreviewImageContent）注入 displayed natural 尺寸（onLoad 时）
  const naturalWidthCache = ref(0)
  const naturalHeightCache = ref(0)
  function setNaturalSize(width: number, height: number) {
    naturalWidthCache.value = width
    naturalHeightCache.value = height
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

  // 步进换图：退出编辑模式、清标注形状与历史（预估随保存 Sheet 重新触发）
  watch(file, () => {
    if (mode.value === 'crop') exitCrop()
    if (mode.value === 'annotate') discardAnnotate()
    error.value = ''
    estimate.value = null
  })

  onUnmounted(() => {
    if (flashTimer) clearTimeout(flashTimer)
  })

  return {
    // state
    mode,
    aspect,
    cropRect,
    editable,
    hasCollection,
    saveDialogVisible,
    pendingCrop,
    pendingAnnotate,
    pendingCompress,
    estimate,
    estimating,
    applying,
    error,
    flashMessage,
    savedSeq,
    shapes,
    selectedIds,
    annoTool,
    annoParams,
    activeParam,
    annotationsVisible,
    canUndo,
    canRedo,
    annoDirty,
    unsavedPrompt,
    requestAnnotateExit,
    resolveUnsaved,
    batchProgress,
    batchRunning,
    batchDialogVisible,
    renameDialogVisible,
    // intents
    startCrop,
    exitCrop,
    setCropRect,
    requestCropApply,
    startAnnotate,
    exitAnnotate,
    completeEdit,
    discardAnnotate,
    addShape,
    replaceShape,
    beginShapeGesture,
    applyShapesLive,
    moveShapes,
    deleteShapes,
    duplicateShapes,
    restyleShapes,
    setAnnoParam,
    selectShape,
    selectMany,
    clearSelection,
    undoAnno,
    redoAnno,
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
