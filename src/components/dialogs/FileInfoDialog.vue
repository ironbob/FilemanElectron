<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45" @click.self="$emit('close')">
    <form class="w-[440px] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="save">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0"><h2 class="truncate text-base font-semibold text-text-primary">{{ file.name }}</h2><p class="mt-1 break-all text-xs text-text-tertiary">{{ file.path }}</p></div>
        <button type="button" class="text-text-tertiary hover:text-text-primary" @click="$emit('close')">×</button>
      </div>
      <dl class="mt-5 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
        <dt class="text-text-tertiary">Kind</dt><dd>{{ file.isDirectory ? 'Folder' : file.extension || 'File' }}</dd>
        <dt class="text-text-tertiary">Size</dt><dd>{{ file.isDirectory ? '—' : formatSize(file.size) }}</dd>
        <dt class="text-text-tertiary">Modified</dt><dd>{{ new Date(file.modifiedTime).toLocaleString() }}</dd>
        <dt class="text-text-tertiary">Device</dt><dd>{{ deviceName }}</dd>
      </dl>
      <label class="mt-5 block text-xs font-medium text-text-secondary">Tags <span class="font-normal text-text-tertiary">(comma separated; stored by Fileman)</span></label>
      <input v-model="tagText" class="mt-1 w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm" placeholder="work, review" />
      <div class="mt-6 flex justify-end gap-2"><button type="button" class="rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="$emit('close')">Close</button><button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white">Save tags</button></div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FileInfo } from '@/types'
const props = defineProps<{ file: FileInfo; deviceName: string; tags: string[] }>()
const emit = defineEmits<{ close: []; saveTags: [tags: string[]] }>()
const tagText = ref(props.tags.join(', '))
watch(() => props.tags, tags => { tagText.value = tags.join(', ') })
function save() { emit('saveTags', tagText.value.split(',').map(tag => tag.trim()).filter(Boolean)) }
function formatSize(size: number) { return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB` }
</script>
