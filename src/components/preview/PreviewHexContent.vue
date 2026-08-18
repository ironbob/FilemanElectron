<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import { t } from '@/i18n'
import type { FileInfo } from '@/types'
import type { HexRegion } from '@/utils/hexCursor'
import { formatOffset } from '@/utils/hexFormat'
import { formatSize } from '@/utils/path'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useTabsStore } from '@/stores/tabs'
import { useHexViewer } from './composables/useHexViewer'
import HexIcon from './HexIcon.vue'

/**
 * Hex 预览内容（只读 View）。三段纵向结构（44px 工具栏 / 数据网格+Inspector /
 * 28px 状态栏），全文件虚拟滚动（占位高=真实总行数×行高）、字节级光标/选区
 * 联动（Hex ↔ ASCII ↔ Offset ↔ Inspector）、自适应每行字节（8/16/24/32）、
 * 偏移跳转与分组 Data Inspector；坐标换算/光标几何/窗口预取/解读全部来自
 * useHexViewer（MVVM：View 只渲染与转发意图）。
 */
const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 预览会话 id（PreviewView 传入；注册关闭守卫，QuickLook 不传）。 */
  sessionId?: string
}>()

// open-in-full 声明保持与其余 Preview*Content 一致（hex 无全屏形态）
defineEmits<{ 'open-in-full': [] }>()

// ── 视图偏好（localStorage 持久化；bpr 自动档按宽度自适应） ─────────────────

interface HexPrefs {
  bprPref: 'auto' | 8 | 16 | 32
  fontSize: 12 | 13 | 14
  showAscii: boolean
  inspectorWidth: number
  inspectorCollapsed: boolean
}

const PREFS_KEY = 'fileman-hex-prefs'
const DEFAULT_PREFS: HexPrefs = { bprPref: 'auto', fontSize: 13, showAscii: true, inspectorWidth: 300, inspectorCollapsed: false }

function loadPrefs(): HexPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<HexPrefs>
    return {
      bprPref: parsed.bprPref === 8 || parsed.bprPref === 16 || parsed.bprPref === 32 ? parsed.bprPref : 'auto',
      fontSize: parsed.fontSize === 12 || parsed.fontSize === 14 ? parsed.fontSize : 13,
      showAscii: parsed.showAscii !== false,
      inspectorWidth: Number.isFinite(parsed.inspectorWidth) && (parsed.inspectorWidth as number) >= 240 && (parsed.inspectorWidth as number) <= 420
        ? (parsed.inspectorWidth as number)
        : 300,
      inspectorCollapsed: parsed.inspectorCollapsed === true
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

const prefs = loadPrefs()
const bprPref = ref<'auto' | 8 | 16 | 32>(prefs.bprPref)
const fontSize = ref<12 | 13 | 14>(prefs.fontSize)
const showAscii = ref(prefs.showAscii)
const inspectorWidth = ref(prefs.inspectorWidth)
const inspectorCollapsed = ref(prefs.inspectorCollapsed)

let prefsSaveTimer: ReturnType<typeof setTimeout> | null = null
watch([bprPref, fontSize, showAscii, inspectorWidth, inspectorCollapsed], () => {
  if (prefsSaveTimer !== null) clearTimeout(prefsSaveTimer)
  prefsSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        bprPref: bprPref.value, fontSize: fontSize.value, showAscii: showAscii.value,
        inspectorWidth: inspectorWidth.value, inspectorCollapsed: inspectorCollapsed.value
      } satisfies HexPrefs))
    } catch { /* 私有模式等写入失败静默 */ }
    prefsSaveTimer = null
  }, 300)
}, { deep: false })

// ── 自适应每行字节（编辑器实测宽度 + 实测字符宽 → 最大可容纳档位） ──────────

const scroller = ref<HTMLElement | null>(null)
const probe = ref<HTMLElement | null>(null)
const editorWidth = ref(0)
const charWidth = ref(7.8)
const rowHeight = computed(() => (fontSize.value === 12 ? 25 : fontSize.value === 14 ? 29 : 27))

function measureCharWidth(): void {
  const el = probe.value
  if (!el) return
  const width = el.getBoundingClientRect().width / 20
  if (Number.isFinite(width) && width > 0) charWidth.value = width
}

/** 每行 bpr 字节所需的编辑器宽度（列几何与 CSS 同源：3ch/字节 + 组界 2ch+1px）。 */
function requiredWidth(bpr: number): number {
  const ch = charWidth.value
  const groups = Math.ceil(bpr / 8)
  const groupGap = 2 * ch + 1
  const offset = 8 * ch + 3 * ch + 1                       // 偏移 8ch + 右距 2ch + 分隔内距 1ch + 1px 线
  const hex = bpr * 3 * ch + (groups - 1) * groupGap        // 每字节 2ch + 尾随空 1ch
  const ascii = showAscii.value ? bpr * ch + (groups - 1) * groupGap + 2 * ch + 1 + ch : 0
  return 32 + offset + hex + ascii + 16                    // 行左右 padding 16×2 + 16px 余量
}

const bytesPerRow = computed<number>(() => {
  if (bprPref.value !== 'auto') return bprPref.value
  const width = editorWidth.value
  for (const bpr of [32, 24, 16, 8]) {
    if (requiredWidth(bpr) <= width) return bpr
  }
  return 8
})

// reactive() 解包 composable 嵌套 ref（脚本与模板一致访问）
const vm = reactive(useHexViewer(props.file, props.deviceId, {
  bytesPerRow: computed(() => bytesPerRow.value),
  rowHeight: computed(() => rowHeight.value)
}))

const tabsStore = useTabsStore()

const jumpInput = ref('')
/** 拖选进行中（mousedown 起帧 → 字节 mouseenter 扩 head → mouseup 收帧）。 */
const dragging = ref(false)
/** 编辑器焦点（光标 caret 呈现条件之一）。 */
const editorFocused = ref(false)
/** 应用窗口失活（选区/光标降饱和）。 */
const windowInactive = ref(false)

function onScroll(event: Event): void {
  const el = event.target as HTMLElement
  vm.onScroll(el.scrollTop, el.clientHeight)
}

function submitJump(): void {
  void vm.jumpTo(jumpInput.value)
}

function onRowClick(row: number): void {
  vm.selectRow(row)
}

// ── 字节级鼠标交互 ──────────────────────────────────────────────────────────

function onByteMouseDown(offset: number, region: HexRegion, event: MouseEvent): void {
  if (event.shiftKey) {
    // Shift+点击：以原锚点扩选（无锚点时以当前光标为锚）
    vm.placeCursor(offset, { extend: true, region })
  } else {
    vm.placeCursor(offset, { region })
    dragging.value = true
  }
  scroller.value?.focus()
}

function onByteMouseEnter(offset: number): void {
  if (dragging.value) vm.placeCursor(offset, { extend: true })
}

// ── 键盘：编辑输入 / Undo·Redo / 导航（意图 → VM；Cmd+↑/↓ = 文件首尾） ──

function onKeydown(event: KeyboardEvent): void {
  if (vm.totalRows === 0) return
  const extend = event.shiftKey
  const meta = event.metaKey || event.ctrlKey

  // Undo / Redo（Cmd/Ctrl+Z、+Shift+Z、Cmd/Ctrl+Y）
  if (meta && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    if (event.shiftKey) vm.redoEdit()
    else vm.undoEdit()
    return
  }
  if (meta && (event.key === 'y' || event.key === 'Y')) {
    event.preventDefault()
    vm.redoEdit()
    return
  }
  // 保存（Cmd/Ctrl+S）
  if (meta && (event.key === 's' || event.key === 'S')) {
    event.preventDefault()
    void vm.saveFile()
    return
  }
  // 字号（Cmd/Ctrl + / -）
  if (meta && (event.key === '=' || event.key === '+')) {
    event.preventDefault()
    fontSize.value = fontSize.value === 12 ? 13 : 14
    return
  }
  if (meta && event.key === '-') {
    event.preventDefault()
    fontSize.value = fontSize.value === 14 ? 13 : 12
    return
  }
  // Insert 键：覆写/插入模式切换
  if (event.key === 'Insert') {
    event.preventDefault()
    vm.toggleEditMode()
    return
  }
  // 查找（Cmd/Ctrl+F 聚焦工具栏查找字段；选区预填 Hex）
  if (meta && (event.key === 'f' || event.key === 'F')) {
    event.preventDefault()
    vm.openFindBar()
    void nextTick(() => { findInput.value?.focus(); findInput.value?.select() })
    return
  }
  // 匹配导航（F3 / Cmd+G，Shift 反向）
  if (event.key === 'F3' || (meta && (event.key === 'g' || event.key === 'G'))) {
    event.preventDefault()
    if (event.shiftKey) vm.prevMatch()
    else vm.nextMatch()
    return
  }
  // 跳转历史（Alt+←/→）
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault()
    vm.jumpBack()
    return
  }
  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault()
    vm.jumpForward()
    return
  }
  // Tab/Shift+Tab：Hex ↔ ASCII 焦点区切换（偏移不动）
  if (event.key === 'Tab') {
    event.preventDefault()
    vm.switchRegion()
    return
  }
  // Hex 区 nibble 输入（0-9A-F，每字符半个字节）
  if (!meta && !event.altKey && /^[0-9a-fA-F]$/.test(event.key)) {
    if (vm.inputNibble(event.key)) {
      event.preventDefault()
      return
    }
  }
  // ASCII 区整字节输入（可打印字符）
  if (!meta && !event.altKey && event.key.length === 1 && event.key >= ' ' && event.key <= '~') {
    if (vm.inputAscii(event.key)) {
      event.preventDefault()
      return
    }
  }

  let handled = false
  switch (event.key) {
    case 'ArrowLeft':
      vm.moveCursor('left', extend); handled = true; break
    case 'ArrowRight':
      vm.moveCursor('right', extend); handled = true; break
    case 'ArrowUp':
      vm.moveCursor(meta ? 'fileStart' : 'up', extend); handled = true; break
    case 'ArrowDown':
      vm.moveCursor(meta ? 'fileEnd' : 'down', extend); handled = true; break
    case 'Home':
      vm.moveCursor(meta ? 'fileStart' : 'lineStart', extend); handled = true; break
    case 'End':
      vm.moveCursor(meta ? 'fileEnd' : 'lineEnd', extend); handled = true; break
    case 'PageUp':
      vm.moveCursor('pageUp', extend); handled = true; break
    case 'PageDown':
      vm.moveCursor('pageDown', extend); handled = true; break
    case 'a':
    case 'A':
      if (meta) { vm.selectAll(); handled = true }
      break
    default:
      break
  }
  if (handled) event.preventDefault()
}

// ESC：确认条 → 视图菜单 → 替换行 → 清选区（捕获期 LIFO 消费，预览面板不被
// 全局 ESC 关闭）；无选区放行 → 维持“ESC 关闭预览”的既有行为。输入框内不拦截。
useKeyInterceptor(event => {
  if (event.key !== 'Escape') return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (closeConfirm.value) {
    closeConfirm.value = false
    return true
  }
  if (viewMenuOpen.value) {
    viewMenuOpen.value = false
    return true
  }
  if (vm.replaceVisible) {
    vm.replaceVisible = false
    return true
  }
  if (vm.selection) {
    vm.clearSelection()
    return true
  }
})

// ── 粘贴（scroller paste 事件 → VM 校验落地；非法输入状态栏报错） ───────────

function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? ''
  if (text.length === 0) return
  event.preventDefault()
  vm.pasteText(text)
}

// ── 只读来源锁定（ZIP 虚拟路径 / 设备无写能力 → segmented 锁定只读） ────────

onMounted(() => {
  if (props.file.path.includes('::')) {
    vm.lockReadonly(t('preview.hex.readonlyZipLock'))
  } else {
    void window.fileman.getDeviceCapabilities(props.deviceId)
      .then(caps => {
        if (caps?.canWrite === false) vm.lockReadonly(t('preview.hex.readonlyDeviceLock'))
      })
      .catch(() => undefined)
  }
})

// ── 未保存关闭守卫（tabs store 注册；三键确认条就地呈现） ────────────────────

const closeConfirm = ref(false)
/** 放弃修改后置真：守卫放行一次，完成关闭。 */
const closeArmed = ref(false)
let unregisterGuard: (() => void) | null = null
let unregisterProbe: (() => void) | null = null

if (props.sessionId) {
  onMounted(() => {
    unregisterGuard = tabsStore.registerCloseGuard(props.sessionId!, () => {
      if (closeArmed.value || !vm.isModified) return true
      closeConfirm.value = true  // 阻止关闭，就地请求用户决策
      return false
    })
    // 脏探针（标签栏圆点）：与守卫同生命周期
    unregisterProbe = tabsStore.registerDirtyProbe(props.sessionId!, () => vm.isModified)
  })
  onBeforeUnmount(() => {
    unregisterGuard?.()
    unregisterProbe?.()
    unregisterGuard = null
    unregisterProbe = null
  })
}

/** 确认条：保存并关闭（保存成功后守卫自然放行）。 */
async function saveAndClose(): Promise<void> {
  if (await vm.saveFile()) {
    closeConfirm.value = false
    if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
  }
  // 保存失败：确认条保留，失败原因已在状态栏通知槽呈现
}

/** 确认条：放弃修改并关闭。 */
function discardAndClose(): void {
  closeArmed.value = true
  closeConfirm.value = false
  if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
}

// ── 字节样式（选区/光标/匹配/修改标记；Hex 与 ASCII 镜像，颜色见 CSS） ──────

function byteClass(offset: number): string[] {
  const sel = vm.selection
  const inSelection = !!sel && offset >= sel.start && offset <= sel.end
  const isMatch = vm.matchSet.has(offset) && !inSelection
  return [
    isMatch ? 'is-match' : '',
    inSelection ? 'is-sel' : '',
    offset === vm.cursorOffset ? 'is-cursor' : '',
    vm.modifiedSet.has(offset) ? 'is-modified' : ''
  ].filter(Boolean)
}

const findInput = ref<HTMLInputElement | null>(null)

// ── 列头（与数据行同一套列几何：偏移 | 列号（8 字节分组） | ASCII） ──────────

const columnGroups = computed<string[][]>(() => {
  const bpr = bytesPerRow.value
  const groups: string[][] = []
  for (let base = 0; base < bpr; base += 8) {
    const group: string[] = []
    for (let i = base; i < base + 8; i++) group.push(i.toString(16).padStart(2, '0'))
    groups.push(group)
  }
  return groups
})

/** 光标所在列（列头联动强调；-1 无光标）。 */
const cursorColumn = computed(() => {
  const offset = vm.cursorOffset
  return offset === null ? -1 : offset % bytesPerRow.value
})

/** 组内空格：行内最后一个字节不带尾随空格（其余字节后跟 1ch 空格）。 */
function hexSpaceAfter(total: number, indexInRow: number): boolean {
  return indexInRow < total - 1
}

// ── 视图设置弹出层（每行字节 / 字号 / ASCII 列） ─────────────────────────────

const viewMenuOpen = ref(false)

// 菜单打开期间放行标题栏拖拽区，否则点标题栏的外点关闭收不到事件
useAppDragSuspend(() => viewMenuOpen.value)

function onDocumentMouseDownForMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target && target.closest('.hex-view-menu, .hex-tb-btn[data-view-toggle]')) return
  viewMenuOpen.value = false
}

watch(viewMenuOpen, open => {
  if (open) document.addEventListener('mousedown', onDocumentMouseDownForMenu, true)
  else document.removeEventListener('mousedown', onDocumentMouseDownForMenu, true)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMouseDownForMenu, true))

// ── Inspector 拖拽调宽（240–420，双击复位 300）与折叠 ────────────────────────

function toggleInspector(): void {
  inspectorCollapsed.value = !inspectorCollapsed.value
}

let resizing = false
let resizeStartX = 0
let resizeStartWidth = 0

function onResizeMove(event: MouseEvent): void {
  if (!resizing) return
  inspectorWidth.value = Math.min(420, Math.max(240, resizeStartWidth - (event.clientX - resizeStartX)))
}

function onResizeEnd(): void {
  resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

function startResize(event: MouseEvent): void {
  resizing = true
  resizeStartX = event.clientX
  resizeStartWidth = inspectorWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(onResizeEnd)

// ── 窗口失活（选区/光标降饱和、光标停闪） ───────────────────────────────────

function onWindowBlur(): void { windowInactive.value = true }
function onWindowFocus(): void { windowInactive.value = false }

// ── 宽度/字号测量与跳转/键盘滚动目标（DOM 动作由 View 执行） ─────────────────

let resizeObserver: ResizeObserver | null = null

watch(
  () => vm.pendingScroll,
  async pending => {
    if (pending === null || !scroller.value) return
    await nextTick()
    scroller.value.scrollTo({ top: pending.top })
    vm.scrollHandled()
  }
)

watch(fontSize, () => { void nextTick(measureCharWidth) })

onMounted(() => {
  if (scroller.value) {
    vm.onScroll(scroller.value.scrollTop, scroller.value.clientHeight)
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) editorWidth.value = entry.contentRect.width
    })
    resizeObserver.observe(scroller.value)
  }
  measureCharWidth()
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
  if (prefsSaveTimer !== null) clearTimeout(prefsSaveTimer)
})

const modeLabel = computed(() =>
  vm.editMode === 'readonly'
    ? t('preview.hex.modeReadonly')
    : vm.editMode === 'insert'
      ? t('preview.hex.modeInsert')
      : t('preview.hex.modeOverwrite')
)
const rootClass = computed(() => ({
  'is-window-inactive': windowInactive.value,
  'is-editing': editorFocused.value && vm.editMode !== 'readonly',
  'is-insert-mode': editorFocused.value && vm.editMode === 'insert',
  'cursor-in-ascii': vm.cursorRegion === 'ascii',
  'nibble-lo': vm.cursorNibble === 1
}))
</script>

<template>
  <div
    class="finder-preview hex-root h-full flex flex-col min-h-0"
    :class="rootClass"
    :style="{ '--hex-ch': charWidth + 'px' }"
    @mouseup="dragging = false"
  >
    <!-- 字符宽探针（测量列几何；不参与布局） -->
    <span ref="probe" class="hex-probe" :style="{ fontSize: fontSize + 'px' }">00000000000000000000</span>

    <!-- 工具栏 44px：文件标识 | 撤销重做 | 查找字段 | 跳转字段 | 模式 | 视图/Inspector | 保存 -->
    <div class="hex-toolbar flex items-center gap-2 flex-shrink-0">
      <span class="finder-preview-badge">HEX</span>
      <div class="min-w-0 flex items-baseline gap-1.5">
        <span class="hex-file-name truncate max-w-56" :title="file.name">{{ file.name }}</span>
        <span v-if="vm.isModified" class="hex-file-dirty flex-shrink-0" :title="$t('preview.hex.dirtyTip')">{{ $t('preview.hex.dirtyBadge') }}</span>
      </div>

      <div class="flex-1" />

      <button class="hex-tb-btn" :disabled="!vm.canUndo" :title="$t('preview.hex.undoTip')" @click="vm.undoEdit()"><HexIcon name="undo" /></button>
      <button class="hex-tb-btn" :disabled="!vm.canRedo" :title="$t('preview.hex.redoTip')" @click="vm.redoEdit()"><HexIcon name="redo" /></button>
      <span class="hex-tb-sep" />

      <!-- 查找字段：模式切换 + 查询 + 匹配计数 + 匹配导航 + 替换展开 -->
      <div class="hex-field hex-find-field">
        <button
          class="hex-field-mode"
          :title="vm.findMode === 'hex' ? $t('preview.hex.findModeHexTip') : $t('preview.hex.findModeTextTip')"
          @click="vm.toggleFindMode()"
        >{{ vm.findMode === 'hex' ? 'Hex' : $t('preview.hex.findModeText') }}</button>
        <HexIcon name="search" :size="13" class="hex-field-glyph" />
        <input
          ref="findInput"
          v-model="vm.findQuery"
          type="text"
          class="hex-field-input"
          :class="{ 'is-searching': vm.searching }"
          :placeholder="vm.findMode === 'hex' ? '48 65 / 4? ??' : $t('preview.hex.findPlaceholderText')"
          spellcheck="false"
          @keydown.enter.prevent="vm.runFind()"
          @keydown.f3.prevent="vm.nextMatch()"
          @keydown.shift.f3.prevent="vm.prevMatch()"
          @keydown.esc.prevent.stop="vm.closeFind(); findInput?.blur()"
        >
        <span v-if="vm.matchCountLabel" class="hex-field-label">{{ $t('preview.hex.matchPrefix') }} {{ vm.matchCountLabel }}</span>
        <button class="hex-tb-btn hex-tb-btn-sm" :disabled="vm.findMatches.length === 0" :title="$t('preview.hex.prevMatchTip')" @click="vm.prevMatch()"><HexIcon name="chevronUp" :size="14" /></button>
        <button class="hex-tb-btn hex-tb-btn-sm" :disabled="vm.findMatches.length === 0" :title="$t('preview.hex.nextMatchTip')" @click="vm.nextMatch()"><HexIcon name="chevronDown" :size="14" /></button>
        <button v-if="!vm.replaceVisible" class="hex-tb-text" :title="$t('preview.hex.expandReplaceTip')" @click="vm.replaceVisible = true">{{ $t('preview.hex.replace') }}</button>
      </div>

      <!-- 跳转字段：标签 + 输入 + 提交；解析错误浮于字段下方（3.5s 自动消失） -->
      <div class="hex-field hex-jump-field">
        <span class="hex-field-label hex-field-label-static">{{ $t('preview.hex.jumpLabel') }}</span>
        <input
          v-model="jumpInput"
          type="text"
          class="hex-field-input"
          placeholder="0x1A2B / +0x20 / -16"
          spellcheck="false"
          @keydown.enter="submitJump"
        >
        <button class="hex-tb-btn hex-tb-btn-sm" :title="$t('preview.hex.jumpTip')" @click="submitJump"><HexIcon name="jump" :size="14" /></button>
        <div v-if="vm.jumpNotice" class="hex-jump-notice">{{ vm.jumpNotice }}</div>
      </div>

      <span class="hex-tb-sep" />

      <!-- 编辑模式 segmented：只读（锁）｜覆写｜插入 -->
      <div
        class="hex-seg"
        role="group"
        :aria-label="$t('preview.hex.editModeAria')"
        :title="vm.readonlyLock ?? $t('preview.hex.editModeTip')"
      >
        <button
          class="hex-seg-item"
          :class="{ 'is-active': vm.editMode === 'readonly' }"
          :disabled="vm.readonlyLock !== null && vm.editMode !== 'readonly'"
          @click="vm.setEditMode('readonly')"
        ><HexIcon name="lock" :size="11" />{{ $t('preview.hex.modeReadonly') }}</button>
        <button
          class="hex-seg-item"
          :class="{ 'is-active': vm.editMode === 'overwrite' }"
          :disabled="vm.readonlyLock !== null"
          @click="vm.setEditMode('overwrite')"
        >{{ $t('preview.hex.modeOverwrite') }}</button>
        <button
          class="hex-seg-item"
          :class="{ 'is-active': vm.editMode === 'insert', 'is-insert': vm.editMode === 'insert' }"
          :disabled="vm.readonlyLock !== null"
          @click="vm.setEditMode('insert')"
        >{{ $t('preview.hex.modeInsert') }}</button>
      </div>

      <span class="hex-tb-sep" />

      <!-- 视图设置 + Inspector 开关 -->
      <div class="relative">
        <button
          class="hex-tb-btn"
          data-view-toggle
          :class="{ 'is-active': viewMenuOpen }"
          :title="$t('preview.hex.viewSettingsTip')"
          @click="viewMenuOpen = !viewMenuOpen"
        ><HexIcon name="sliders" /></button>
        <div v-if="viewMenuOpen" class="hex-view-menu">
          <div class="hex-view-menu-row">
            <span>{{ $t('preview.hex.bytesPerRow') }}</span>
            <div class="hex-seg hex-seg-mini">
              <button v-for="opt in (['auto', 8, 16, 32] as const)" :key="opt" class="hex-seg-item" :class="{ 'is-active': bprPref === opt }" @click="bprPref = opt">{{ opt === 'auto' ? $t('preview.hex.auto') : opt }}</button>
            </div>
          </div>
          <div class="hex-view-menu-row">
            <span>{{ $t('preview.hex.fontSize') }}</span>
            <div class="hex-seg hex-seg-mini">
              <button v-for="opt in ([12, 13, 14] as const)" :key="opt" class="hex-seg-item" :class="{ 'is-active': fontSize === opt }" @click="fontSize = opt">{{ opt }}</button>
            </div>
          </div>
          <div class="hex-view-menu-row">
            <span>{{ $t('preview.hex.showAsciiColumn') }}</span>
            <button class="hex-seg-item hex-view-ascii-toggle" :class="{ 'is-active': showAscii }" @click="showAscii = !showAscii">{{ showAscii ? $t('common.on') : $t('common.off') }}</button>
          </div>
        </div>
      </div>
      <button
        class="hex-tb-btn"
        :class="{ 'is-active': !inspectorCollapsed }"
        :title="$t('preview.hex.inspectorToggleTip')"
        @click="toggleInspector"
      ><HexIcon name="sidebar" /></button>

      <span class="hex-tb-sep" />

      <!-- 保存：图标 + 文字（无修改禁用；永不换行） -->
      <button
        class="hex-save-btn"
        :class="{ 'is-dirty': vm.isModified }"
        :disabled="!vm.isModified || vm.saveState === 'saving'"
        :title="vm.isModified ? $t('preview.hex.saveTip') : $t('preview.hex.saveIdleTip')"
        @click="vm.saveFile()"
      >
        <HexIcon name="save" :size="14" />
        <span class="hex-save-label">{{ vm.saveState === 'saving' ? $t('preview.hex.saving') : $t('preview.hex.save') }}</span>
      </button>
    </div>

    <div v-if="vm.error" class="hex-banner is-error">
      {{ vm.error }}{{ $t('preview.hex.errorSuffix') }}
    </div>

    <!-- 替换行（查找字段「替换」展开；Esc 收起） -->
    <div v-if="vm.replaceVisible" class="hex-replace-row flex items-center gap-2 flex-shrink-0">
      <span class="hex-field-label hex-field-label-static">{{ $t('preview.hex.replace') }}</span>
      <input
        v-model="vm.replaceQuery"
        type="text"
        class="hex-field-input w-36"
        :placeholder="vm.findMode === 'hex' ? $t('preview.hex.replaceBytesPlaceholder') : $t('preview.hex.replaceTextPlaceholder')"
        spellcheck="false"
        @keydown.esc.prevent.stop="vm.replaceVisible = false"
      >
      <button class="hex-tb-text" :disabled="vm.findMatchIndex < 0" :title="$t('preview.hex.replaceCurrentTip')" @click="vm.replaceCurrent()">{{ $t('preview.hex.replace') }}</button>
      <button class="hex-tb-text" :disabled="vm.findMatches.length === 0" :title="$t('preview.hex.replaceAllTip')" @click="vm.requestReplaceAll()">{{ $t('preview.hex.replaceAll') }}</button>
      <div class="flex-1" />
      <button class="hex-tb-btn hex-tb-btn-sm" :title="$t('preview.hex.collapseReplaceTip')" @click="vm.replaceVisible = false"><HexIcon name="close" :size="13" /></button>
    </div>

    <!-- 全部替换确认条（先呈现 N 处再执行） -->
    <div
      v-if="vm.replaceConfirmCount !== null"
      class="hex-banner is-confirm flex items-center gap-2 flex-shrink-0"
      role="alertdialog"
      :aria-label="$t('preview.hex.replaceAllConfirmAria')"
    >
      <span class="flex-shrink-0">{{ $t('preview.hex.replaceAllConfirm', { count: vm.replaceConfirmCount }) }}</span>
      <div class="flex-1" />
      <button class="hex-banner-btn is-primary" @click="vm.confirmReplaceAll()">{{ $t('preview.hex.replaceAllAction', { count: vm.replaceConfirmCount }) }}</button>
      <button class="hex-banner-btn" @click="vm.cancelReplaceAll()">{{ $t('common.cancel') }}</button>
    </div>

    <!-- 未保存关闭确认条（tabs 关闭被守卫阻止后就地呈现，三键决策） -->
    <div
      v-if="closeConfirm"
      class="hex-banner is-confirm flex items-center gap-2 flex-shrink-0"
      role="alertdialog"
      :aria-label="$t('preview.hex.unsavedAria')"
    >
      <span class="flex-shrink-0">{{ $t('preview.hex.unsavedPrompt') }}</span>
      <div class="flex-1" />
      <button class="hex-banner-btn is-primary" :disabled="vm.saveState === 'saving'" @click="saveAndClose">
        {{ vm.saveState === 'saving' ? $t('preview.hex.savingEllipsis') : $t('preview.hex.saveAndClose') }}
      </button>
      <button class="hex-banner-btn is-danger" @click="discardAndClose">{{ $t('preview.hex.discard') }}</button>
      <button class="hex-banner-btn" @click="closeConfirm = false">{{ $t('common.cancel') }}</button>
    </div>

    <!-- 主体：数据网格（列头 + 虚拟滚动）+ Inspector 侧栏 -->
    <div class="flex-1 min-h-0 flex">
      <div
        ref="scroller"
        class="hex-scroller flex-1 min-w-0 overflow-y-auto font-mono outline-none"
        :data-bpr="bytesPerRow"
        :data-row-height="rowHeight"
        tabindex="0"
        :aria-label="$t('preview.hex.scrollerAria')"
        @scroll="onScroll"
        @keydown="onKeydown"
        @paste="onPaste"
        @focus="editorFocused = true"
        @blur="editorFocused = false"
      >
        <!-- 固定列头（与数据行同列几何：偏移 | 列号 8 字节分组 | ASCII） -->
        <div class="hex-header flex-shrink-0">
          <div class="hex-row hex-header-row" :style="{ height: '24px', lineHeight: '24px', fontSize: '11px' }">
            <span class="hex-offset">{{ $t('preview.hex.offset') }}</span>
            <span class="hex-bytes">
              <span v-for="(group, gi) in columnGroups" :key="gi" class="hex-group">
                <span
                  v-for="(col, ci) in group"
                  :key="ci"
                  class="hex-b hex-col-label"
                  :class="{ 'is-col-active': gi * 8 + ci === cursorColumn }"
                >{{ col }}{{ gi * 8 + ci < bytesPerRow - 1 ? ' ' : '' }}</span>
              </span>
            </span>
            <span v-if="showAscii" class="hex-ascii hex-ascii-label">ASCII</span>
          </div>
        </div>

        <!-- 占位总高 = 真实总行数 × 行高：滚动条覆盖整个文件 -->
        <div class="hex-rows-host" :style="{ height: vm.contentHeight + 'px', position: 'relative' }">
          <div
            v-for="row in vm.rows"
            :key="row.row"
            class="hex-row"
            :class="[
              row.row === vm.cursorRow ? 'is-cursor-row' : '',
              row.row === vm.jumpRow ? 'is-jump-row' : ''
            ]"
            :style="{ position: 'absolute', top: row.top + 'px', height: rowHeight + 'px', left: 0, right: 0, fontSize: fontSize + 'px', lineHeight: rowHeight + 'px' }"
            :title="row.loaded ? `${$t('preview.hex.offset')} ${formatOffset(row.offset)}` : $t('preview.hex.loadingRow')"
            @click="onRowClick(row.row)"
          >
            <span class="hex-offset" :class="{ 'is-cursor-row': row.row === vm.cursorRow }">{{ formatOffset(row.offset) }}</span>
            <template v-if="row.loaded">
              <!-- 字节 span 内尾随空格保留列距（whitespace-pre；选区底色随之连续） -->
              <span class="hex-bytes whitespace-pre">
                <span v-for="(group, gi) in row.hexGroups" :key="gi" class="hex-group">
                  <span
                    v-for="(b, i) in group"
                    :key="i"
                    class="hex-b"
                    :class="byteClass(row.offset + gi * 8 + i)"
                    :data-hex-offset="row.offset + gi * 8 + i"
                    @mousedown.prevent="onByteMouseDown(row.offset + gi * 8 + i, 'hex', $event)"
                    @mouseenter="onByteMouseEnter(row.offset + gi * 8 + i)"
                    @click.stop
                  >{{ b }}{{ hexSpaceAfter(row.hex.length, gi * 8 + i) ? ' ' : '' }}</span>
                </span>
              </span>
              <span v-if="showAscii" class="hex-ascii whitespace-pre">
                <span v-for="(group, gi) in row.asciiGroups" :key="gi" class="hex-group">
                  <span
                    v-for="(c, i) in group"
                    :key="i"
                    class="hex-b hex-b-ascii"
                    :class="byteClass(row.offset + gi * 8 + i)"
                    :data-ascii-offset="row.offset + gi * 8 + i"
                    @mousedown.prevent="onByteMouseDown(row.offset + gi * 8 + i, 'ascii', $event)"
                    @mouseenter="onByteMouseEnter(row.offset + gi * 8 + i)"
                    @click.stop
                  >{{ c }}</span>
                </span>
              </span>
            </template>
            <span v-else class="hex-offset hex-placeholder">················································································································</span>
          </div>
          <div v-if="vm.totalRows === 0" class="hex-empty-file">
            <HexIcon name="doc" :size="28" />
            <span>{{ $t('preview.hex.emptyFile') }}</span>
          </div>
        </div>
      </div>

      <!-- Inspector 拖拽调宽热区（双击复位 300px） -->
      <div
        v-if="!inspectorCollapsed"
        class="hex-inspector-resize"
        :title="$t('preview.hex.resizeTip')"
        @mousedown.prevent="startResize"
        @dblclick="inspectorWidth = 300"
      />

      <!-- Data Inspector：上下文头 + 分组解读（选区长度匹配类型） -->
      <aside v-if="!inspectorCollapsed" class="hex-inspector flex flex-col min-h-0" :style="{ width: inspectorWidth + 'px' }">
        <div class="hex-inspector-title">{{ $t('preview.hex.inspectorTitle') }}</div>

        <div class="hex-inspector-context flex-shrink-0">
          <template v-if="vm.inspectorContext">
            <span class="hex-inspector-cap">{{ $t('preview.hex.inspectorSelectionCap') }}</span>
            <span v-if="vm.inspectorContext.kind === 'offset'" class="font-mono">{{ $t('preview.hex.inspectorOffsetContext', { start: formatOffset(vm.inspectorContext.start) }) }}</span>
            <span v-else class="font-mono">{{ $t('preview.hex.inspectorRangeContext', { start: formatOffset(vm.inspectorContext.start), end: formatOffset(vm.inspectorContext.end), count: vm.inspectorContext.length }) }}</span>
          </template>
        </div>

        <!-- 空态：图标 + 主句 + 辅句（不是一行灰字） -->
        <div v-if="vm.inspectorState === 'empty'" class="hex-inspector-empty">
          <HexIcon name="dashed" :size="28" />
          <span class="hex-inspector-empty-main">{{ $t('preview.hex.inspectorEmptyMain') }}</span>
          <span class="hex-inspector-empty-hint">{{ $t('preview.hex.inspectorEmptyHint') }}</span>
        </div>
        <div v-else-if="vm.inspectorState === 'loading'" class="hex-inspector-empty">
          <span class="hex-inspector-empty-main">{{ $t('preview.hex.inspectorLoadingMain') }}</span>
          <span class="hex-inspector-empty-hint">{{ $t('preview.hex.inspectorLoadingHint') }}</span>
        </div>

        <div v-else class="hex-inspector-body flex-1 min-h-0 overflow-y-auto">
          <section v-for="group in vm.inspectorGroups" :key="group.title" class="hex-inspector-group">
            <div class="hex-inspector-group-title">{{ group.title }}</div>
            <div v-for="entry in group.entries" :key="entry.label" class="hex-inspector-row" :title="`${entry.label} = ${entry.value}`">
              <span class="hex-inspector-label">{{ entry.label }}</span>
              <span class="hex-inspector-value">{{ entry.value }}</span>
            </div>
          </section>
        </div>
      </aside>
    </div>

    <!-- 底部状态栏 28px：模式 | 偏移 | 选区 ⟷ 通知槽 ⟷ 编码 | 字节序 | 大小 | 修改状态 -->
    <div class="hex-statusbar flex items-center flex-shrink-0">
      <span class="hex-mode-chip" :class="`is-${vm.editMode}`" :title="vm.readonlyLock ?? $t('preview.hex.currentModeTip', { mode: modeLabel })">
        <HexIcon v-if="vm.editMode === 'readonly'" name="lock" :size="11" />{{ modeLabel }}
      </span>
      <span class="hex-stat">{{ $t('preview.hex.offset') }} <span class="hex-stat-num">0x{{ vm.cursorLabel ?? '—' }}</span></span>
      <span class="hex-stat">{{ $t('preview.hex.selection') }} <span class="hex-stat-num">{{ vm.selectionShortLabel ?? (vm.cursorLabel !== null ? $t('preview.hex.singleByte') : '—') }}</span></span>

      <div class="flex-1 min-w-0 hex-notice-slot">
        <span v-if="vm.fetching > 0" class="hex-notice is-info"><i class="hex-spinner" />{{ $t('preview.hex.fetching') }}</span>
        <span v-else-if="vm.notice" class="hex-notice" :class="`is-${vm.notice.tone}`">
          <HexIcon v-if="vm.notice.tone === 'success'" name="check" :size="12" />
          <HexIcon v-else-if="vm.notice.tone === 'error'" name="close" :size="12" />
          {{ vm.notice.text }}
        </span>
      </div>

      <span class="hex-stat">ASCII</span>
      <span class="hex-stat">Little Endian</span>
      <span class="hex-stat">{{ formatSize(file.size) }}</span>
      <span class="hex-stat hex-stat-dirty" :class="{ 'is-dirty': vm.isModified }">
        {{ vm.isModified ? $t('preview.hex.modifiedCount', vm.modifiedCount) : $t('preview.hex.savedState') }}
      </span>
    </div>
  </div>
</template>
