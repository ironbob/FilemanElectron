<template>
  <!-- 批量改名（增强：前缀 + 序号 start/step/pad + 查找替换；前后对照 + 冲突禁提交）。
       规则应用全部来自 batchRenamePattern 纯函数（IFC-5）。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="emit('close')">
    <form class="w-[600px] max-h-[80vh] flex flex-col rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="confirm">
      <h2 class="text-base font-semibold">Batch Rename</h2>
      <p class="mt-1 text-sm text-text-tertiary">Rename {{ files.length }} items while preserving each extension.</p>

      <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="usePrefix" type="checkbox" class="accent-blue-500" />
          <span class="w-10 text-xs text-text-tertiary flex-shrink-0">前缀</span>
          <input v-model="prefix" class="flex-1 min-w-0 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="!usePrefix" placeholder="Trip_" />
        </label>
        <label class="flex items-center gap-2">
          <input v-model="useFind" type="checkbox" class="accent-blue-500" />
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">查找替换</span>
          <input v-model="find" class="w-20 min-w-0 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="!useFind" placeholder="IMG_" />
          <span class="text-text-tertiary">→</span>
          <input v-model="replace" class="w-20 min-w-0 rounded border border-border bg-bg-primary px-2 py-1 text-sm" :disabled="!useFind" placeholder="" />
        </label>
      </div>
      <div class="mt-3 flex items-center gap-3 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="useSequence" type="checkbox" class="accent-blue-500" />
          <span class="text-xs text-text-tertiary">序号</span>
        </label>
        <template v-if="useSequence">
          <label class="flex items-center gap-1.5 text-xs text-text-tertiary">起始
            <input v-model.number="start" type="number" min="0" class="w-16 rounded border border-border bg-bg-primary px-2 py-1 text-sm" />
          </label>
          <label class="flex items-center gap-1.5 text-xs text-text-tertiary">步长
            <input v-model.number="step" type="number" min="1" class="w-16 rounded border border-border bg-bg-primary px-2 py-1 text-sm" />
          </label>
          <label class="flex items-center gap-1.5 text-xs text-text-tertiary">位数
            <input v-model.number="pad" type="number" min="0" max="8" class="w-16 rounded border border-border bg-bg-primary px-2 py-1 text-sm" />
          </label>
        </template>
      </div>

      <!-- 前后对照预览 -->
      <div class="mt-4 min-h-0 flex-1 overflow-auto rounded border border-border text-sm">
        <div class="grid grid-cols-2 gap-3 border-b border-border px-3 py-1.5 text-xs text-text-tertiary sticky top-0 bg-bg-secondary">
          <span>当前名称</span><span>新名称</span>
        </div>
        <div
          v-for="item in preview.items"
          :key="item.sourcePath"
          class="grid grid-cols-2 gap-3 border-b border-border px-3 py-1.5 last:border-0"
          :class="isConflict(item.sourcePath) ? 'bg-red-400/10' : ''"
        >
          <span class="truncate text-text-tertiary" :title="item.sourcePath">{{ baseName(item.sourcePath) }}</span>
          <span class="truncate" :class="changed(item) ? 'text-accent-blue' : 'text-text-tertiary'">{{ item.newName }}</span>
        </div>
      </div>

      <p v-if="conflicts.length > 0" class="mt-2 text-xs text-red-400">规则产生 {{ conflicts.length }} 个重名，请调整后重试</p>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="emit('close')">Cancel</button>
        <button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white disabled:opacity-40" :disabled="!canSubmit">Rename {{ files.length }} items</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BatchRenameItem } from '@/types/fileBrowser'
import { buildRenameItems } from '@/utils/batchRenamePattern'

const props = defineProps<{ files: Array<{ path: string; name: string; isDirectory: boolean }> }>()
const emit = defineEmits<{ close: []; confirm: [items: BatchRenameItem[]] }>()

const usePrefix = ref(false)
const prefix = ref('')
const useSequence = ref(false)
const start = ref(1)
const step = ref(1)
const pad = ref(3)
const useFind = ref(false)
const find = ref('')
const replace = ref('')

const preview = computed(() =>
  buildRenameItems(
    props.files.map(f => ({ path: f.path, name: f.name })),
    {
      prefix: usePrefix.value && prefix.value ? prefix.value : undefined,
      sequence: useSequence.value ? { start: start.value || 0, step: Math.max(1, step.value || 1), pad: Math.max(0, pad.value || 0) } : undefined,
      find: useFind.value && find.value ? find.value : undefined,
      replace: useFind.value ? replace.value : undefined
    }
  )
)

const conflicts = computed(() => preview.value.conflicts)
const hasChange = computed(() => preview.value.items.some(item => item.newName !== baseName(item.sourcePath)))
const canSubmit = computed(() => hasChange.value && conflicts.value.length === 0)

function isConflict(sourcePath: string): boolean {
  return conflicts.value.includes(sourcePath)
}
function changed(item: { sourcePath: string; newName: string }): boolean {
  return item.newName !== baseName(item.sourcePath)
}
function baseName(p: string): string {
  return p.split('/').pop() || p
}

function confirm() {
  if (!canSubmit.value) return
  emit('confirm', preview.value.items.map(item => ({ sourcePath: item.sourcePath, newName: item.newName })))
}
</script>
