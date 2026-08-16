<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChecksumAlgo, ChecksumItem, ChecksumProgress } from '@shared/types'
import { useLongTaskProgress } from '@/composables/useLongTaskProgress'
import { formatSize } from '@/utils/path'
import { copyToClipboard } from '@/utils/clipboard'

/**
 * 校验和弹窗 —— 1 个文件算哈希 / 2 个文件（可跨设备）逐字节对比。
 * 消费 M1 的 useLongTaskProgress（start/cancel/push 三件套 harness）；
 * 终态事件自带 results + match，无需二次拉取。
 */

const props = defineProps<{
  items: ChecksumItem[]
  algo: ChecksumAlgo
}>()

const emit = defineEmits<{ close: [] }>()

const sessionId = `checksum-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const algo = ref<ChecksumAlgo>(props.algo)
const copiedIndex = ref<number | null>(null)

const { progress, isRunning, start, cancel } = useLongTaskProgress<
  Parameters<typeof window.fileman.startChecksum>[0],
  ChecksumProgress
>({
  start: request => window.fileman.startChecksum(request),
  cancel: taskId => window.fileman.cancelChecksum(taskId),
  subscribe: callback => window.fileman.onChecksumProgress(callback)
})

void start({ sessionId, algo: algo.value, items: props.items })

/** 切算法即重启（同 session 自动取消旧任务）。 */
function changeAlgo(next: ChecksumAlgo): void {
  if (isRunning.value) return
  algo.value = next
  void start({ sessionId, algo: next, items: props.items })
}

const percent = computed(() => {
  const p = progress.value
  if (!p || p.totalBytes === 0) return 0
  return Math.min(100, Math.round((p.bytesProcessed / p.totalBytes) * 100))
})

const terminal = computed(() => progress.value && ['completed', 'cancelled', 'failed'].includes(progress.value.status))

async function copyHex(index: number): Promise<void> {
  const hex = progress.value?.results?.[index]?.hex
  if (!hex) return
  await copyToClipboard(hex)
  copiedIndex.value = index
  setTimeout(() => { if (copiedIndex.value === index) copiedIndex.value = null }, 1500)
}

function statusText(): string {
  const p = progress.value
  if (!p) return '准备中…'
  if (p.status === 'hashing') return `哈希中 ${p.index + 1}/${p.total}`
  if (p.status === 'completed') return '完成'
  if (p.status === 'cancelled') return '已取消'
  return `失败：${p.message ?? '未知错误'}`
}
</script>

<template>
  <div class="fixed inset-0 z-modal flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="w-[520px] max-w-[90vw] rounded-lg border border-border bg-bg-secondary shadow-xl">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">
          {{ items.length === 2 ? '校验和对比' : '计算校验和' }}
        </h3>
        <button class="text-text-tertiary hover:text-text-primary" @click="emit('close')">✕</button>
      </div>

      <div class="px-5 py-4 space-y-4">
        <!-- 算法选择 -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-text-secondary w-14">算法</span>
          <div class="flex gap-1">
            <button
              v-for="a in (['md5', 'sha1', 'sha256'] as ChecksumAlgo[])"
              :key="a"
              class="px-2.5 py-1 text-xs rounded border"
              :class="algo === a
                ? 'bg-accent-blue text-white border-accent-blue'
                : 'text-text-secondary border-border hover:bg-bg-hover'"
              :disabled="isRunning"
              @click="changeAlgo(a)"
            >{{ a.toUpperCase() }}</button>
          </div>
        </div>

        <!-- 条目 -->
        <div class="space-y-2">
          <div
            v-for="(item, index) in items"
            :key="item.deviceId + item.path"
            class="px-3 py-2 rounded border border-border bg-bg-primary"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-text-primary truncate font-mono" :title="item.path">{{ item.name }}</span>
              <span class="text-[10px] text-text-tertiary flex-shrink-0">{{ formatSize(item.size) }}</span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <code class="flex-1 text-[11px] text-text-secondary font-mono break-all">
                {{ progress?.results?.[index]?.hex ?? progress?.results?.[index]?.error ?? (progress?.index === index && isRunning ? '计算中…' : '—') }}
              </code>
              <button
                v-if="progress?.results?.[index]?.hex"
                class="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary hover:bg-bg-hover flex-shrink-0"
                @click="copyHex(index)"
              >{{ copiedIndex === index ? '已复制' : '复制' }}</button>
            </div>
          </div>
        </div>

        <!-- 对比结论 -->
        <div
          v-if="terminal && progress?.status === 'completed' && progress?.match !== undefined"
          class="px-3 py-2 rounded text-xs font-medium"
          :class="progress.match
            ? 'bg-accent-green/15 text-accent-green'
            : 'bg-accent-red/15 text-accent-red'"
        >
          {{ progress.match ? '✓ 两个文件内容一致（逐字节哈希相同）' : '✗ 两个文件内容不同' }}
        </div>

        <!-- 进度 -->
        <div>
          <div class="flex items-center justify-between text-[11px] text-text-tertiary mb-1">
            <span>{{ statusText() }}</span>
            <span v-if="isRunning">{{ percent }}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <div
              class="h-full bg-accent-blue transition-all duration-150"
              :style="{ width: (terminal ? 100 : percent) + '%' }"
            />
          </div>
        </div>
      </div>

      <div class="px-5 py-3 border-t border-border flex justify-end gap-2">
        <button
          v-if="isRunning"
          class="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:bg-bg-hover"
          @click="cancel()"
        >取消</button>
        <button
          class="px-3 py-1.5 text-xs rounded bg-accent-blue text-white hover:bg-accent-blue/90"
          @click="emit('close')"
        >关闭</button>
      </div>
    </div>
  </div>
</template>
