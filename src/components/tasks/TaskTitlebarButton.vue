<template>
  <!-- titlebar 右端任务按钮：全局唯一任务入口。Badge 三态——
       单个进行中→蓝色进度环；多个→蓝数字；未读失败→红数字（最优先）。 -->
  <button
    class="task-titlebar-button app-no-drag"
    :class="{ 'is-open': fileOps.isDrawerOpen }"
    :title="$t('tasks.drawer.openTip')"
    :aria-label="ariaLabel"
    data-testid="task-titlebar-button"
    @click="fileOps.toggleDrawer()"
  >
    <!-- tray.full 风格：托盘 + 内容物 -->
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 14v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M7 6h10M7 10h7" />
    </svg>

    <!-- 进度环 Badge：18px 外圈，stroke-dashoffset 随进度 -->
    <svg
      v-if="badge.kind === 'ring'"
      class="task-badge-ring"
      viewBox="0 0 20 20"
      data-testid="task-badge-ring"
      aria-hidden="true"
    >
      <circle class="task-badge-ring-track" cx="10" cy="10" r="8.5" />
      <circle
        class="task-badge-ring-fill"
        cx="10"
        cy="10"
        r="8.5"
        :stroke-dasharray="RING_CIRCUMFERENCE"
        :stroke-dashoffset="RING_CIRCUMFERENCE * (1 - badge.value / 100)"
      />
    </svg>

    <!-- 数字 Badge：进行中蓝 / 失败红 -->
    <span
      v-else-if="badge.kind === 'count' || badge.kind === 'failure'"
      class="task-badge-count"
      :class="badge.kind === 'failure' ? 'is-failure' : 'is-active'"
      :data-testid="`task-badge-${badge.kind}`"
    >{{ badge.value }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { t } from '@/i18n'

const fileOps = useFileOperationsStore()

const badge = computed(() => fileOps.badgeState)

const RING_CIRCUMFERENCE = 2 * Math.PI * 8.5

const ariaLabel = computed(() => {
  const b = badge.value
  if (b.kind === 'failure') return `${t('tasks.drawer.openTip')} · ${t('tasks.badge.failure', b.value)}`
  if (b.kind === 'count') return `${t('tasks.drawer.openTip')} · ${t('tasks.badge.count', b.value)}`
  if (b.kind === 'ring') return `${t('tasks.drawer.openTip')} · ${t('tasks.badge.progress', { percent: b.value })}`
  return t('tasks.drawer.openTip')
})
</script>

<style scoped>
.task-titlebar-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--finder-secondary-label);
  transition: background-color 120ms ease, color 120ms ease;
}

.task-titlebar-button:hover {
  background: var(--finder-row-hover);
  color: var(--finder-label);
}

.task-titlebar-button.is-open {
  background: var(--finder-control-strong);
  color: var(--finder-selection);
}

.task-badge-ring {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.task-badge-ring-track {
  fill: none;
  stroke: var(--finder-divider);
  stroke-width: 1.5;
}

.task-badge-ring-fill {
  fill: none;
  stroke: var(--finder-selection);
  stroke-width: 1.5;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset 300ms ease;
}

.task-badge-count {
  position: absolute;
  top: -1px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  color: #fff;
  pointer-events: none;
}

.task-badge-count.is-active {
  background: var(--finder-selection);
}

.task-badge-count.is-failure {
  background: var(--accent-red);
}
</style>
