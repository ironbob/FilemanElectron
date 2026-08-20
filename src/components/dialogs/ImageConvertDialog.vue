<template>
  <!-- 图片批量转换：格式/质量/最长边 + 副本(默认)/替换。引擎 = ImageEditService
       （SIPS heic 解码、原子写、副本名自动 -1 递增），进度在任务抽屉呈现。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="emit('close')">
    <form class="finder-sheet w-[560px] max-h-[80vh] flex flex-col p-5" @submit.prevent="confirm">
      <h2 class="text-base font-semibold">{{ $t('dialogs.imageConvert.title') }}</h2>
      <p class="mt-1 text-sm text-text-tertiary">{{ $t('dialogs.imageConvert.subtitle', files.length) }}</p>

      <!-- 格式（segmented） -->
      <div class="mt-4 flex items-center gap-3">
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
            class="flex-1 accent-blue-500"
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
            class="w-24 rounded border border-border bg-bg-primary px-2 py-1 text-sm tabular-nums"
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
            class="w-32 rounded border border-border bg-bg-primary px-2 py-1 text-sm"
            :placeholder="DEFAULT_SUFFIX"
            spellcheck="false"
          />
        </label>
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-16 flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.imageConvert.outputDir') }}</span>
          <p class="flex-1 min-w-0 truncate text-xs text-text-secondary" :title="customDir ?? sourceDir">
            {{ customDir ?? $t('dialogs.imageConvert.sameFolder') }}
          </p>
          <button type="button" class="finder-btn-secondary !h-7 flex-shrink-0" @click="chooseDirectory">
            {{ $t('dialogs.imageConvert.choose') }}
          </button>
        </div>
      </div>

      <!-- 替换：风险提示 -->
      <div v-else class="mt-3 ml-[68px] flex gap-2.5 rounded-lg p-2.5 mode-overwrite-warning">
        <svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-orange" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        <p>{{ $t('dialogs.imageConvert.modeOverwriteWarning') }}</p>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.imageConvert.cancel') }}</button>
        <button type="submit" class="finder-btn-primary">{{ $t('dialogs.imageConvert.confirm', files.length) }}</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImageConvertSpec } from '@shared/types'

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
  height: 28px;
  padding: 2px;
  border-radius: 7px;
  background: var(--finder-control);
}
.convert-segmented-item {
  flex: 1;
  border: 0;
  border-radius: 5px;
  font-size: 13px;
  color: var(--finder-secondary-label);
  background: transparent;
}
.convert-segmented-item.is-selected {
  background: var(--finder-canvas);
  color: var(--finder-label);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.mode-overwrite-warning {
  font-size: 12px;
  line-height: 1.5;
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
}
.mode-overwrite-warning p {
  margin: 0;
}
</style>
