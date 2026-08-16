<template>
  <!-- 保存对话框（IFC-2 前置 UI）：覆盖/另存 + 格式质量 + 预估体积。
       短生命周期表单 → 不建 ViewModel（DC-8）。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="emit('close')">
    <form class="w-[440px] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="confirm">
      <h2 class="text-base font-semibold">保存图片</h2>
      <p class="mt-1 text-xs text-text-tertiary truncate">{{ fileName }}</p>

      <!-- 保存方式 -->
      <div class="mt-4 grid grid-cols-2 gap-2">
        <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="mode === 'overwrite' ? 'border-accent-blue bg-accent-blue/10' : 'border-border hover:bg-bg-hover'">
          <input v-model="mode" type="radio" value="overwrite" class="accent-blue-500" />
          <span>覆盖原图</span>
        </label>
        <label class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors" :class="mode === 'copy' ? 'border-accent-blue bg-accent-blue/10' : 'border-border hover:bg-bg-hover'">
          <input v-model="mode" type="radio" value="copy" class="accent-blue-500" />
          <span>另存副本</span>
        </label>
      </div>
      <div v-if="mode === 'copy'" class="mt-2 flex items-center gap-2 text-sm">
        <span class="text-text-tertiary text-xs flex-shrink-0">后缀</span>
        <input v-model="suffix" class="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-sm" placeholder="_edited" />
      </div>

      <!-- 压缩参数（可关闭：纯裁剪不重压缩，避免多余质量损失） -->
      <div class="mt-4 space-y-3 rounded-lg border p-3" :class="compressOn ? 'border-border' : 'border-border/50 opacity-60'">
        <div class="flex items-center justify-between text-sm">
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="compressOn" type="checkbox" class="accent-blue-500" />
            <span class="text-text-secondary">压缩参数</span>
          </label>
          <span v-if="estimateLabel" class="text-xs text-text-tertiary tabular-nums">{{ estimateLabel }}</span>
          <span v-else-if="estimating && compressOn" class="text-xs text-text-tertiary">预估中…</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">质量 {{ quality }}</span>
          <input v-model.number="quality" type="range" min="1" max="100" class="flex-1 accent-blue-500" />
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">最长边</span>
          <input v-model.number="maxEdge" type="number" min="1" placeholder="不限制" class="w-24 rounded border border-border bg-bg-primary px-2 py-1 text-sm" />
          <span class="text-xs text-text-tertiary">px（仅缩小）</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span class="w-16 text-xs text-text-tertiary flex-shrink-0">格式</span>
          <select v-model="format" class="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-sm">
            <option value="keep">保持原格式</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="mt-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-400">{{ error }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="emit('close')">取消</button>
        <button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white hover:bg-accent-blue/90 disabled:opacity-40" :disabled="applying || !!error">
          {{ applying ? '保存中…' : '保存' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { EditCompressParams, EditEstimateResult, EditSaveSpec } from '@shared/types'

const props = defineProps<{
  fileName: string
  /** 显示原体积（预估对比） */
  sourceBytes?: number
  estimate: EditEstimateResult | null
  estimating: boolean
  applying: boolean
  error: string
  /** 压缩区默认开关（压缩入口=true；纯裁剪=false） */
  compressDefault?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [save: EditSaveSpec, params: EditCompressParams | null]
  'params-change': [params: EditCompressParams]
}>()

const mode = ref<'overwrite' | 'copy'>('copy')
const compressOn = ref(props.compressDefault ?? true)
const suffix = ref('_edited')
const quality = ref(80)
const maxEdge = ref<number | null>(null)
const format = ref<'keep' | 'jpeg' | 'webp'>('keep')

const params = computed<EditCompressParams>(() => ({
  quality: quality.value,
  maxEdge: maxEdge.value && maxEdge.value > 0 ? maxEdge.value : undefined,
  format: format.value
}))

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const estimateLabel = computed(() => {
  if (!props.estimate) return ''
  const dim = props.estimate.width ? ` · ${props.estimate.width}×${props.estimate.height}` : ''
  const source = props.sourceBytes ? `${formatBytes(props.sourceBytes)} → ` : ''
  return `${source}约 ${formatBytes(props.estimate.estimatedBytes)}${dim}`
})

let notifyTimer: ReturnType<typeof setTimeout> | null = null
watch([params, compressOn], () => {
  // 300ms 节流（IFC-1 并发边界）；关闭压缩不请求预估
  if (notifyTimer) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    if (compressOn.value) emit('params-change', params.value)
  }, 300)
}, { immediate: true, deep: true })

function confirm() {
  const save: EditSaveSpec = {
    mode: mode.value,
    suffix: mode.value === 'copy' ? (suffix.value || '_edited') : undefined
  }
  emit('confirm', save, compressOn.value ? params.value : null)
}
</script>
