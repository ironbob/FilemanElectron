<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChecksumAlgo, ChecksumItem, ChecksumProgress } from '@shared/types'
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useLongTaskProgress } from '@/composables/useLongTaskProgress'
import { formatSize } from '@/utils/path'
import { copyToClipboard } from '@/utils/clipboard'
import FinderIcon from '@/components/FinderIcon.vue'
import IconfontIcon from '@/components/preview/IconfontIcon.vue'

/**
 * 校验和弹窗 —— 1 个文件算哈希 / 2 个文件（可跨设备）逐字节对比。
 * 消费 M1 的 useLongTaskProgress（start/cancel/push 三件套 harness）；
 * 终态事件自带 results + match，无需二次拉取。
 * 2026-08-20 Finder 化：分段算法选择器（激活=浅灰，单蓝规则）/ 凹陷组条目
 * 带 FinderIcon / 拷贝钮 icon+文字 / 结论行=状态图标+彩字（去大色块）/ Esc 消费。
 */

const props = defineProps<{
  items: ChecksumItem[]
  algo: ChecksumAlgo
}>()

const emit = defineEmits<{ close: [] }>()

/** 规范算法名（勿机械 toUpperCase——SHA-1/SHA-256 是正确拼写）。 */
const ALGOS: ReadonlyArray<{ value: ChecksumAlgo; label: string }> = [
  { value: 'md5', label: 'MD5' },
  { value: 'sha1', label: 'SHA-1' },
  { value: 'sha256', label: 'SHA-256' }
]

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

// props.items 经 FilePane 的 reactive() 存储，读出即深层 Proxy——直接跨 IPC 会
// "could not be cloned" 且异常被 void 吞掉（弹窗永远停在准备中）。发送前展开成普通对象。
const plainItems = (): ChecksumItem[] => props.items.map(item => ({ ...item }))

void start({ sessionId, algo: algo.value, items: plainItems() })

/** 切算法即重启（同 session 自动取消旧任务）。 */
function changeAlgo(next: ChecksumAlgo): void {
  if (isRunning.value) return
  algo.value = next
  void start({ sessionId, algo: next, items: plainItems() })
}

const percent = computed(() => {
  const p = progress.value
  if (!p || p.totalBytes === 0) return 0
  return Math.min(100, Math.round((p.bytesProcessed / p.totalBytes) * 100))
})

/** 仅完成态灌满；取消/失败停在原位（Finder 进度窗语义）。 */
const barWidth = computed(() => (progress.value?.status === 'completed' ? 100 : percent.value))

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
  if (!p) return t('dialogs.checksum.preparing')
  if (p.status === 'hashing') return t('dialogs.checksum.hashing', { index: p.index + 1, total: p.total })
  if (p.status === 'completed') return t('dialogs.checksum.completed')
  if (p.status === 'cancelled') return t('dialogs.checksum.cancelled')
  return t('dialogs.checksum.failed', { message: p.message ?? t('dialogs.checksum.unknownError') })
}

// 模态期间 Esc 归弹窗所有（capture 消费，App.vue 的 bubble 监听不穿透）。
useKeyInterceptor((e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return true
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45" @click.self="emit('close')">
    <div
      class="finder-sheet w-[520px] max-w-[90vw] app-no-drag"
      role="dialog"
      :aria-label="items.length === 2 ? $t('dialogs.checksum.titleCompare') : $t('dialogs.checksum.titleSingle')"
    >
      <div class="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <h3 class="text-sm font-medium text-text-primary">
          {{ items.length === 2 ? $t('dialogs.checksum.titleCompare') : $t('dialogs.checksum.titleSingle') }}
        </h3>
        <div class="finder-control-group">
          <button class="finder-icon-button" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')">
            <IconfontIcon name="close" />
          </button>
        </div>
      </div>

      <div class="px-5 py-4 space-y-4">
        <!-- 算法选择：分段控件，激活=浅灰（单蓝规则）；计算中禁切带原因提示 -->
        <div class="flex items-center gap-3">
          <span class="text-xs text-text-secondary w-14 flex-shrink-0">{{ $t('dialogs.checksum.algo') }}</span>
          <div class="finder-seg-tray" role="radiogroup" :aria-label="$t('dialogs.checksum.algo')">
            <button
              v-for="a in ALGOS"
              :key="a.value"
              class="finder-segment-btn-text"
              :class="{ active: algo === a.value }"
              role="radio"
              :aria-checked="algo === a.value"
              :disabled="isRunning"
              :title="isRunning ? $t('dialogs.checksum.algoLocked') : undefined"
              @click="changeAlgo(a.value)"
            >{{ a.label }}</button>
          </div>
        </div>

        <!-- 条目：凹陷组（finder-inset-group，无描边——一张材质规则），行间 hairline -->
        <div class="finder-inset-group px-3">
          <div
            v-for="(item, index) in items"
            :key="item.deviceId + item.path"
            class="py-2.5"
            :class="index > 0 ? 'border-t border-border/60' : ''"
          >
            <div class="flex items-center gap-2 min-w-0">
              <FinderIcon name="fileText" class="finder-item-icon flex-shrink-0 text-text-tertiary" />
              <span class="text-xs text-text-primary truncate" :title="item.path">{{ item.name }}</span>
              <span class="ml-auto text-[10px] text-text-tertiary flex-shrink-0">{{ formatSize(item.size) }}</span>
            </div>
            <div class="mt-0.5 flex items-start gap-2 pl-9">
              <code class="flex-1 text-[11px] leading-4 text-text-secondary font-mono break-all">
                {{ progress?.results?.[index]?.hex ?? progress?.results?.[index]?.error ?? (progress?.index === index && isRunning ? $t('dialogs.checksum.computing') : '—') }}
              </code>
              <button
                v-if="progress?.results?.[index]?.hex"
                class="finder-btn-secondary is-sm flex-shrink-0"
                @click="copyHex(index)"
              >
                <IconfontIcon name="copy" size="sm" />
                <span>{{ copiedIndex === index ? $t('dialogs.checksum.copied') : $t('dialogs.checksum.copy') }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 进度：细蓝条；取消/失败停在原位，仅完成灌满 -->
        <div>
          <div class="flex items-center justify-between text-[11px] text-text-tertiary mb-1">
            <span>{{ statusText() }}</span>
            <span v-if="isRunning">{{ percent }}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <div
              class="h-full bg-accent-blue transition-all duration-150"
              :style="{ width: barWidth + '%' }"
            />
          </div>
        </div>

        <!-- 对比结论：状态图标+彩字行（去大色块） -->
        <div
          v-if="terminal && progress?.status === 'completed' && progress?.match !== undefined"
          class="flex items-center gap-1.5 text-xs font-medium"
          :class="progress.match ? 'text-accent-green' : 'text-accent-red'"
        >
          <svg v-if="progress.match" class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10" /></svg>
          <svg v-else class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2.5 20h19L12 3z" /><path d="M12 10v4.5" /><path d="M12 17.6v.1" /></svg>
          {{ progress.match ? $t('dialogs.checksum.matchSame') : $t('dialogs.checksum.matchDiff') }}
        </div>
      </div>

      <!-- 底栏：右对齐 32px 主次钮；计算中关闭属不安全动作→主钮禁用 -->
      <div class="px-5 py-3 border-t border-border flex justify-end gap-2">
        <button
          v-if="isRunning"
          class="finder-btn-secondary"
          @click="cancel()"
        >{{ $t('dialogs.checksum.cancel') }}</button>
        <button
          class="finder-btn-primary"
          :disabled="isRunning"
          @click="emit('close')"
        >{{ $t('dialogs.checksum.close') }}</button>
      </div>
    </div>
  </div>
</template>
