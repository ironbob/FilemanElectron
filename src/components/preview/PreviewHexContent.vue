<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FileInfo } from '@/types'
import { formatOffset } from '@/utils/hexFormat'
import { ROW_HEIGHT } from '@/utils/hexViewport'
import { formatSize } from '@/utils/path'
import { useHexViewer } from './composables/useHexViewer'

/**
 * Hex 预览内容（只读 View）。全文件虚拟滚动（占位高=真实总行数）、
 * 偏移跳转与 Data Inspector；坐标换算/窗口预取/解读全部来自
 * useHexViewer（MVVM：View 只渲染与转发意图）。
 */
const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

// open-in-full 声明保持与其余 Preview*Content 一致（hex 无全屏形态）
defineEmits<{ 'open-in-full': [] }>()

// reactive() 解包 composable 嵌套 ref（脚本与模板一致访问）
const vm = reactive(useHexViewer(props.file, props.deviceId))

const scroller = ref<HTMLElement | null>(null)
const jumpInput = ref('')

function onScroll(event: Event): void {
  const el = event.target as HTMLElement
  vm.onScroll(el.scrollTop, el.clientHeight)
}

function submitJump(): void {
  void vm.jumpTo(jumpInput.value)
}

function backToTop(): void {
  scroller.value?.scrollTo({ top: 0 })
}

function onRowClick(row: number): void {
  vm.selectRow(row)
}

// 跳转目标：VM 只给目标行，滚动动作（DOM）由 View 执行
watch(
  () => vm.pendingScrollRow,
  async row => {
    if (row === null || !scroller.value) return
    await nextTick()
    scroller.value.scrollTo({ top: vm.scrollTopToCenter(row, scroller.value.clientHeight) })
    vm.scrollHandled()
  }
)

onMounted(() => {
  if (scroller.value) {
    vm.onScroll(scroller.value.scrollTop, scroller.value.clientHeight)
  }
})
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 头部：文件信息 + 光标偏移 + 偏移跳转 -->
    <div class="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-bg-secondary text-[11px] text-text-tertiary flex-shrink-0">
      <span class="font-mono truncate max-w-48" :title="file.name">{{ file.name }}</span>
      <span class="flex-shrink-0">{{ formatSize(file.size) }}</span>
      <span v-if="vm.cursorLabel" class="font-mono flex-shrink-0 text-text-secondary">光标 {{ vm.cursorLabel }}</span>
      <span v-if="vm.fetching > 0" class="text-accent-blue flex-shrink-0">读取中…</span>
      <div class="flex-1" />
      <div class="flex flex-col items-end flex-shrink-0">
        <div class="flex items-center gap-1">
          <input
            v-model="jumpInput"
            type="text"
            class="w-32 px-2 py-0.5 font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="0x1A2B / 6667"
            spellcheck="false"
            @keydown.enter="submitJump"
          >
          <button
            class="px-1.5 py-0.5 rounded border border-border hover:bg-bg-hover"
            title="跳转到偏移（目标行居中高亮）"
            @click="submitJump"
          >→</button>
          <button
            class="px-1.5 py-0.5 rounded border border-border hover:bg-bg-hover"
            title="回到文件头"
            @click="backToTop"
          >⤒</button>
        </div>
        <span v-if="vm.jumpNotice" class="text-[10px] text-accent-orange leading-tight">{{ vm.jumpNotice }}</span>
      </div>
    </div>

    <div v-if="vm.error" class="px-3 py-1 text-[11px] text-accent-red bg-accent-red/10 border-b border-accent-red/30 flex-shrink-0">
      {{ vm.error }}（已加载区保持可用，滚动可重试新窗口）
    </div>

    <!-- 主体：hex 行区 + Inspector 侧栏 -->
    <div class="flex-1 min-h-0 flex">
      <div
        ref="scroller"
        class="flex-1 min-w-0 overflow-y-auto font-mono text-[11px]"
        @scroll="onScroll"
      >
        <!-- 占位总高 = 真实总行数 × 行高：滚动条覆盖整个文件 -->
        <div :style="{ height: vm.contentHeight + 'px', position: 'relative' }">
          <div
            v-for="row in vm.rows"
            :key="row.row"
            class="flex gap-4 px-3 whitespace-nowrap cursor-pointer"
            :class="[
              row.row === vm.cursorRow ? 'bg-accent-blue/20' : 'hover:bg-bg-hover',
              row.row === vm.jumpRow ? 'ring-1 ring-inset ring-accent-orange' : ''
            ]"
            :style="{ position: 'absolute', top: row.top + 'px', height: ROW_HEIGHT + 'px', left: 0, right: 0, lineHeight: ROW_HEIGHT + 'px' }"
            :title="row.loaded ? `偏移 ${formatOffset(row.offset)}` : '加载中…'"
            @click="onRowClick(row.row)"
          >
            <span class="text-text-tertiary">{{ formatOffset(row.offset) }}</span>
            <template v-if="row.loaded">
              <span class="text-text-primary tracking-wider">{{ row.hex.join(' ') }}</span>
              <span class="text-text-secondary">|{{ row.ascii }}</span>
            </template>
            <span v-else class="text-text-tertiary/50">································</span>
          </div>
        </div>
        <div v-if="vm.totalRows === 0" class="p-4 text-text-tertiary">空文件</div>
      </div>

      <!-- Data Inspector：选中行首字节的各类型解读 -->
      <aside class="w-52 flex-shrink-0 border-l border-border bg-bg-secondary/60 overflow-y-auto flex flex-col">
        <div class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary border-b border-border flex-shrink-0">
          Data Inspector
        </div>
        <div v-if="vm.cursorRow === null" class="px-3 py-3 text-[11px] text-text-tertiary">
          点击任意行查看该处字节的数值解读
        </div>
        <div v-else-if="vm.inspector.length === 0" class="px-3 py-3 text-[11px] text-text-tertiary">
          该行数据尚未加载
        </div>
        <dl v-else class="px-3 py-1.5 space-y-1">
          <div v-for="entry in vm.inspector" :key="entry.label" class="flex justify-between gap-2 text-[11px]">
            <dt class="text-text-tertiary font-mono flex-shrink-0">{{ entry.label }}</dt>
            <dd class="text-text-primary font-mono text-right break-all">{{ entry.value }}</dd>
          </div>
        </dl>
        <div v-if="vm.cursorRow !== null" class="px-3 py-2 text-[10px] text-text-tertiary border-t border-border mt-auto flex-shrink-0">
          以选中行首字节（{{ vm.cursorLabel }}）为起点；窗口内不足类型宽度的条目自动跳过
        </div>
      </aside>
    </div>
  </div>
</template>
