<template>
  <!-- 批量压缩对话框：参数 + 保存模式 + 应用到全部 N 张 + 进行中进度。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="!running && emit('close')">
    <form class="finder-sheet w-[460px] p-5" @submit.prevent="start">
      <h2 class="text-base font-semibold">{{ $t('dialogs.batchCompress.title') }}</h2>
      <p class="mt-1 text-sm text-text-tertiary">{{ $t('dialogs.batchCompress.subtitle', count) }}</p>

      <div class="mt-4 space-y-3 rounded-lg border border-border p-3 text-sm">
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">{{ $t('dialogs.batchCompress.quality', { value: quality }) }}</span>
          <input v-model.number="quality" type="range" min="1" max="100" class="flex-1 accent-accent" :disabled="running" />
        </div>
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">{{ $t('dialogs.batchCompress.maxEdge') }}</span>
          <input v-model.number="maxEdge" type="number" min="1" :placeholder="$t('dialogs.batchCompress.noLimit')" class="w-24 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="running" />
          <span class="text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.pxDownscaleOnly') }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">{{ $t('dialogs.batchCompress.format') }}</span>
          <select v-model="format" class="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="running">
            <option value="keep">{{ $t('dialogs.batchCompress.formatKeep') }}</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="[!running && mode === 'overwrite' ? 'border-accent-blue bg-accent-blue/10' : 'border-border']">
            <input v-model="mode" type="radio" value="overwrite" class="accent-accent" :disabled="running" />
            <span>{{ $t('dialogs.batchCompress.overwrite') }}</span>
          </label>
          <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="[!running && mode === 'copy' ? 'border-accent-blue bg-accent-blue/10' : 'border-border']">
            <input v-model="mode" type="radio" value="copy" class="accent-accent" :disabled="running" />
            <span>{{ $t('dialogs.batchCompress.saveCopy') }}</span>
          </label>
        </div>
        <div v-if="mode === 'copy'" class="flex items-center gap-2 text-sm">
          <span class="text-xs text-text-tertiary flex-shrink-0">{{ $t('dialogs.batchCompress.suffix') }}</span>
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

      <p v-if="error" class="mt-3 rounded border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">{{ error }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button v-if="running" type="button" class="finder-btn-secondary" @click="emit('cancel')">{{ $t('dialogs.batchCompress.cancelTask') }}</button>
        <button v-else type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.batchCompress.close') }}</button>
        <button type="submit" class="finder-btn-primary" :disabled="running || count === 0">
          {{ $t('dialogs.batchCompress.compress', count) }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EditOps, EditSaveSpec, ImageEditBatchProgress } from '@shared/types'
import { t } from '@/i18n'

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
  const parts = [t('dialogs.batchCompress.resultOk', ok)]
  if (failed) parts.push(t('dialogs.batchCompress.resultFailed', failed))
  if (p.status === 'cancelled') parts.push(t('dialogs.batchCompress.resultCancelled'))
  return parts.join(' · ')
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
