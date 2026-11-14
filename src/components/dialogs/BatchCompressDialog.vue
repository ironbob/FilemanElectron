<template>
  <BaseSheet
    :title="$t('dialogs.batchCompress.title')"
    :subtitle="$t('dialogs.batchCompress.subtitle', count)"
    glyph="image"
    tone="var(--accent-green)"
    :width="460"
    :dismissible="!running"
    as="form"
    @close="emit('close')"
    @submit="start"
  >
    <div class="finder-inset-group flex flex-col gap-3 p-3 text-sm">
      <div class="flex items-center gap-3">
        <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.quality', { value: quality }) }}</span>
        <input v-model.number="quality" type="range" min="1" max="100" class="flex-1 accent-accent" :disabled="running" />
      </div>
      <div class="flex items-center gap-3">
        <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.maxEdge') }}</span>
        <input v-model.number="maxEdge" type="number" min="1" :placeholder="$t('dialogs.batchCompress.noLimit')" class="sheet-name-input w-24" :disabled="running" />
        <span class="text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.pxDownscaleOnly') }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.format') }}</span>
        <select v-model="format" class="sheet-name-input flex-1" :disabled="running">
          <option value="keep">{{ $t('dialogs.batchCompress.formatKeep') }}</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2 pt-1">
        <label
          class="flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors"
          :class="!running && mode === 'overwrite' ? 'border-accent-blue' : 'border-border'"
          :style="!running && mode === 'overwrite' ? { background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)' } : undefined"
        >
          <input v-model="mode" type="radio" value="overwrite" class="accent-accent" :disabled="running" />
          <span>{{ $t('dialogs.batchCompress.overwrite') }}</span>
        </label>
        <label
          class="flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors"
          :class="!running && mode === 'copy' ? 'border-accent-blue' : 'border-border'"
          :style="!running && mode === 'copy' ? { background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)' } : undefined"
        >
          <input v-model="mode" type="radio" value="copy" class="accent-accent" :disabled="running" />
          <span>{{ $t('dialogs.batchCompress.saveCopy') }}</span>
        </label>
      </div>
      <div v-if="mode === 'copy'" class="flex items-center gap-2 text-sm">
        <span class="flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.batchCompress.suffix') }}</span>
        <input v-model="suffix" class="sheet-name-input flex-1" placeholder="_compressed" :disabled="running" />
      </div>
    </div>

    <!-- 进度 -->
    <div v-if="progress" class="mt-4">
      <div class="h-1.5 overflow-hidden rounded-full bg-bg-hover">
        <div class="h-full bg-accent-blue transition-all" :style="{ width: `${((progress.index + 1) / progress.total) * 100}%` }"></div>
      </div>
      <div class="mt-1.5 flex items-center justify-between text-xs text-text-tertiary">
        <span class="truncate">{{ progress.currentFile }}</span>
        <span class="tabular-nums ml-2 flex-shrink-0">
          {{ Math.min(progress.index + 1, progress.total) }} / {{ progress.total }}
          <template v-if="doneLabel"> · {{ doneLabel }}</template>
        </span>
      </div>
    </div>

    <p v-if="error" class="mt-3 sheet-note is-danger">{{ error }}</p>

    <template #footer>
      <button v-if="running" type="button" class="finder-btn-secondary" @click="emit('cancel')">{{ $t('dialogs.batchCompress.cancelTask') }}</button>
      <button v-else type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.batchCompress.close') }}</button>
      <button type="submit" class="finder-btn-primary" :disabled="running || count === 0">
        {{ $t('dialogs.batchCompress.compress', count) }}
      </button>
    </template>
  </BaseSheet>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EditOps, EditSaveSpec, ImageEditBatchProgress } from '@shared/types'
import { t } from '@/i18n'
import BaseSheet from './BaseSheet.vue'

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
