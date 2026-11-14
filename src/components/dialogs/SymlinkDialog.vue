<script setup lang="ts">
import { reactive } from 'vue'
import { t } from '@/i18n'
import BaseSheet from './BaseSheet.vue'

/**
 * 新建符号链接弹窗（Sheet v2）：目标路径 + 链接名，在当前目录创建链接。
 * 仅 canSymlink 设备（本地/SSH）可达。IO 经 window.fileman.createSymlink。
 */
const props = defineProps<{
  deviceId: string
  dirPath: string
}>()

const emit = defineEmits<{ close: []; confirm: [target: string, name: string] }>()

const form = reactive({
  target: '',
  name: t('dialogs.symlink.defaultName'),
  error: '' as string
})

async function submit(): Promise<void> {
  const target = form.target.trim()
  const name = form.name.trim()
  if (!target) { form.error = t('dialogs.symlink.targetEmpty'); return }
  if (!name || name.includes('/')) { form.error = t('dialogs.symlink.nameInvalid'); return }
  try {
    const linkPath = props.dirPath === '/' ? `/${name}` : `${props.dirPath}/${name}`
    await window.fileman.createSymlink(props.deviceId, target, linkPath)
    emit('confirm', target, name)
  } catch (error) {
    form.error = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <BaseSheet
    :title="$t('dialogs.symlink.title')"
    :subtitle="$t('dialogs.symlink.createIn', { path: dirPath })"
    glyph="link"
    tone="var(--accent-teal)"
    :width="440"
    as="form"
    @close="emit('close')"
    @submit="submit"
  >
    <div class="flex flex-col gap-3">
      <label class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.symlink.targetLabel') }}</span>
        <input
          v-model="form.target"
          type="text"
          data-autofocus
          class="sheet-name-input w-full font-mono"
          placeholder="/usr/local/bin/tool"
          spellcheck="false"
        >
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.symlink.nameLabel') }}</span>
        <input
          v-model="form.name"
          type="text"
          class="sheet-name-input w-full"
          spellcheck="false"
        >
      </label>
      <p v-if="form.error" class="text-xs text-accent-red">{{ form.error }}</p>
    </div>
    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.symlink.cancel') }}</button>
      <button type="submit" class="finder-btn-primary">{{ $t('dialogs.symlink.create') }}</button>
    </template>
  </BaseSheet>
</template>