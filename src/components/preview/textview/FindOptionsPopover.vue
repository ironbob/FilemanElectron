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

    <!-- 高级：排除 / 历史（着色方案已上移工具栏常驻菜单，2026-08-19） -->
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

    <button v-if="!historyOpen && !syntaxOpen" class="menu-row" :title="$t('preview.logview.historyTip')" @click="historyOpen = true">
      <span>{{ $t('preview.logview.history') }}</span>
      <span class="menu-row-value">{{ store.filterHistory.length }}</span>
    </button>

    <!-- 表达式语法（二级面板，2026-08-19）：谓词清单速查——表达式能力
         在 08-19 收纳化后仅剩 placeholder 一处弱提示，此处补回可发现性。 -->
    <button v-if="!historyOpen && !syntaxOpen" class="menu-row" :title="$t('preview.text.syntaxHelpTip')" @click="syntaxOpen = true">
      <span>{{ $t('preview.text.syntaxHelpEntry') }}</span>
      <span class="menu-row-value">co()</span>
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

    <!-- 表达式语法面板（二级）——谓词速查，源自 src/components/filter/SYNTAX.md -->
    <template v-if="syntaxOpen">
      <button class="menu-row" @click="syntaxOpen = false">‹ {{ $t('preview.text.syntaxHelpEntry') }}</button>
      <div class="px-2.5 py-1.5 text-[11px] leading-relaxed" style="color: var(--finder-secondary-label)" data-testid="syntax-help-panel">
        {{ $t('preview.text.syntaxHelpIntro') }}
      </div>
      <div class="max-h-72 overflow-auto">
        <div v-for="row in SYNTAX_ROWS" :key="row.key" class="menu-row" style="cursor: default">
          <span class="font-mono text-xs flex-shrink-0" style="color: var(--finder-label)">{{ row.syntax }}</span>
          <span class="ml-auto text-right text-[11px]" style="color: var(--finder-secondary-label)">{{ $t(row.descKey) }}</span>
        </div>
        <div class="px-2.5 py-1.5 text-[11px] leading-relaxed" style="color: var(--finder-secondary-label)">
          {{ $t('preview.text.syntaxHelpCase') }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import type { PlainQueryMode } from '@/utils/textFilter'
import { useLogAnalysisStore } from '@/stores/logAnalysis'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'

const props = defineProps<{
  vm: LogAnalysisViewModel
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useLogAnalysisStore()
const historyOpen = ref(false)
const syntaxOpen = ref(false)

/** 谓词速查行（SYNTAX.md §二的浓缩；desc 走 i18n key） */
const SYNTAX_ROWS: Array<{ key: string; syntax: string; descKey: string }> = [
  { key: 'contains', syntax: 'co(x) / CO(x)', descKey: 'preview.text.predContains' },
  { key: 'equals', syntax: 'eq(x) / EQ(x)', descKey: 'preview.text.predEquals' },
  { key: 'word', syntax: 'word(x) / WORD(x)', descKey: 'preview.text.predWord' },
  { key: 'regex', syntax: 'reg(x) / REG(x)', descKey: 'preview.text.predRegex' },
  { key: 'level', syntax: 'level(a,b)', descKey: 'preview.text.predLevel' },
  { key: 'lines', syntax: 'lines(n-m)', descKey: 'preview.text.predLines' },
  { key: 'combine', syntax: 'and / or / not / ()', descKey: 'preview.text.predCombine' }
]

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
  syntaxOpen.value = false
  void props.vm.applyFilter(true)
}
</script>
