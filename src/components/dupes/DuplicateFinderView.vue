<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue'
// reactive() 用于解包 composable 嵌套 ref（见下）
import type { DuplicateSession } from '@/types'
import { useDuplicates } from './useDuplicates'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useTabsStore } from '@/stores/tabs'
import { formatSize } from '@/utils/path'
import { useCommandRegistryStore } from '@/stores/commandRegistry'
import { formatDateTime } from '@/utils/formatDate'
import { t } from '@/i18n'

/**
 * 重复文件查找工具页（瞬态标签，DirCompareView 配方）。
 * 三阶段漏斗进度条 + 分组折叠列表 + 勾选批量删除（走既有 fileOperations 队列）。
 */

const props = defineProps<{ session: DuplicateSession }>()

const tabsStore = useTabsStore()
const fileOpsStore = useFileOperationsStore()
const commandRegistry = useCommandRegistryStore()

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

// 挂载即注册命令面板入口（M2 注册表；卸载对称注销）
const COMMAND_IDS = ['dupes.rescan']
onMounted(() => {
  void dupes.run()
  commandRegistry.registerCommands([{
    id: 'dupes.rescan',
    title: t('dupes.cmd.rescan'),
    group: t('dupes.cmdGroup'),
    run: () => {
      if (!dupes.isRunning) void dupes.run()
    }
  }])
})
onUnmounted(() => {
  commandRegistry.unregisterCommands(COMMAND_IDS)
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
    <div class="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-toolbar">
      <span class="text-xs text-text-secondary font-mono truncate" :title="session.rootPath">
        {{ session.rootPath }}
      </span>
      <span class="text-[11px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-tertiary flex-shrink-0">
        {{ dupes.phaseLabel || $t('dupes.phaseIdle') }}
      </span>
      <div class="flex-1" />
      <button
        v-if="!dupes.isRunning && dupes.groups.length > 0"
        class="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-hover"
        @click="dupes.selectDuplicatesOlderThanNewest()"
      >{{ $t('dupes.selectOlder') }}</button>
      <button
        class="text-xs px-2.5 py-1 rounded"
        :class="dupes.isRunning
          ? 'border border-border text-text-secondary hover:bg-bg-hover'
          : 'bg-accent-blue text-white hover:bg-accent-blue/90'"
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
      <div v-if="!dupes.isRunning && dupes.groups.length === 0 && !dupes.message" class="flex items-center justify-center h-full text-sm text-text-tertiary">
        {{ dupes.progress ? $t('dupes.noDuplicates') : '' }}
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
              class="accent-blue-500"
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
      class="flex items-center gap-3 px-4 py-2 border-t border-border bg-bg-toolbar"
    >
      <span class="text-xs text-text-secondary">
        {{ $t('dupes.summary.reclaimable', dupes.groups.length) }} <span class="text-accent-orange">{{ formatSize(dupes.wastedBytes) }}</span>
      </span>
      <div class="flex-1" />
      <span class="text-xs text-text-tertiary">{{ $t('dupes.summary.checked', dupes.checkedList.length) }}</span>
      <button
        class="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-hover"
        @click="dupes.clearSelection()"
      >{{ $t('dupes.clearSelection') }}</button>
      <button
        class="text-xs px-2.5 py-1 rounded bg-accent-red text-white hover:bg-accent-red/90 disabled:opacity-40"
        :disabled="dupes.checkedList.length === 0"
        @click="deleteChecked"
      >{{ $t('dupes.deleteSelected', { count: dupes.checkedList.length }) }}</button>
    </div>
  </div>
</template>
