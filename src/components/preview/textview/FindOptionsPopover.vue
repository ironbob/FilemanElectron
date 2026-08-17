<template>
  <div
    class="text-menu-popover w-[280px] py-1"
    data-testid="find-options-popover"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <!-- 匹配规则（仅纯文本查询可用；表达式查询禁用） -->
    <div class="menu-section-title">{{ $t('preview.text.findRulesSection') }}</div>
    <button
      v-for="rule in ruleToggles"
      :key="rule.kind"
      class="menu-row"
      role="switch"
      :aria-checked="rule.on ? 'true' : 'false'"
      :disabled="isExpression"
      :title="isExpression ? $t('preview.text.rulesUnavailableExpr') : undefined"
      @click="rule.toggle()"
    >
      <span>{{ rule.label }}</span>
      <span v-if="isExpression" class="menu-row-value">{{ $t('preview.text.rulesUnavailableExpr') }}</span>
      <span v-else class="menu-switch" aria-hidden="true" :data-on="rule.on ? 'true' : 'false'" />
    </button>

    <div class="edit-sep-h" />

    <!-- 上下文行数：0/1/3/5 分段（0 = 关） -->
    <div class="menu-section-title">{{ $t('preview.text.contextSection') }}</div>
    <div class="flex items-center justify-between px-2.5 py-1.5">
      <div class="menu-segmented" role="radiogroup" :aria-label="$t('preview.text.contextSection')">
        <button
          v-for="n in vm.contextOptions"
          :key="n"
          :class="{ 'is-selected': contextValue === n }"
          role="radio"
          :aria-checked="contextValue === n ? 'true' : 'false'"
          @click="vm.setContext(n > 0, n)"
        >{{ n }}</button>
      </div>
      <span class="text-[11px]" style="color: var(--finder-secondary-label)">{{ $t('preview.text.contextDesc') }}</span>
    </div>

    <div class="edit-sep-h" />

    <!-- 高级：排除 / 着色方案 / 历史 -->
    <div class="menu-section-title">{{ $t('preview.text.advancedSection') }}</div>
    <button
      class="menu-row"
      role="switch"
      :aria-checked="vm.invert.value ? 'true' : 'false'"
      :title="$t('preview.logview.excludeTip')"
      @click="vm.setInvert(!vm.invert.value)"
    >
      <span>{{ $t('preview.logview.exclude') }}</span>
      <span class="menu-switch" :aria-checked="vm.invert.value ? 'true' : 'false'" />
    </button>

    <div v-if="!historyOpen" class="menu-row" style="cursor: default">
      <span>{{ $t('preview.logview.schemeTip') }}</span>
      <select
        class="ml-auto text-xs rounded border px-1 py-0.5"
        style="border-color: var(--finder-divider); background: var(--finder-control); color: var(--finder-label)"
        :value="store.activeSchemeId"
        :title="$t('preview.logview.schemeTip')"
        @change="onSchemeChange"
      >
        <option value="">{{ $t('preview.logview.noScheme') }}</option>
        <option v-for="s in store.schemes" :key="s.id" :value="s.id">{{ schemeLabel(s) }}</option>
      </select>
      <button class="finder-search-chip" :title="$t('preview.logview.manageSchemes')" @click.stop="emit('open-scheme-editor')">
        {{ $t('preview.logview.schemesButton') }}
      </button>
    </div>

    <button v-if="!historyOpen" class="menu-row" :title="$t('preview.logview.historyTip')" @click="historyOpen = true">
      <span>{{ $t('preview.logview.history') }}</span>
      <span class="menu-row-value">{{ store.filterHistory.length }}</span>
    </button>

    <!-- 历史面板（二级） -->
    <template v-if="historyOpen">
      <button class="menu-row" @click="historyOpen = false">‹ {{ $t('preview.text.advancedSection') }}</button>
      <div class="max-h-56 overflow-auto">
        <template v-if="store.filterFavorites.length > 0">
          <div class="menu-section-title">{{ $t('preview.logview.favorites') }}</div>
          <button
            v-for="expr in store.filterFavorites"
            :key="`fav-${expr}`"
            class="menu-row font-mono text-xs"
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
          <div class="menu-section-title">{{ $t('preview.logview.recent') }}</div>
          <button
            v-for="expr in store.filterHistory"
            :key="expr"
            class="menu-row font-mono text-xs"
            @click="useExpression(expr)"
          >
            <span class="truncate flex-1">{{ expr }}</span>
            <span
              :class="store.isFavorite(expr) ? 'text-yellow-500' : ''"
              class="flex-shrink-0"
              :style="!store.isFavorite(expr) ? 'color: var(--finder-secondary-label)' : undefined"
              :title="$t('preview.logview.favoriteToggle')"
              @click.stop="store.toggleFavorite(expr)"
            >★</span>
          </button>
          <button class="menu-row" style="color: var(--finder-secondary-label)" @click="store.clearHistory()">
            {{ $t('preview.logview.clearHistory') }}
          </button>
        </template>
        <div v-if="store.filterHistory.length === 0" class="px-2.5 py-1.5 text-xs" style="color: var(--finder-secondary-label)">
          {{ $t('preview.logview.noHistory') }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import type { PlainQueryMode } from '@/utils/textFilter'
import { HighlightScheme } from '@/utils/logAnalysis/schemeModel'
import { useLogAnalysisStore } from '@/stores/logAnalysis'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'

const props = defineProps<{
  vm: LogAnalysisViewModel
}>()

const emit = defineEmits<{
  close: []
  'open-scheme-editor': []
}>()

const store = useLogAnalysisStore()
const historyOpen = ref(false)

const isExpression = computed(() => props.vm.isExpressionQuery.value)

/** 当前上下文分段值：contextEnabled ? contextN : 0 */
const contextValue = computed(() => (props.vm.contextEnabled.value ? props.vm.contextN.value : 0))

// 规则开关 ↔ PlainQueryMode 的映射（组合出谓词糖）
const caseSensitive = computed(() => props.vm.plainMode.value.endsWith('-case'))
const wholeWord = computed(() => props.vm.plainMode.value.startsWith('word'))
const useRegex = computed(() => props.vm.plainMode.value.startsWith('regex'))

function setRules(next: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean }): void {
  const isCase = next.caseSensitive ?? caseSensitive.value
  const isWord = next.wholeWord ?? wholeWord.value
  const isRegex = next.useRegex ?? useRegex.value
  const mode: PlainQueryMode = isRegex
    ? (isCase ? 'regex-case' : 'regex')
    : isWord
      ? (isCase ? 'word-case' : 'word')
      : (isCase ? 'contains-case' : 'contains')
  props.vm.setPlainMode(mode)
}

const ruleToggles = computed(() => [
  {
    kind: 'case',
    label: t('preview.text.ruleCaseSensitive'),
    on: caseSensitive.value,
    toggle: () => setRules({ caseSensitive: !caseSensitive.value })
  },
  {
    kind: 'word',
    label: t('preview.text.ruleWholeWord'),
    on: wholeWord.value,
    toggle: () => setRules({ wholeWord: !wholeWord.value })
  },
  {
    kind: 'regex',
    label: t('preview.text.ruleRegex'),
    on: useRegex.value,
    toggle: () => setRules({ useRegex: !useRegex.value, caseSensitive: useRegex.value ? false : caseSensitive.value })
  }
])

function useExpression(expr: string): void {
  props.vm.expression.value = expr
  historyOpen.value = false
  void props.vm.applyFilter(true)
}

function onSchemeChange(event: Event): void {
  store.setActiveScheme((event.target as HTMLSelectElement).value)
}

function schemeLabel(s: HighlightScheme): string {
  return s.builtin ? t('preview.logview.builtinSchemeLabel', { name: s.name }) : s.name
}
</script>
