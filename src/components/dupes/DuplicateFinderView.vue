<script setup lang="ts">
import { onMounted, reactive } from 'vue'
// reactive() 用于解包 composable 嵌套 ref（见下）
import type { DuplicateSession } from '@/types'
import { useDuplicates } from './useDuplicates'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useTabsStore } from '@/stores/tabs'
import { formatSize } from '@/utils/path'
import { formatDateTime } from '@/utils/formatDate'

/**
 * 重复文件查找工具页（瞬态标签，DirCompareView 配方）。
 * 三阶段漏斗进度条 + 分组折叠列表 + 勾选批量删除（走既有 fileOperations 队列）。
 */

const props = defineProps<{ session: DuplicateSession }>()

const tabsStore = useTabsStore()
const fileOpsStore = useFileOperationsStore()

// reactive() 解包 composable 返回值里的嵌套 ref（模板与脚本一致访问）
const dupes = reactive(useDuplicates({
  id: props.session.id,
  deviceId: props.session.deviceId,
  rootPath: props.session.rootPath,
  minSize: props.session.minSize
}))

const view = reactive({
  collapsed: new Set<string>()
})

onMounted(() => {
  void dupes.run()
})

function toggleGroup(hash: string): void {
  if (view.collapsed.has(hash)) view.collapsed.delete(hash)
  else view.collapsed.add(hash)
}

function toggleFile(path: string): void {
  if (dupes.checkedPaths.has(path)) dupes.checkedPaths.delete(path)
  else dupes.checkedPaths.add(path)
}

function deleteChecked(): void {
  if (dupes.checkedList.length === 0) return
  void fileOpsStore.createDeleteTask(props.session.deviceId, dupes.checkedList)
}

function revealInPane(path: string): void {
  // 在新标签页打开该文件所在目录（快速核对内容）
  const dir = path.slice(0, path.lastIndexOf('/')) || '/'
  tabsStore.openPathInNewTab(props.session.deviceId, dir)
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-bg-primary">
    <!-- 工具栏 -->
    <div class="flex items-center gap-3 h-10 px-4 border-b border-border bg-bg-toolbar flex-shrink-0">
      <span class="text-xs text-text-secondary font-mono truncate" :title="session.rootPath">
        {{ session.rootPath }}
      </span>
      <span class="text-[11px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-tertiary flex-shrink-0">
        {{ dupes.phaseLabel || $t('dupes.phaseIdle') }}
      </span>
      <div class="flex-1" />
      <button
        v-if="!dupes.isRunning && dupes.groups.length > 0"
        class="h-7 inline-flex items-center text-xs px-2.5 rounded-md border border-border text-text-secondary hover:bg-bg-hover"
        @click="dupes.selectDuplicatesOlderThanNewest()"
      >{{ $t('dupes.selectOlder') }}</button>
      <button
        class="h-7 inline-flex items-center text-xs px-2.5 rounded-md"
        :class="dupes.isRunning
          ? 'h-7 inline-flex items-center border border-border rounded-md text-text-secondary hover:bg-bg-hover px-2.5'
          : 'h-7 bg-accent-blue text-white hover:bg-accent-blue/90 px-3'"
        @click="dupes.isRunning ? dupes.cancel() : dupes.run()"
      >{{ dupes.isRunning ? $t('common.cancel') : $t('dupes.rescan') }}</button>
    </div>

    <!-- 进度条 -->
    <div v-if="dupes.isRunning" class="h-0.5 bg-bg-hover">
      <div class="h-full bg-accent-blue animate-pulse w-1/3" />
    </div>

    <!-- 消息 -->
    <div v-if="dupes.message" class="px-4 py-1.5 text-xs text-accent-orange bg-accent-orange/10">
      {{ dupes.message }}
    </div>

    <!-- 分组列表 -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="!dupes.isRunning && dupes.groups.length === 0 && !dupes.message" class="flex flex-col items-center justify-center h-full gap-3 text-text-tertiary">
        <svg class="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.4 2.4l1.4 3.2M9.2 2.4l1.4 3.2M4 7.2h11.2a.8.8 0 0 1 0 1.6H4a.8.8 0 0 1 0-1.6zM5.2 8.8v9.6a2.4 2.4 0 0 0 2.4 2.4h4.8a2.4 2.4 0 0 0 2.4-2.4V8.8M8.8 12v4.8M11.2 12v4.8" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 6l2 2-4.5 4.5-2.5.5.5-2.5z" />
        </svg>
        <span class="text-sm">{{ dupes.progress ? $t('dupes.noDuplicates') : $t('dupes.phaseIdle') }}</span>
      </div>

      <div
        v-for="group in dupes.groups"
        :key="group.hash"
        class="border-b border-border/60"
      >
        <!-- 组头 -->
        <button
          class="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-bg-hover"
          @click="toggleGroup(group.hash)"
        >
          <svg
            class="w-3 h-3 text-text-tertiary transition-transform"
            :class="view.collapsed.has(group.hash) ? '' : 'rotate-90'"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <span class="text-xs font-medium text-text-primary">{{ $t('dupes.group.identicalCount', group.files.length) }}</span>
          <span class="text-xs text-text-tertiary">· {{ $t('dupes.group.eachSize', { size: formatSize(group.size) }) }}</span>
          <span class="text-xs text-accent-orange">· {{ $t('dupes.group.redundant', { size: formatSize(group.size * (group.files.length - 1)) }) }}</span>
        </button>

        <!-- 组内文件 -->
        <div v-if="!view.collapsed.has(group.hash)">
          <label
            v-for="file in group.files"
            :key="file.path"
            class="flex items-center gap-2 px-4 py-1.5 pl-10 cursor-pointer hover:bg-bg-hover"
            @click.stop
          >
            <input
              type="checkbox"
              class="accent-accent"
              :checked="dupes.checkedPaths.has(file.path)"
              @change="toggleFile(file.path)"
            />
            <span
              class="flex-1 truncate text-xs font-mono text-text-secondary"
              :title="file.path"
              @click.prevent="revealInPane(file.path)"
            >{{ file.path }}</span>
            <span class="text-[10px] text-text-tertiary flex-shrink-0">{{ formatDateTime(file.modifiedTime) }}</span>
          </label>
        </div>
      </div>

      <div v-if="dupes.truncated" class="px-4 py-2 text-[11px] text-text-tertiary">
        {{ $t('dupes.truncatedNotice') }}
      </div>
    </div>

    <!-- 底部动作栏 -->
    <div
      v-if="dupes.groups.length > 0"
      class="flex items-center gap-3 h-10 px-4 border-t border-border bg-bg-toolbar flex-shrink-0"
    >
      <span class="text-xs text-text-secondary">
        {{ $t('dupes.summary.reclaimable', dupes.groups.length) }} <span class="text-accent-orange">{{ formatSize(dupes.wastedBytes) }}</span>
      </span>
      <div class="flex-1" />
      <span class="text-xs text-text-tertiary">{{ $t('dupes.summary.checked', dupes.checkedList.length) }}</span>
      <button
        class="h-7 inline-flex items-center text-xs px-2.5 rounded-md border border-border text-text-secondary hover:bg-bg-hover"
        @click="dupes.clearSelection()"
      >{{ $t('dupes.clearSelection') }}</button>
      <button
        class="h-7 inline-flex items-center text-xs px-3 rounded-md bg-accent-red text-white hover:bg-accent-red/90 disabled:opacity-40"
        :disabled="dupes.checkedList.length === 0"
        @click="deleteChecked"
      >{{ $t('dupes.deleteSelected', { count: dupes.checkedList.length }) }}</button>
    </div>
  </div>
</template>
