<template>
  <div
    ref="rootEl"
    class="text-view-toolbar relative flex items-center gap-3 border-b flex-shrink-0"
    role="toolbar"
    :aria-label="$t('preview.text.toolbarAriaLabel')"
    data-testid="text-preview-toolbar"
  >
    <!-- ── 左段：Quick Look=文件名+「大小 · i / n」（单行合并 2026-08-19）；
              预览 tab=单行元信息。名称 truncate 可收缩，不挤压右组 ── -->
    <div class="flex items-center gap-2 min-w-0" :class="quickLook ? 'flex-shrink' : 'flex-shrink-0'">
      <template v-if="quickLook && qlInfo">
        <span
          class="text-[15px] font-medium truncate min-w-0"
          style="color: var(--finder-label)"
          :title="qlInfo.name"
          data-testid="quick-look-name"
        >{{ qlInfo.name }}</span>
        <span
          v-if="qlInfo.meta"
          class="text-xs whitespace-nowrap flex-shrink-0"
          style="color: var(--finder-secondary-label)"
          data-testid="quick-look-meta"
        >{{ qlInfo.meta }}</span>
      </template>
      <span
        v-else-if="metaDetail"
        class="text-xs whitespace-nowrap truncate"
        style="color: var(--finder-secondary-label)"
        data-testid="text-meta-detail"
      >{{ metaDetail }}</span>
      <slot name="left-extra" />
    </div>

    <!-- ── 中段：查找组（默认收纳为右段图标入口；⌘F/点击展开，Esc 清空后收纳）── -->
    <div v-if="showSearch && searchVisible" class="flex-1 flex items-center justify-center min-w-0">
      <div class="relative flex items-center gap-1.5">
        <FinderSearchField
          ref="searchFieldRef"
          v-model="vm.expression.value"
          class="w-[280px]"
          :invalid="!!vm.filterError.value"
          :placeholder="$t('preview.text.searchPlaceholder')"
          :title="vm.filterError.value ?? $t('preview.text.searchSyntaxTip')"
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

    <!-- ── 右段：Finder 式分组（Quick Look=独立浮动胶囊 finder-toolbar-capsule，
              组间留白无竖线；预览 tab=contents 包裹保持原扁平淡色布局）────────── -->
    <div class="flex items-center flex-shrink-0" :class="quickLook ? 'gap-2.5' : 'gap-1.5'">
      <!-- 阅读组：换行 + 语法（compact 档语法收进 ⋯） -->
      <div v-if="showSourceTools" :class="quickLook ? 'finder-toolbar-capsule' : 'contents'">
        <FinderToolbarButton
          :variant="btnVariant"
          :active-quiet="wordWrapOn"
          :label="wordWrapOn ? $t('preview.text.wordWrapDisable') : $t('preview.text.wordWrapEnable')"
          data-testid="text-wrap-toggle"
          @click="emit('toggle-wrap')"
        >
          <WrapIcon class="w-4 h-4" />
        </FinderToolbarButton>

        <div v-if="density !== 'compact'" class="relative">
          <button
            :class="quickLook
              ? ['finder-pill-btn ql-syntax-btn', { 'is-open': syntaxOpen }]
              : 'h-8 px-3 flex items-center gap-1 bg-bg-secondary/50 border rounded-lg text-[13px] transition-colors ' +
                (syntaxOpen ? 'syntax-open text-text-primary' : 'text-text-secondary hover:text-text-primary')"
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
      </div>

      <span v-if="showSourceTools && !quickLook" class="finder-toolbar-divider" />

      <!-- 查找组（收纳态）：QL=单图标胶囊；展开后由中段承接 -->
      <div v-if="showSearch && !searchVisible" :class="quickLook ? 'finder-toolbar-capsule' : 'contents'">
        <FinderToolbarButton
          :variant="btnVariant"
          :label="$t('preview.text.searchTip')"
          data-testid="text-find-entry"
          @click="focusSearch()"
        >
          <SearchIcon class="w-4 h-4" />
        </FinderToolbarButton>
      </div>

      <!-- 文件操作组：复制 / 导出 / 编辑 / 保存 / 更多（QL 同一胶囊） -->
      <div :class="quickLook ? 'finder-toolbar-capsule' : 'contents'">
        <FinderToolbarButton
          :variant="btnVariant"
          :label="copyTooltip"
          data-testid="text-copy-btn"
          @click="emit('copy')"
        >
          <CopyIcon class="w-4 h-4" />
        </FinderToolbarButton>
        <div v-if="density === 'full'" class="relative">
          <FinderToolbarButton
            :variant="btnVariant"
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

        <span v-if="showSourceTools && !quickLook" class="finder-toolbar-divider" />

        <!-- 编辑（默认只读预览；分片未全量/过滤视图期间禁用）+ 保存（脏时主操作） -->
        <template v-if="showSourceTools">
          <FinderToolbarButton
            :variant="btnVariant"
            :active="editing"
            :disabled="!canEdit"
            :label="editing
              ? $t('preview.text.editActiveTip')
              : editBlockedReason ?? $t('preview.text.editTip')"
            data-testid="text-edit-toggle"
            @click="emit('toggle-edit')"
          >
            <PencilIcon class="w-4 h-4" />
          </FinderToolbarButton>
          <button
            v-if="editing || isModified"
            class="text-save-btn"
            :disabled="!isModified || isSaving || !!saveBlockedReason"
            :title="saveBlockedReason ?? `${t('preview.text.save')} (⌘S)`"
            data-testid="text-save-btn"
            @click="emit('save')"
          >
            <svg v-if="isSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ t('preview.text.save') }}
            <span class="text-save-kbd">⌘S</span>
          </button>
        </template>

        <span v-if="!quickLook" class="finder-toolbar-divider" />

        <!-- 更多 ⋯ -->
        <div class="relative">
          <FinderToolbarButton
            :variant="btnVariant"
            :open="moreOpen"
            :label="$t('preview.text.moreMenuTip')"
            data-testid="text-more-btn"
            @click="moreOpen = !moreOpen"
          >
            <MoreIcon class="w-4 h-4" />
          </FinderToolbarButton>
          <div v-if="moreOpen" class="text-menu-popover min-w-[220px] max-h-[420px] overflow-auto" data-testid="text-more-popover">
            <!-- 修改中：Diff 入口（原底部信息栏） -->
            <template v-if="isModified">
              <button class="menu-row" @click="moreOpen = false; emit('show-diff')">
                <span>{{ t('preview.text.diffLabel') }}</span>
                <span class="menu-row-value">{{ t('preview.text.modifiedBadge') }}</span>
              </button>
              <div class="edit-sep-h" />
            </template>

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

      <!-- Quick Look 步进/关闭三钮（2026-08-19 并入单行；icon-park 描边同组图标） -->
      <div v-if="qlControls" class="finder-toolbar-capsule">
        <FinderToolbarButton
          variant="pill"
          :disabled="qlControls.index <= 0"
          :label="$t('preview.quickLook.prevTip')"
          data-testid="ql-step-prev"
          @click="qlControls.step(-1)"
        >
          <StepUpIcon />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          :disabled="qlControls.index >= qlControls.total - 1"
          :label="$t('preview.quickLook.nextTip')"
          data-testid="ql-step-next"
          @click="qlControls.step(1)"
        >
          <StepDownIcon />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          :label="$t('preview.quickLook.closeTip')"
          data-testid="ql-close"
          @click="qlControls.close()"
        >
          <CloseXIcon />
        </FinderToolbarButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import {
  SearchIcon, ClearIcon, ChevronUpIcon, ChevronDownIcon,
  CopyIcon, MoreIcon, ExportIcon, WrapIcon, PencilIcon,
  StepUpIcon, StepDownIcon, CloseXIcon
} from '@/components/icons/previewToolIcons'
import FinderToolbarButton from '@/components/toolbar/FinderToolbarButton.vue'
import FinderToolbarGroup from '@/components/toolbar/FinderToolbarGroup.vue'
import FinderSearchField from '@/components/toolbar/FinderSearchField.vue'
import FindOptionsPopover from '@/components/preview/textview/FindOptionsPopover.vue'
import type { LogAnalysisViewModel } from '@/components/preview/composables/useLogAnalysis'
import type { QuickLookControls } from '@/types/preview'

const props = defineProps<{
  vm: LogAnalysisViewModel
  /** 单行元信息 "类型 · N 行 · 大小"（Quick Look 模式传 null——左段改示文件名） */
  metaDetail: string | null
  /** Quick Look 浮层模式：左段=文件信息、右段=浮动胶囊分组（无竖线） */
  quickLook?: boolean
  /** Quick Look 左段文件信息（名 + "大小 · i / n"） */
  qlInfo?: { name: string; meta: string } | null
  /** Quick Look 步进/关闭控件（右端三钮胶囊；仅 QL 传入） */
  qlControls?: QuickLookControls | null
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
  /** 编辑模式（只读预览 ⇄ 可写） */
  editing: boolean
  /** 可进入编辑（null reason = 可编辑） */
  canEdit: boolean
  /** 编辑被阻断原因（分片未全量 / 过滤视图）；tooltip 呈现 */
  editBlockedReason: string | null
  isModified: boolean
  isSaving: boolean
  /** 保存被阻断原因（过滤视图/分片未全量）；null = 可保存 */
  saveBlockedReason: string | null
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
  'toggle-edit': []
  save: []
  'show-diff': []
}>()

const { t } = useI18n()

/** QL=胶囊内透明 pill 钮；tab=原 30px 圆钮（toolbar-btn-enhanced） */
const btnVariant = computed(() => (props.quickLook ? 'pill' : 'round') as 'pill' | 'round')

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

// ── 搜索收纳（2026-08-19）：默认收为右段图标入口；⌘F/点击展开。
//    查询非空或结果激活期间保持展开（Esc 先清查询，再收纳）。 ──
const searchOpen = ref(false)
const searchVisible = computed(() =>
  searchOpen.value || props.vm.expression.value !== '' || props.vm.hasResult.value
)

function collapseSearch(): void {
  searchOpen.value = false
}

// ── 菜单开合（统一外点关闭） ──
const findOptionsOpen = ref(false)
const syntaxOpen = ref(false)
const exportOpen = ref(false)
const moreOpen = ref(false)

// 任一菜单打开期间放行标题栏拖拽区，否则点标题栏的外点关闭收不到事件
useAppDragSuspend(() => findOptionsOpen.value || syntaxOpen.value || exportOpen.value || moreOpen.value)

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
  searchOpen.value = true
  void nextTick(() => searchFieldRef.value?.selectAll())
}

function openFindOptions(): void {
  searchOpen.value = true
  void nextTick(() => { findOptionsOpen.value = true })
}

/** Esc 链一环：菜单开着 → 全部收起；搜索展开且已清空 → 收纳；否则交下一环 */
function handleEscape(): boolean {
  const hadOpen = findOptionsOpen.value || syntaxOpen.value || exportOpen.value || moreOpen.value
  closeMenus()
  if (hadOpen) return true
  if (searchOpen.value && props.vm.expression.value === '') {
    searchOpen.value = false
    return true
  }
  return false
}

defineExpose({ focusSearch, openFindOptions, collapseSearch, handleEscape })
</script>
