<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { FileInfo } from '@/types'
import type { HexRegion } from '@/utils/hexCursor'
import { formatOffset } from '@/utils/hexFormat'
import { ROW_HEIGHT } from '@/utils/hexViewport'
import { formatSize } from '@/utils/path'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useTabsStore } from '@/stores/tabs'
import { useHexViewer } from './composables/useHexViewer'
import IconfontIcon from './IconfontIcon.vue'

/**
 * Hex 预览内容（只读 View）。全文件虚拟滚动（占位高=真实总行数）、
 * 字节级光标/选区联动（Hex ↔ ASCII ↔ Offset ↔ Inspector）、偏移跳转
 * 与 Data Inspector；坐标换算/光标几何/窗口预取/解读全部来自
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

// reactive() 解包 composable 嵌套 ref（脚本与模板一致访问）
const vm = reactive(useHexViewer(props.file, props.deviceId))

const tabsStore = useTabsStore()

const scroller = ref<HTMLElement | null>(null)
const jumpInput = ref('')
/** 拖选进行中（mousedown 起帧 → 字节 mouseenter 扩 head → mouseup 收帧）。 */
const dragging = ref(false)

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
  // Insert 键：覆写/插入模式切换
  if (event.key === 'Insert') {
    event.preventDefault()
    vm.toggleEditMode()
    return
  }
  // 查找条（Cmd/Ctrl+F，选区预填 Hex）与 F3 匹配导航
  if (meta && (event.key === 'f' || event.key === 'F')) {
    event.preventDefault()
    vm.openFindBar()
    void nextTick(() => findInput.value?.focus())
    return
  }
  if (event.key === 'F3') {
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

// ESC：有选区时先清选区（捕获期 LIFO 消费，预览面板不被全局 ESC 关闭）；
// 无选区放行 → 维持"ESC 关闭预览"的既有行为。输入框内不拦截。
useKeyInterceptor(event => {
  if (event.key !== 'Escape') return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (closeConfirm.value) {
    closeConfirm.value = false
    return true
  }
  if (vm.selection) {
    vm.clearSelection()
    return true
  }
})

// ── 粘贴（scroller paste 事件 → VM 校验落地；非法输入就地报错） ─────────────

function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? ''
  if (text.length === 0) return
  event.preventDefault()
  vm.pasteText(text)
}

// ── 未保存关闭守卫（tabs store 注册；三键确认条就地呈现） ────────────────────

const closeConfirm = ref(false)
/** 放弃修改后置真：守卫放行一次，完成关闭。 */
const closeArmed = ref(false)
let unregisterGuard: (() => void) | null = null

if (props.sessionId) {
  onMounted(() => {
    unregisterGuard = tabsStore.registerCloseGuard(props.sessionId!, () => {
      if (closeArmed.value || !vm.isModified) return true
      closeConfirm.value = true  // 阻止关闭，就地请求用户决策
      return false
    })
  })
  onBeforeUnmount(() => {
    unregisterGuard?.()
    unregisterGuard = null
  })
}

/** 确认条：保存并关闭（保存成功后守卫自然放行）。 */
async function saveAndClose(): Promise<void> {
  if (await vm.saveFile()) {
    closeConfirm.value = false
    if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
  }
  // 保存失败：确认条保留，saveError 已就地显示
}

/** 确认条：放弃修改并关闭。 */
function discardAndClose(): void {
  closeArmed.value = true
  closeConfirm.value = false
  if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
}

// ── 字节样式（选区底色 / 光标焦点框 / 查找匹配黄底；Hex 与 ASCII 镜像） ──────

function byteClass(offset: number): string[] {
  const sel = vm.selection
  const inSelection = !!sel && offset >= sel.start && offset <= sel.end
  const isCursor = offset === vm.cursorOffset
  const isMatch = vm.matchSet.has(offset) && !inSelection
  return [
    isMatch ? 'bg-accent-orange/30' : '',
    inSelection ? 'bg-accent-blue/35 text-text-primary' : '',
    !inSelection && isCursor ? 'bg-accent-blue/15' : '',
    isCursor ? 'outline outline-1 -outline-offset-1 outline-accent-blue font-bold' : ''
  ].filter(Boolean)
}

const findInput = ref<HTMLInputElement | null>(null)

/** 工具栏按钮打开查找条后聚焦输入框（等 v-if 挂载）。 */
function nextTickFocusFind(): void {
  void nextTick(() => findInput.value?.focus())
}

// 跳转/键盘滚动目标：VM 给目标 scrollTop，滚动动作（DOM）由 View 执行
watch(
  () => vm.pendingScroll,
  async pending => {
    if (pending === null || !scroller.value) return
    await nextTick()
    scroller.value.scrollTo({ top: pending.top })
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
  <div class="finder-preview h-full flex flex-col min-h-0" @mouseup="dragging = false">
    <!-- 头部：文件信息 + 光标/选区偏移 + 偏移跳转 -->
    <div class="finder-preview-toolbar flex items-center gap-3 border-b border-border text-[11px] text-text-tertiary flex-shrink-0">
      <span class="finder-preview-badge">HEX</span>
      <span class="font-mono truncate max-w-48" :title="file.name">{{ file.name }}</span>
      <button
        class="finder-preview-badge cursor-pointer flex-shrink-0"
        :class="vm.editMode === 'insert' ? 'text-accent-orange !bg-accent-orange/10' : ''"
        :title="`编辑模式：${vm.editMode === 'overwrite' ? '覆写（Overwrite）' : '插入（Insert）'}，按 Insert 键切换`"
        @click="vm.toggleEditMode()"
      >{{ vm.editMode === 'overwrite' ? '覆写' : '插入' }}</button>
      <span
        v-if="vm.isModified"
        class="flex-shrink-0 text-accent-orange"
        title="存在未保存修改（Cmd/Ctrl+S 保存）"
      >● 未保存</span>
      <span class="flex-shrink-0">{{ formatSize(file.size) }}</span>
      <span v-if="vm.cursorLabel" class="font-mono flex-shrink-0 text-text-secondary">光标 {{ vm.cursorLabel }}</span>
      <span v-if="vm.selectionLabel" class="font-mono flex-shrink-0 text-text-secondary">选区 {{ vm.selectionLabel }}</span>
      <span v-if="vm.fetching > 0" class="text-accent-blue flex-shrink-0">读取中…</span>
      <div class="flex-1" />
      <div class="flex flex-col items-end flex-shrink-0">
        <div class="finder-control-group">
          <button
            class="finder-icon-button !px-2 text-text-primary"
            :class="vm.isModified ? 'text-accent-orange' : ''"
            :disabled="!vm.isModified || vm.saveState === 'saving'"
            :title="vm.isModified ? '保存修改（Cmd/Ctrl+S，写入前生成临时文件，原子替换）' : '无未保存修改'"
            @click="vm.saveFile()"
          >{{ vm.saveState === 'saving' ? '保存中…' : '保存' }}</button>
          <button
            class="finder-icon-button !px-2 text-text-primary"
            :class="vm.findBarVisible ? 'text-accent-blue' : ''"
            title="查找（Cmd/Ctrl+F，支持 Hex 通配 ? 与文本）"
            @click="vm.openFindBar(); void nextTickFocusFind()"
          >查找</button>
          <input
            v-model="jumpInput"
            type="text"
            class="w-32 px-2 py-0.5 font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="0x1A2B / +0x20 / -16"
            spellcheck="false"
            @keydown.enter="submitJump"
          >
          <button
            class="finder-icon-button"
            title="跳转到偏移（目标行居中高亮；+0x20/-16 相对当前光标）"
            @click="submitJump"
          ><IconfontIcon name="jump" /></button>
          <button
            class="finder-icon-button"
            :disabled="!vm.canJumpBack"
            title="跳转后退（Alt+←）"
            @click="vm.jumpBack()"
          >‹</button>
          <button
            class="finder-icon-button"
            :disabled="!vm.canJumpForward"
            title="跳转前进（Alt+→）"
            @click="vm.jumpForward()"
          >›</button>
          <button
            class="finder-icon-button"
            title="回到文件头"
            @click="backToTop"
          ><IconfontIcon name="top" /></button>
        </div>
        <span v-if="vm.jumpNotice" class="text-[10px] text-accent-orange leading-tight">{{ vm.jumpNotice }}</span>
        <span
          v-if="vm.pasteNotice"
          class="text-[10px] text-accent-red leading-tight max-w-64 truncate"
          :title="vm.pasteNotice"
        >{{ vm.pasteNotice }}</span>
        <span
          v-if="vm.saveError"
          class="text-[10px] text-accent-red leading-tight max-w-64 truncate"
          :title="vm.saveError"
        >保存失败：{{ vm.saveError }}</span>
      </div>
    </div>

    <div v-if="vm.error" class="px-3 py-1 text-[11px] text-accent-red bg-accent-red/10 border-b border-accent-red/30 flex-shrink-0">
      {{ vm.error }}（已加载区保持可用，滚动可重试新窗口）
    </div>

    <!-- 查找/替换条（Cmd/Ctrl+F；Hex 模式支持 ? 半字节通配） -->
    <div
      v-if="vm.findBarVisible"
      class="flex items-center gap-2 px-3 py-1 border-b border-border text-[11px] bg-bg-secondary/60 flex-shrink-0 flex-wrap"
    >
      <button
        class="finder-preview-badge cursor-pointer flex-shrink-0"
        :title="vm.findMode === 'hex' ? '当前：Hex 字节（? 为半字节通配，如 4? ??）；点击切换为文本' : '当前：文本（UTF-8）；点击切换为 Hex'"
        @click="vm.toggleFindMode()"
      >{{ vm.findMode === 'hex' ? 'Hex' : '文本' }}</button>
      <input
        ref="findInput"
        v-model="vm.findQuery"
        type="text"
        class="w-40 px-2 py-0.5 font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
        :placeholder="vm.findMode === 'hex' ? '48 65 / 4? ??' : '查找文本（UTF-8）'"
        spellcheck="false"
        @keydown.enter.prevent="vm.runFind()"
        @keydown.f3.prevent="vm.nextMatch()"
        @keydown.shift.f3.prevent="vm.prevMatch()"
        @keydown.esc.prevent="vm.closeFindBar()"
      >
      <span class="font-mono text-text-secondary flex-shrink-0 min-w-10 text-center">{{ vm.matchCountLabel }}</span>
      <button class="finder-icon-button" :disabled="vm.findMatches.length === 0" title="上一个匹配（Shift+F3）" @click="vm.prevMatch()">‹</button>
      <button class="finder-icon-button" :disabled="vm.findMatches.length === 0" title="下一个匹配（F3）" @click="vm.nextMatch()">›</button>
      <button
        class="finder-icon-button !px-2"
        :class="vm.replaceVisible ? 'text-accent-blue' : ''"
        :title="vm.replaceVisible ? '收起替换' : '展开替换'"
        @click="vm.replaceVisible = !vm.replaceVisible"
      >替换</button>
      <template v-if="vm.replaceVisible">
        <input
          v-model="vm.replaceQuery"
          type="text"
          class="w-32 px-2 py-0.5 font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
          :placeholder="vm.findMode === 'hex' ? '替换字节（如 41 42）' : '替换文本'"
          spellcheck="false"
          @keydown.esc.prevent="vm.closeFindBar()"
        >
        <button
          class="finder-icon-button !px-2"
          :disabled="vm.findMatchIndex < 0"
          title="替换当前匹配"
          @click="vm.replaceCurrent()"
        >替换</button>
        <button
          class="finder-icon-button !px-2"
          :disabled="vm.findMatches.length === 0"
          title="替换全部匹配（先确认）"
          @click="vm.requestReplaceAll()"
        >全部替换</button>
      </template>
      <span v-if="vm.findNotice" class="text-accent-red flex-shrink-0 max-w-56 truncate" :title="vm.findNotice">{{ vm.findNotice }}</span>
      <div class="flex-1" />
      <button class="finder-icon-button" title="关闭查找条（Esc）" @click="vm.closeFindBar()">×</button>
    </div>

    <!-- 全部替换确认条（先呈现 N 处再执行） -->
    <div
      v-if="vm.replaceConfirmCount !== null"
      class="flex items-center gap-2 px-3 py-1.5 text-[11px] bg-accent-orange/10 border-b border-accent-orange/40 flex-shrink-0"
      role="alertdialog"
      aria-label="确认全部替换"
    >
      <span class="text-accent-orange font-medium">将替换 {{ vm.replaceConfirmCount }} 处匹配，确定执行？</span>
      <div class="flex-1" />
      <button class="px-2 py-0.5 rounded bg-accent-blue text-white hover:opacity-90" @click="vm.confirmReplaceAll()">替换 {{ vm.replaceConfirmCount }} 处</button>
      <button class="px-2 py-0.5 rounded bg-bg-hover text-text-secondary hover:bg-bg-active" @click="vm.cancelReplaceAll()">取消</button>
    </div>

    <!-- 未保存关闭确认条（tabs 关闭被守卫阻止后就地呈现，三键决策） -->
    <div
      v-if="closeConfirm"
      class="flex items-center gap-2 px-3 py-1.5 text-[11px] bg-accent-orange/10 border-b border-accent-orange/40 flex-shrink-0"
      role="alertdialog"
      aria-label="存在未保存修改"
    >
      <span class="text-accent-orange font-medium flex-shrink-0">存在未保存修改，关闭前如何处理？</span>
      <div class="flex-1" />
      <button
        class="px-2 py-0.5 rounded bg-accent-blue text-white hover:opacity-90 flex-shrink-0"
        :disabled="vm.saveState === 'saving'"
        @click="saveAndClose"
      >{{ vm.saveState === 'saving' ? '保存中…' : '保存并关闭' }}</button>
      <button
        class="px-2 py-0.5 rounded bg-accent-red/90 text-white hover:opacity-90 flex-shrink-0"
        @click="discardAndClose"
      >放弃修改</button>
      <button
        class="px-2 py-0.5 rounded bg-bg-hover text-text-secondary hover:bg-bg-active flex-shrink-0"
        @click="closeConfirm = false"
      >取消</button>
    </div>

    <!-- 主体：hex 行区 + Inspector 侧栏 -->
    <div class="flex-1 min-h-0 flex">
      <div
        ref="scroller"
        class="flex-1 min-w-0 overflow-y-auto font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-blue"
        tabindex="0"
        aria-label="十六进制内容：方向键移动光标，Shift 扩展选区，PageUp/PageDown 翻页"
        @scroll="onScroll"
        @keydown="onKeydown"
        @paste="onPaste"
      >
        <!-- 占位总高 = 真实总行数 × 行高：滚动条覆盖整个文件 -->
        <div :style="{ height: vm.contentHeight + 'px', position: 'relative' }">
          <div
            v-for="row in vm.rows"
            :key="row.row"
            class="flex gap-4 px-3 whitespace-nowrap cursor-pointer"
            :class="[
              row.row === vm.cursorRow ? 'bg-accent-blue/10' : 'hover:bg-bg-hover',
              row.row === vm.jumpRow ? 'ring-1 ring-inset ring-accent-orange' : ''
            ]"
            :style="{ position: 'absolute', top: row.top + 'px', height: ROW_HEIGHT + 'px', left: 0, right: 0, lineHeight: ROW_HEIGHT + 'px' }"
            :title="row.loaded ? `偏移 ${formatOffset(row.offset)}` : '加载中…'"
            @click="onRowClick(row.row)"
          >
            <span
              class="text-text-tertiary flex-shrink-0"
              :class="row.row === vm.cursorRow ? '!text-text-primary font-semibold' : ''"
            >{{ formatOffset(row.offset) }}</span>
            <template v-if="row.loaded">
              <!-- 字节 span 间的空格在 whitespace-pre 下保留（列对齐 + 文本可复制） -->
              <span class="whitespace-pre text-text-primary tracking-wider">
                <span
                  v-for="(b, i) in row.hex"
                  :key="i"
                  :data-hex-offset="row.offset + i"
                  class="cursor-pointer"
                  :class="byteClass(row.offset + i)"
                  @mousedown.prevent="onByteMouseDown(row.offset + i, 'hex', $event)"
                  @mouseenter="onByteMouseEnter(row.offset + i)"
                  @click.stop
                >{{ b }}{{ i < row.hex.length - 1 ? ' ' : '' }}</span>
              </span>
              <span class="whitespace-pre text-text-secondary">|<span
                  v-for="(c, i) in row.ascii"
                  :key="i"
                  :data-ascii-offset="row.offset + i"
                  class="cursor-pointer"
                  :class="byteClass(row.offset + i)"
                  @mousedown.prevent="onByteMouseDown(row.offset + i, 'ascii', $event)"
                  @mouseenter="onByteMouseEnter(row.offset + i)"
                  @click.stop
                >{{ c }}</span></span>
            </template>
            <span v-else class="text-text-tertiary/50">································</span>
          </div>
        </div>
        <div v-if="vm.totalRows === 0" class="p-4 text-text-tertiary">空文件</div>
      </div>

      <!-- Data Inspector：光标/选区首字节的各类型解读 -->
      <aside class="w-52 flex-shrink-0 border-l border-border bg-bg-secondary/60 overflow-y-auto flex flex-col">
        <div class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary border-b border-border flex-shrink-0">
          Data Inspector
        </div>
        <div v-if="vm.cursorRow === null" class="px-3 py-3 text-[11px] text-text-tertiary">
          点击任意字节查看该处数值解读
        </div>
        <div v-else-if="vm.inspector.length === 0" class="px-3 py-3 text-[11px] text-text-tertiary">
          该处数据尚未加载
        </div>
        <dl v-else class="px-3 py-1.5 space-y-1">
          <div v-for="entry in vm.inspector" :key="entry.label" class="flex justify-between gap-2 text-[11px]">
            <dt class="text-text-tertiary font-mono flex-shrink-0">{{ entry.label }}</dt>
            <dd class="text-text-primary font-mono text-right break-all">{{ entry.value }}</dd>
          </div>
        </dl>
        <div v-if="vm.inspectorOffset !== null" class="px-3 py-2 text-[10px] text-text-tertiary border-t border-border mt-auto flex-shrink-0">
          自 {{ formatOffset(vm.inspectorOffset) }} 起{{ vm.selection ? '（选区首字节）' : '' }}解读；窗口内不足类型宽度的条目自动跳过
        </div>
      </aside>
    </div>
  </div>
</template>
