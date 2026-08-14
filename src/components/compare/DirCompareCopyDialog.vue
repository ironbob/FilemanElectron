<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" @click.self="$emit('cancel')">
    <section class="w-[460px] rounded-xl border border-border bg-bg-secondary shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <header class="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 id="copy-title" class="text-sm font-semibold">确认复制</h2>
          <p class="mt-1 text-xs text-text-tertiary">{{ directionLabel }} · {{ plan.items.length }} 个可见选中项</p>
        </div>
        <button class="toolbar-btn-enhanced" aria-label="关闭" @click="$emit('cancel')">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div class="space-y-4 px-5 py-4 text-sm">
        <p v-if="plan.blockedItems.length" class="rounded-lg border border-orange-400/30 bg-orange-400/10 p-3 text-xs text-orange-300">
          {{ plan.blockedItems.length }} 个目录含有未扫描或被过滤的后代，已阻止递归复制。请先展开并显示完整范围后再确认。
        </p>
        <div v-if="plan.items.length" class="rounded-lg border border-border bg-bg-primary/50 p-3">
          <p class="mb-2 text-xs font-medium text-text-secondary">将复制的路径</p>
          <ul class="space-y-1 text-xs text-text-tertiary">
            <li v-for="item in plan.items.slice(0, 3)" :key="item.relativePath" class="truncate">{{ item.relativePath }} → {{ item.targetDirectory }}</li>
            <li v-if="plan.items.length > 3">另有 {{ plan.items.length - 3 }} 项</li>
          </ul>
        </div>
        <label class="block text-xs text-text-secondary">
          冲突处理
          <select v-model="strategy" class="mt-1.5 w-full rounded-md border border-border bg-bg-primary px-2 py-2 text-sm text-text-primary">
            <option value="skip">跳过已存在项</option>
            <option value="overwrite">覆盖已存在项</option>
            <option value="rename">保留两者（自动重命名）</option>
          </select>
        </label>
        <p class="text-xs text-text-tertiary">复制任务会进入传输队列；失败不会删除源文件。</p>
      </div>
      <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button class="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary" @click="$emit('cancel')">取消</button>
        <button class="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40" :disabled="!plan.items.length" @click="$emit('confirm', strategy)">
          确认复制
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CopyConflictStrategy, DirCompareCopyPlan } from '@/types'

const props = defineProps<{ plan: DirCompareCopyPlan }>()
defineEmits<{ cancel: []; confirm: [strategy: Exclude<CopyConflictStrategy, 'ask'>] }>()
const strategy = ref<Exclude<CopyConflictStrategy, 'ask'>>('skip')
const directionLabel = computed(() => props.plan.direction === 'left-to-right' ? '左侧 → 右侧' : '右侧 → 左侧')
</script>
