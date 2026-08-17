<template>
  <!-- 完成通知层：右上角 titlebar 下 12px，最多 3 条堆叠，4s 自动淡出
       （hover 暂停计时）。「显示」= 打开抽屉并定位该任务；「撤销」按
       undoKind 走 undoLastRecycle / undoLastMove。绝不自动展开抽屉。 -->
  <div class="task-toast-layer" aria-live="polite">
    <TransitionGroup name="task-toast">
      <div
        v-for="toast in fileOps.toasts"
        :key="toast.id"
        class="task-toast"
        :data-testid="`task-toast-${toast.kind}`"
        @mouseenter="pause(toast.id)"
        @mouseleave="resume(toast.id)"
      >
        <span class="task-toast-icon" :class="toast.kind === 'failed' ? 'is-failed' : 'is-done'" aria-hidden="true">
          <svg v-if="toast.kind === 'completed'" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
          <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" d="M12 8v5m0 4h.01" /></svg>
        </span>
        <div class="task-toast-body">
          <div class="task-toast-title">{{ toastText(toast) }}</div>
          <div v-if="toast.kind === 'failed' && toast.error" class="task-toast-error" :title="toast.error">{{ toast.error }}</div>
        </div>
        <div class="task-toast-actions">
          <button class="task-toast-btn" data-testid="task-toast-show" @click="showTask(toast)">{{ t('tasks.toast.show') }}</button>
          <button
            v-if="toast.canUndo"
            class="task-toast-btn is-undo"
            data-testid="task-toast-undo"
            @click="undo(toast)"
          >
            {{ t('tasks.toast.undo') }}
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useFileOperationsStore, type TaskToast } from '@/stores/fileOperations'
import { t } from '@/i18n'

const fileOps = useFileOperationsStore()

const TOAST_MS = 4000
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function schedule(id: number): void {
  clear(id)
  timers.set(id, setTimeout(() => fileOps.dismissToast(id), TOAST_MS))
}

function clear(id: number): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

function pause(id: number): void {
  clear(id)
}

function resume(id: number): void {
  if (fileOps.toasts.some(tst => tst.id === id)) schedule(id)
}

function toastText(toast: TaskToast): string {
  const action = t(toast.verbKey)
  if (toast.kind === 'failed') {
    return t('tasks.sentence.failedMultiple', { action, count: toast.count })
  }
  return t('tasks.sentence.doneMultiple', { action, count: toast.count })
}

function showTask(toast: TaskToast): void {
  fileOps.openDrawer('history')
  fileOps.revealTaskId = toast.taskId
  fileOps.dismissToast(toast.id)
}

async function undo(toast: TaskToast): Promise<void> {
  fileOps.dismissToast(toast.id)
  if (toast.undoKind === 'recycle') await fileOps.undoLastRecycle()
  else if (toast.undoKind === 'move') await fileOps.undoLastMove()
}

// 新 toast 入队即排程（watch id 列表增删）
const unwatch = watch(
  () => fileOps.toasts.map(tst => tst.id),
  (ids, prev) => {
    for (const id of ids) {
      if (!prev?.includes(id)) schedule(id)
    }
    for (const id of prev ?? []) {
      if (!ids.includes(id)) clear(id)
    }
  }
)

onBeforeUnmount(() => {
  unwatch()
  for (const id of [...timers.keys()]) clear(id)
})
</script>

<style scoped>
.task-toast-layer {
  position: fixed;
  top: 60px;
  /* 抽屉打开时右移让位（App 根注入 --task-drawer-width），避免挡住抽屉头部操作 */
  right: calc(12px + var(--task-drawer-width, 0px));
  width: 320px;
  z-index: var(--z-toast, 100);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.task-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--finder-chrome);
  border: 1px solid var(--finder-divider);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.task-toast-icon {
  display: flex;
  flex-shrink: 0;
}

.task-toast-icon.is-done { color: var(--accent-green); }
.task-toast-icon.is-failed { color: var(--accent-red); }

.task-toast-body {
  flex: 1;
  min-width: 0;
}

.task-toast-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--finder-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-toast-error {
  margin-top: 2px;
  font-size: 11px;
  color: var(--accent-red);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-toast-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.task-toast-btn {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--finder-selection);
  white-space: nowrap;
}

.task-toast-btn:hover {
  background: var(--finder-control-strong);
}

/* 淡入 / 淡出（TransitionGroup） */
.task-toast-enter-active { transition: opacity 150ms ease, transform 150ms ease; }
.task-toast-leave-active { transition: opacity 250ms ease, transform 250ms ease; }
.task-toast-enter-from { opacity: 0; transform: translateY(-6px); }
.task-toast-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
