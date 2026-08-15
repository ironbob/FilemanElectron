<template>
  <!-- display:contents 使 dt/dd 直接参与父级 dl 的 grid 布局 -->
  <div v-if="hasContent" class="contents">
    <dt class="text-text-tertiary">{{ label }}</dt>
    <dd
      class="group/copy relative flex min-w-0 items-start gap-1"
      :class="[
        mono ? 'font-mono' : '',
        copyable ? 'cursor-pointer hover:text-accent-blue' : 'text-text-primary',
      ]"
      :title="copyable ? '点击复制' : undefined"
      @click="copyable && copy()"
    >
      <!-- 简单值：直接 prop；复杂展示（如带进度的内联说明）：用默认插槽 -->
      <span v-if="value !== undefined && value !== null" class="min-w-0 flex-1 break-all">{{ value }}</span>
      <slot v-else />

      <!-- 复制反馈 / hover 图标 -->
      <svg v-if="copied" class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <svg
        v-else-if="copyable"
        class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/copy:opacity-100"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </dd>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, useSlots } from 'vue'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  label: string
  /** 简单值：既展示又作为复制内容；null/undefined/''/'—' 视为无内容（整行隐藏） */
  value?: string | number | null
  /** 复杂展示（插槽）时显式指定复制内容；简单值时可覆盖 */
  copyValue?: string
  mono?: boolean
}>()

const slots = useSlots()

/** 展示值收敛为非空字符串（'—' 占位视为无内容） */
const nonEmptyValue = computed(() => {
  const v = props.value
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === '' || s === '—' ? null : s
})

const hasContent = computed(() => !!nonEmptyValue.value || !!slots.default?.())
const copyable = computed(() => !!(props.copyValue ?? nonEmptyValue.value))

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copy() {
  const text = props.copyValue ?? nonEmptyValue.value
  if (!text) return
  if (await copyToClipboard(text)) {
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1200)
  }
}

onUnmounted(() => { if (copiedTimer) clearTimeout(copiedTimer) })
</script>
