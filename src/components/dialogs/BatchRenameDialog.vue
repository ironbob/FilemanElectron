<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45" @click.self="$emit('close')">
    <form class="w-[560px] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="confirm">
      <h2 class="text-base font-semibold">Batch Rename</h2>
      <p class="mt-1 text-sm text-text-tertiary">Prefix selected names while preserving each extension.</p>
      <input v-model="prefix" class="mt-4 w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm" placeholder="Prefix" />
      <div class="mt-4 max-h-56 overflow-auto rounded border border-border text-sm">
        <div v-for="item in preview" :key="item.sourcePath" class="grid grid-cols-2 gap-3 border-b border-border px-3 py-2 last:border-0"><span class="truncate text-text-tertiary">{{ item.sourcePath.split('/').pop() }}</span><span class="truncate">{{ item.newName }}</span></div>
      </div>
      <div class="mt-6 flex justify-end gap-2"><button type="button" class="rounded px-3 py-2 text-sm text-text-secondary" @click="$emit('close')">Cancel</button><button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white" :disabled="!prefix">Rename {{ files.length }} items</button></div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BatchRenameItem } from '@/types/fileBrowser'
const props = defineProps<{ files: Array<{ path: string; name: string; isDirectory: boolean }> }>()
const emit = defineEmits<{ close: []; confirm: [items: BatchRenameItem[]] }>()
const prefix = ref('')
const preview = computed(() => props.files.map(file => ({ sourcePath: file.path, newName: `${prefix.value}${file.name}` })))
function confirm() { emit('confirm', preview.value) }
</script>
