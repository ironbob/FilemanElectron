<template>
  <!-- 预览 tab 的主内容视图（非浮层）：三区布局归各内容组件（图片内容含
       顶部工具栏/状态栏）。tab 的切换/关闭由顶部统一 AppTabBar 拥有。
       图片集合导航已收编进图片内容顶栏（‹ › + n/n），不再悬浮于内容之上。
       本组件同时是编辑会话（useImageEdit）的组合根：创建 VM、下传 Router、
       挂载集合级批量对话框。 -->
  <div class="h-full relative flex flex-col overflow-hidden bg-bg-primary">
    <!-- Content Area -->
    <div class="flex-1 overflow-hidden">
      <PreviewContentRouter
        :file="session.file"
        :device-id="session.deviceId"
        :session-id="session.id"
        :initial-line="session.initialLine"
        :force-type="session.forceType"
        :edit="session.type === 'image' ? edit : undefined"
        :collection="isCollection ? { index: index, total } : null"
        :step-collection="step"
      />
    </div>

    <!-- 批量压缩（集合会话；进度/取消在对话框内） -->
    <BatchCompressDialog
      v-if="edit.batchDialogVisible.value"
      :count="collectionCount"
      :progress="edit.batchProgress.value"
      :running="edit.batchRunning.value"
      :error="edit.error.value"
      @close="edit.closeBatchCompress()"
      @start="edit.startBatch"
      @cancel="edit.cancelBatch()"
    />

    <!-- 批量改名（集合会话；复用既有 batch-rename 任务队列，完成后同步会话列表） -->
    <BatchRenameDialog
      v-if="edit.renameDialogVisible.value"
      :files="renameTargets"
      @close="edit.closeRename()"
      @confirm="queueBatchRename"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { PreviewTab } from '@/types/preview'
import type { EditOps, EditSaveSpec } from '@shared/types'
import type { BatchRenameItem } from '@/types/fileBrowser'
import { usePreviewStore } from '@/stores/preview'
import { useTabsStore } from '@/stores/tabs'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useImageEdit } from '@/composables/useImageEdit'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import PreviewContentRouter from './PreviewContentRouter.vue'
import BatchCompressDialog from '../dialogs/BatchCompressDialog.vue'
import BatchRenameDialog from '../dialogs/BatchRenameDialog.vue'

const props = defineProps<{
  session: PreviewTab
}>()

const previewStore = usePreviewStore()
const tabsStore = useTabsStore()
const fileOpsStore = useFileOperationsStore()

// 编辑会话组合根：file 为响应式引用，集合步进时 VM 自动退出裁剪/清预估
const sessionFile = computed(() => props.session.file)
const edit = useImageEdit({
  file: sessionFile,
  deviceId: props.session.deviceId,
  sessionId: props.session.id,
  collectionPaths: () => props.session.files?.map(f => f.path) ?? null
})

const isCollection = computed(() => (props.session.files?.length ?? 0) > 1)
const index = computed(() => props.session.index ?? 0)
const total = computed(() => props.session.files?.length ?? 1)
const collectionCount = computed(() => props.session.files?.length ?? 0)

const renameTargets = computed(() =>
  (props.session.files ?? []).map(f => ({ path: f.path, name: f.name, isDirectory: false }))
)

// 集合会话消费 ←/→（capture、preventDefault + return true）。
// 存在未保存标注时经 VM 弹「不保存并切换」确认，避免静默丢弃。
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
  if (edit.mode.value === 'annotate' && edit.annoDirty.value) {
    requestGuardedExit({ type: 'step', delta })
    return
  }
  previewStore.stepImageCollection(props.session.id, delta)
}

// ── 未保存守卫的挂起后续（保存成功后执行；取消则清空） ────────────────────────
type PendingAfterSave = { type: 'close' } | { type: 'step'; delta: number }
const pendingAfterSave = ref<PendingAfterSave | null>(null)
/** 本次未保存确认是否已由 discard/store 分支处理（cancel 清空挂起）。 */
let guardResolved = false

/** 统一守卫出口：dirty → 三键确认；「存储」→ 保存 Sheet（成功后执行 pending）。 */
function requestGuardedExit(after: PendingAfterSave) {
  pendingAfterSave.value = after
  edit.requestAnnotateExit({
    onDiscard: () => {
      guardResolved = true
      pendingAfterSave.value = null
      if (after.type === 'step') previewStore.stepImageCollection(props.session.id, after.delta)
      // close 路径：discardAnnotate 已退出标注 → 重新走 closeTab（守卫此刻放行）
      if (after.type === 'close') tabsStore.closePreviewSession(props.session.id)
    },
    onStore: () => {
      guardResolved = true
      edit.requestAnnotateApply() // VM 自含导出 → 保存 Sheet；成功后 savedSeq 触发挂起动作
    }
  })
}

watch(() => edit.unsavedPrompt.value, open => {
  if (open) {
    guardResolved = false
    return
  }
  if (!guardResolved) pendingAfterSave.value = null // 取消：清空挂起
})

// 保存成功 → 执行挂起的关闭/步进（「存储」分支的续接）
watch(() => edit.savedSeq.value, () => {
  const pending = pendingAfterSave.value
  if (!pending) return
  pendingAfterSave.value = null
  if (pending.type === 'close') tabsStore.closePreviewSession(props.session.id)
  else previewStore.stepImageCollection(props.session.id, pending.delta)
})

// 关闭守卫（AppTabBar ✕ / Esc / 命令面板关闭统一入口）：dirty 时拦截并弹确认
const unregisterGuard = tabsStore.registerCloseGuard(props.session.id, () => {
  if (edit.mode.value !== 'annotate' || !edit.annoDirty.value) return true
  requestGuardedExit({ type: 'close' })
  return false
})
// 脏探针（标签栏圆点）：标注模式且有形状 = 未保存
const unregisterProbe = tabsStore.registerDirtyProbe(props.session.id, () =>
  edit.mode.value === 'annotate' && edit.annoDirty.value)
onUnmounted(() => {
  unregisterGuard()
  unregisterProbe()
})

/** 批量改名：入既有任务队列；完成后（成功）按映射同步会话 files/index（IFC-7）。 */
async function queueBatchRename(items: BatchRenameItem[]) {
  edit.closeRename()
  try {
    const task = await fileOpsStore.createBatchRenameTask(props.session.deviceId, items)
    trackRenameTask(task.id, items)
  } catch (error) {
    console.error('[PreviewView] batch rename queue failed:', error)
  }
}

// 改名任务订阅清理（不能在 async 回调里调 onUnmounted——无活跃实例）
const renameStops: Array<() => void> = []
onUnmounted(() => renameStops.forEach(stop => stop()))

function trackRenameTask(taskId: string, items: BatchRenameItem[]) {
  const stop = window.fileman.onFileOperationUpdated(task => {
    if (task.id !== taskId) return
    if (task.status === 'completed') {
      previewStore.applyRenameMapping(props.session.id, items)
    }
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      stop()
    }
  })
  renameStops.push(stop)
}
</script>
