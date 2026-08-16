<script setup lang="ts">
import { reactive } from 'vue'

/**
 * 新建符号链接弹窗（RenameDialog 形态）：目标路径 + 链接名，在
 * 当前目录创建链接。仅 canSymlink 设备（本地/SSH）可达。
 */
const props = defineProps<{
  deviceId: string
  dirPath: string
}>()

const emit = defineEmits<{ close: []; confirm: [target: string, name: string] }>()

const form = reactive({
  target: '',
  name: '新链接',
  error: '' as string
})

async function submit(): Promise<void> {
  const target = form.target.trim()
  const name = form.name.trim()
  if (!target) { form.error = '目标路径不能为空'; return }
  if (!name || name.includes('/')) { form.error = '链接名不能为空且不含 /'; return }
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
  <div class="fixed inset-0 z-modal flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div
      class="w-[440px] max-w-[90vw] rounded-lg border border-border bg-bg-secondary shadow-xl"
      role="dialog"
      aria-label="新建符号链接"
    >
      <div class="px-5 py-4 border-b border-border">
        <h3 class="text-sm font-semibold text-text-primary">新建符号链接</h3>
        <p class="mt-1 text-[11px] text-text-tertiary font-mono truncate" :title="dirPath">在 {{ dirPath }} 中创建</p>
      </div>
      <form class="px-5 py-4 space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="text-xs text-text-secondary">目标路径（可为相对路径）</span>
          <input
            v-model="form.target"
            type="text"
            autofocus
            class="mt-1 w-full px-2.5 py-1.5 text-sm font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="/usr/local/bin/tool"
            spellcheck="false"
          >
        </label>
        <label class="block">
          <span class="text-xs text-text-secondary">链接名称</span>
          <input
            v-model="form.name"
            type="text"
            class="mt-1 w-full px-2.5 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
            spellcheck="false"
          >
        </label>
        <p v-if="form.error" class="text-xs text-accent-red">{{ form.error }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:bg-bg-hover" @click="emit('close')">取消</button>
          <button type="submit" class="px-3 py-1.5 text-xs rounded bg-accent-blue text-white hover:bg-accent-blue/90">创建</button>
        </div>
      </form>
    </div>
  </div>
</template>
