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
import { computed, onUnmounted } from 'vue'
import type { PreviewTab } from '@/types/preview'
import type { EditOps, EditSaveSpec } from '@shared/types'
import type { BatchRenameItem } from '@/types/fileBrowser'
import { usePreviewStore } from '@/stores/preview'
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
    edit.requestAnnotateExit({
      onDiscard: () => previewStore.stepImageCollection(props.session.id, delta),
      // 选择「存储」→ 打开保存 Sheet；保存完成后停留在当前图（用户可再按 →）
      onStore: () => undefined
    })
    return
  }
  previewStore.stepImageCollection(props.session.id, delta)
}

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
