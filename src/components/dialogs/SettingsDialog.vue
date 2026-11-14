<template>
  <BaseSheet
    :title="$t('settings.title')"
    glyph="gear"
    tone="var(--finder-secondary-label)"
    :width="480"
    sheet-class="max-h-[80vh]"
    body-class="min-h-0 flex-1 overflow-auto"
    show-close
    @close="$emit('close')"
  >
    <div class="flex flex-col gap-5">
      <!-- Cache Section -->
      <section>
        <h4 class="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
          <svg class="h-4 w-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          {{ $t('settings.cache') }}
        </h4>
        <div class="finder-inset-group overflow-hidden">
          <div class="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div class="min-w-0">
              <div class="text-sm text-text-primary">{{ $t('settings.thumbnailCache') }}</div>
              <div class="mt-0.5 text-xs text-text-tertiary">{{ $t('settings.cacheUsed', { size: cacheSizeFormatted }) }}</div>
            </div>
            <button
              class="finder-btn-secondary is-sm flex-shrink-0"
              :disabled="clearingCache"
              @click="clearThumbnailCache"
            >
              {{ clearingCache ? $t('settings.clearing') : $t('settings.clear') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Files Section -->
      <section>
        <h4 class="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
          <svg class="h-4 w-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          {{ $t('settings.files') }}
        </h4>
        <div class="finder-inset-group overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <div class="min-w-0">
              <div class="text-sm text-text-primary">{{ $t('settings.showHidden') }}</div>
              <div class="mt-0.5 text-xs text-text-tertiary">{{ $t('settings.showHiddenDesc') }}</div>
            </div>
            <button type="button" role="switch" :aria-checked="showHiddenFiles" class="sheet-switch" :aria-label="$t('settings.showHidden')" @click="toggleShowHiddenFiles" />
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <div class="min-w-0">
              <div class="text-sm text-text-primary">{{ $t('settings.showPermissions') }}</div>
              <div class="mt-0.5 text-xs text-text-tertiary">{{ $t('settings.showPermissionsDesc') }}</div>
            </div>
            <button type="button" role="switch" :aria-checked="showPermissions" class="sheet-switch" :aria-label="$t('settings.showPermissions')" @click="toggleShowPermissions" />
          </div>
        </div>
      </section>

      <!-- Appearance Section -->
      <section>
        <h4 class="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
          <svg class="h-4 w-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          {{ $t('settings.appearance') }}
        </h4>
        <div class="finder-inset-group overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <div class="text-sm text-text-primary">{{ $t('settings.language') }}</div>
            <div class="finder-seg-tray">
              <button
                v-for="l in localeOptions"
                :key="l.value"
                type="button"
                class="finder-segment-btn-text"
                :class="{ active: currentLocale === l.value }"
                @click="chooseLocale(l.value)"
              >{{ l.label }}</button>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <div class="text-sm text-text-primary">{{ $t('settings.theme') }}</div>
            <div class="finder-seg-tray">
              <button
                v-for="opt in themes"
                :key="opt.value"
                type="button"
                class="finder-segment-btn-text"
                :class="{ active: theme === opt.value }"
                @click="setTheme(opt.value)"
              >{{ $t(opt.labelKey) }}</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button class="finder-btn-primary" @click="$emit('close')">
        {{ $t('settings.done') }}
      </button>
    </template>
  </BaseSheet>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useThumbnailStore } from '@/stores/thumbnail'
import { useSettingsStore } from '@/stores/settings'
import { i18n, setLocale, type AppLocale } from '@/i18n'
import BaseSheet from './BaseSheet.vue'

defineEmits<{
  close: []
}>()

const thumbnailStore = useThumbnailStore()
const settingsStore = useSettingsStore()

const showHiddenFiles = computed(() => settingsStore.settings.showHiddenFiles)
const showPermissions = computed(() => settingsStore.settings.showPermissions)

function toggleShowHiddenFiles() {
  void settingsStore.toggleShowHiddenFiles()
}

function toggleShowPermissions() {
  void settingsStore.toggleShowPermissions()
}

const theme = ref<'light' | 'dark' | 'system'>('dark')
const clearingCache = ref(false)
const cacheSize = ref(0)

const themes = [
  { value: 'light' as const, labelKey: 'settings.themeLight' },
  { value: 'dark' as const, labelKey: 'settings.themeDark' },
  { value: 'system' as const, labelKey: 'settings.themeSystem' },
]

// 语言选项标签永远自名（不随界面语言翻译），保证外语界面下用户能找回自己的语言
const localeOptions: ReadonlyArray<{ value: AppLocale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

const currentLocale = computed(() => i18n.global.locale.value as AppLocale)

/** setLocale（默认 persist）：i18n + localStorage + config（主进程随 config:save 跟随）。 */
function chooseLocale(locale: AppLocale) {
  if (currentLocale.value === locale) return
  void setLocale(locale)
}

const cacheSizeFormatted = computed(() => {
  if (cacheSize.value < 1024) return `${cacheSize.value} B`
  if (cacheSize.value < 1024 * 1024) return `${(cacheSize.value / 1024).toFixed(1)} KB`
  return `${(cacheSize.value / 1024 / 1024).toFixed(1)} MB`
})

async function loadCacheSize() {
  try {
    const size = await window.fileman.thumbnail.getCacheSize()
    cacheSize.value = size
  } catch (e) {
    console.error('Failed to get cache size:', e)
  }
}

async function clearThumbnailCache() {
  if (clearingCache.value) return
  clearingCache.value = true
  try {
    await thumbnailStore.clearDiskCache()
    thumbnailStore.clearMemoryCache()
    await loadCacheSize()
  } catch (e) {
    console.error('Failed to clear cache:', e)
  } finally {
    clearingCache.value = false
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (savedTheme) {
    theme.value = savedTheme
  } else {
    theme.value = 'system'
  }
}

function setTheme(newTheme: 'light' | 'dark' | 'system') {
  theme.value = newTheme
  if (newTheme === 'system') {
    localStorage.removeItem('theme')
  } else {
    localStorage.setItem('theme', newTheme)
  }
  applyTheme()
}

function applyTheme() {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme)
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  }
}

onMounted(() => {
  loadCacheSize()
  loadTheme()
})
</script>
