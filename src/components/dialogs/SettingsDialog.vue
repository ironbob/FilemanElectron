<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in" @click.self="$emit('close')">
    <div class="finder-sheet w-[480px] max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 class="text-base font-medium text-text-primary">{{ $t('settings.title') }}</h3>
        <button
          class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
          :title="$t('common.close')"
          :aria-label="$t('common.close')"
          @click="$emit('close')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-4 space-y-6">
        <!-- Cache Section -->
        <section>
          <h4 class="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            {{ $t('settings.cache') }}
          </h4>

          <div class="bg-bg-tertiary/50 rounded-lg p-3 space-y-3">
            <!-- Thumbnail Cache -->
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-text-primary">{{ $t('settings.thumbnailCache') }}</div>
                <div class="text-xs text-text-tertiary mt-0.5">
                  {{ $t('settings.cacheUsed', { size: cacheSizeFormatted }) }}
                </div>
              </div>
              <button
                class="px-3 py-1.5 rounded text-sm bg-bg-hover hover:bg-accent-red/20 text-text-secondary hover:text-accent-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <h4 class="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {{ $t('settings.files') }}
          </h4>

          <div class="bg-bg-tertiary/50 rounded-lg p-3 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-text-primary">{{ $t('settings.showHidden') }}</div>
                <div class="text-xs text-text-tertiary mt-0.5">{{ $t('settings.showHiddenDesc') }}</div>
              </div>
              <button
                class="px-3 py-1.5 rounded text-sm transition-colors"
                :class="showHiddenFiles ? 'bg-accent-blue text-white' : 'bg-bg-hover text-text-secondary hover:text-text-primary'"
                @click="toggleShowHiddenFiles"
              >
                {{ showHiddenFiles ? $t('common.on') : $t('common.off') }}
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-text-primary">{{ $t('settings.showPermissions') }}</div>
                <div class="text-xs text-text-tertiary mt-0.5">{{ $t('settings.showPermissionsDesc') }}</div>
              </div>
              <button
                class="px-3 py-1.5 rounded text-sm transition-colors"
                :class="showPermissions ? 'bg-accent-blue text-white' : 'bg-bg-hover text-text-secondary hover:text-text-primary'"
                @click="toggleShowPermissions"
              >
                {{ showPermissions ? $t('common.on') : $t('common.off') }}
              </button>
            </div>
          </div>
        </section>

        <!-- Appearance Section -->
        <section>
          <h4 class="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            {{ $t('settings.appearance') }}
          </h4>

          <div class="bg-bg-tertiary/50 rounded-lg p-3 space-y-3">
            <!-- Language -->
            <div class="flex items-center justify-between">
              <div class="text-sm text-text-primary">{{ $t('settings.language') }}</div>
              <div class="flex items-center gap-1 bg-bg-secondary rounded-lg p-0.5">
                <button
                  v-for="l in localeOptions"
                  :key="l.value"
                  class="px-2.5 py-1 rounded text-xs transition-all"
                  :class="currentLocale === l.value ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
                  @click="chooseLocale(l.value)"
                >
                  {{ l.label }}
                </button>
              </div>
            </div>
            <!-- Theme -->
            <div class="flex items-center justify-between">
              <div class="text-sm text-text-primary">{{ $t('settings.theme') }}</div>
              <div class="flex items-center gap-1 bg-bg-secondary rounded-lg p-0.5">
                <button
                  v-for="t in themes"
                  :key="t.value"
                  class="px-2.5 py-1 rounded text-xs transition-all"
                  :class="theme === t.value ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
                  @click="setTheme(t.value)"
                >
                  {{ $t(t.labelKey) }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <div class="flex justify-end px-4 py-3 border-t border-border">
        <button
          class="finder-btn-primary"
          @click="$emit('close')"
        >
          {{ $t('settings.done') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useThumbnailStore } from '@/stores/thumbnail'
import { useSettingsStore } from '@/stores/settings'
import { i18n, setLocale, type AppLocale } from '@/i18n'

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
