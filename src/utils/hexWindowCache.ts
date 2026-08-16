/**
 * HexWindowCache —— hex 视图的窗口化字节缓存（infrastructure）。
 *
 * 以 windowBytes 对齐窗口为单位向注入的 fetcher 取数、解码 base64、
 * LRU 缓存与同窗在途合并。fetcher 构造注入（DIP）：单测传内存函数，
 * 生产传 readChunk 包装。
 *
 * 不变量：
 *  - get(offset) 返回**含该 offset 的整窗**，长度 = min(windowBytes, fileSize - alignedStart) ≥ 1；
 *  - 同窗口在途 get 共享同一 Promise（不重复请求）；
 *  - fetcher 失败：在途表清除、缓存不留半成品，错误原样透传（信息含窗口起始）；
 *  - LRU 容量 capacity，get 命中即触碰（移到最旧端驱逐）。
 * 返回的 Uint8Array 视为不可变（消费方不得改写）。
 */

/** 结构化打点（关键节点：出口/异常；仓库 console 惯例）。 */
const log = {
  info: (message: string, ...args: unknown[]) => console.log(`[HexWindowCache] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[HexWindowCache] ${message}`, ...args)
}

export type WindowFetcher = (offset: number, length: number) => Promise<Uint8Array>

export interface HexWindowCacheOptions {
  fetcher: WindowFetcher
  fileSize: number
  windowBytes?: number
  capacity?: number
}

const DEFAULT_WINDOW_BYTES = 64 * 1024
const DEFAULT_CAPACITY = 4

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export class HexWindowCache {
  private readonly fetcher: WindowFetcher
  private readonly fileSize: number
  private readonly windowBytes: number
  private readonly capacity: number
  /** 已落地的窗口：start → bytes（Map 插入序即 LRU 序，新者靠后）。 */
  private readonly settled = new Map<number, Uint8Array>()
  /** 在途窗口：start → 共享 Promise（含解码；落定后迁入 settled）。 */
  private readonly inflight = new Map<number, Promise<Uint8Array>>()

  constructor(options: HexWindowCacheOptions) {
    this.fetcher = options.fetcher
    this.fileSize = Math.max(0, options.fileSize)
    this.windowBytes = options.windowBytes ?? DEFAULT_WINDOW_BYTES
    this.capacity = options.capacity ?? DEFAULT_CAPACITY
  }

  /** 任意偏移 → 其所属窗口的起始偏移。 */
  align(offset: number): number {
    return Math.floor(Math.max(0, offset) / this.windowBytes) * this.windowBytes
  }

  /** 窗口字节数（消费方按窗分段读取用；构造后不变）。 */
  get windowBytesValue(): number {
    return this.windowBytes
  }

  /** 同步探测：该偏移所在窗口是否已加载（渲染层判断占位用）。 */
  has(offset: number): boolean {
    return this.settled.has(this.align(offset))
  }

  /** 同步取已加载窗口（未命中返回 undefined）。 */
  peek(offset: number): { start: number; bytes: Uint8Array } | undefined {
    const start = this.align(offset)
    const bytes = this.settled.get(start)
    return bytes ? { start, bytes } : undefined
  }

  /** 取含该 offset 的整窗（在途合并 + LRU）。前置：offset < fileSize。 */
  async get(offset: number): Promise<Uint8Array> {
    const start = this.align(offset)
    const cached = this.settled.get(start)
    if (cached) {
      // LRU 触碰：删除重插，保持插入序 = 新旧序
      this.settled.delete(start)
      this.settled.set(start, cached)
      return cached
    }
    const pending = this.inflight.get(start)
    if (pending) return pending

    const length = Math.max(1, Math.min(this.windowBytes, this.fileSize - start))
    const promise = this.fetcher(start, length)
      .then(bytes => {
        log.info('window fetched', { start, length: bytes.length })  // 出口
        this.settled.set(start, bytes)
        while (this.settled.size > this.capacity) {
          const oldest = this.settled.keys().next().value as number
          this.settled.delete(oldest)
        }
        this.inflight.delete(start)
        return bytes
      })
      .catch(error => {
        // 异常：清在途、不留半成品，错误带窗口上下文后透传
        log.warn('window fetch failed', { start, error: error instanceof Error ? error.message : String(error) })
        this.inflight.delete(start)
        throw new Error(`读取窗口 0x${start.toString(16)} 失败：${error instanceof Error ? error.message : String(error)}`)
      })
    this.inflight.set(start, promise)
    return promise
  }

  /** 供单测/调试：当前已缓存窗口数。 */
  get size(): number {
    return this.settled.size
  }
}

export { decodeBase64 }
