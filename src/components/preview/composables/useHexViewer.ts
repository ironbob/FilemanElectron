import { computed, ref, watch } from 'vue'
import type { FileInfo } from '@/types'
import type { HexSavePiece } from '@shared/types'
import { BYTES_PER_ROW, bytesToHexRows, formatOffset, interpretAt, parseOffsetInput, type InspectorEntry } from '@/utils/hexFormat'
import { cursorAfterMove, selectionRange, type CursorMove, type HexCursor, type HexRegion, type SelectionRange } from '@/utils/hexCursor'
import { HexWindowCache, decodeBase64 } from '@/utils/hexWindowCache'
import { HexEditJournal } from '@/utils/hexEditJournal'
import { findMatchesInChunk, parseHexPattern, textToPattern, type NibblePattern } from '@/utils/hexSearch'
import {
  OVERSCAN_ROWS,
  ROW_HEIGHT,
  clampOffset,
  offsetToRow,
  rowTop,
  rowToOffset,
  scrollTopToCenter,
  scrollTopToShow,
  visibleRowRange
} from '@/utils/hexViewport'

/** 结构化打点（关键节点：入口/出口/异常/外部调用；仓库 console 惯例）。 */
const log = {
  info: (message: string, ...args: unknown[]) => console.log(`[HexViewer] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[HexViewer] ${message}`, ...args)
}

/** Uint8Array → base64（保存片段序列化；与 hexWindowCache.decodeBase64 对偶）。 */
function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** 渲染行视图（View 直接消费；未加载行 loaded=false 渲染占位）。 */
export interface HexRowView {
  row: number
  /** 绝对定位 top（px）——由 hexViewport 换算，View 不自算坐标。 */
  top: number
  offset: number
  loaded: boolean
  hex: string[]
  ascii: string
}

/**
 * Hex 查看器会话 ViewModel（composable-as-VM 配方，useGrepSearch 同款）。
 *
 * 职责：持有视口/字节级光标与选区/编辑会话状态；显示字节 = 编辑日志
 * （HexEditJournal）逻辑文档 ∘ HexWindowCache 窗口的组合（readLogicalSync）；
 * 编排窗口预取、rAF 合帧滚动、跳转解析定位与光标处解读。坐标换算
 * 全部委托 hexViewport、光标/选区几何委托 hexCursor、编辑语义委托
 * hexEditJournal —— 本层不自算坐标、不触 DOM（滚动目标是状态，
 * 滚动动作由 View 执行）。
 */
export function useHexViewer(file: FileInfo, deviceId: string) {
  const size = Math.max(0, file.size || 0)

  const scrollTop = ref(0)
  const viewportHeight = ref(600)
  /** 缓存落定计数：computed 行集依赖它以在窗口到达后刷新。 */
  const loadedRevision = ref(0)
  const error = ref<string | null>(null)
  const fetching = ref(0)
  /**
   * 编辑日志（稀疏补丁 + Undo/Redo，P0-2）。显示字节 = journal 逻辑文档；
   * editRevision 在每次编辑/撤销/重做后自增，驱动行集/Inspector/行数重算
   * （journal 状态本身非响应式）。
   */
  const journal = new HexEditJournal(size)
  const editRevision = ref(0)
  /** 字节级光标（逻辑偏移；nibble 输入时高/低半字节语义）。 */
  const cursor = ref<HexCursor | null>(null)
  /** 选区锚点字节（null = 无选区；拖选/Shift 扩选只动 head=光标）。 */
  const anchorOffset = ref<number | null>(null)
  /** 跳转高亮行（限时清除由 View 定时器驱动或停留至下次跳转）。 */
  const jumpRow = ref<number | null>(null)
  /** 跳转解析错误（含钳制提示），就地在输入框下呈现。 */
  const jumpNotice = ref<string | null>(null)
  /** 请求 View 滚动到的 scrollTop（View watch 后清回 null）。 */
  const pendingScroll = ref<{ top: number } | null>(null)

  const cache = new HexWindowCache({
    fileSize: size,
    fetcher: async (offset, length) => {
      // 外部调用点：readChunk 通道（本地区间流/远程流式/非流式守卫在 main）
      const result = await window.fileman.readChunk(deviceId, file.path, offset, length)
      log.info('readChunk ok', { offset, length: result.bytesRead })  // 出口
      return decodeBase64(result.base64)
    }
  })

  // ── 逻辑文档 → 视口行集 ────────────────────────────────────────────────────

  /** 逻辑总行数（编辑插入/删除后随 logicalSize 联动）。 */
  const totalRows = computed(() => {
    void editRevision.value
    const logical = journal.logicalSize
    return logical > 0 ? Math.ceil(logical / BYTES_PER_ROW) : 0
  })

  log.info('open', { path: file.path, size, rows: totalRows.value })  // 入口

  // ── 视口 → 行集（唯一换算经 hexViewport） ──
  const range = computed(() =>
    visibleRowRange(scrollTop.value, viewportHeight.value, totalRows.value, OVERSCAN_ROWS)
  )

  /**
   * 逻辑区间 → 字节（同步组合 journal.describe 片段：edit 直取、base 经
   * 已加载窗口切片）。任一 base 片段所在窗口未加载 → null（行渲染占位，
   * 走既有按需预取）。不变量：单行 16 字节不跨 64K 窗口（窗对齐且 16|64K）。
   */
  function readLogicalSync(offset: number, length: number): Uint8Array | null {
    if (length <= 0 || offset < 0 || offset + length > journal.logicalSize) return null
    const out = new Uint8Array(length)
    let position = 0
    for (const piece of journal.describe(offset, length)) {
      if (piece.kind === 'edit') {
        out.set(piece.bytes, position)
        position += piece.bytes.length
        continue
      }
      const win = cache.peek(piece.start)
      if (!win) return null
      const relative = piece.start - win.start
      out.set(win.bytes.subarray(relative, relative + piece.length), position)
      position += piece.length
    }
    return position === length ? out : null
  }

  /**
   * 逻辑区间 → 字节（异步版）：base 片段所在窗口未加载时先经 cache.get
   * 取数（查找/替换的全文档扫描用），再走同步组合。失败返回 null。
   */
  async function readLogicalAsync(offset: number, length: number): Promise<Uint8Array | null> {
    if (length <= 0 || offset < 0 || offset + length > journal.logicalSize) return null
    for (const piece of journal.describe(offset, length)) {
      if (piece.kind !== 'base' || cache.has(piece.start)) continue
      fetching.value++
      try {
        await cache.get(piece.start)
        loadedRevision.value++
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        return null
      } finally {
        fetching.value--
      }
    }
    return readLogicalSync(offset, length)
  }

  const rows = computed<HexRowView[]>(() => {
    void loadedRevision.value // 依赖缓存落定
    void editRevision.value  // 依赖编辑/撤销/重做
    const out: HexRowView[] = []
    const { bufferFirst, bufferLast } = range.value
    for (let row = bufferFirst; row <= bufferLast; row++) {
      const offset = rowToOffset(row)
      const length = Math.min(BYTES_PER_ROW, journal.logicalSize - offset)
      const bytes = length > 0 ? readLogicalSync(offset, length) : null
      if (bytes) {
        const hexRow = bytesToHexRows(bytes, offset)[0]
        out.push({ row, top: rowTop(row), offset, loaded: true, hex: hexRow.hex, ascii: hexRow.ascii })
      } else {
        out.push({ row, top: rowTop(row), offset, loaded: false, hex: [], ascii: '' })
      }
    }
    return out
  })

  /** 可视区间内未加载窗口的按需预取（在途合并由缓存承担）。 */
  async function ensureRangeLoaded(): Promise<void> {
    const { first, last } = range.value
    if (totalRows.value === 0) return
    const targets = new Set<number>([rowToOffset(first), rowToOffset(last)])
    for (const offset of targets) {
      if (cache.has(offset)) continue
      fetching.value++
      try {
        await cache.get(offset)
        loadedRevision.value++
      } catch (err) {
        // 异常点：保留已加载行集，就地呈现错误
        error.value = err instanceof Error ? err.message : String(err)
        log.warn('window fetch failed', { offset, error: error.value })  // 异常
      } finally {
        fetching.value--
      }
    }
  }

  watch(range, () => { void ensureRangeLoaded() }, { immediate: true })

  // ── 滚动（rAF 合帧；scrollTop 更新驱动 range/rows 重算） ──
  let scrollFrame: number | null = null
  function onScroll(top: number, height: number): void {
    viewportHeight.value = height
    if (scrollFrame !== null) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null
      scrollTop.value = top
    })
  }

  // ── 偏移跳转（目标为逻辑文档偏移；支持 +0x20 / -16 相对当前光标） ──────────

  /** 跳转历史（浏览器式：back/forward 不压栈，新跳转截断前向分支）。 */
  const jumpHistory = ref<number[]>([])
  const jumpHistoryIndex = ref(-1)

  function pushJumpHistory(offset: number): void {
    if (jumpHistoryIndex.value >= 0 && jumpHistory.value[jumpHistoryIndex.value] === offset) return
    jumpHistory.value = jumpHistory.value.slice(0, jumpHistoryIndex.value + 1)
    jumpHistory.value.push(offset)
    jumpHistoryIndex.value = jumpHistory.value.length - 1
  }

  function jumpBack(): void {
    if (jumpHistoryIndex.value <= 0) return
    jumpHistoryIndex.value--
    void navigateTo(jumpHistory.value[jumpHistoryIndex.value], { history: false })
  }

  function jumpForward(): void {
    if (jumpHistoryIndex.value >= jumpHistory.value.length - 1) return
    jumpHistoryIndex.value++
    void navigateTo(jumpHistory.value[jumpHistoryIndex.value], { history: false })
  }

  async function jumpTo(text: string): Promise<void> {
    const base = cursor.value?.offset ?? 0
    const parsed = parseOffsetInput(text, journal.logicalSize, base)
    if (!parsed.ok) {
      jumpNotice.value = parsed.error
      return
    }
    jumpNotice.value = parsed.clamped
      ? `已钳制到${parsed.offset === journal.logicalSize - 1 ? '文件末尾' : '文件头'} 0x${parsed.offset.toString(16)}`
      : null
    log.info('jump', { input: text.trim(), offset: parsed.offset, relative: parsed.relative, clamped: parsed.clamped })  // 入口
    await navigateTo(parsed.offset, { jumpRow: true })
  }

  /**
   * 统一导航入口（跳转/历史/匹配跳转共用）：按需预取窗口 → 光标落位 →
   * 居中滚动；jumpRow 置跳转高亮；history 压入跳转历史（默认压）。
   */
  async function navigateTo(offset: number, opts?: { jumpRow?: boolean; history?: boolean }): Promise<void> {
    const target = clampOffset(offset, journal.logicalSize)
    if (!cache.has(target)) {
      fetching.value++
      try {
        await cache.get(target)
        loadedRevision.value++
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        return
      } finally {
        fetching.value--
      }
    }
    cursor.value = { offset: target, nibble: 0, region: 'hex' }
    anchorOffset.value = null
    const row = offsetToRow(target)
    if (opts?.jumpRow) jumpRow.value = row
    if (opts?.history !== false) pushJumpHistory(target)
    pendingScroll.value = { top: scrollTopToCenter(row, viewportHeight.value) }
  }

  /** View 完成滚动后调用，清掉请求态。 */
  function scrollHandled(): void {
    pendingScroll.value = null
  }

  // ── 字节级光标与选区 ──────────────────────────────────────────────────────

  /**
   * 落位光标（点击/拖选/键盘共用的唯一写入口）。
   * extend：保留锚点扩选（锚点为空时以当前光标为锚）；非 extend 清空选区。
   */
  function placeCursor(offset: number, opts?: { extend?: boolean; region?: HexRegion }): void {
    if (journal.logicalSize === 0) return
    const prevOffset = cursor.value?.offset ?? null
    const region = opts?.region ?? cursor.value?.region ?? 'hex'
    if (opts?.extend && prevOffset !== null) {
      if (anchorOffset.value === null) anchorOffset.value = prevOffset
    } else {
      anchorOffset.value = null
    }
    cursor.value = { offset: clampOffset(offset, journal.logicalSize), nibble: 0, region }
    ensureCursorVisible()
  }

  /** 键盘移动意图 → 换算 + 落位（光标为空时自 0 起步）。 */
  function moveCursor(move: CursorMove, extend: boolean): void {
    if (journal.logicalSize === 0) return
    const from = cursor.value?.offset ?? 0
    const next = cursorAfterMove(from, move, {
      size: journal.logicalSize,
      bytesPerRow: BYTES_PER_ROW,
      pageRows: Math.max(1, Math.floor(viewportHeight.value / ROW_HEIGHT))
    })
    placeCursor(next, { extend })
  }

  /** 清空选区（光标留在原位）。 */
  function clearSelection(): void {
    anchorOffset.value = null
  }

  /** 全选（锚点 0 → 光标末字节；Cmd/Ctrl+A）。 */
  function selectAll(): void {
    if (journal.logicalSize === 0) return
    anchorOffset.value = 0
    cursor.value = { offset: journal.logicalSize - 1, nibble: 0, region: 'hex' }
    ensureCursorVisible()
  }

  // ── 安全编辑（nibble/ASCII 输入、Insert/Overwrite、粘贴；修改只进 journal） ──

  /** 编辑模式：overwrite 覆写 / insert 插入（后续字节右移）。 */
  const editMode = ref<'overwrite' | 'insert'>('overwrite')
  /** 粘贴校验/截断提示（就地反馈；下次输入清除）。 */
  const pasteNotice = ref<string | null>(null)

  /** Insert 键 / 徽章点击切换编辑模式。 */
  function toggleEditMode(): void {
    editMode.value = editMode.value === 'overwrite' ? 'insert' : 'overwrite'
  }

  /**
   * Hex 区 nibble 输入：半字节组装修改整字节。覆写模式 coalesce 合并连续
   * 输入为单条 Undo；插入模式高 nibble 先落新字节（低 4 位 0）、低 nibble
   * 补全。值未变只前进光标不记操作；字节未加载返回 false。
   */
  function inputNibble(char: string): boolean {
    const cur = cursor.value
    if (cur === null || cur.region !== 'hex') return false
    const value = Number.parseInt(char, 16)
    if (!Number.isInteger(value) || value < 0 || value > 15) return false
    anchorOffset.value = null  // 输入即清选区
    pasteNotice.value = null
    if (editMode.value === 'insert' && cur.nibble === 0) {
      // 插入模式高 nibble：落一个新字节（低 4 位 0），光标进低 nibble
      journal.insert(cur.offset, new Uint8Array([value << 4]))
      editRevision.value++
      cursor.value = { ...cur, nibble: 1 }
      return true
    }
    const bytes = readLogicalSync(cur.offset, 1)
    if (!bytes) return false
    const old = bytes[0]
    const next = cur.nibble === 0 ? (old & 0x0f) | (value << 4) : (old & 0xf0) | value
    if (next !== old) {
      journal.overwrite(cur.offset, new Uint8Array([next]), { coalesce: editMode.value === 'overwrite' })
      editRevision.value++
      log.info('nibble input', { offset: cur.offset, from: old, to: next })  // 入口
    }
    // 高 → 低 nibble；低 → 下一字节高 nibble
    if (cur.nibble === 0) {
      cursor.value = { ...cur, nibble: 1 }
    } else {
      cursor.value = { offset: clampOffset(cur.offset + 1, journal.logicalSize), nibble: 0, region: cur.region }
      ensureCursorVisible()
    }
    return true
  }

  /** ASCII 区整字节输入（可打印 Latin-1 字符），覆写/插入随模式，光标右移。 */
  function inputAscii(char: string): boolean {
    const cur = cursor.value
    if (cur === null || cur.region !== 'ascii') return false
    const code = char.charCodeAt(0)
    if (char.length !== 1 || code < 0x20 || code > 0xff) return false
    const bytes = readLogicalSync(cur.offset, 1)
    if (!bytes) return false
    anchorOffset.value = null
    pasteNotice.value = null
    if (editMode.value === 'insert') {
      journal.insert(cur.offset, new Uint8Array([code]))
      editRevision.value++
      log.info('ascii input', { offset: cur.offset, to: code, mode: 'insert' })  // 入口
    } else if (bytes[0] !== code) {
      journal.overwrite(cur.offset, new Uint8Array([code]), { coalesce: true })
      editRevision.value++
      log.info('ascii input', { offset: cur.offset, to: code })  // 入口
    }
    cursor.value = { offset: clampOffset(cur.offset + 1, journal.logicalSize), nibble: 0, region: 'ascii' }
    ensureCursorVisible()
    return true
  }

  /**
   * 多字节粘贴（scroller paste 事件）：Hex 区接受空白分隔的偶数位 hex
   * 串；ASCII 区接受 Latin-1 文本。非法输入就地报错（pasteNotice）且
   * 不落地任何字节；覆写模式超出文件尾自动截断并提示。
   */
  function pasteText(text: string): boolean {
    const cur = cursor.value
    if (cur === null || text.length === 0) return false
    anchorOffset.value = null
    let bytes: Uint8Array
    if (cur.region === 'hex') {
      const compact = text.replace(/\s+/g, '')
      const bad = compact.match(/[^0-9a-fA-F]/)
      if (bad) {
        pasteNotice.value = `非法字符 “${bad[0]}”（Hex 区仅支持 0-9 A-F 与空白分隔）`
        return false
      }
      if (compact.length === 0) {
        pasteNotice.value = '粘贴内容无有效字节'
        return false
      }
      if (compact.length % 2 !== 0) {
        pasteNotice.value = '十六进制位数须为偶数（如 41 2A / 412A）'
        return false
      }
      bytes = new Uint8Array(compact.length / 2)
      for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(compact.slice(i * 2, i * 2 + 2), 16)
      if (editMode.value === 'overwrite' && cur.offset + bytes.length > journal.logicalSize) {
        bytes = bytes.subarray(0, journal.logicalSize - cur.offset)
        pasteNotice.value = `已截断至文件末尾（粘贴 ${bytes.length} 字节）`
      }
    } else {
      const codes: number[] = []
      for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0
        if (code > 0xff) {
          pasteNotice.value = `字符 “${ch}” 超出 Latin-1 范围，无法按字节粘贴`
          return false
        }
        codes.push(code)
      }
      bytes = new Uint8Array(codes)
    }
    if (bytes.length === 0) return false
    if (editMode.value === 'insert') journal.insert(cur.offset, bytes)
    else journal.overwrite(cur.offset, bytes)
    editRevision.value++
    log.info('paste', { offset: cur.offset, bytes: bytes.length, mode: editMode.value })  // 入口
    cursor.value = { offset: clampOffset(cur.offset + bytes.length, journal.logicalSize), nibble: 0, region: cur.region }
    ensureCursorVisible()
    return true
  }

  /** 撤销（光标落到该操作起点，清选区）。 */
  function undoEdit(): boolean {
    const op = journal.undo()
    if (!op) return false
    editRevision.value++
    anchorOffset.value = null
    cursor.value = { offset: clampOffset(op.offset, journal.logicalSize), nibble: 0, region: cursor.value?.region ?? 'hex' }
    ensureCursorVisible()
    log.info('undo', { type: op.type, offset: op.offset })  // 出口
    return true
  }

  /** 重做（光标落到该操作起点，清选区）。 */
  function redoEdit(): boolean {
    const op = journal.redo()
    if (!op) return false
    editRevision.value++
    anchorOffset.value = null
    cursor.value = { offset: clampOffset(op.offset, journal.logicalSize), nibble: 0, region: cursor.value?.region ?? 'hex' }
    ensureCursorVisible()
    log.info('redo', { type: op.type, offset: op.offset })  // 出口
    return true
  }

  // ── 保存（编辑净效果片段 → fs:saveHexFile 流式原子写） ──────────────────────

  const saveState = ref<'idle' | 'saving'>('idle')
  const saveError = ref<string | null>(null)

  /** 逻辑文档净效果 → IPC 片段（edit 字节 base64；量 ∝ 编辑量非文件大小）。 */
  function exportSavePieces(): HexSavePiece[] {
    return journal.describe(0, journal.logicalSize).map(piece =>
      piece.kind === 'base'
        ? { kind: 'base', start: piece.start, length: piece.length }
        : { kind: 'edit', base64: encodeBase64(piece.bytes) }
    )
  }

  /** 保存（Cmd/Ctrl+S）：无修改直通；成功后 markSaved（脏状态清零）。 */
  async function saveFile(): Promise<boolean> {
    if (saveState.value === 'saving') return false
    if (!journal.isModified) return true
    saveState.value = 'saving'
    saveError.value = null
    try {
      const result = await window.fileman.saveHexFile(deviceId, file.path, exportSavePieces())
      journal.markSaved()
      editRevision.value++
      log.info('save ok', { bytesWritten: result.bytesWritten })  // 出口
      return true
    } catch (err) {
      // 异常点：就地呈现，journal 不动（可重试保存或继续编辑）
      saveError.value = err instanceof Error ? err.message : String(err)
      log.warn('save failed', { error: saveError.value })  // 异常
      return false
    } finally {
      saveState.value = 'idle'
    }
  }

  /** 光标行离开可视区 → 请求 View 最小滚动（已在视口内则不动）。 */
  function ensureCursorVisible(): void {
    const offset = cursor.value?.offset
    if (offset === undefined) return
    const top = scrollTopToShow(offsetToRow(offset), scrollTop.value, viewportHeight.value)
    if (top >= 0) pendingScroll.value = { top }
  }

  // ── 查找与替换（Hex 含 '?' nibble 通配 / 文本 UTF-8；全文档逻辑扫描） ────────

  const findBarVisible = ref(false)
  const replaceVisible = ref(false)
  const findMode = ref<'hex' | 'text'>('hex')
  const findQuery = ref('')
  const replaceQuery = ref('')
  const findMatches = ref<number[]>([])
  const findMatchIndex = ref(-1)
  /** 当前模式字节长度（匹配选区/替换长度用）。 */
  const findPatternLength = ref(0)
  const searching = ref(false)
  const findNotice = ref<string | null>(null)
  /** 全部替换前确认条：待替换处数（null = 无待确认）。 */
  const replaceConfirmCount = ref<number | null>(null)

  /** 匹配偏移集合（View 字节级黄底高亮用，O(1) 查询）。 */
  const matchSet = computed<Set<number>>(() => new Set(findMatches.value))

  /** 匹配计数标签：`3/17` / `0/0` / 搜索中…。 */
  const matchCountLabel = computed(() => {
    if (searching.value) return '搜索中…'
    if (findMatches.value.length === 0) return findQuery.value.trim().length > 0 ? '0/0' : ''
    return `${findMatchIndex.value + 1}/${findMatches.value.length}`
  })

  /** 打开查找条；有选区时预填其 Hex（作为查找起点最自然）。 */
  function openFindBar(): void {
    findBarVisible.value = true
    const sel = selection.value
    if (sel && sel.length <= 64) {
      const bytes = readLogicalSync(sel.start, sel.length)
      if (bytes) findQuery.value = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(' ')
    }
  }

  function closeFindBar(): void {
    findBarVisible.value = false
    replaceVisible.value = false
    replaceConfirmCount.value = null
    findNotice.value = null
    anchorOffset.value = null  // 清除匹配选区（光标保留）
  }

  function toggleFindMode(): void {
    findMode.value = findMode.value === 'hex' ? 'text' : 'hex'
    findNotice.value = null
  }

  function buildPattern(): NibblePattern[] | null {
    const result = findMode.value === 'hex' ? parseHexPattern(findQuery.value) : textToPattern(findQuery.value)
    if ('error' in result) {
      findNotice.value = result.error
      return null
    }
    findNotice.value = null
    return result.pattern
  }

  /** 全文档分块扫描（块尾重叠 pattern−1 防漏；lastEnd 非重叠去重）。 */
  async function runFind(): Promise<void> {
    const pattern = buildPattern()
    if (!pattern) {
      findMatches.value = []
      findMatchIndex.value = -1
      findPatternLength.value = 0
      return
    }
    findPatternLength.value = pattern.length
    searching.value = true
    try {
      const found: number[] = []
      let lastEnd = 0
      const size = journal.logicalSize
      if (pattern.length <= size) {
        const CHUNK = 256 * 1024
        let offset = 0
        while (offset < size) {
          const length = Math.min(CHUNK, size - offset)
          const data = await readLogicalAsync(offset, length)
          if (!data) throw new Error('查找中断：数据加载失败')
          for (const hit of findMatchesInChunk(data, pattern, offset, lastEnd)) {
            found.push(hit)
            lastEnd = hit + pattern.length
          }
          offset += Math.max(1, length - (pattern.length - 1))
        }
      }
      findMatches.value = found
      findMatchIndex.value = found.length > 0 ? 0 : -1
      findNotice.value = found.length === 0 ? '未找到匹配' : null
      if (found.length > 0) revealMatch(0, false)
    } catch (err) {
      findNotice.value = err instanceof Error ? err.message : String(err)
      findMatches.value = []
      findMatchIndex.value = -1
    } finally {
      searching.value = false
    }
  }

  /** 呈现第 index 个匹配：选区覆盖匹配范围 + 居中（入跳转历史可选）。 */
  function revealMatch(index: number, history = true): void {
    const offset = findMatches.value[index]
    if (offset === undefined) return
    findMatchIndex.value = index
    anchorOffset.value = offset
    cursor.value = { offset: clampOffset(offset + findPatternLength.value - 1, journal.logicalSize), nibble: 0, region: 'hex' }
    pendingScroll.value = { top: scrollTopToCenter(offsetToRow(offset), viewportHeight.value) }
    if (history) pushJumpHistory(offset)
  }

  function nextMatch(): void {
    if (findMatches.value.length === 0) return
    revealMatch((findMatchIndex.value + 1) % findMatches.value.length)
  }

  function prevMatch(): void {
    if (findMatches.value.length === 0) return
    revealMatch((findMatchIndex.value - 1 + findMatches.value.length) % findMatches.value.length)
  }

  /** 替换字节序列（Hex 不支持通配；文本按 UTF-8）。 */
  function buildReplaceBytes(): Uint8Array | null {
    if (findMode.value === 'hex') {
      if (replaceQuery.value.includes('?')) {
        findNotice.value = '替换内容不支持 ? 通配'
        return null
      }
      const parsed = parseHexPattern(replaceQuery.value)
      if ('error' in parsed) {
        findNotice.value = `替换内容非法：${parsed.error}`
        return null
      }
      return Uint8Array.from(parsed.pattern, p => ((p.hi ?? 0) << 4) | (p.lo ?? 0))
    }
    return new TextEncoder().encode(replaceQuery.value)
  }

  /** 应用替换（等长覆写一条 op；变长 delete+insert 两条 op）。 */
  function applyReplace(offset: number, oldLen: number, newBytes: Uint8Array): void {
    if (newBytes.length === oldLen) {
      journal.overwrite(offset, newBytes)
    } else {
      journal.delete(offset, oldLen)
      journal.insert(offset, newBytes)
    }
    editRevision.value++
  }

  /** 替换当前匹配并重扫。 */
  async function replaceCurrent(): Promise<void> {
    if (findMatchIndex.value < 0) return
    const newBytes = buildReplaceBytes()
    if (!newBytes) return
    const offset = findMatches.value[findMatchIndex.value]
    if (offset === undefined) return
    applyReplace(offset, findPatternLength.value, newBytes)
    await runFind()
    findNotice.value = `已替换 1 处`
  }

  /** 请求全部替换：先弹确认条（N 处）。 */
  function requestReplaceAll(): void {
    if (findMatches.value.length === 0) return
    if (!buildReplaceBytes()) return
    replaceConfirmCount.value = findMatches.value.length
  }

  /** 确认全部替换：从后往前（低偏移匹配不受高偏移变长替换影响）。 */
  async function confirmReplaceAll(): Promise<void> {
    const count = replaceConfirmCount.value
    replaceConfirmCount.value = null
    if (!count) return
    const newBytes = buildReplaceBytes()
    if (!newBytes) return
    for (let i = findMatches.value.length - 1; i >= 0; i--) {
      applyReplace(findMatches.value[i], findPatternLength.value, newBytes)
    }
    await runFind()
    findNotice.value = `已替换 ${count} 处`
  }

  function cancelReplaceAll(): void {
    replaceConfirmCount.value = null
  }

  /** 行点击兜底（偏移列/占位行）：光标落行首。 */
  function selectRow(row: number): void {
    placeCursor(rowToOffset(clampRowSafe(row)))
  }

  function clampRowSafe(row: number): number {
    return Number.isFinite(row) && row >= 0 ? Math.min(row, Math.max(totalRows.value - 1, 0)) : 0
  }

  /** 光标行（行背景/行标题联动；无光标为 null）。 */
  const cursorRow = computed<number | null>(() =>
    cursor.value === null ? null : offsetToRow(cursor.value.offset)
  )

  /** 光标字节偏移（View 字节样式判断用）。 */
  const cursorOffset = computed<number | null>(() => cursor.value?.offset ?? null)

  /** 规范选区（闭区间；无选区为 null）。 */
  const selection = computed<SelectionRange | null>(() =>
    selectionRange(anchorOffset.value, cursor.value?.offset ?? null)
  )

  /** 选区标签：`start–end · N B`（无选区为 null）。 */
  const selectionLabel = computed<string | null>(() => {
    const sel = selection.value
    return sel ? `${formatOffset(sel.start)}–${formatOffset(sel.end)} · ${sel.length} B` : null
  })

  // ── 光标/选区 → Inspector 解读（选区优先取首字节；数据 = 逻辑文档） ──
  const inspectorOffset = computed<number | null>(() =>
    selection.value ? selection.value.start : cursorOffset.value
  )

  const inspector = computed<InspectorEntry[]>(() => {
    void loadedRevision.value
    void editRevision.value
    const offset = inspectorOffset.value
    if (offset === null) return []
    const bytes = readLogicalSync(offset, Math.min(8, journal.logicalSize - offset))
    if (!bytes) return []
    return interpretAt(bytes, 0)
  })

  const cursorLabel = computed(() => {
    const offset = cursorOffset.value
    return offset === null ? null : formatOffset(offset)
  })

  /** 占位总高：真实总行数 × 行高（滚动条覆盖整个文件）。 */
  const contentHeight = computed(() => totalRows.value * ROW_HEIGHT)

  return {
    totalRows, rows, contentHeight, range,
    error, fetching,
    cursorRow, cursorOffset, cursorLabel, selection, selectionLabel, inspector, inspectorOffset,
    jumpRow, jumpNotice, pendingScroll,
    jumpHistory, jumpHistoryIndex,
    canJumpBack: computed(() => jumpHistoryIndex.value > 0),
    canJumpForward: computed(() => jumpHistoryIndex.value >= 0 && jumpHistoryIndex.value < jumpHistory.value.length - 1),
    isModified: computed(() => { void editRevision.value; return journal.isModified }),
    canUndo: computed(() => { void editRevision.value; return journal.canUndo }),
    canRedo: computed(() => { void editRevision.value; return journal.canRedo }),
    onScroll, jumpTo, scrollHandled, selectRow, jumpBack, jumpForward,
    placeCursor, moveCursor, clearSelection, selectAll,
    editMode, toggleEditMode, pasteNotice,
    inputNibble, inputAscii, pasteText, undoEdit, redoEdit,
    saveState, saveError, saveFile,
    findBarVisible, replaceVisible, findMode, findQuery, replaceQuery,
    findMatches, findMatchIndex, matchSet, matchCountLabel, searching, findNotice, replaceConfirmCount,
    openFindBar, closeFindBar, toggleFindMode, runFind, nextMatch, prevMatch,
    replaceCurrent, requestReplaceAll, confirmReplaceAll, cancelReplaceAll
  }
}
