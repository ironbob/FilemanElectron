<template>
  <BaseSheet
    :title="$t('dialogs.videoConvert.title')"
    :subtitle="$t('dialogs.videoConvert.subtitle', { count: files.length, size: totalSizeText })"
    glyph="video"
    :width="560"
    sheet-class="max-h-[80vh]"
    body-class="min-h-0 flex-1 overflow-auto"
    as="form"
    @close="emit('close')"
    @submit="confirm"
  >
    <!-- 质量（segmented） -->
    <div class="flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.videoConvert.quality') }}</span>
      <div class="convert-segmented flex-1" role="radiogroup" :aria-label="$t('dialogs.videoConvert.quality')">
        <button
          v-for="q in QUALITIES"
          :key="q"
          type="button"
          class="convert-segmented-item"
          :class="{ 'is-selected': quality === q }"
          role="radio"
          :aria-checked="quality === q"
          @click="quality = q"
        >{{ $t(`dialogs.videoConvert.quality_${q}`) }}</button>
      </div>
    </div>

    <!-- 分辨率（segmented；长边上限，仅缩小不放大） -->
    <div class="mt-3 flex items-center gap-3">
      <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.videoConvert.resolution') }}</span>
      <div class="convert-segmented flex-1" role="radiogroup" :aria-label="$t('dialogs.videoConvert.resolution')">
        <button
          v-for="r in RESOLUTIONS"
          :key="r"
          type="button"
          class="convert-segmented-item"
          :class="{ 'is-selected': resolution === r }"
          role="radio"
          :aria-checked="resolution === r"
          @click="resolution = r"
        >{{ $t(`dialogs.videoConvert.resolution_${r}`) }}</button>
      </div>
    </div>

    <!-- 后缀 + 输出位置（副本恒存，不提供覆盖原片） -->
    <div class="mt-4 flex flex-col gap-2.5">
      <label class="flex items-center gap-3">
        <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.videoConvert.suffix') }}</span>
        <input
          v-model="suffix"
          class="sheet-name-input w-32"
          :placeholder="$t('dialogs.videoConvert.suffixPlaceholder')"
          spellcheck="false"
        />
      </label>
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-14 flex-shrink-0 text-xs text-text-tertiary text-right">{{ $t('dialogs.videoConvert.outputDir') }}</span>
        <p class="flex-1 min-w-0 truncate text-xs text-text-secondary" :title="customDir ?? sourceDir">
          {{ customDir ?? $t('dialogs.videoConvert.sameFolder') }}
        </p>
        <button type="button" class="finder-btn-secondary is-sm flex-shrink-0" @click="chooseDirectory">
          {{ $t('dialogs.videoConvert.choose') }}
        </button>
      </div>
      <p class="text-xs text-text-tertiary">{{ $t('dialogs.videoConvert.note') }}</p>
    </div>

    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.videoConvert.cancel') }}</button>
      <button type="submit" class="finder-btn-primary">{{ $t('dialogs.videoConvert.confirm', files.length) }}</button>
    </template>
  </BaseSheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VideoConvertSpec } from '@shared/types'
import BaseSheet from './BaseSheet.vue'
import { formatSize } from '@/utils/path'

const props = defineProps<{
  files: Array<{ path: string; name: string; isDirectory: boolean; size?: number }>
}>()
const emit = defineEmits<{ close: []; confirm: [spec: VideoConvertSpec] }>()

const QUALITIES = ['high', 'standard', 'small'] as const
const RESOLUTIONS = ['keep', '1080p', '720p'] as const

const quality = ref<VideoConvertSpec['quality']>('standard')
const resolution = ref<VideoConvertSpec['resolution']>('keep')
const suffix = ref('')
const customDir = ref<string | null>(null)

const sourceDir = computed(() => {
  const first = props.files[0]?.path ?? ''
  const idx = first.lastIndexOf('/')
  return idx > 0 ? first.slice(0, idx) : '/'
})

const totalSizeText = computed(() => formatSize(props.files.reduce((sum, file) => sum + (file.size ?? 0), 0)))

async function chooseDirectory() {
  try {
    const dir = await window.fileman.pickDirectory(sourceDir.value)
    if (dir) customDir.value = dir
  } catch (err) {
    console.error('[VideoConvertDialog] pickDirectory failed:', err)
  }
}

function confirm() {
  const spec: VideoConvertSpec = {
    format: 'mp4',
    quality: quality.value,
    resolution: resolution.value,
    dir: customDir.value ?? undefined,
    suffix: suffix.value.trim()
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
