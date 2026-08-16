/**
 * HexWindowCache — 最小断言 harness（QA-5 健壮性）。
 * fetcher 注入内存函数：覆盖对齐/在途合并/LRU 驱逐/失败不留半成品/截尾。
 * （esbuild CJS 输出不支持顶层 await，测试体包在 async main 内。）
 */

import assert from 'node:assert/strict'
import { HexWindowCache } from '../src/utils/hexWindowCache'

/** 构造测试 fetcher：返回 [start, start+length) 的字节序列，可统计调用。 */
function makeFetcher() {
  const calls: Array<{ offset: number; length: number }> = []
  const fetcher = async (offset: number, length: number): Promise<Uint8Array> => {
    calls.push({ offset, length })
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i++) bytes[i] = (offset + i) % 251
    return bytes
  }
  return { fetcher, calls }
}

const KB = 1024

async function main(): Promise<void> {
  // ============ 对齐与窗口内容 ============

  {
    const { fetcher } = makeFetcher()
    const cache = new HexWindowCache({ fetcher, fileSize: 100 * KB, windowBytes: 4 * KB, capacity: 2 })
    // offset 5000 → 窗口 4096..8192
    const win = await cache.get(5000)
    assert.equal(win.length, 4 * KB)
    assert.equal(win[0], 4096 % 251)
    assert.ok(!cache.has(0))
    assert.ok(cache.has(5001))
    const peeked = cache.peek(6000)
    assert.ok(peeked && peeked.start === 4096)
  }

  // ============ 同窗在途合并 ============

  {
    const { fetcher, calls } = makeFetcher()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const slowFetcher = async (offset: number, length: number) => {
      await gate // 两个并发 get 都在途时才放行
      return fetcher(offset, length)
    }
    const cache = new HexWindowCache({ fetcher: slowFetcher, fileSize: 10 * KB, windowBytes: 4 * KB, capacity: 4 })

    const p1 = cache.get(100)
    const p2 = cache.get(200) // 同窗（0..4096）
    release()
    const [w1, w2] = await Promise.all([p1, p2])
    assert.equal(w1, w2, '同窗在途共享同一结果')
    // 慢 fetcher 只被调用一次（合并生效）
    assert.equal(calls.filter(c => c.offset === 0).length, 1)
    // 落定后再取走缓存，不触发新调用
    const before = calls.length
    await cache.get(4095)
    assert.equal(calls.length, before)
  }

  // ============ LRU 驱逐 ============

  {
    const { fetcher, calls } = makeFetcher()
    const cache = new HexWindowCache({ fetcher, fileSize: 100 * KB, windowBytes: 4 * KB, capacity: 2 })
    await cache.get(0)       // 窗 A
    await cache.get(4096)    // 窗 B
    await cache.get(0)       // 触碰 A（B 变最旧）
    await cache.get(8192)    // 窗 C → 驱逐 B
    assert.equal(cache.size, 2)
    assert.ok(cache.has(0), 'A 保留（最近使用）')
    assert.ok(!cache.has(4096), 'B 被驱逐')
    assert.ok(cache.has(8192), 'C 在缓存')
    assert.ok(calls.some(c => c.offset === 4096)) // B 曾被真实取过
  }

  // ============ 失败不留半成品 ============

  {
    let fail = true
    const calls: number[] = []
    const cache = new HexWindowCache({
      fileSize: 10 * KB,
      windowBytes: 4 * KB,
      capacity: 2,
      fetcher: async offset => {
        calls.push(offset)
        if (fail) throw new Error('boom')
        return new Uint8Array(4 * KB)
      }
    })
    await assert.rejects(() => cache.get(0), /读取窗口 0x0 失败/)
    assert.ok(!cache.has(0), '失败不落缓存')
    // 在途表已清：重试会真正再调 fetcher（而非复用已 reject 的 Promise）
    fail = false
    await cache.get(0)
    assert.equal(calls.length, 2, '失败后重试重新发起')
    assert.ok(cache.has(0))
  }

  // ============ 尾窗截尾 ============

  {
    const { fetcher, calls } = makeFetcher()
    const cache = new HexWindowCache({ fetcher, fileSize: 10 * KB + 100, windowBytes: 4 * KB, capacity: 2 })
    // fileSize=10340：尾偏移 10339 属于窗口 8192..10340 → 截尾为 2148 字节
    const tail = await cache.get(10 * KB)
    assert.equal(tail.length, 2148, '尾窗截尾到文件末尾')
    assert.equal(calls[0].offset, 8192, 'fetcher 收到对齐窗口起点')
    assert.equal(calls[0].length, 2148, 'fetcher 收到截尾长度')
    assert.equal(cache.peek(10339)?.start, 8192)
  }

  // ============ 空文件防御 ============

  {
    const cache = new HexWindowCache({ fileSize: 0, fetcher: async () => new Uint8Array(0) })
    assert.equal(cache.align(0), 0)
    assert.ok(!cache.has(0))
  }

  console.log('✓ HexWindowCache 窗口缓存测试全部通过')
}

void main()
