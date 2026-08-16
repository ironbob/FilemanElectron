<template>
  <!-- 批量压缩对话框：参数 + 保存模式 + 应用到全部 N 张 + 进行中进度。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="!running && emit('close')">
    <form class="w-[460px] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="start">
      <h2 class="text-base font-semibold">批量压缩</h2>
      <p class="mt-1 text-sm text-text-tertiary">应用到当前集合的全部 {{ count }} 张图片</p>

      <div class="mt-4 space-y-3 rounded-lg border border-border p-3 text-sm">
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">质量 {{ quality }}</span>
          <input v-model.number="quality" type="range" min="1" max="100" class="flex-1 accent-blue-500" :disabled="running" />
        </div>
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">最长边</span>
          <input v-model.number="maxEdge" type="number" min="1" placeholder="不限制" class="w-24 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="running" />
          <span class="text-xs text-text-tertiary">px（仅缩小）</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">格式</span>
          <select v-model="format" class="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="running">
            <option value="keep">保持原格式</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="[!running && mode === 'overwrite' ? 'border-accent-blue bg-accent-blue/10' : 'border-border']">
            <input v-model="mode" type="radio" value="overwrite" class="accent-blue-500" :disabled="running" />
            <span>覆盖原图</span>
          </label>
          <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="[!running && mode === 'copy' ? 'border-accent-blue bg-accent-blue/10' : 'border-border']">
            <input v-model="mode" type="radio" value="copy" class="accent-blue-500" :disabled="running" />
            <span>另存副本</span>
          </label>
        </div>
        <div v-if="mode === 'copy'" class="flex items-center gap-2 text-sm">
          <span class="text-xs text-text-tertiary flex-shrink-0">后缀</span>
          <input v-model="suffix" class="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-sm" placeholder="_compressed" :disabled="running" />
        </div>
      </div>

      <!-- 进度 -->
      <div v-if="progress" class="mt-4">
        <div class="h-1.5 rounded-full bg-bg-hover overflow-hidden">
          <div class="h-full bg-accent-blue transition-all" :style="{ width: `${((progress.index + 1) / progress.total) * 100}%` }"></div>
        </div>
        <div class="mt-1.5 flex items-center justify-between text-xs text-text-tertiary">
          <span class="truncate">{{ progress.currentFile }}</span>
          <span class="tabular-nums flex-shrink-0 ml-2">
            {{ Math.min(progress.index + 1, progress.total) }} / {{ progress.total }}
            <template v-if="doneLabel"> · {{ doneLabel }}</template>
          </span>
        </div>
      </div>

      <p v-if="error" class="mt-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-400">{{ error }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button v-if="running" type="button" class="rounded border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="emit('cancel')">取消任务</button>
        <button v-else type="button" class="rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="emit('close')">关闭</button>
        <button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white hover:bg-accent-blue/90 disabled:opacity-40" :disabled="running || count === 0">
          压缩 {{ count }} 张
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EditOps, EditSaveSpec, ImageEditBatchProgress } from '@shared/types'

const props = defineProps<{
  count: number
  progress: ImageEditBatchProgress | null
  running: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  start: [ops: EditOps, save: EditSaveSpec]
  cancel: []
}>()

const quality = ref(80)
const maxEdge = ref<number | null>(null)
const format = ref<'keep' | 'jpeg' | 'webp'>('keep')
const mode = ref<'overwrite' | 'copy'>('copy')
const suffix = ref('_compressed')

const doneLabel = computed(() => {
  const p = props.progress
  if (!p || p.status === 'running') return ''
  const ok = p.itemResults.filter(r => r.status === 'success').length
  const failed = p.itemResults.filter(r => r.status === 'failed').length
  const skipped = p.status === 'cancelled' ? ' · 已取消' : ''
  return `成功 ${ok}${failed ? ` · 失败 ${failed}` : ''}${skipped}`
})

function start() {
  const ops: EditOps = {
    compress: {
      quality: quality.value,
      maxEdge: maxEdge.value && maxEdge.value > 0 ? maxEdge.value : undefined,
      format: format.value
    }
  }
  const save: EditSaveSpec = {
    mode: mode.value,
    suffix: mode.value === 'copy' ? (suffix.value || '_compressed') : undefined
  }
  emit('start', ops, save)
}
</script>
