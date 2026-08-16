import { computed, ref, watch } from 'vue'
import type { FileInfo } from '@/types'
import { bytesToHexRows, formatOffset, interpretAt, parseOffsetInput, type InspectorEntry } from '@/utils/hexFormat'
import { HexWindowCache, decodeBase64 } from '@/utils/hexWindowCache'
import {
  OVERSCAN_ROWS,
  ROW_HEIGHT,
  offsetToRow,
  rowTop,
  rowToOffset,
  scrollTopToCenter,
  visibleRowRange
} from '@/utils/hexViewport'

/** 结构化打点（关键节点：入口/出口/异常/外部调用；仓库 console 惯例）。 */
const log = {
  info: (message: string, ...args: unknown[]) => console.log(`[HexViewer] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[HexViewer] ${message}`, ...args)
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
 * 职责：持有视口/光标/错误会话状态；编排窗口预取（在途合并经缓存）、
 * rAF 合帧滚动、跳转解析定位与选中行解读。坐标换算全部委托
 * hexViewport，数据获取全部委托 HexWindowCache —— 本层不自算坐标、
 * 不触 DOM（滚动目标是状态，滚动动作由 View 执行）。
 */
export function useHexViewer(file: FileInfo, deviceId: string) {
  const size = Math.max(0, file.size || 0)
  const totalRows = ref(size > 0 ? Math.ceil(size / 16) : 0)

  const scrollTop = ref(0)
  const viewportHeight = ref(600)
  /** 缓存落定计数：computed 行集依赖它以在窗口到达后刷新。 */
  const loadedRevision = ref(0)
  const error = ref<string | null>(null)
  const fetching = ref(0)
  const cursorRow = ref<number | null>(null)
  /** 跳转高亮行（限时清除由 View 定时器驱动或停留至下次跳转）。 */
  const jumpRow = ref<number | null>(null)
  /** 跳转解析错误（含钳制提示），就地在输入框下呈现。 */
  const jumpNotice = ref<string | null>(null)
  /** 请求 View 滚动到的行（View watch 后清回 null）。 */
  const pendingScrollRow = ref<number | null>(null)

  const cache = new HexWindowCache({
    fileSize: size,
    fetcher: async (offset, length) => {
      // 外部调用点：readChunk 通道（本地区间流/远程流式/非流式守卫在 main）
      const result = await window.fileman.readChunk(deviceId, file.path, offset, length)
      log.info('readChunk ok', { offset, length: result.bytesRead })  // 出口
      return decodeBase64(result.base64)
    }
  })

  log.info('open', { path: file.path, size, rows: totalRows.value })  // 入口

  // ── 视口 → 行集（唯一换算经 hexViewport） ──
  const range = computed(() =>
    visibleRowRange(scrollTop.value, viewportHeight.value, totalRows.value, OVERSCAN_ROWS)
  )

  const rows = computed<HexRowView[]>(() => {
    void loadedRevision.value // 依赖缓存落定
    const out: HexRowView[] = []
    const { bufferFirst, bufferLast } = range.value
    for (let row = bufferFirst; row <= bufferLast; row++) {
      const offset = rowToOffset(row)
      const win = cache.peek(offset)
      if (win) {
        const inWindow = offset - win.start
        const hexRow = bytesToHexRows(win.bytes.subarray(inWindow, inWindow + 16), offset)[0]
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

  // ── 偏移跳转 ──
  async function jumpTo(text: string): Promise<void> {
    const parsed = parseOffsetInput(text, size)
    if (!parsed.ok) {
      jumpNotice.value = parsed.error
      return
    }
    jumpNotice.value = parsed.clamped ? `已钳制到文件末尾 0x${parsed.offset.toString(16)}` : null
    const row = offsetToRow(parsed.offset)
    log.info('jump', { input: text.trim(), row, clamped: parsed.clamped })  // 入口
    if (!cache.has(parsed.offset)) {
      fetching.value++
      try {
        await cache.get(parsed.offset)
        loadedRevision.value++
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        return
      } finally {
        fetching.value--
      }
    }
    cursorRow.value = row
    jumpRow.value = row
    pendingScrollRow.value = row
  }

  /** View 完成滚动后调用，清掉请求态。 */
  function scrollHandled(): void {
    pendingScrollRow.value = null
  }

  // ── 选中行 → Inspector 解读 ──
  function selectRow(row: number): void {
    cursorRow.value = row
  }

  const inspector = computed<InspectorEntry[]>(() => {
    void loadedRevision.value
    const row = cursorRow.value
    if (row === null) return []
    const offset = rowToOffset(row)
    const win = cache.peek(offset)
    if (!win) return []
    return interpretAt(win.bytes, offset - win.start)
  })

  const cursorLabel = computed(() => {
    const row = cursorRow.value
    return row === null ? null : formatOffset(rowToOffset(row))
  })

  /** 占位总高：真实总行数 × 行高（滚动条覆盖整个文件）。 */
  const contentHeight = computed(() => totalRows.value * ROW_HEIGHT)

  return {
    totalRows, rows, contentHeight, range,
    error, fetching,
    cursorRow, cursorLabel, inspector,
    jumpRow, jumpNotice, pendingScrollRow,
    onScroll, jumpTo, scrollHandled, selectRow,
    scrollTopToCenter
  }
}
