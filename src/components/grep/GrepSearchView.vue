<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import type { GrepSession } from '@/types'
import type { GrepMatch } from '@shared/types'
import { useGrepSearch } from './useGrepSearch'
import { usePreviewStore } from '@/stores/preview'
import { getBaseName } from '@/utils/path'

/**
 * 内容搜索工具页（瞬态标签）。查询栏 + 实时进度行 + 按文件分组折叠列表；
 * 点击命中行 → 预览标签页并定位行号（PreviewTab.initialLine）。
 */

const props = defineProps<{ session: GrepSession }>()

const previewStore = usePreviewStore()

const query = reactive({
  pattern: props.session.pattern,
  isRegex: props.session.isRegex,
  caseSensitive: props.session.caseSensitive,
  includeGlob: props.session.includeGlob ?? '',
  excludeGlob: props.session.excludeGlob ?? ''
})

const grep = reactive(useGrepSearch({
  id: props.session.id,
  deviceId: props.session.deviceId,
  rootPath: props.session.rootPath
}))

const view = reactive({
  collapsed: new Set<string>()
})

onMounted(() => {
  if (query.pattern) void grep.run(query)
})

function submit(): void {
  if (!query.pattern.trim() || grep.isRunning) return
  view.collapsed.clear()
  void grep.run(query)
}

function toggleGroup(path: string): void {
  if (view.collapsed.has(path)) view.collapsed.delete(path)
  else view.collapsed.add(path)
}

/** 点击命中 → 打开预览并定位行号。 */
function openMatch(match: GrepMatch): void {
  const name = getBaseName(match.path)
  previewStore.openPreview({
    name,
    path: match.path,
    isDirectory: false,
    isFile: true,
    size: 0,
    modifiedTime: new Date().toISOString(),
    extension: name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : undefined
  }, props.session.deviceId, match.line)
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-bg-primary">
    <!-- 查询栏 -->
    <div class="flex items-center gap-2 h-10 px-4 border-b border-border bg-bg-toolbar flex-shrink-0">
      <input
        v-model="query.pattern"
        type="text"
        class="flex-1 min-w-0 h-7 px-2.5 text-sm font-mono rounded-md border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
        :placeholder="$t('grep.placeholder')"
        spellcheck="false"
        @keydown.enter="submit"
      >
      <label class="flex items-center gap-1 text-xs text-text-secondary cursor-pointer" :title="$t('grep.regexTip')">
        <input v-model="query.isRegex" type="checkbox" class="accent-accent"> .*
      </label>
      <label class="flex items-center gap-1 text-xs text-text-secondary cursor-pointer" :title="$t('grep.caseTip')">
        <input v-model="query.caseSensitive" type="checkbox" class="accent-accent"> Aa
      </label>
      <input
        v-model="query.includeGlob"
        type="text"
        class="w-28 h-7 px-2 text-xs font-mono rounded-md border border-border bg-bg-primary text-text-secondary focus:outline-none focus:border-accent-blue"
        :placeholder="$t('grep.includePlaceholder')"
        spellcheck="false"
      >
      <input
        v-model="query.excludeGlob"
        type="text"
        class="w-28 h-7 px-2 text-xs font-mono rounded-md border border-border bg-bg-primary text-text-secondary focus:outline-none focus:border-accent-blue"
        :placeholder="$t('grep.excludePlaceholder')"
        spellcheck="false"
      >
      <button
        class="h-7 inline-flex items-center text-xs px-3 rounded-md flex-shrink-0"
        :class="grep.isRunning
          ? 'h-7 inline-flex items-center px-3 border border-border rounded-md text-text-secondary hover:bg-bg-hover'
          : 'h-7 bg-accent-blue text-white hover:bg-accent-blue/90 px-3'"
        @click="grep.isRunning ? grep.cancel() : submit()"
      >{{ grep.isRunning ? $t('common.cancel') : $t('grep.search') }}</button>
    </div>

    <!-- 状态行 -->
    <div class="flex items-center gap-3 px-4 py-1.5 border-b border-border/60 text-[11px] text-text-tertiary">
      <span class="font-mono truncate" :title="session.rootPath">{{ session.rootPath }}</span>
      <span v-if="grep.isRunning" class="text-accent-blue">{{ $t('grep.status.searching', grep.matches.length) }}</span>
      <span v-else-if="grep.progress?.status === 'completed'" class="text-accent-green">
        {{ $t('grep.status.done', { fileCount: grep.fileCount, matchCount: grep.matches.length }, grep.matches.length) }}{{ grep.truncated ? $t('grep.status.truncated') : '' }}
      </span>
      <span v-else-if="grep.message" class="text-accent-orange">{{ grep.message }}</span>
      <span v-else>{{ $t('grep.status.idle') }}</span>
    </div>

    <!-- 结果列表（按文件分组折叠） -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div
        v-for="group in grep.groupedMatches"
        :key="group.path"
        class="border-b border-border/60"
      >
        <button
          class="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-bg-hover"
          @click="toggleGroup(group.path)"
        >
          <svg
            class="w-3 h-3 text-text-tertiary transition-transform"
            :class="view.collapsed.has(group.path) ? '' : 'rotate-90'"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <span class="text-xs font-medium text-text-primary truncate">{{ getBaseName(group.path) }}</span>
          <span class="text-[10px] text-text-tertiary truncate flex-1" :title="group.path">{{ group.path }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-tertiary flex-shrink-0">{{ group.matches.length }}</span>
        </button>
        <div v-if="!view.collapsed.has(group.path)">
          <button
            v-for="match in group.matches"
            :key="match.path + ':' + match.line"
            class="w-full flex items-start gap-2 px-4 py-1 pl-10 text-left hover:bg-bg-hover"
            @click="openMatch(match)"
          >
            <span class="text-[10px] text-text-tertiary font-mono w-10 text-right flex-shrink-0 pt-0.5">{{ match.line }}</span>
            <span class="text-xs font-mono text-text-secondary truncate">{{ match.lineText }}</span>
          </button>
        </div>
      </div>

      <div
        v-if="!grep.isRunning && grep.matches.length === 0 && grep.progress?.status === 'completed'"
        class="flex flex-col items-center justify-center flex-1 gap-3 py-16 text-text-tertiary"
      >
        <svg class="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" stroke-width="1.5" />
          <path stroke-linecap="round" stroke-width="1.5" d="M20 20l-3.8-3.8" />
          <path stroke-linecap="round" stroke-width="1.5" d="M8.5 11h5M11 8.5v5" />
        </svg>
        <span class="text-sm">{{ $t('grep.noMatches') }}</span>
      </div>
    </div>
  </div>
</template>
