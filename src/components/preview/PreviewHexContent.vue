<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { FileInfo } from '@/types'
import { BYTES_PER_ROW, bytesToHexRows, formatOffset, rowCountForSize, type HexRow } from '@/utils/hexFormat'
import { formatSize } from '@/utils/path'

/**
 * Hex 预览内容（只读）。256KB 窗口按需分块读取（fs:readChunk），小 LRU
 * 缓存；行虚拟化沿用 RecycleScroller 固定行高模式（FileList 同款约束）。
 */

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const WINDOW_BYTES = 256 * 1024
const ROW_HEIGHT = 22

const rows = ref<HexRow[]>([])
const totalRows = computed(() => rowCountForSize(props.file.size || 0))
const loading = ref(false)
const error = ref<string | null>(null)
/** 已加载窗口的覆盖范围提示。 */
const loadedRange = reactive({ start: -1, end: -1 })

/** 窗口 LRU（4 个窗口，base64→bytes 由调用处解码）。 */
const windowCache = new Map<number, Uint8Array>()
const WINDOW_CACHE_LIMIT = 4

const scroller = ref<HTMLElement | null>(null)

/** 用窗口数据重建虚拟行视图（未加载区域渲染占位）。 */
function rebuildRows(): void {
  const built: HexRow[] = []
  for (const [windowStart, bytes] of windowCache) {
    built.push(...bytesToHexRows(bytes, windowStart))
  }
  built.sort((a, b) => a.offset - b.offset)
  rows.value = built
  const starts = Array.from(windowCache.keys())
  if (starts.length > 0) {
    loadedRange.start = Math.min(...starts)
    loadedRange.end = Math.max(...starts.map(s => s + (windowCache.get(s)?.length ?? 0)))
  } else {
    loadedRange.start = loadedRange.end = -1
  }
}

async function ensureWindow(offset: number): Promise<void> {
  const windowStart = Math.floor(offset / WINDOW_BYTES) * WINDOW_BYTES
  if (windowCache.has(windowStart)) {
    // LRU 触碰
    const bytes = windowCache.get(windowStart)!
    windowCache.delete(windowStart)
    windowCache.set(windowStart, bytes)
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    const result = await window.fileman.readChunk(props.deviceId, props.file.path, windowStart, WINDOW_BYTES)
    const binary = atob(result.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    windowCache.set(windowStart, bytes)
    while (windowCache.size > WINDOW_CACHE_LIMIT) {
      const oldest = windowCache.keys().next().value as number
      windowCache.delete(oldest)
    }
    rebuildRows()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void ensureWindow(0)
})

/** 滚动时按可视首行预取窗口。 */
function handleScroll(event: Event): void {
  const el = event.target as HTMLElement
  const firstVisibleOffset = Math.floor(el.scrollTop / ROW_HEIGHT) * BYTES_PER_ROW
  if (firstVisibleOffset >= 0) void ensureWindow(firstVisibleOffset)
}

/** 虚拟行：全部行号占位，数据行从 rows 匹配。 */
const virtualRows = computed(() => {
  // RecycleScroller 需要等长条目；这里用普通容器 + 已加载行渲染（简化：
  // 首版只渲染已加载窗口的行 + 滚动按需加载，超界滚动条由占位高度撑起）
  return rows.value
})

const placeholderHeight = computed(() => Math.min(totalRows.value, 5000) * ROW_HEIGHT)
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 头部：文件信息 + 加载状态 -->
    <div class="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-bg-secondary text-[11px] text-text-tertiary flex-shrink-0">
      <span class="font-mono truncate">{{ file.name }}</span>
      <span>{{ formatSize(file.size) }}</span>
      <span v-if="loading" class="text-accent-blue">读取中…</span>
      <span v-else-if="loadedRange.start >= 0" class="font-mono">
        已加载 {{ formatOffset(loadedRange.start) }}–{{ formatOffset(loadedRange.end) }}
      </span>
      <span class="flex-1" />
      <button
        class="px-1.5 py-0.5 rounded border border-border hover:bg-bg-hover"
        title="回到文件头"
        @click="scroller?.scrollTo({ top: 0 }); void ensureWindow(0)"
      >⤒ 头部</button>
    </div>

    <div v-if="error" class="flex-1 flex items-center justify-center text-sm text-accent-red">
      {{ error }}
    </div>

    <!-- hex 主体：等宽字体行列表 + 滚动按需加载 -->
    <div
      v-else
      ref="scroller"
      class="flex-1 min-h-0 overflow-y-auto font-mono text-[11px] leading-[22px]"
      @scroll="handleScroll"
    >
      <div :style="{ height: placeholderHeight + 'px', position: 'relative' }">
        <div
          v-for="row in virtualRows"
          :key="row.offset"
          class="flex gap-4 px-3 whitespace-nowrap hover:bg-bg-hover"
          :style="{ position: 'absolute', top: (row.offset / BYTES_PER_ROW) * ROW_HEIGHT + 'px', height: ROW_HEIGHT + 'px', left: 0, right: 0 }"
        >
          <span class="text-text-tertiary">{{ formatOffset(row.offset) }}</span>
          <span class="text-text-primary tracking-wider">{{ row.hex.join(' ') }}</span>
          <span class="text-text-secondary">|{{ row.ascii }}</span>
        </div>
      </div>
      <div v-if="rows.length === 0 && !loading" class="p-4 text-text-tertiary">空文件</div>
    </div>
  </div>
</template>
