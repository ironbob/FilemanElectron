import { expect, test } from '@playwright/test'

// Hex 预览回归：
// 1. .bin 文件预览 → hex 视图（偏移列 + hex 列 + ASCII 列）
// 2. readChunk 分块语义（offset/length 传递正确）
// 3. 头部显示文件大小与已加载区间

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'firmware.bin', path: '/fw/firmware.bin', isDirectory: false, isFile: true, size: 32, modifiedTime: '2026-08-15T10:00:00Z', extension: '.bin' },
        { name: 'notes.txt', path: '/fw/notes.txt', isDirectory: false, isFile: true, size: 19, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' },
        // 1MB 大文件：验证滚动条覆盖全文件（65536 行）
        { name: 'big.bin', path: '/fw/big.bin', isDirectory: false, isFile: true, size: 1024 * 1024, modifiedTime: '2026-08-15T10:00:00Z', extension: '.bin' }
      ],
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      readChunk: async (_d: string, path: string, offset: number, length: number) => {
        ;(window as any).__readChunkCalls = ((window as any).__readChunkCalls ?? []).concat([{ offset, length }])
        let slice: number[]; let fileSize: number
        if (path.includes('big.bin')) {
          // 大文件窗口：按 (offset+i)%251 填充可复算字节
          fileSize = 1024 * 1024
          slice = Array.from({ length: Math.min(length, fileSize - offset) }, (_, i) => (offset + i) % 251)
        } else {
          // "Hello, Hex View!\n" 的 UTF-8 字节（19 字节）+ 0x00 0xff
          const bytes = [72, 101, 108, 108, 111, 44, 32, 72, 101, 120, 32, 86, 105, 101, 119, 33, 10, 0, 255]
          fileSize = bytes.length
          slice = bytes.slice(offset, offset + length)
        }
        return { base64: btoa(String.fromCharCode(...slice)), bytesRead: slice.length, fileSize }
      },
      getStats: async () => ({ size: 19, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      exists: async () => true,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      volumes: { list: async () => [], onChanged: () => () => undefined },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 }
    }
    ;(window as any).fileman = new Proxy(api, {
      get(target, property) {
        if (property in target) return target[property as string]
        if (String(property).startsWith('on')) return () => () => undefined
        return async () => undefined
      }
    })
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: 'fw', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/fw', history: ['/fw'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  })
  await page.goto('/')
})

test('previewing a .bin file renders the hex view', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()

  // 偏移列 + 十六进制 + ASCII
  await expect(page.getByText('00000000').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('|Hello, Hex View!').first()).toBeVisible()
  // 0x00 与 0xff 显示为 . （ASCII 不可打印）
  await expect(page.getByText(/\.\./).first()).toBeVisible()

  // readChunk 首窗从 0 开始
  const calls = await page.evaluate(() => (window as any).__readChunkCalls)
  expect(calls[0].offset).toBe(0)
  expect(calls[0].length).toBeGreaterThan(0)
})

test('explicit entry forces hex view on a text file', async ({ page }) => {
  // 右键 .txt（扩展名推断本应是 text）→ 以十六进制查看 → 强制 hex
  await page.locator('[data-file-path="/fw/notes.txt"]').click({ button: 'right' })
  await page.locator('.context-menu .context-menu-item', { hasText: '以十六进制查看' }).click()

  await expect(page.getByText('00000000').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
  // 不出现 Monaco 文本编辑器（确实强制为 hex，而非扩展名推断的 text）
  await expect(page.locator('.monaco-editor')).toHaveCount(0)
})

// ── 成熟基线升级回归（2026-08-16 hex-viewer-baseline） ──────────────────────
// 4. 全文件滚动：占位高 = 真实总行数 × 22px（不再 5000 行封顶）
// 5. 偏移跳转：0x20 → 目标行居中高亮，光标标签更新
// 6. Data Inspector：点击行 → 该行首字节各类型解读（int8/uint8 立即可验）

const BIG_SIZE = 1024 * 1024 // 1MB → 65536 行 × 22px = 1,441,792px（5000 行封顶只会有 110,000px）

test('full-file scrollbar covers the entire file (no 5000-row cap)', async ({ page }) => {
  await page.locator('[data-file-path="/fw/big.bin"]').dblclick()
  await expect(page.getByText('00000000').first()).toBeVisible({ timeout: 5000 })

  const height = await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto.font-mono > div')
    return container ? (container as HTMLElement).offsetHeight : -1
  })
  expect(height).toBe(BIG_SIZE / 16 * 22) // 65536 行 × 22 = 1,441,792（旧实现只会 110,000）

  // DOM 行数有界：缓冲行集 ≪ 总行数（QA-1：与文件大小无关）
  const domRows = await page.evaluate(() => document.querySelectorAll('.overflow-y-auto.font-mono [style*="position: absolute"]').length)
  expect(domRows).toBeLessThan(120)
})

test('offset jump centers and highlights the target row', async ({ page }) => {
  // 大文件（1MB）：0x20 未越界，不触发钳制
  await page.locator('[data-file-path="/fw/big.bin"]').dblclick()
  await expect(page.getByText('00000000').first()).toBeVisible({ timeout: 5000 })

  const input = page.locator('input[placeholder*="0x1A2B"]')
  await input.fill('0x20')
  await input.press('Enter')

  // 目标行（offset 0x20 = 行 2）高亮（ring-accent-orange）+ 光标标签
  const targetRow = page.locator('[title="偏移 00000020"]')
  await expect(targetRow).toHaveClass(/ring-accent-orange/, { timeout: 5000 })
  await expect(page.getByText('光标 00000020')).toBeVisible()

  // 非法输入：就地报错不崩溃
  await input.fill('zz')
  await input.press('Enter')
  await expect(page.getByText(/无法识别/)).toBeVisible()

})

test('out-of-range jump clamps to the last byte with a notice', async ({ page }) => {
  // firmware.bin 声明 size=32：跳 0x64 → 钳到 0x1f（行 1，行首 0x10）并提示
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('00000000').first()).toBeVisible({ timeout: 5000 })
  const input = page.locator('input[placeholder*="0x1A2B"]')
  await input.fill('0x64')
  await input.press('Enter')
  await expect(page.getByText(/已钳制到文件末尾 0x1f/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('光标 00000010')).toBeVisible()
})

test('data inspector interprets the clicked row', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击首行（首字节 72='H'）
  await page.getByText('|Hello, Hex View!').first().click()
  const inspector = page.locator('aside')
  await expect(inspector.getByText('int8', { exact: true })).toBeVisible({ timeout: 5000 })
  await expect(inspector.getByText('72', { exact: true }).first()).toBeVisible()   // int8/uint8 均为 72
  await expect(inspector.getByText('uint8')).toBeVisible()
  await expect(inspector.getByText('float64 LE')).toBeVisible()            // 19 字节窗口 → 8 字节可用
})
