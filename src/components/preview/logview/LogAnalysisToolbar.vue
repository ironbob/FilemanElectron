<template>
  <div class="flex items-center gap-1 ml-2" data-testid="log-analysis-toolbar">
    <!-- Expression input -->
    <div class="relative">
      <input
        v-model="vm.expression.value"
        type="text"
        placeholder="过滤 (回车执行): co(error) and level(warn)"
        class="w-60 px-2 py-1 text-xs rounded border bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
        :class="vm.filterError.value ? 'border-red-500' : 'border-border'"
        :title="vm.filterError.value ?? '语法: co/eq/word/reg/level/lines + and/or/not'"
        @keydown="onKeydown"
        @change="onKeydownEnterOnly"
      />
      <!-- Match count -->
      <span
        v-if="vm.matchCount.value !== null && !vm.filterError.value"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono"
      >{{ vm.matchCount.value }} 命中</span>
    </div>

    <!-- Clear -->
    <button
      v-if="vm.expression.value || vm.hasResult.value"
      class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
      title="清除过滤 (Esc)"
      @click="vm.clearFilter()"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- Expression error -->
    <span
      v-if="vm.filterError.value"
      class="text-xs text-red-400 max-w-[180px] truncate"
      :title="vm.filterError.value"
    >⚠ {{ vm.filterError.value }}</span>

    <!-- Invert (排除) -->
    <button
      class="px-1.5 py-1 rounded text-xs transition-colors"
      :class="vm.invert.value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
      title="反向过滤：显示不匹配的行"
      @click="vm.setInvert(!vm.invert.value)"
    >⇅ 排除</button>

    <!-- Context lines -->
    <div class="flex items-center gap-1">
      <button
        class="px-1.5 py-1 rounded text-xs transition-colors"
        :class="vm.contextEnabled.value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
        title="显示命中行的前后上下文"
        @click="vm.setContext(!vm.contextEnabled.value)"
      >≡ 上下文</button>
      <select
        v-if="vm.contextEnabled.value"
        v-model.number="contextNLocal"
        class="px-1 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary"
        title="上下文行数"
        @change="vm.setContext(true, contextNLocal)"
      >
        <option v-for="n in vm.contextOptions" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>

    <!-- Hit navigation -->
    <template v-if="vm.matchDisplayLines.value.length > 0">
      <span class="text-xs text-text-tertiary font-mono">
        {{ vm.hitIndex.value < 0 ? '–' : vm.hitIndex.value + 1 }}/{{ vm.matchDisplayLines.value.length }}
      </span>
      <button
        class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
        title="上一个命中"
        @click="vm.navigateHit(-1)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
      </button>
      <button
        class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
        title="下一个命中"
        @click="vm.navigateHit(1)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
    </template>

    <!-- Copy / export -->
    <template v-if="vm.canExport.value">
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="复制过滤结果（含原始行号）"
        @click="vm.copyResult()"
      >复制</button>
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
        :disabled="vm.exporting.value"
        title="导出过滤结果为新文件（<原名>.filtered.log）"
        @click="vm.exportFiltered()"
      >{{ vm.exporting.value ? '导出中…' : '导出' }}</button>
    </template>

    <!-- Action feedback -->
    <span
      v-if="vm.actionMessage.value"
      class="text-xs text-text-tertiary max-w-[200px] truncate"
      :title="vm.actionMessage.value"
    >{{ vm.actionMessage.value }}</span>

    <div class="w-px h-4 bg-border mx-0.5"></div>

    <!-- Scheme selector -->
    <select
      :value="store.activeSchemeId"
      class="px-1.5 py-1 text-xs rounded border border-border bg-bg-primary text-text-primary"
      title="着色方案"
      @change="onSchemeChange"
    >
      <option value="">无着色</option>
      <option v-for="s in store.schemes" :key="s.id" :value="s.id">{{ schemeLabel(s) }}</option>
    </select>
    <button
      class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
      title="管理着色方案"
      @click="emit('open-scheme-editor')"
    >方案…</button>

    <!-- History dropdown -->
    <div class="relative">
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="历史与收藏"
        @click="historyOpen = !historyOpen"
      >历史 ▾</button>
      <div
        v-if="historyOpen"
        class="absolute right-0 top-full mt-1 z-50 min-w-[240px] max-h-72 overflow-auto rounded border border-border bg-bg-primary shadow-lg py-1"
      >
        <template v-if="store.filterFavorites.length > 0">
          <div class="px-2 py-1 text-[10px] uppercase tracking-wide text-text-tertiary">收藏</div>
          <button
            v-for="expr in store.filterFavorites"
            :key="`fav-${expr}`"
            class="w-full text-left px-2 py-1 text-xs font-mono text-text-primary hover:bg-bg-hover flex items-center gap-1"
            @click="useExpression(expr)"
          >
            <span class="truncate flex-1">{{ expr }}</span>
            <span
              class="text-yellow-500 flex-shrink-0"
              title="取消收藏"
              @click.stop="store.toggleFavorite(expr)"
            >★</span>
          </button>
        </template>
        <template v-if="store.filterHistory.length > 0">
          <div class="px-2 py-1 text-[10px] uppercase tracking-wide text-text-tertiary">最近使用</div>
          <button
            v-for="expr in store.filterHistory"
            :key="expr"
            class="w-full text-left px-2 py-1 text-xs font-mono text-text-primary hover:bg-bg-hover flex items-center gap-1"
            @click="useExpression(expr)"
          >
            <span class="truncate flex-1">{{ expr }}</span>
            <span
              :class="store.isFavorite(expr) ? 'text-yellow-500' : 'text-text-tertiary'"
              class="flex-shrink-0"
              title="收藏/取消收藏"
              @click.stop="store.toggleFavorite(expr)"
            >★</span>
          </button>
          <button
            class="w-full text-left px-2 py-1 text-xs text-text-tertiary hover:bg-bg-hover border-t border-border mt-1"
            @click="store.clearHistory()"
          >清空历史</button>
        </template>
        <div v-if="store.filterHistory.length === 0" class="px-2 py-1 text-xs text-text-tertiary">暂无历史</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { HighlightScheme } from '@/utils/logAnalysis/schemeModel'
import { useLogAnalysisStore } from '@/stores/logAnalysis'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'

const props = defineProps<{
  vm: LogAnalysisViewModel
}>()

const emit = defineEmits<{
  'open-scheme-editor': []
}>()

const store = useLogAnalysisStore()
const historyOpen = ref(false)
const contextNLocal = ref(props.vm.contextN.value)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    historyOpen.value = false
    void props.vm.applyFilter()
  } else if (event.key === 'Escape') {
    props.vm.clearFilter()
  }
}

function onKeydownEnterOnly(): void {
  void props.vm.applyFilter()
}

function useExpression(expr: string): void {
  props.vm.expression.value = expr
  historyOpen.value = false
  void props.vm.applyFilter()
}

function onSchemeChange(event: Event): void {
  store.setActiveScheme((event.target as HTMLSelectElement).value)
}

function schemeLabel(s: HighlightScheme): string {
  return s.builtin ? `${s.name} (内置)` : s.name
}
</script>
