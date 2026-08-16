<template>
  <main :data-theme="theme" class="min-h-screen bg-bg-secondary text-text-primary">
    <FileInfoDialog
      v-if="context"
      standalone
      :device-id="context.deviceId"
      :device-type="context.deviceType"
      :device-name="context.deviceName"
      :files="context.files"
      @close="closeWindow"
      @save-tags="saveTags"
    />
    <div v-else class="flex min-h-screen items-center justify-center px-8 text-center text-sm text-text-tertiary">
      {{ statusText }}
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FileInfoWindowContext } from '@shared/types'
import FileInfoDialog from '@/components/dialogs/FileInfoDialog.vue'
import { i18n, isAppLocale, LOCALE_STORAGE_KEY, setLocale, t } from '@/i18n'
import { resolveInitialTheme, THEME_STORAGE_KEY, type AppTheme } from '@/utils/theme'

const context = ref<FileInfoWindowContext | null>(null)
// 主进程抛出的错误原文（已在 throw 时按语言本地化）；空串 = 尚未失败
const errorText = ref('')
const loadFailed = ref(false)
// 主题与语言均和主窗口同源共享（localStorage），加载时解析一次，之后经 storage 事件跟随
const theme = ref<AppTheme>(resolveInitialTheme())

const statusText = computed(() => {
  if (errorText.value) return errorText.value
  return loadFailed.value ? t('windows.fileInfo.loadFailed') : t('windows.fileInfo.loading')
})

function updateDocumentTitle(): void {
  const ctx = context.value
  if (!ctx) return
  document.title = ctx.files.length === 1
    ? t('main.infoWindowTitle', { name: ctx.files[0].name })
    : t('main.infoWindowTitleMulti', { count: ctx.files.length })
}

function onStorageChange(event: StorageEvent): void {
  if (event.key === THEME_STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
    theme.value = event.newValue
  }
  // 跨窗口语言同步。persist:false 必须保留：本窗口未执行 settingsStore.load()，
  // 回写会把 DEFAULT_SETTINGS 写进 config 覆盖用户设置。
  if (event.key === LOCALE_STORAGE_KEY && isAppLocale(event.newValue)) {
    void setLocale(event.newValue, { persist: false })
  }
}

// 语言切换时 document.title 跟随（主进程建窗时的原生标题会被这里的赋值覆盖）
watch(() => i18n.global.locale.value, updateDocumentTitle)

onMounted(async () => {
  window.addEventListener('storage', onStorageChange)
  try {
    context.value = await window.fileman.getFileInfoWindowContext()
    updateDocumentTitle()
  } catch (error) {
    loadFailed.value = true
    errorText.value = error instanceof Error ? error.message : ''
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange)
})

async function saveTags(tags: string[]): Promise<void> {
  const file = context.value?.files[0]
  if (!file || !context.value) return
  await window.fileman.setFileTags(context.value.deviceId, file.path, tags)
}

function closeWindow(): void {
  window.close()
}
</script>
