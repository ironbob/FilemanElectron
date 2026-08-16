<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import type { SpaceSession } from '@/types'
import type { SpaceEntry } from '@shared/types'
import { useLongTaskProgress } from '@/composables/useLongTaskProgress'
import { useCommandRegistryStore } from '@/stores/commandRegistry'
import { useTabsStore } from '@/stores/tabs'
import { formatSize } from '@/utils/path'
import { squarify } from './squarify'

/**
 * 目录空间分析工具页（瞬态标签）。顶层条目 treemap（squarified）+
 * 点击下钻 + hover tooltip。entries 只随终态到达。
 */

const props = defineProps<{ session: SpaceSession }>()

const tabsStore = useTabsStore()
const commandRegistry = useCommandRegistryStore()

const sessionId = `space-${props.session.id}`

const { progress, isRunning, start, cancel } = useLongTaskProgress<
  Parameters<typeof window.fileman.startSpaceAnalysis>[0],
  import('@shared/types').SpaceAnalysisProgress
>({
  start: request => window.fileman.startSpaceAnalysis(request),
  cancel: taskId => window.fileman.cancelSpaceAnalysis(taskId),
  subscribe: callback => window.fileman.onSpaceAnalysisProgress(callback)
})

const entries = computed<SpaceEntry[]>(() => {
  const p = progress.value
  return p?.status === 'completed' ? (p.entries ?? []) : []
})

const MAX_NODES = 200

/** 前 200 个 + Others 聚合（超出截断，色块过多不可读）。 */
const displayEntries = computed(() => {
  const list = entries.value
  if (list.length <= MAX_NODES) return list
  const head = list.slice(0, MAX_NODES)
  const rest = list.slice(MAX_NODES)
  return [...head, {
    name: `其余 ${rest.length} 项`,
    path: '',
    size: rest.reduce((sum, entry) => sum + entry.size, 0),
    fileCount: rest.reduce((sum, entry) => sum + entry.fileCount, 0),
    directoryCount: rest.reduce((sum, entry) => sum + entry.directoryCount, 0)
  }]
})

interface Cell extends SpaceEntry {
  x: number
  y: number
  w: number
  h: number
  tone: number
}

/** 容器逻辑尺寸（布局用相对坐标乘 1000 保证整数精度）。 */
const CONTAINER = 1000

const cells = computed<Cell[]>(() => {
  const rects = squarify(
    displayEntries.value.map(entry => ({ key: entry.path || entry.name, value: entry.size })),
    CONTAINER,
    CONTAINER
  )
  const byKey = new Map(displayEntries.value.map(entry => [entry.path || entry.name, entry]))
  const total = displayEntries.value.reduce((sum, entry) => sum + entry.size, 0) || 1
  return rects.flatMap(rect => {
    const entry = byKey.get(rect.key)
    if (!entry) return []
    // 色调：占比越大越暖（0=蓝 → 1=红），find 空间占用直觉
    const share = entry.size / total
    return [{
      ...entry,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      tone: Math.min(1, share * 4)
    }]
  })
})

const tooltip = reactive({ visible: false, x: 0, y: 0, entry: null as Cell | null })

function showTooltip(event: MouseEvent, cell: Cell): void {
  tooltip.visible = true
  // 钳制在视口内（模板不直接访问 window）
  tooltip.x = Math.min(event.clientX + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260)
  tooltip.y = event.clientY + 16
  tooltip.entry = cell
}

function hideTooltip(): void {
  tooltip.visible = false
}

function drillDown(cell: Cell): void {
  if (!cell.path) return // Others 聚合项不可下钻
  tabsStore.openSpaceTab(props.session.deviceId, cell.path)
}

const COMMAND_IDS = ['space.rerun']
onMounted(() => {
  void start({ sessionId, deviceId: props.session.deviceId, rootPath: props.session.rootPath })
  commandRegistry.registerCommands([{
    id: 'space.rerun',
    title: '重新分析空间',
    group: '空间分析',
    run: () => { if (!isRunning.value) void start({ sessionId, deviceId: props.session.deviceId, rootPath: props.session.rootPath }) }
  }])
})
onUnmounted(() => commandRegistry.unregisterCommands(COMMAND_IDS))

function cellColor(tone: number): string {
  // 蓝(低) → 紫 → 红(高) 的 HSL 插值；双主题下均以白色文字保证可读
  const hue = 220 - tone * 200 // 220(蓝) → 20(橙红)
  const saturation = 45 + tone * 25
  const lightness = 30 + tone * 12
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

function cellLabel(cell: Cell): string {
  if (cell.w < 60 || cell.h < 40) return '' // 太小不放文字（tooltip 兜底）
  return cell.name
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-bg-primary">
    <!-- 工具栏 -->
    <div class="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-toolbar">
      <span class="text-xs text-text-secondary font-mono truncate" :title="session.rootPath">{{ session.rootPath }}</span>
      <span v-if="isRunning" class="text-[11px] px-1.5 py-0.5 rounded bg-bg-secondary text-accent-blue">
        分析中 · {{ progress?.currentPath ?? '' }}
      </span>
      <span v-else-if="progress?.status === 'completed'" class="text-[11px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-tertiary">
        {{ progress.fileCount }} 文件 · {{ formatSize(progress.totalBytes) }}
      </span>
      <div class="flex-1" />
      <button
        class="text-xs px-2.5 py-1 rounded"
        :class="isRunning
          ? 'border border-border text-text-secondary hover:bg-bg-hover'
          : 'bg-accent-blue text-white hover:bg-accent-blue/90'"
        @click="isRunning ? cancel() : start({ sessionId, deviceId: session.deviceId, rootPath: session.rootPath })"
      >{{ isRunning ? '取消' : '重新分析' }}</button>
    </div>

    <!-- treemap 画布 -->
    <div class="flex-1 min-h-0 overflow-hidden relative p-2">
      <div
        v-for="cell in cells"
        :key="cell.path || cell.name"
        class="absolute rounded-sm border border-bg-primary/60 overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
        :style="{
          left: (cell.x / CONTAINER * 100) + '%',
          top: (cell.y / CONTAINER * 100) + '%',
          width: (cell.w / CONTAINER * 100) + '%',
          height: (cell.h / CONTAINER * 100) + '%',
          background: cellColor(cell.tone)
        }"
        :title="`${cell.name} · ${formatSize(cell.size)}`"
        @mousemove="showTooltip($event, cell)"
        @mouseleave="hideTooltip"
        @click="drillDown(cell)"
      >
        <div v-if="cellLabel(cell)" class="p-1.5 text-white text-[11px] font-medium leading-tight break-all pointer-events-none">
          {{ cellLabel(cell) }}
          <div class="text-[10px] opacity-80 font-normal">{{ formatSize(cell.size) }}</div>
        </div>
      </div>

      <div
        v-if="!isRunning && cells.length === 0 && progress?.status === 'completed'"
        class="absolute inset-0 flex items-center justify-center text-sm text-text-tertiary"
      >目录为空</div>
    </div>

    <!-- tooltip -->
    <div
      v-if="tooltip.visible && tooltip.entry"
      class="fixed z-dropdown pointer-events-none px-2.5 py-1.5 rounded-md bg-bg-secondary border border-border shadow-lg text-xs"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="font-medium text-text-primary truncate max-w-60">{{ tooltip.entry.name }}</div>
      <div class="text-text-secondary">{{ formatSize(tooltip.entry.size) }} · {{ tooltip.entry.fileCount }} 文件 · {{ tooltip.entry.directoryCount }} 目录</div>
      <div v-if="tooltip.entry.path" class="text-text-tertiary font-mono truncate max-w-60">{{ tooltip.entry.path }}</div>
    </div>
  </div>
</template>
