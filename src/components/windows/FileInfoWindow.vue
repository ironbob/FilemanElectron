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
      {{ errorMessage || '正在打开简介…' }}
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { FileInfoWindowContext } from '@shared/types'
import FileInfoDialog from '@/components/dialogs/FileInfoDialog.vue'
import { resolveInitialTheme, THEME_STORAGE_KEY, type AppTheme } from '@/utils/theme'

const context = ref<FileInfoWindowContext | null>(null)
const errorMessage = ref('')
// 主题与主窗口同源共享（localStorage），加载时解析一次，之后跟随主窗口切换
const theme = ref<AppTheme>(resolveInitialTheme())

function onThemeStorageChange(event: StorageEvent): void {
  if (event.key === THEME_STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
    theme.value = event.newValue
  }
}

onMounted(async () => {
  window.addEventListener('storage', onThemeStorageChange)
  try {
    context.value = await window.fileman.getFileInfoWindowContext()
    document.title = context.value.files.length === 1
      ? `“${context.value.files[0].name}”简介`
      : `${context.value.files.length} 个项目简介`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取简介内容'
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onThemeStorageChange)
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
