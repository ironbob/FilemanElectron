<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in" @click.self="$emit('close')">
    <div class="bg-bg-secondary rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col border border-border">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 class="text-base font-medium text-text-primary">Settings</h3>
        <button
          class="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
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
            Cache
          </h4>
          
          <div class="bg-bg-tertiary/50 rounded-lg p-3 space-y-3">
            <!-- Thumbnail Cache -->
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-text-primary">Thumbnail Cache</div>
                <div class="text-xs text-text-tertiary mt-0.5">
                  {{ cacheSizeFormatted }} used
                </div>
              </div>
              <button
                class="px-3 py-1.5 rounded text-sm bg-bg-hover hover:bg-red-500/20 text-text-secondary hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="clearingCache"
                @click="clearThumbnailCache"
              >
                {{ clearingCache ? 'Clearing...' : 'Clear' }}
              </button>
            </div>
          </div>
        </section>

        <!-- Appearance Section (placeholder for future) -->
        <section>
          <h4 class="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Appearance
          </h4>
          
          <div class="bg-bg-tertiary/50 rounded-lg p-3 space-y-3">
            <!-- Theme -->
            <div class="flex items-center justify-between">
              <div class="text-sm text-text-primary">Theme</div>
              <div class="flex items-center gap-1 bg-bg-secondary rounded-lg p-0.5">
                <button
                  v-for="t in themes"
                  :key="t.value"
                  class="px-2.5 py-1 rounded text-xs transition-all cursor-pointer"
                  :class="theme === t.value ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
                  @click="setTheme(t.value)"
                >
                  {{ t.label }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <div class="flex justify-end px-4 py-3 border-t border-border">
        <button
          class="px-4 py-1.5 rounded bg-accent-blue hover:bg-accent-blue-hover text-sm text-white transition-colors cursor-pointer"
          @click="$emit('close')"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useThumbnailStore } from '@/stores/thumbnail'

defineEmits<{
  close: []
}>()

const thumbnailStore = useThumbnailStore()

const theme = ref<'light' | 'dark' | 'system'>('dark')
const clearingCache = ref(false)
const cacheSize = ref(0)

const themes = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
]

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
