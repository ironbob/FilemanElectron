<template>
  <!-- 右侧任务抽屉：push 模式为 flex 兄弟（App.vue 挂载），窄窗 overlay 由
       overlay prop 切换。头部 44px + 连续列表；Esc 消费（useKeyInterceptor
       capture LIFO）；revealTaskId 指令定位（切历史段+展开+滚动）。 -->
  <div
    class="task-drawer flex flex-col h-full min-h-0 bg-bg-primary app-no-drag"
    :class="overlay ? 'task-drawer--overlay' : 'task-drawer--push'"
    role="complementary"
    :aria-label="$t('tasks.drawer.title')"
    data-testid="task-drawer"
  >
    <!-- 头部：标题 + segmented + 清除历史(仅历史段) + ⋯ + ✕ -->
    <div class="task-drawer-header">
      <div class="task-drawer-title">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 14v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 6h10M7 10h7" />
        </svg>
        <span>{{ $t('tasks.drawer.title') }}</span>
      </div>

      <div class="task-drawer-segments" role="tablist">
        <button
          class="task-drawer-seg"
          :class="{ 'is-active': fileOps.drawerTab === 'active' }"
          role="tab"
          :aria-selected="fileOps.drawerTab === 'active'"
          data-testid="task-tab-active"
          @click="fileOps.setDrawerTab('active')"
        >
          {{ $t('tasks.tab.active') }}<span v-if="fileOps.activeTaskCount > 0" class="task-drawer-seg-count">{{ fileOps.activeTaskCount }}</span>
        </button>
        <button
          class="task-drawer-seg"
          :class="{ 'is-active': fileOps.drawerTab === 'history' }"
          role="tab"
          :aria-selected="fileOps.drawerTab === 'history'"
          data-testid="task-tab-history"
          @click="fileOps.setDrawerTab('history')"
        >
          {{ $t('tasks.tab.history') }}
        </button>
      </div>

      <div class="task-drawer-header-actions">
        <button
          v-if="fileOps.drawerTab === 'history' && fileOps.history.length > 0"
          class="task-drawer-text-btn"
          data-testid="task-clear-history"
          @click="fileOps.clearHistory()"
        >
          {{ $t('tasks.drawer.clearHistory') }}
        </button>
        <button
          ref="moreBtn"
          class="task-drawer-icon-btn"
          :title="$t('tasks.drawer.more')"
          :aria-label="$t('tasks.drawer.more')"
          data-testid="task-more"
          @click="toggleMenu"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </button>
        <button
          class="task-drawer-icon-btn"
          :title="$t('tasks.drawer.closeTip')"
          :aria-label="$t('tasks.drawer.closeTip')"
          data-testid="task-drawer-close"
          @click="fileOps.closeDrawer()"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>

    <!-- 列表主体 -->
    <div ref="bodyEl" class="task-drawer-body">
      <template v-if="fileOps.drawerTab === 'active'">
        <div v-if="fileOps.tasks.length === 0" class="task-drawer-empty">
          <svg class="w-10 h-10 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 14v3a2 2 0 002 2h12a2 2 0 002-2v-3M7 6h10M7 10h7" />
          </svg>
          <span>{{ $t('tasks.noActiveTasks') }}</span>
        </div>
        <TaskRow
          v-for="task in fileOps.tasks"
          :key="task.id"
          :task="task"
          :expanded="expandedIds.has(task.id)"
          :queue-position="fileOps.pendingPosition(task.id)"
          @toggle="onToggleExpand"
          @locate="endpoint => emit('locate', endpoint)"
        />
      </template>

      <template v-else>
        <div v-if="fileOps.history.length === 0" class="task-drawer-empty">
          <svg class="w-10 h-10 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{{ $t('tasks.noHistory') }}</span>
        </div>
        <template v-for="group in fileOps.historyGroups" :key="group.key">
          <div class="task-drawer-group" data-testid="task-history-group">{{ groupLabel(group.key) }}</div>
          <TaskRow
            v-for="task in group.tasks"
            :key="task.id"
            :task="task"
            :expanded="expandedIds.has(task.id)"
            @toggle="onToggleExpand"
            @locate="endpoint => emit('locate', endpoint)"
          />
        </template>
        <div v-if="fileOps.history.length > 0" class="task-drawer-cap">{{ $t('tasks.group.cap') }}</div>
      </template>
    </div>

    <!-- ⋯ 菜单 -->
    <TaskDrawerMenu
      v-if="menuAnchor"
      :queue-paused="fileOps.queuePaused"
      :anchor="menuAnchor"
      @toggle-pause="onTogglePause"
      @cancel-all="showCancelConfirm = true"
      @close="menuAnchor = null"
    />

    <!-- 取消全部二次确认 -->
    <ConfirmDialog
      v-if="showCancelConfirm"
      :title="t('tasks.drawer.cancelAllTitle')"
      :message="t('tasks.drawer.cancelAllMessage', fileOps.tasks.length)"
      :confirm-text="t('tasks.drawer.cancelAll')"
      danger
      @confirm="onCancelAll"
      @close="showCancelConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { t } from '@/i18n'
import type { HistoryGroupKey } from '@/utils/taskMetrics'
import TaskRow from './TaskRow.vue'
import TaskDrawerMenu from './TaskDrawerMenu.vue'
import ConfirmDialog from '@/components/dialogs/ConfirmDialog.vue'

defineProps<{
  /** 窄窗降级：absolute 覆盖 + 投影（panes 保持全宽）。 */
  overlay?: boolean
}>()

const emit = defineEmits<{
  (e: 'locate', endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }): void
}>()

const fileOps = useFileOperationsStore()
const bodyEl = ref<HTMLElement | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const menuAnchor = ref<DOMRect | null>(null)
const showCancelConfirm = ref(false)
const expandedIds = reactive(new Set<string>())

const GROUP_LABEL_KEYS: Record<HistoryGroupKey, string> = {
  today: 'tasks.group.today',
  yesterday: 'tasks.group.yesterday',
  week: 'tasks.group.week',
  earlier: 'tasks.group.earlier'
}

function groupLabel(key: HistoryGroupKey): string {
  return t(GROUP_LABEL_KEYS[key])
}

function onToggleExpand(taskId: string): void {
  if (expandedIds.has(taskId)) expandedIds.delete(taskId)
  else expandedIds.add(taskId)
}

function toggleMenu(): void {
  menuAnchor.value = menuAnchor.value ? null : (moreBtn.value?.getBoundingClientRect() ?? null)
}

async function onTogglePause(): Promise<void> {
  await fileOps.setQueuePaused(!fileOps.queuePaused)
  menuAnchor.value = null
}

function onCancelAll(): void {
  fileOps.cancelAllTasks()
  showCancelConfirm.value = false
  menuAnchor.value = null
}

// ── 键盘：Esc 关抽屉（消费）；↑↓ 在行间移动焦点 ─────────────────────────────
useKeyInterceptor((event): boolean => {
  if (event.key === 'Escape') {
    if (menuAnchor.value) {
      menuAnchor.value = null
      return true
    }
    if (showCancelConfirm.value) {
      showCancelConfirm.value = false
      return true
    }
    fileOps.closeDrawer()
    return true
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const rows = Array.from(bodyEl.value?.querySelectorAll<HTMLElement>('[data-testid="task-row"]') ?? [])
    if (rows.length === 0) return false
    const idx = rows.findIndex(el => el === document.activeElement || el.contains(document.activeElement))
    const next = event.key === 'ArrowDown' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0)
    const target = rows[idx === -1 ? 0 : next]
    if (target) {
      event.preventDefault()
      target.focus()
      return true
    }
  }
  return false
})

// ── 指令定位：失败自动展开 / toast「显示」 ──────────────────────────────────
watch(
  () => fileOps.revealTaskId,
  async id => {
    if (!id) return
    expandedIds.add(id)
    await nextTick()
    const el = bodyEl.value?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    fileOps.consumeReveal()
  }
)

onMounted(() => {
  // 打开抽屉即视为看过进行中状态；焦点移入便于键盘操作
  bodyEl.value?.focus({ preventScroll: true })
})
</script>

<style scoped>
.task-drawer--push {
  border-left: 1px solid var(--finder-divider);
}

.task-drawer--overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 40;
  border-left: 1px solid var(--finder-divider);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
}

.task-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  flex-shrink: 0;
  padding: 0 10px;
  background: var(--finder-chrome);
  border-bottom: 1px solid var(--finder-divider);
}

.task-drawer-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--finder-label);
  white-space: nowrap;
}

.task-drawer-segments {
  display: flex;
  flex: 1;
  min-width: 0;
  justify-content: center;
  gap: 2px;
  margin: 0 4px;
  padding: 2px;
  border-radius: 7px;
  background: var(--finder-control);
}

.task-drawer-seg {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--finder-secondary-label);
  white-space: nowrap;
}

.task-drawer-seg:hover:not(.is-active) {
  color: var(--finder-label);
}

.task-drawer-seg.is-active {
  background: var(--finder-canvas);
  color: var(--finder-label);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.10);
}

.task-drawer-seg-count {
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  color: #fff;
  background: var(--finder-selection);
}

.task-drawer-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.task-drawer-text-btn {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--finder-secondary-label);
  white-space: nowrap;
}

.task-drawer-text-btn:hover {
  color: var(--accent-red);
  background: rgba(255, 69, 58, 0.10);
}

.task-drawer-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--finder-secondary-label);
}

.task-drawer-icon-btn:hover {
  background: var(--finder-row-hover);
  color: var(--finder-label);
}

.task-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
}

.task-drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  font-size: 13px;
  color: var(--finder-secondary-label);
}

.task-drawer-group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 5px 12px 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--finder-secondary-label);
  background: var(--finder-list-header);
  border-bottom: 1px solid var(--finder-divider);
}

.task-drawer-cap {
  padding: 10px 12px;
  font-size: 11px;
  text-align: center;
  color: var(--finder-secondary-label);
  opacity: 0.75;
}
</style>
