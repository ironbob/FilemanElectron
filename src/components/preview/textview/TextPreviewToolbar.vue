<template>
  <div
    ref="rootEl"
    class="text-view-toolbar relative flex items-center gap-3 border-b flex-shrink-0"
    role="toolbar"
    :aria-label="$t('preview.text.toolbarAriaLabel')"
    data-testid="text-preview-toolbar"
  >
    <!-- ── 左段：元信息（compact 档收进 ⋯；模式切换组经 left-extra 插槽注入） ── -->
    <div class="flex items-center gap-2 min-w-0 flex-shrink-0">
      <span class="finder-preview-badge">{{ badge }}</span>
      <span
        v-if="density !== 'compact' && metaDetail"
        class="text-xs whitespace-nowrap"
        style="color: var(--finder-secondary-label)"
        data-testid="text-meta-detail"
      >{{ metaDetail }}</span>
      <slot name="left-extra" />
    </div>

    <!-- ── 中段：统一查找组（共享组件：FinderSearchField + bordered 分段托盘） ── -->
    <div v-if="showSearch" class="flex-1 flex items-center justify-center min-w-0">
      <div class="relative flex items-center gap-1.5">
        <FinderSearchField
          ref="searchFieldRef"
          v-model="vm.expression.value"
          class="w-[280px]"
          :invalid="!!vm.filterError.value"
          :placeholder="$t('preview.text.searchPlaceholder')"
          :title="vm.filterError.value ?? $t('preview.text.searchTip')"
          :input-attrs="{ 'data-testid': 'text-find-input' }"
          data-testid="text-find-field"
          @input="onInput"
          @enter="onEnter"
        >
          <template #leading>
            <SearchIcon class="w-3.5 h-3.5" />
          </template>
          <template #trailing>
            <span
              v-if="countText"
              class="finder-search-chip"
              data-testid="text-match-count"
            >{{ countText }}</span>
            <button
              class="finder-search-chip"
              :class="{ 'is-open': findOptionsOpen }"
              :aria-label="$t('preview.text.findOptionsTip')"
              :title="$t('preview.text.findOptionsTip')"
              data-testid="text-find-options-btn"
              @click="findOptionsOpen = !findOptionsOpen"
            >
              <ChevronDownIcon class="w-3 h-3 flex-shrink-0" />
            </button>
            <button
              v-if="vm.expression.value || vm.hasResult.value"
              class="finder-search-chip"
              :aria-label="$t('preview.text.clearSearchTip')"
              :title="$t('preview.text.clearSearchTip')"
              data-testid="text-find-clear"
              @click="vm.clearFilter()"
            >
              <ClearIcon class="w-3.5 h-3.5 flex-shrink-0" />
            </button>
          </template>
        </FinderSearchField>

        <FinderToolbarGroup bordered>
          <FinderToolbarButton
            variant="segment"
            :disabled="!navEnabled"
            :label="navEnabled ? $t('preview.text.prevMatchTip') : $t('preview.text.findNavDisabledTip')"
            data-testid="text-find-prev"
            @click="vm.navigateHit(-1)"
          >
            <ChevronUpIcon class="w-3.5 h-3.5" />
          </FinderToolbarButton>
          <FinderToolbarButton
            variant="segment"
            :disabled="!navEnabled"
            :label="navEnabled ? $t('preview.text.nextMatchTip') : $t('preview.text.findNavDisabledTip')"
            data-testid="text-find-next"
            @click="vm.navigateHit(1)"
          >
            <ChevronDownIcon class="w-3.5 h-3.5" />
          </FinderToolbarButton>
        </FinderToolbarGroup>

        <FindOptionsPopover
          v-if="findOptionsOpen"
          class="text-menu-popover"
          :vm="vm"
          @close="findOptionsOpen = false"
          @open-scheme-editor="emit('open-scheme-editor')"
        />
      </div>
    </div>
    <div v-else class="flex-1"></div>

    <!-- ── 右段：阅读 │ 语法 │ 内容（共享 FinderToolbarButton 圆钮，与 FilePane 对齐） ── -->
    <div class="flex items-center gap-1.5 flex-shrink-0">
      <!-- 阅读组：唯一的图标切换钮（单蓝规则：唯一可能长蓝的控件） -->
      <template v-if="showSourceTools">
        <FinderToolbarButton
          :active="wordWrapOn"
          :label="wordWrapOn ? $t('preview.text.wordWrapDisable') : $t('preview.text.wordWrapEnable')"
          data-testid="text-wrap-toggle"
          @click="emit('toggle-wrap')"
        >
          <WrapIcon class="w-4 h-4" />
        </FinderToolbarButton>

        <!-- 语法轻量菜单（面包屑同款 pill；compact 档收进 ⋯） -->
        <div v-if="density !== 'compact'" class="relative">
          <button
            class="h-8 px-3 flex items-center gap-1 bg-bg-secondary/50 border rounded-lg text-[13px] transition-colors"
            :class="syntaxOpen
              ? 'syntax-open text-text-primary'
              : 'text-text-secondary hover:text-text-primary'"
            :aria-label="$t('preview.text.syntaxMenuLabel', { lang: syntaxLabel })"
            :title="$t('preview.text.syntaxMenuLabel', { lang: syntaxLabel })"
            data-testid="text-syntax-menu"
            @click="syntaxOpen = !syntaxOpen"
          >
            <span class="truncate max-w-[140px]">{{ $t('preview.text.syntaxMenuLabel', { lang: syntaxLabel }) }}</span>
            <ChevronDownIcon class="w-2.5 h-2.5 flex-shrink-0" />
          </button>
          <div v-if="syntaxOpen" class="text-menu-popover max-h-80 overflow-auto" data-testid="text-syntax-popover">
            <button
              class="menu-row"
              :class="{ 'is-checked': !syntaxOverride }"
              @click="selectSyntax(null)"
            >
              <span>{{ $t('preview.text.syntaxAuto') }}</span>
              <span v-if="!syntaxOverride" class="menu-row-value">✓</span>
            </button>
            <button
              v-for="lang in syntaxLanguages"
              :key="lang.id"
              class="menu-row"
              :class="{ 'is-checked': syntaxOverride === lang.id }"
              @click="selectSyntax(lang.id)"
            >
              <span>{{ lang.label }}</span>
              <span v-if="syntaxOverride === lang.id" class="menu-row-value">✓</span>
            </button>
          </div>
        </div>
      </template>

      <span v-if="showSourceTools" class="finder-toolbar-divider" />

      <!-- 内容组：复制 / 导出（<980 导出收进 ⋯） -->
      <FinderToolbarButton
        :label="copyTooltip"
        data-testid="text-copy-btn"
        @click="emit('copy')"
      >
        <CopyIcon class="w-4 h-4" />
      </FinderToolbarButton>
      <div v-if="density === 'full'" class="relative">
        <FinderToolbarButton
          :open="exportOpen"
          :disabled="vm.exporting.value"
          :label="$t('preview.text.exportTip')"
          data-testid="text-export-btn"
          @click="exportOpen = !exportOpen"
        >
          <ExportIcon class="w-4 h-4" />
        </FinderToolbarButton>
        <div v-if="exportOpen" class="text-menu-popover" data-testid="text-export-popover">
          <button class="menu-row" @click="doExport('full')">
            <span>{{ $t('preview.text.exportFull') }}</span>
          </button>
          <button v-if="vm.canExport.value" class="menu-row" @click="doExport('matches')">
            <span>{{ $t('preview.text.exportMatches') }}</span>
          </button>
          <button v-if="hasSelection" class="menu-row" @click="doExport('selection')">
            <span>{{ $t('preview.text.exportSelection') }}</span>
          </button>
        </div>
      </div>

      <span class="finder-toolbar-divider" />

      <!-- 更多 ⋯ -->
      <div class="relative">
        <FinderToolbarButton
          :open="moreOpen"
          :label="$t('preview.text.moreMenuTip')"
          data-testid="text-more-btn"
          @click="moreOpen = !moreOpen"
        >
          <MoreIcon class="w-4 h-4" />
        </FinderToolbarButton>
        <div v-if="moreOpen" class="text-menu-popover min-w-[220px] max-h-[420px] overflow-auto" data-testid="text-more-popover">
          <!-- compact 档：元信息收进 ⋯（只读） -->
          <template v-if="density === 'compact' && metaDetail">
            <div class="menu-row" style="cursor: default; color: var(--finder-secondary-label)">{{ metaDetail }}</div>
            <div class="edit-sep-h" />
          </template>

          <!-- <980：导出迁入 -->
          <template v-if="density !== 'full'">
            <button class="menu-row" @click="doExport('full')">
              <span>{{ $t('preview.text.exportFull') }}</span>
            </button>
            <button v-if="vm.canExport.value" class="menu-row" @click="doExport('matches')">
              <span>{{ $t('preview.text.exportMatches') }}</span>
            </button>
            <button v-if="hasSelection" class="menu-row" @click="doExport('selection')">
              <span>{{ $t('preview.text.exportSelection') }}</span>
            </button>
            <div class="edit-sep-h" />
          </template>

          <!-- <840：语法迁入 -->
          <template v-if="showSourceTools && density === 'compact'">
            <div class="menu-section-title">{{ $t('preview.text.syntaxMenuLabel', { lang: '' }) }}</div>
            <button class="menu-row" :class="{ 'is-checked': !syntaxOverride }" @click="selectSyntax(null)">
              <span>{{ $t('preview.text.syntaxAuto') }}</span>
              <span v-if="!syntaxOverride" class="menu-row-value">✓</span>
            </button>
            <button
              v-for="lang in syntaxLanguages"
              :key="lang.id"
              class="menu-row"
              :class="{ 'is-checked': syntaxOverride === lang.id }"
              @click="selectSyntax(lang.id)"
            >
              <span>{{ lang.label }}</span>
              <span v-if="syntaxOverride === lang.id" class="menu-row-value">✓</span>
            </button>
            <div class="edit-sep-h" />
          </template>

          <!-- 常驻低频项 -->
          <div class="menu-row" style="cursor: default">
            <span>{{ $t('preview.text.encodingRow') }}</span>
            <span class="menu-row-value font-mono">{{ encoding }}</span>
          </div>
          <div class="menu-row" style="cursor: default">
            <span>{{ $t('preview.text.fontSizeRow') }}</span>
            <span class="menu-row-value flex items-center gap-1">
              <button class="finder-search-chip" :aria-label="$t('preview.text.fontSizeRow') + ' −'" @click.stop="emit('set-font-size', fontSize - 1)">−</button>
              <span class="font-mono w-5 text-center">{{ fontSize }}</span>
              <button class="finder-search-chip" :aria-label="$t('preview.text.fontSizeRow') + ' +'" @click.stop="emit('set-font-size', fontSize + 1)">＋</button>
            </span>
          </div>
          <button class="menu-row" @click="toggleCheck('line-numbers')">
            <span>{{ $t('preview.text.showLineNumbersRow') }}</span>
            <span v-if="showLineNumbers" class="menu-row-value">✓</span>
          </button>
          <button class="menu-row" @click="toggleCheck('minimap')">
            <span>{{ $t('preview.text.showMinimapRow') }}</span>
            <span v-if="showMinimap" class="menu-row-value">✓</span>
          </button>
          <div class="edit-sep-h" />
          <button class="menu-row" @click="doJump">
            <span>{{ $t('preview.text.jumpToLineRow') }}</span>
            <span class="menu-row-value">⌘L</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SearchIcon, ClearIcon, ChevronUpIcon, ChevronDownIcon,
  CopyIcon, MoreIcon, ExportIcon, WrapIcon
} from '@/components/icons/previewToolIcons'
import FinderToolbarButton from '@/components/toolbar/FinderToolbarButton.vue'
import FinderToolbarGroup from '@/components/toolbar/FinderToolbarGroup.vue'
import FinderSearchField from '@/components/toolbar/FinderSearchField.vue'
import FindOptionsPopover from '@/components/preview/textview/FindOptionsPopover.vue'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'

const props = defineProps<{
  vm: LogAnalysisViewModel
  /** 类型徽标（如 "纯文本"/"JSON"） */
  badge: string
  /** 元信息 "348 行 · 67.8 KB"（full/medium 档显示；compact 收进 ⋯） */
  metaDetail: string | null
  /** source 模式才显示查找与源码工具 */
  showSearch: boolean
  showSourceTools: boolean
  wordWrapOn: boolean
  hasSelection: boolean
  syntaxLabel: string
  syntaxOverride: string | null
  syntaxLanguages: Array<{ id: string; label: string }>
  fontSize: number
  showLineNumbers: boolean
  showMinimap: boolean
  encoding: string
}>()

const emit = defineEmits<{
  'toggle-wrap': []
  'set-syntax': [id: string | null]
  copy: []
  export: [kind: 'full' | 'matches' | 'selection']
  'set-font-size': [size: number]
  'toggle-line-numbers': []
  'toggle-minimap': []
  'jump-to-line': []
  'open-scheme-editor': []
}>()

const { t } = useI18n()

// ── 密度档位（≥980 full；980–840 medium 导出入⋯；<840 compact 导出/语法/元信息入⋯；
//    搜索任何宽度保留） ──
type Density = 'full' | 'medium' | 'compact'
const rootEl = ref<HTMLElement | null>(null)
const density = ref<Density>('full')
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (rootEl.value !== null && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 1200
      density.value = width >= 980 ? 'full' : width >= 840 ? 'medium' : 'compact'
    })
    resizeObserver.observe(rootEl.value)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// ── 菜单开合（统一外点关闭） ──
const findOptionsOpen = ref(false)
const syntaxOpen = ref(false)
const exportOpen = ref(false)
const moreOpen = ref(false)

function closeMenus(): void {
  findOptionsOpen.value = false
  syntaxOpen.value = false
  exportOpen.value = false
  moreOpen.value = false
}

function onWindowPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && rootEl.value?.contains(event.target)) return
  closeMenus()
}
onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onWindowPointerDown, true))

// ── 查找输入：即时过滤（200ms 防抖），Enter 落历史并跳下一个匹配 ──
const searchFieldRef = ref<InstanceType<typeof FinderSearchField> | null>(null)
const pendingQuery = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onInput(): void {
  pendingQuery.value = true
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (pendingQuery.value) void props.vm.applyFilter(false)
    pendingQuery.value = false
  }, 200)
}

function onEnter(event: KeyboardEvent): void {
  if (pendingQuery.value) {
    // 查询刚改过：Enter = 记录历史并应用（再按才切换匹配）
    pendingQuery.value = false
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null }
    void props.vm.applyFilter(true)
    return
  }
  props.vm.navigateHit(event.shiftKey ? -1 : 1)
}

// ── 计数 chip：n 个匹配 / i / n 个匹配 ──
const countText = computed(() => {
  const vm = props.vm
  if (vm.filterError.value || vm.matchCount.value === null) return null
  const n = vm.matchCount.value
  if (vm.hitIndex.value >= 0 && n > 0) {
    return t('preview.text.matchCountCurrent', { i: vm.hitIndex.value + 1, n })
  }
  return t('preview.text.matchCountTotal', n)
})

const navEnabled = computed(() => props.vm.matchDisplayLines.value.length > 0)

const copyTooltip = computed(() =>
  props.hasSelection ? t('preview.text.copySelectionTip') : t('preview.text.copyAllTip')
)

// ── 菜单动作 ──
function selectSyntax(id: string | null): void {
  emit('set-syntax', id)
  syntaxOpen.value = false
  moreOpen.value = false
}

function doExport(kind: 'full' | 'matches' | 'selection'): void {
  exportOpen.value = false
  moreOpen.value = false
  emit('export', kind)
}

function toggleCheck(which: 'line-numbers' | 'minimap'): void {
  if (which === 'line-numbers') emit('toggle-line-numbers')
  else emit('toggle-minimap')
}

function doJump(): void {
  moreOpen.value = false
  emit('jump-to-line')
}

// ── 供父组件（⌘F / 空态按钮 / Esc 链）调用 ──
function focusSearch(): void {
  searchFieldRef.value?.selectAll()
}

function openFindOptions(): void {
  findOptionsOpen.value = true
}

/** Esc 链一环：有菜单开着 → 全部收起并消费；返回 false 交给下一环 */
function handleEscape(): boolean {
  const hadOpen = findOptionsOpen.value || syntaxOpen.value || exportOpen.value || moreOpen.value
  closeMenus()
  return hadOpen
}

defineExpose({ focusSearch, openFindOptions, handleEscape })
</script>
