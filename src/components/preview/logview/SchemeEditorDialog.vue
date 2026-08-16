<template>
  <div class="absolute inset-0 bg-bg-primary z-50 flex flex-col" data-testid="scheme-editor">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border flex-shrink-0">
      <span class="text-sm font-medium text-text-primary">{{ $t('preview.logview.editorTitle') }}</span>
      <button class="p-1.5 rounded hover:bg-bg-hover text-text-secondary" :title="$t('preview.logview.editorCloseTip')" @click="close">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Left: scheme list -->
      <div class="w-56 flex-shrink-0 border-r border-border overflow-auto py-2">
        <button
          v-for="s in store.schemes"
          :key="s.id"
          class="w-full text-left px-3 py-1.5 text-xs flex items-center gap-1 transition-colors"
          :class="selectedId === s.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-primary hover:bg-bg-hover'"
          @click="selectScheme(s.id)"
        >
          <span class="flex-1 truncate">{{ s.name }}</span>
          <span v-if="s.builtin" class="text-[10px] text-text-tertiary">{{ $t('preview.logview.builtinTag') }}</span>
          <span v-else-if="store.activeSchemeId === s.id" class="w-1.5 h-1.5 rounded-full bg-accent-blue flex-shrink-0" :title="$t('preview.logview.activeScheme')"></span>
        </button>
        <div class="px-3 pt-2 mt-2 border-t border-border flex flex-col gap-1">
          <button class="text-left text-xs text-text-secondary hover:text-text-primary" @click="createScheme">{{ $t('preview.logview.newScheme') }}</button>
          <button class="text-left text-xs text-text-secondary hover:text-text-primary" @click="triggerImport">{{ $t('preview.logview.importScheme') }}</button>
          <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
        </div>
      </div>

      <!-- Right: scheme editor -->
      <div class="flex-1 overflow-auto p-4" v-if="draft !== null">
        <!-- Name + actions -->
        <div class="flex items-center gap-2 mb-3">
          <input
            v-model="draft.name"
            class="px-2 py-1 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
            :disabled="draft.builtin"
            :placeholder="$t('preview.logview.namePlaceholder')"
          />
          <button
            v-if="draft.builtin"
            class="px-2 py-1 text-xs bg-bg-hover text-text-primary rounded hover:bg-bg-secondary transition-colors"
            @click="duplicateSelected"
          >{{ $t('preview.logview.duplicateAsCustom') }}</button>
          <template v-else>
            <button
              class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors"
              @click="saveDraft"
            >{{ $t('preview.logview.save') }}</button>
            <button
              class="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              :disabled="!dirty"
              @click="discardDraft"
            >{{ $t('preview.logview.restore') }}</button>
            <button class="px-2 py-1 text-xs text-text-secondary hover:text-red-400" @click="deleteSelected">{{ $t('common.delete') }}</button>
          </template>
          <button
            class="px-2 py-1 text-xs text-text-secondary hover:text-text-primary ml-auto"
            @click="exportSelected"
          >{{ $t('preview.logview.exportScheme') }}</button>
        </div>
        <p v-if="draft.builtin" class="text-xs text-text-tertiary mb-2">{{ $t('preview.logview.builtinReadonly') }}</p>

        <!-- Rules table -->
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="text-text-tertiary text-left">
              <th class="py-1 pr-2 font-normal w-24">{{ $t('preview.logview.matchTypeHeader') }}</th>
              <th class="py-1 pr-2 font-normal">{{ $t('preview.logview.valueHeader') }}</th>
              <th class="py-1 pr-2 font-normal w-20">{{ $t('preview.logview.scopeHeader') }}</th>
              <th class="py-1 pr-2 font-normal w-40">{{ $t('preview.logview.colorHeader') }}</th>
              <th v-if="!draft.builtin" class="py-1 font-normal w-16">{{ $t('preview.logview.actionsHeader') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(rule, idx) in draft.rules" :key="rule.id" class="border-t border-border/40 align-middle">
              <td class="py-1 pr-2">
                <select v-model="rule.matchType" :disabled="draft.builtin" class="w-full px-1 py-0.5 rounded border border-border bg-bg-primary text-text-primary">
                  <option value="contains">{{ $t('preview.logview.matchContains') }}</option>
                  <option value="equals">{{ $t('preview.logview.matchEquals') }}</option>
                  <option value="word">{{ $t('preview.logview.matchWord') }}</option>
                  <option value="regex">{{ $t('preview.logview.matchRegex') }}</option>
                </select>
              </td>
              <td class="py-1 pr-2">
                <input
                  v-model="rule.value"
                  :disabled="draft.builtin"
                  class="w-full px-1 py-0.5 rounded border border-border bg-bg-primary text-text-primary font-mono"
                  :class="ruleError(rule.id) ? 'border-red-500' : ''"
                  :title="ruleError(rule.id) ?? ''"
                />
              </td>
              <td class="py-1 pr-2">
                <select v-model="rule.scope" :disabled="draft.builtin" class="w-full px-1 py-0.5 rounded border border-border bg-bg-primary text-text-primary">
                  <option value="line">{{ $t('preview.logview.scopeLine') }}</option>
                  <option value="fragment">{{ $t('preview.logview.scopeFragment') }}</option>
                </select>
              </td>
              <td class="py-1 pr-2">
                <div class="flex items-center gap-1">
                  <button
                    v-for="key in COLOR_KEYS"
                    :key="key"
                    class="w-4 h-4 rounded-sm border transition-transform"
                    :class="[`fma-swatch-${key}`, rule.colorKey === key ? 'border-text-primary scale-110' : 'border-transparent']"
                    :title="key"
                    :disabled="draft.builtin"
                    @click="rule.colorKey = key"
                  ></button>
                </div>
              </td>
              <td v-if="!draft.builtin" class="py-1">
                <button class="px-1 text-text-secondary hover:text-text-primary disabled:opacity-30" :disabled="idx === 0" @click="moveRule(idx, -1)" :title="$t('preview.logview.moveUpTip')">↑</button>
                <button class="px-1 text-text-secondary hover:text-text-primary disabled:opacity-30" :disabled="idx === draft.rules.length - 1" @click="moveRule(idx, 1)" :title="$t('preview.logview.moveDownTip')">↓</button>
                <button class="px-1 text-text-secondary hover:text-red-400" @click="removeRule(idx)" :title="$t('preview.logview.removeRuleTip')">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="invalidSummary !== ''" class="text-xs text-red-400 mt-2">{{ invalidSummary }}</p>
        <button
          v-if="!draft.builtin"
          class="mt-2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded"
          @click="addRule"
        >{{ $t('preview.logview.addRule') }}</button>
        <p class="text-xs text-text-tertiary mt-2">{{ $t('preview.logview.rulePriorityHint') }}</p>

        <!-- Level words (R9) -->
        <div class="mt-6">
          <h3 class="text-xs font-medium text-text-secondary mb-2">{{ $t('preview.logview.customLevelTitlePrefix') }} <code class="font-mono">level(custom)</code> {{ $t('preview.logview.customLevelTitleSuffix') }}</h3>
          <div class="flex items-center gap-1 flex-wrap">
            <span
              v-for="word in store.customLevelWords"
              :key="word"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-hover text-xs font-mono text-text-primary"
            >{{ word }}<span class="text-text-tertiary hover:text-red-400" :title="$t('preview.logview.removeWord')" @click="store.removeLevelWord(word)">✕</span></span>
            <input
              v-model="newLevelWord"
              class="px-1.5 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary w-32 font-mono"
              :placeholder="$t('preview.logview.newWordPlaceholder')"
              @keydown.enter.prevent="addLevelWord"
            />
          </div>
        </div>
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-text-tertiary text-sm">{{ $t('preview.logview.selectOrCreateScheme') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { t } from '@/i18n'
import {
  COLOR_KEYS,
  HighlightScheme,
  compileScheme,
  newRuleId
} from '@/utils/logAnalysis/schemeModel'
import { serializeScheme, deserializeScheme } from '@/utils/logAnalysis/schemeSerializer'
import { useLogAnalysisStore } from '@/stores/logAnalysis'

const emit = defineEmits<{
  close: []
}>()

const store = useLogAnalysisStore()

const selectedId = ref(store.activeSchemeId || store.schemes[0]?.id || '')
/** Draft copy — edits stay here until 保存 (contract: 确认前不落库) */
const draft = shallowRef<HighlightScheme | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const newLevelWord = ref('')

const dirty = computed(() => {
  const original = store.schemes.find(s => s.id === selectedId.value)
  if (original === undefined || draft.value === null) return false
  return JSON.stringify(stripForCompare(original)) !== JSON.stringify(stripForCompare(draft.value))
})

function stripForCompare(s: HighlightScheme): unknown {
  return { name: s.name, rules: s.rules.map(r => ({ matchType: r.matchType, value: r.value, scope: r.scope, colorKey: r.colorKey })) }
}

watch(selectedId, id => {
  const scheme = store.schemes.find(s => s.id === id)
  draft.value = scheme === undefined ? null : JSON.parse(JSON.stringify(scheme))
}, { immediate: true })

function selectScheme(id: string): void {
  selectedId.value = id
}

function close(): void {
  emit('close')
}

function createScheme(): void {
  const id = store.addScheme(t('preview.logview.newSchemeName'), [
    { id: newRuleId(), matchType: 'word', value: 'ERROR', scope: 'line', colorKey: 'red' }
  ])
  selectedId.value = id
}

function duplicateSelected(): void {
  if (selectedId.value === '') return
  const id = store.duplicateScheme(selectedId.value)
  if (id !== null) selectedId.value = id
}

function deleteSelected(): void {
  if (selectedId.value === '') return
  store.deleteScheme(selectedId.value)
  selectedId.value = store.schemes[0]?.id ?? ''
}

function saveDraft(): void {
  if (draft.value === null) return
  const ok = store.updateScheme(draft.value.id, draft.value.name.trim() || t('preview.logview.unnamedScheme'), draft.value.rules)
  if (ok) {
    // refresh draft from the store to reset dirty state
    selectedId.value = ''
    selectedId.value = draft.value.id
  }
}

function discardDraft(): void {
  const id = selectedId.value
  selectedId.value = ''
  selectedId.value = id
}

function addRule(): void {
  draft.value?.rules.push({ id: newRuleId(), matchType: 'contains', value: '', scope: 'fragment', colorKey: 'yellow' })
}

function removeRule(idx: number): void {
  draft.value?.rules.splice(idx, 1)
}

function moveRule(idx: number, delta: number): void {
  const rules = draft.value?.rules
  if (rules === undefined) return
  const target = idx + delta
  if (target < 0 || target >= rules.length) return
  const [moved] = rules.splice(idx, 1)
  rules.splice(target, 0, moved)
}

/** Live validation preview via the domain model (invalid rules are listed, not blocking) */
const validation = computed(() => {
  if (draft.value === null) return null
  return compileScheme(draft.value)
})

function ruleError(ruleId: string): string | null {
  const invalid = validation.value?.invalidRules.find(r => r.ruleId === ruleId)
  return invalid?.reason ?? null
}

const invalidSummary = computed(() => {
  const list = validation.value?.invalidRules ?? []
  if (list.length === 0) return ''
  return t('preview.logview.invalidRules', { count: list.length, reasons: list.map(r => r.reason).join('；') })
})

function exportSelected(): void {
  if (draft.value === null) return
  const blob = new Blob([serializeScheme(draft.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${draft.value.name}.color-scheme.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport(): void {
  importInput.value?.click()
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file === undefined) return
  try {
    const text = await file.text()
    const { data, error } = deserializeScheme(text)
    if (data === null) {
      console.error(`[SchemeEditorDialog] import failed: ${error}`)
      alert(t('preview.logview.importFailed', { message: error }))
      return
    }
    const id = store.importScheme(data)
    selectedId.value = id
  } catch (err) {
    console.error('[SchemeEditorDialog] import failed:', err)
    alert(t('preview.logview.importFailed', { message: err instanceof Error ? err.message : String(err) }))
  }
}

function addLevelWord(): void {
  if (newLevelWord.value.trim() !== '') {
    store.addLevelWord(newLevelWord.value)
    newLevelWord.value = ''
  }
}
</script>
