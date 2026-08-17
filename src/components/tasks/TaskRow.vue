<template>
  <!-- 任务行：连续列表行（无卡片）。左 20px 单色类型图标（三语义组）+
       主行动作句式（文件名中间截断）+ 状态副行 + 路径摘要行 + 展开详情。
       状态双通道：颜色之外均有图标/文字（绿勾/红叹号/灰减号/进度条）。 -->
  <div
    class="task-row"
    :class="[`is-${task.status}`, { 'is-expanded': expanded, 'has-failures': failedItems.length > 0 }]"
    :data-task-id="task.id"
    :data-task-status="task.status"
  >
    <div
      class="task-row-main"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      data-testid="task-row"
      @click="emit('toggle', task.id)"
      @keydown.enter.prevent="emit('toggle', task.id)"
      @keydown.space.prevent="emit('toggle', task.id)"
    >
      <!-- 类型图标（单色，按语义组） -->
      <span class="task-row-icon" aria-hidden="true">
        <svg v-if="iconGroup === 'transfer'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <svg v-else-if="iconGroup === 'delete'" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
        </svg>
        <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </span>

      <div class="task-row-body">
        <!-- 第一行：句式 + 终态图标 + 操作 -->
        <div class="task-row-line1">
          <span class="task-row-title" :title="fullTitle">{{ sentence }}</span>
          <span v-if="task.status === 'completed' && failedItems.length === 0" class="task-row-mark is-done" aria-hidden="true">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
          </span>
          <span v-else-if="isFailedRow" class="task-row-mark is-failed" aria-hidden="true">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M12 8v5m0 4h.01" /></svg>
          </span>
          <span v-else-if="task.status === 'cancelled'" class="task-row-mark is-cancelled" aria-hidden="true">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M8 12h8" /></svg>
          </span>

          <span v-if="task.status === 'running' || task.status === 'pending'" class="task-row-actions is-always">
            <button class="task-row-action" :title="$t('tasks.row.cancel')" :aria-label="$t('tasks.row.cancel')" data-testid="task-cancel" @click.stop="fileOps.cancelTask(task.id)">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
          <span v-else class="task-row-actions">
            <button
              v-if="task.status === 'completed' && finderPath"
              class="task-row-action"
              :title="$t('tasks.row.showInFinder')"
              :aria-label="$t('tasks.row.showInFinder')"
              data-testid="task-show-in-finder"
              @click.stop="windowShowInFolder(finderPath)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" /></svg>
            </button>
            <button
              v-if="isFailedRow || task.status === 'cancelled' || task.status === 'completed'"
              class="task-row-action"
              :title="isFailedRow ? $t('tasks.row.retry') : $t('tasks.row.reexecute')"
              :aria-label="isFailedRow ? $t('tasks.row.retry') : $t('tasks.row.reexecute')"
              :data-testid="isFailedRow ? 'task-retry' : 'task-reexecute'"
              @click.stop="fileOps.retryTask(task.id)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 101.9-5.2M4 4v4h4" /></svg>
            </button>
          </span>
        </div>

        <!-- 进度条：运行中蓝色 / 排队中条纹 -->
        <div
          v-if="task.status === 'running'"
          class="task-row-progress"
          role="progressbar"
          :aria-valuenow="percent"
          :aria-valuetext="progressAriaText"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="task-row-progress-fill" :style="{ width: `${percent}%` }"></div>
        </div>
        <div v-else-if="task.status === 'pending'" class="task-row-progress is-indeterminate" aria-hidden="true">
          <div class="task-row-progress-strip"></div>
        </div>

        <!-- 第二行：状态副行 -->
        <div class="task-row-line2" data-testid="task-row-subline">{{ subline }}</div>

        <!-- 第三行：路径摘要（完整路径 hover title） -->
        <div v-if="summary.source || summary.target" class="task-row-line3" :title="summaryTooltip">
          <template v-if="summary.source">{{ summary.source }}</template>
          <template v-if="summary.source && summary.target"> → </template>
          <template v-if="summary.target">{{ summary.target }}</template>
        </div>
      </div>

      <svg class="task-row-chevron" :class="{ 'is-open': expanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <!-- 展开详情：来源/目标/大小/用时/错误 -->
    <div v-if="expanded" class="task-row-detail" data-testid="task-row-detail">
      <div v-if="primarySourcePath" class="task-detail-line">
        <span class="task-detail-label">{{ $t('tasks.sourceLabel') }}</span>
        <span class="task-detail-value" :title="endpointFull('source')">{{ endpointFull('source') }}</span>
        <button class="task-detail-link" @click="locateEndpoint('source')">{{ $t('tasks.locate') }}</button>
      </div>
      <div v-if="destinationPath" class="task-detail-line">
        <span class="task-detail-label">{{ $t('tasks.destinationLabel') }}</span>
        <span class="task-detail-value" :title="endpointFull('destination')">{{ endpointFull('destination') }}</span>
        <button class="task-detail-link" @click="locateEndpoint('destination')">{{ $t('tasks.locate') }}</button>
      </div>
      <div class="task-detail-line">
        <span class="task-detail-label">{{ $t('tasks.detail.size') }}</span>
        <span class="task-detail-value">
          {{ itemCount > 1 ? `${t('tasks.itemCount', itemCount)} · ` : '' }}{{ task.progress.totalBytes > 0 ? formatBytes(task.progress.totalBytes) : '—' }}
        </span>
      </div>
      <div v-if="durationText" class="task-detail-line">
        <span class="task-detail-label">{{ $t('tasks.detail.duration') }}</span>
        <span class="task-detail-value">{{ durationText }}</span>
      </div>

      <template v-if="failedItems.length > 0">
        <div class="task-detail-sep"></div>
        <div class="task-detail-errors">
          <div class="task-detail-errors-title">{{ $t('tasks.error.itemsFailed', failedItems.length) }}</div>
          <div v-for="(item, i) in shownFailedItems" :key="i" class="task-detail-error">
            <span class="task-detail-error-name" :title="item.sourcePath">{{ baseName(item.sourcePath) }}</span>
            <span v-if="item.error" class="task-detail-error-msg">{{ item.error }}</span>
          </div>
          <button
            v-if="failedItems.length > shownFailedItems.length || showAllErrors"
            class="task-detail-link"
            data-testid="task-view-all-errors"
            @click="showAllErrors = !showAllErrors"
          >
            {{ $t('tasks.detail.viewAll', failedItems.length) }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FileOperationTask } from '@/types/fileOperation'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useVolumesStore } from '@/stores/volumes'
import { useDevicesStore } from '@/stores/devices'
import { t } from '@/i18n'
import {
  actionSentenceParts,
  basename as baseName,
  middleEllipsis,
  pathSummary,
  taskIconGroup
} from '@/utils/taskDisplay'
import {
  createSpeedSmoother,
  formatBytes,
  formatSpeed,
  splitDuration,
  taskRatio
} from '@/utils/taskMetrics'

const props = defineProps<{
  task: FileOperationTask
  expanded: boolean
  /** pending 任务在队列中的序（1 起）；drawer 侧由 store 算好传入。 */
  queuePosition?: number
}>()

const emit = defineEmits<{
  (e: 'toggle', taskId: string): void
  (e: 'locate', endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }): void
}>()

const fileOps = useFileOperationsStore()
const volumesStore = useVolumesStore()
const devicesStore = useDevicesStore()

const showAllErrors = ref(false)

// ── 图标/句式 ──────────────────────────────────────────────
const iconGroup = computed(() => taskIconGroup(props.task.type))
const parts = computed(() => actionSentenceParts(props.task))

const failedItems = computed(() => props.task.progress.itemResults.filter(r => r.status === 'failed'))
/** 部分失败的任务按失败行渲染（红叹号 + 失败句式）。 */
const isFailedRow = computed(() => props.task.status === 'failed' || (props.task.status === 'completed' && failedItems.value.length > 0))

const sentence = computed(() => {
  const action = t(parts.value.verbKey)
  const name = parts.value.name ? middleEllipsis(parts.value.name) : null
  const st = props.task.status
  if (st === 'running' || st === 'pending') {
    return name
      ? t('tasks.sentence.runningSingle', { action, name })
      : t('tasks.sentence.runningMultiple', { action, count: parts.value.count })
  }
  if (isFailedRow.value) {
    return name
      ? t('tasks.sentence.failedSingle', { action, name })
      : t('tasks.sentence.failedMultiple', { action, count: parts.value.count })
  }
  if (st === 'completed') {
    return name
      ? t('tasks.sentence.doneSingle', { action, name })
      : t('tasks.sentence.doneMultiple', { action, count: parts.value.count })
  }
  return t('tasks.sentence.cancelled', { action, count: parts.value.count })
})

const fullTitle = computed(() => parts.value.name ?? sentence.value)

// ── 速度平滑 / 进度 / ETA ──────────────────────────────────
const smoother = createSpeedSmoother()
const smoothSpeed = ref(0)
watch(
  () => props.task.progress.speed,
  v => { smoothSpeed.value = smoother.push(v) },
  { immediate: true }
)

const percent = computed(() => Math.round((taskRatio(props.task) ?? 0) * 100))
const isTransient = computed(() => props.task.progress.totalBytes <= 0)

const etaSeconds = computed(() => {
  if (isTransient.value || smoothSpeed.value <= 0) return null
  const { totalBytes, bytesTransferred } = props.task.progress
  return (totalBytes - bytesTransferred) / smoothSpeed.value
})

function durationTextOf(ms: number | undefined | null): string {
  const partsDur = splitDuration(ms ?? 0)
  if (!partsDur) return ''
  return t(partsDur.unitKey, partsDur.value)
}

const durationText = computed(() =>
  durationTextOf((props.task.completedAt ?? 0) - (props.task.startedAt ?? props.task.createdAt))
)

const subline = computed(() => {
  const st = props.task.status
  if (st === 'running') {
    if (isTransient.value) {
      return t('tasks.line.items', { done: props.task.progress.currentFileIndex, total: props.task.progress.totalFiles })
    }
    const speed = formatSpeed(smoothSpeed.value)
    if (smoothSpeed.value <= 0) {
      return `${percent.value}% · ${t('tasks.line.waiting')}`
    }
    const eta = etaSeconds.value
    if (eta === null) {
      return `${percent.value}% · ${speed} · ${t('tasks.line.etaUnknown')}`
    }
    if (eta < 10) {
      return `${percent.value}% · ${speed} · ${t('tasks.line.soon')}`
    }
    const etaText = t('tasks.line.eta', { duration: durationTextOf(eta * 1000) })
    return t('tasks.line.running', { percent: percent.value, speed, eta: etaText })
  }
  if (st === 'pending') {
    return t('tasks.line.pending', { position: props.queuePosition ?? 1 })
  }
  if (st === 'completed' && !isFailedRow.value) {
    const successCount = props.task.progress.itemResults.filter(r => r.status === 'success').length
    return parts.value.count > 1
      ? t('tasks.line.completedMultiple', { count: successCount || parts.value.count, duration: durationText.value })
      : t('tasks.line.completed', { duration: durationText.value })
  }
  if (isFailedRow.value) {
    if (props.task.status === 'failed' && props.task.error) return props.task.error
    if (failedItems.value.length > 0) {
      const successCount = props.task.progress.itemResults.filter(r => r.status === 'success').length
      return [
        successCount > 0 ? t('tasks.result.succeeded', successCount) : '',
        t('tasks.result.failed', failedItems.value.length)
      ].filter(Boolean).join(' · ')
    }
    return t('tasks.taskError')
  }
  if (st === 'cancelled') {
    return t('tasks.line.cancelled', { size: formatBytes(props.task.progress.bytesTransferred) })
  }
  return ''
})

const progressAriaText = computed(() =>
  `${percent.value}%${isTransient.value ? '' : `, ${formatSpeed(smoothSpeed.value)}`}`
)

// ── 路径摘要 / 详情 ────────────────────────────────────────
const deviceNames = computed(() =>
  Object.fromEntries(devicesStore.devices.map(d => [d.id, d.name]))
)
const summary = computed(() => pathSummary(props.task, volumesStore.volumes, deviceNames.value))

const primarySourcePath = computed(() => props.task.sourcePaths[0] || '')
const destinationPath = computed(() => props.task.targetPath || '')
const sourceDeviceId = computed(() => props.task.sourceDeviceId)
const destinationDeviceId = computed(() => props.task.targetDeviceId ?? props.task.sourceDeviceId)

const summaryTooltip = computed(() =>
  [endpointFull('source'), endpointFull('destination')].filter(Boolean).join('\n → ')
)

function endpointFull(kind: 'source' | 'destination'): string {
  if (kind === 'source') {
    if (!primarySourcePath.value) return ''
    const dev = sourceDeviceId.value === 'local' ? t('devices.localName') : sourceDeviceId.value
    return `${dev} · ${primarySourcePath.value}`
  }
  if (!destinationPath.value) return ''
  const dev = destinationDeviceId.value === 'local' ? t('devices.localName') : destinationDeviceId.value
  return `${dev} · ${destinationPath.value}`
}

const itemCount = computed(() => props.task.sourcePaths.length || 1)

const shownFailedItems = computed(() =>
  showAllErrors.value ? failedItems.value : failedItems.value.slice(0, 5)
)

/** 完成「显示于 Finder」：仅本地目标的首个成功项。 */
const finderPath = computed(() => {
  if (destinationDeviceId.value !== 'local') return null
  const first = props.task.progress.itemResults.find(r => r.status === 'success' && r.targetPath)
  return first?.targetPath ?? null
})

function locateEndpoint(kind: 'source' | 'destination'): void {
  if (kind === 'source') {
    if (!primarySourcePath.value) return
    if (sourceDeviceId.value === 'local') {
      window.fileman.showInFolder(primarySourcePath.value)
      return
    }
    emit('locate', { kind, deviceId: sourceDeviceId.value, path: primarySourcePath.value })
    return
  }
  if (!destinationPath.value) return
  if (destinationDeviceId.value === 'local') {
    window.fileman.showInFolder(destinationPath.value)
    return
  }
  emit('locate', { kind, deviceId: destinationDeviceId.value, path: destinationPath.value })
}

function windowShowInFolder(path: string): void {
  window.fileman.showInFolder(path)
}
</script>

<style scoped>
.task-row {
  border-bottom: 1px solid var(--finder-divider);
}

.task-row.is-expanded {
  background: var(--finder-control);
}

.task-row-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  min-height: 60px;
  cursor: default;
}

.task-row.is-running .task-row-main,
.task-row.is-pending .task-row-main {
  min-height: 72px;
}

.task-row-main:hover {
  background: var(--finder-row-hover);
}

.task-row.is-expanded .task-row-main:hover {
  background: transparent;
}

.task-row-main:focus-visible {
  outline: 2px solid var(--finder-selection);
  outline-offset: -2px;
}

.task-row-icon {
  flex-shrink: 0;
  padding-top: 1px;
  color: var(--finder-secondary-label);
}

.task-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-row-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}

.task-row-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--finder-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row.is-cancelled .task-row-title,
.task-row.is-pending .task-row-title {
  font-weight: 500;
}

.task-row-mark {
  flex-shrink: 0;
  display: flex;
}

.task-row-mark.is-done { color: var(--accent-green); }
.task-row-mark.is-failed { color: var(--accent-red); }
.task-row-mark.is-cancelled { color: var(--finder-secondary-label); }

/* 操作区：运行中常显（取消有时效性）；终态 hover 显 */
.task-row-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 120ms ease;
}

.task-row-actions.is-always,
.task-row-main:hover .task-row-actions,
.task-row-main:focus-within .task-row-actions {
  opacity: 1;
}

.task-row-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--finder-secondary-label);
}

.task-row-action:hover {
  background: var(--finder-control-strong);
  color: var(--finder-label);
}

/* 进度条：3px 细条 */
.task-row-progress {
  height: 3px;
  border-radius: 1.5px;
  background: var(--finder-control-strong);
  overflow: hidden;
  margin: 2px 0;
}

.task-row-progress-fill {
  height: 100%;
  border-radius: 1.5px;
  background: var(--finder-selection);
  transition: width 300ms ease;
}

.task-row-progress.is-indeterminate {
  position: relative;
}

.task-row-progress-strip {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30%;
  border-radius: 1.5px;
  background: var(--finder-selection);
  opacity: 0.55;
  animation: task-strip 1.4s ease-in-out infinite;
}

@keyframes task-strip {
  0% { left: -30%; }
  60% { left: 100%; }
  100% { left: 100%; }
}

.task-row-line2 {
  font-size: 12px;
  color: var(--finder-secondary-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row.is-failed .task-row-line2,
.task-row.has-failures .task-row-line2 {
  color: var(--accent-red);
}

.task-row-line3 {
  font-size: 12px;
  color: var(--finder-secondary-label);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row-chevron {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  color: var(--finder-secondary-label);
  opacity: 0.6;
  transform: rotate(-90deg);
  transition: transform 180ms ease;
}

.task-row-chevron.is-open {
  transform: rotate(0deg);
}

/* 展开详情 */
.task-row-detail {
  padding: 6px 12px 12px 40px;
  border-top: 1px dashed var(--finder-divider);
}

.task-detail-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
}

.task-detail-label {
  flex-shrink: 0;
  width: 34px;
  color: var(--finder-secondary-label);
}

.task-detail-value {
  flex: 1;
  min-width: 0;
  color: var(--finder-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-detail-link {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--finder-selection);
}

.task-detail-link:hover {
  text-decoration: underline;
}

.task-detail-sep {
  height: 1px;
  margin: 6px 0;
  background: var(--finder-divider);
}

.task-detail-errors-title {
  font-size: 12px;
  color: var(--accent-red);
  padding: 2px 0;
}

.task-detail-error {
  display: flex;
  gap: 6px;
  font-size: 12px;
  padding: 1px 0;
  min-width: 0;
}

.task-detail-error-name {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--finder-label);
}

.task-detail-error-msg {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent-red);
  opacity: 0.85;
}
</style>
