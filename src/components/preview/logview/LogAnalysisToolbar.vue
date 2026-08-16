<template>
  <div class="flex items-center gap-1 ml-2" data-testid="log-analysis-toolbar">
    <!-- Expression input -->
    <div class="relative">
      <input
        v-model="vm.expression.value"
        type="text"
        :placeholder="$t('preview.logview.filterPlaceholder')"
        class="w-60 px-2 py-1 text-xs rounded border bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
        :class="vm.filterError.value ? 'border-red-500' : 'border-border'"
        :title="vm.filterError.value ?? $t('preview.logview.syntaxTip')"
        @keydown="onKeydown"
        @change="onKeydownEnterOnly"
      />
      <!-- Match count -->
      <span
        v-if="vm.matchCount.value !== null && !vm.filterError.value"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono"
      >{{ $t('preview.logview.matchCount', vm.matchCount.value) }}</span>
    </div>

    <!-- Clear -->
    <button
      v-if="vm.expression.value || vm.hasResult.value"
      class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
      :title="$t('preview.logview.clearTip')"
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
      :title="$t('preview.logview.excludeTip')"
      @click="vm.setInvert(!vm.invert.value)"
    >⇅ {{ $t('preview.logview.exclude') }}</button>

    <!-- Context lines -->
    <div class="flex items-center gap-1">
      <button
        class="px-1.5 py-1 rounded text-xs transition-colors"
        :class="vm.contextEnabled.value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'"
        :title="$t('preview.logview.contextTip')"
        @click="vm.setContext(!vm.contextEnabled.value)"
      >≡ {{ $t('preview.logview.context') }}</button>
      <select
        v-if="vm.contextEnabled.value"
        v-model.number="contextNLocal"
        class="px-1 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary"
        :title="$t('preview.logview.contextLinesTip')"
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
        :title="$t('preview.logview.prevHitTip')"
        @click="vm.navigateHit(-1)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
      </button>
      <button
        class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
        :title="$t('preview.logview.nextHitTip')"
        @click="vm.navigateHit(1)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
    </template>

    <!-- Copy / export -->
    <template v-if="vm.canExport.value">
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        :title="$t('preview.logview.copyTip')"
        @click="vm.copyResult()"
      >{{ $t('preview.logview.copy') }}</button>
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
        :disabled="vm.exporting.value"
        :title="$t('preview.logview.exportTip')"
        @click="vm.exportFiltered()"
      >{{ vm.exporting.value ? $t('preview.logview.exporting') : $t('preview.logview.exportAction') }}</button>
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
      :title="$t('preview.logview.schemeTip')"
      @change="onSchemeChange"
    >
      <option value="">{{ $t('preview.logview.noScheme') }}</option>
      <option v-for="s in store.schemes" :key="s.id" :value="s.id">{{ schemeLabel(s) }}</option>
    </select>
    <button
      class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
      :title="$t('preview.logview.manageSchemes')"
      @click="emit('open-scheme-editor')"
    >{{ $t('preview.logview.schemesButton') }}</button>

    <!-- History dropdown -->
    <div class="relative">
      <button
        class="px-1.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        :title="$t('preview.logview.historyTip')"
        @click="historyOpen = !historyOpen"
      >{{ $t('preview.logview.history') }}</button>
      <div
        v-if="historyOpen"
        class="absolute right-0 top-full mt-1 z-50 min-w-[240px] max-h-72 overflow-auto rounded border border-border bg-bg-primary shadow-lg py-1"
      >
        <template v-if="store.filterFavorites.length > 0">
          <div class="px-2 py-1 text-[10px] uppercase tracking-wide text-text-tertiary">{{ $t('preview.logview.favorites') }}</div>
          <button
            v-for="expr in store.filterFavorites"
            :key="`fav-${expr}`"
            class="w-full text-left px-2 py-1 text-xs font-mono text-text-primary hover:bg-bg-hover flex items-center gap-1"
            @click="useExpression(expr)"
          >
            <span class="truncate flex-1">{{ expr }}</span>
            <span
              class="text-yellow-500 flex-shrink-0"
              :title="$t('preview.logview.unfavorite')"
              @click.stop="store.toggleFavorite(expr)"
            >★</span>
          </button>
        </template>
        <template v-if="store.filterHistory.length > 0">
          <div class="px-2 py-1 text-[10px] uppercase tracking-wide text-text-tertiary">{{ $t('preview.logview.recent') }}</div>
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
              :title="$t('preview.logview.favoriteToggle')"
              @click.stop="store.toggleFavorite(expr)"
            >★</span>
          </button>
          <button
            class="w-full text-left px-2 py-1 text-xs text-text-tertiary hover:bg-bg-hover border-t border-border mt-1"
            @click="store.clearHistory()"
          >{{ $t('preview.logview.clearHistory') }}</button>
        </template>
        <div v-if="store.filterHistory.length === 0" class="px-2 py-1 text-xs text-text-tertiary">{{ $t('preview.logview.noHistory') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/i18n'
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
  return s.builtin ? t('preview.logview.builtinSchemeLabel', { name: s.name }) : s.name
}
</script>
