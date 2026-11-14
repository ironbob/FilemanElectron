<template>
  <BaseSheet
    :title="$t('dialogs.imageConvert.title')"
    :subtitle="$t('dialogs.imageConvert.subtitle', files.length)"
    glyph="image"
    tone="var(--accent-green)"
    :width="560"
    sheet-class="max-h-[80vh]"
    body-class="min-h-0 flex-1 overflow-auto"
    as="form"
    @close="emit('close')"
    @submit="confirm"
  >
    <!-- 格式（segmented） -->
    <div class="flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.imageConvert.format') }}</span>
      <div class="convert-segmented flex-1" role="radiogroup" :aria-label="$t('dialogs.imageConvert.format')">
        <button
          v-for="f in FORMATS"
          :key="f"
          type="button"
          class="convert-segmented-item"
          :class="{ 'is-selected': format === f }"
          role="radio"
          :aria-checked="format === f"
          @click="format = f"
        >{{ $t(`dialogs.imageConvert.format_${f}`) }}</button>
      </div>
    </div>

    <!-- 质量（png 无损隐藏滑条） -->
    <div v-if="format !== 'png'" class="mt-3 flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.imageConvert.quality') }}</span>
      <div class="flex-1 flex items-center gap-3">
        <input
          v-model.number="quality"
          type="range"
          min="1"
          max="100"
          class="flex-1 accent-accent"
          :aria-label="$t('dialogs.imageConvert.quality')"
        />
        <span class="w-9 text-right text-xs tabular-nums text-text-secondary">{{ quality }}</span>
      </div>
    </div>

    <!-- 最长边（可选，仅缩小） -->
    <div class="mt-3 flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.imageConvert.maxEdge') }}</span>
      <label class="flex items-center gap-2">
        <input v-model="limitEdge" type="checkbox" class="accent-accent" />
        <input
          v-model.number="maxEdge"
          type="number"
          min="16"
          max="32768"
          class="sheet-name-input w-24 tabular-nums"
          :disabled="!limitEdge"
          :placeholder="$t('dialogs.imageConvert.maxEdgePlaceholder')"
        />
        <span class="text-xs text-text-tertiary">px</span>
      </label>
    </div>

    <!-- 目标模式（segmented：副本默认 / 替换原文件） -->
    <div class="mt-4 flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.imageConvert.mode') }}</span>
      <div class="convert-segmented flex-1" role="radiogroup" :aria-label="$t('dialogs.imageConvert.mode')">
        <button
          type="button"
          class="convert-segmented-item"
          :class="{ 'is-selected': mode === 'copy' }"
          role="radio"
          :aria-checked="mode === 'copy'"
          @click="mode = 'copy'"
        >{{ $t('dialogs.imageConvert.modeCopy') }}</button>
        <button
          type="button"
          class="convert-segmented-item"
          :class="{ 'is-selected': mode === 'overwrite' }"
          role="radio"
          :aria-checked="mode === 'overwrite'"
          @click="mode = 'overwrite'"
        >{{ $t('dialogs.imageConvert.modeOverwrite') }}</button>
      </div>
    </div>

    <!-- 副本：后缀 + 输出目录 -->
    <div v-if="mode === 'copy'" class="mt-3 flex flex-col gap-2.5 pl-[68px]">
      <label class="flex items-center gap-2">
        <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.imageConvert.suffix') }}</span>
        <input
          v-model="suffix"
          class="sheet-name-input w-32"
          :placeholder="DEFAULT_SUFFIX"
          spellcheck="false"
        />
      </label>
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.imageConvert.outputDir') }}</span>
        <p class="flex-1 min-w-0 truncate text-xs text-text-secondary" :title="customDir ?? sourceDir">
          {{ customDir ?? $t('dialogs.imageConvert.sameFolder') }}
        </p>
        <button type="button" class="finder-btn-secondary is-sm flex-shrink-0" @click="chooseDirectory">
          {{ $t('dialogs.imageConvert.choose') }}
        </button>
      </div>
    </div>

    <!-- 替换：风险提示 -->
    <div v-else class="mt-3 ml-[68px] sheet-note is-warning">
      <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
      <span>{{ $t('dialogs.imageConvert.modeOverwriteWarning') }}</span>
    </div>

    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.imageConvert.cancel') }}</button>
      <button type="submit" class="finder-btn-primary">{{ $t('dialogs.imageConvert.confirm', files.length) }}</button>
    </template>
  </BaseSheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImageConvertSpec } from '@shared/types'
import BaseSheet from './BaseSheet.vue'

const props = defineProps<{ files: Array<{ path: string; name: string; isDirectory: boolean }> }>()
const emit = defineEmits<{ close: []; confirm: [spec: ImageConvertSpec] }>()

const FORMATS = ['jpeg', 'png', 'webp'] as const
const DEFAULT_SUFFIX = '_converted'

const format = ref<'jpeg' | 'png' | 'webp'>('jpeg')
const quality = ref(85)
const limitEdge = ref(false)
const maxEdge = ref(2048)
const mode = ref<'copy' | 'overwrite'>('copy')
const suffix = ref('')
const customDir = ref<string | null>(null)

const sourceDir = computed(() => {
  const first = props.files[0]?.path ?? ''
  const idx = first.lastIndexOf('/')
  return idx > 0 ? first.slice(0, idx) : '/'
})

const qualityDisabled = computed(() => format.value === 'png')

async function chooseDirectory() {
  try {
    const dir = await window.fileman.pickDirectory(sourceDir.value)
    if (dir) customDir.value = dir
  } catch (err) {
    console.error('[ImageConvertDialog] pickDirectory failed:', err)
  }
}

function confirm() {
  const spec: ImageConvertSpec = {
    format: format.value,
    // png 无损：质量无意义不传
    quality: qualityDisabled.value ? undefined : Math.min(100, Math.max(1, quality.value || 85)),
    maxEdge: limitEdge.value && maxEdge.value >= 16 ? Math.floor(maxEdge.value) : undefined,
    mode: mode.value,
    dir: mode.value === 'copy' && customDir.value ? customDir.value : undefined,
    suffix: mode.value === 'copy' && suffix.value.trim() ? suffix.value.trim() : undefined
  }
  emit('confirm', spec)
}
</script>

<style scoped>
.convert-segmented {
  display: flex;
  gap: 3px;
  height: 30px;
  padding: 3px;
  border-radius: 8px;
  background: var(--finder-control);
}
.convert-segmented-item {
  flex: 1;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  color: var(--finder-secondary-label);
  background: transparent;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}
.convert-segmented-item:hover:not(.is-selected) {
  color: var(--finder-label);
}
.convert-segmented-item.is-selected {
  background: var(--finder-canvas);
  color: var(--finder-label);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
</style>
