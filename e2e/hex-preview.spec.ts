import { expect, test, type Page } from '@playwright/test'

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
          // "Hello, Hex View!\n" 的 UTF-8 字节（19 字节）+ 0x00 0xff；
          // firmware.bin 声明 32 B → 尾部 13 字节补零（mock 供给与 size 声明一致）
          const bytes = [72, 101, 108, 108, 111, 44, 32, 72, 101, 120, 32, 86, 105, 101, 119, 33, 10, 0, 255]
          fileSize = path.includes('firmware.bin') ? 32 : bytes.length
          slice = Array.from(
            { length: Math.min(length, Math.max(0, fileSize - offset)) },
            (_, i) => (offset + i < bytes.length ? bytes[offset + i] : 0)
          )
        }
        return { base64: btoa(String.fromCharCode(...slice)), bytesRead: slice.length, fileSize }
      },
      getStats: async () => ({ size: 19, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      saveHexFile: async (_d: string, path: string, pieces: Array<{ kind: string; start?: number; length?: number; base64?: string }>) => {
        ;(window as any).__saveCalls = ((window as any).__saveCalls ?? []).concat([{ path, pieces }])
        let bytesWritten = 0
        for (const piece of pieces) {
          bytesWritten += piece.kind === 'base' ? (piece.length ?? 0) : Math.floor((piece.base64?.length ?? 0) * 3 / 4)
        }
        return { bytesWritten }
      },
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

  // 偏移列 + 十六进制 + ASCII + 固定列头
  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('Hello, Hex View!').first()).toBeVisible()
  await expect(page.locator('.hex-header-row').getByText('偏移')).toBeVisible()
  await expect(page.locator('.hex-header-row').getByText('ASCII')).toBeVisible()
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

  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
  // 不出现 Monaco 文本编辑器（确实强制为 hex，而非扩展名推断的 text）
  await expect(page.locator('.monaco-editor')).toHaveCount(0)
})

// ── 成熟基线升级回归（2026-08-16 hex-viewer-baseline；v2 界面重设计同步） ────
// 4. 全文件滚动：占位高 = 真实总行数 × 行高（自适应 bpr/行高，从 data 属性读回）
// 5. 偏移跳转：0x20 → 目标行琥珀高亮 + 状态栏偏移标签更新
// 6. Data Inspector：点击字节 → 1 字节分组解读；扩选 8 字节 → Float64

const BIG_SIZE = 1024 * 1024 // 1MB

test('full-file scrollbar covers the entire file (no 5000-row cap)', async ({ page }) => {
  await page.locator('[data-file-path="/fw/big.bin"]').dblclick()
  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })

  // 占位高 = 总行数 × 行高；行数按自适应 bpr 计算（data 属性回读，避免布局耦合）
  const { height, bpr, rowHeight } = await page.evaluate(() => {
    const host = document.querySelector('.hex-rows-host')
    const scroller = document.querySelector('.hex-scroller')
    return {
      height: host ? (host as HTMLElement).offsetHeight : -1,
      bpr: Number(scroller?.getAttribute('data-bpr') ?? 0),
      rowHeight: Number(scroller?.getAttribute('data-row-height') ?? 0)
    }
  })
  expect(bpr).toBeGreaterThan(0)
  expect(height).toBe(Math.ceil(BIG_SIZE / bpr) * rowHeight)

  // DOM 行数有界：缓冲行集 ≪ 总行数（QA-1：与文件大小无关）
  const domRows = await page.evaluate(() => document.querySelectorAll('.hex-scroller [style*="position: absolute"]').length)
  expect(domRows).toBeLessThan(120)
})

test('offset jump centers and highlights the target row', async ({ page }) => {
  // 大文件（1MB）：0x20 未越界，不触发钳制
  await page.locator('[data-file-path="/fw/big.bin"]').dblclick()
  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })

  const input = page.locator('input[placeholder*="0x1A2B"]')
  await input.fill('0x20')
  await input.press('Enter')

  // 目标行（offset 0x20）琥珀左条高亮 + 状态栏偏移标签
  const targetRow = page.locator('[title="偏移 00000020"]')
  await expect(targetRow).toHaveClass(/is-jump-row/, { timeout: 5000 })
  await expect(page.getByText('偏移 0x00000020', { exact: true })).toBeVisible()

  // 非法输入：字段下方就地报错不崩溃
  await input.fill('zz')
  await input.press('Enter')
  await expect(page.getByText(/无法识别/)).toBeVisible()

})

test('out-of-range jump clamps to the last byte with a notice', async ({ page }) => {
  // firmware.bin 声明 size=32：跳 0x64 → 钳到 0x1f（字节级光标直达末字节）并提示
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })
  const input = page.locator('input[placeholder*="0x1A2B"]')
  await input.fill('0x64')
  await input.press('Enter')
  await expect(page.getByText(/已钳制到文件末尾 0x1f/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('偏移 0x0000001f', { exact: true })).toBeVisible()
})

test('data inspector interprets cursor and 8-byte selection by length', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击首字节（72='H'）→ 上下文头 Offset · 1 byte + 1 字节分组（Int8/UInt8/位视图）
  await page.locator('[data-hex-offset="0"]').click()
  const inspector = page.locator('aside')
  await expect(inspector.getByText('Offset 0x00000000 · 1 byte')).toBeVisible({ timeout: 5000 })
  await expect(inspector.getByText('Int8', { exact: true })).toBeVisible()
  await expect(inspector.getByText('72', { exact: true }).first()).toBeVisible()
  await expect(inspector.getByText('UInt8', { exact: true })).toBeVisible()
  await expect(inspector.getByText('Bit 视图')).toBeVisible()
  await expect(inspector.getByText('Float64 LE')).toHaveCount(0)   // 长度不匹配 → 不展示

  // Shift+点击字节 7 → 8 字节选区 → Range 上下文 + Int64/Float64/CRC32
  await page.locator('[data-hex-offset="7"]').click({ modifiers: ['Shift'] })
  await expect(inspector.getByText('Range 0x00000000–0x00000007 · 8 bytes')).toBeVisible()
  await expect(inspector.getByText('Float64 LE')).toBeVisible()
  await expect(inspector.getByText('CRC32')).toBeVisible()
})

// ── P0-1 字节级光标/选区回归 ────────────────────────────────────────────────
// 点击字节 → 光标标签字节级精确；Shift+点击扩选 → 选区起止+长度显示；
// Shift+方向键继续扩选；ESC 清空选区（光标保留）。

test('byte-level cursor, shift-click selection and keyboard extend', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击字节 1 → 状态栏偏移字节级精确
  await page.locator('[data-hex-offset="1"]').click()
  await expect(page.getByText('偏移 0x00000001', { exact: true })).toBeVisible()

  // Shift+点击字节 4 → 选区 1–4（闭区间 4 字节，短标签形态）
  await page.locator('[data-hex-offset="4"]').click({ modifiers: ['Shift'] })
  await expect(page.getByText('选区 0x1–0x4 · 4 B', { exact: true })).toBeVisible()

  // Shift+→ 再扩一字节（点击后焦点在 hex 滚动区，键盘直达）
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByText('选区 0x1–0x5 · 5 B', { exact: true })).toBeVisible()

  // ESC 清选区 → 回到单字节形态，光标保留在 head
  await page.keyboard.press('Escape')
  await expect(page.getByText('选区 0x1–0x5 · 5 B', { exact: true })).toHaveCount(0)
  await expect(page.getByText('偏移 0x00000005', { exact: true })).toBeVisible()
})

// ── P0-4 安全编辑回归（journal 叠加缓存 + nibble 输入 + Undo/Redo） ─────────

test('nibble typing edits bytes, cursor advances, undo/redo restores', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击首字节（0x48）→ 键入 '4'：高 nibble 已是 4，值不变但光标进低 nibble
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('4')
  await expect(page.getByText('偏移 0x00000000', { exact: true })).toBeVisible()
  // 键入 '1'：低 nibble → 0x41，光标前进到字节 1
  await page.keyboard.press('1')
  await expect(page.getByText('41 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('偏移 0x00000001', { exact: true })).toBeVisible()

  // 键入 'f'：字节 1 高 nibble 6→f（0x65 → 0xf5）
  await page.keyboard.press('f')
  await expect(page.getByText('41 f5 6c 6c 6f').first()).toBeVisible()

  // Cmd+Z 一次还原整段连续输入（coalesce 合并为单条 Undo），光标回起点
  await page.keyboard.press('Meta+z')
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('偏移 0x00000000', { exact: true })).toBeVisible()

  // Cmd+Shift+Z 重做
  await page.keyboard.press('Meta+Shift+z')
  await expect(page.getByText('41 f5 6c 6c 6f').first()).toBeVisible()
})

test('ascii typing overwrites the mirrored byte', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击 ASCII 首字符 → 键入 X：H→X（0x48→0x58），Hex 列同步镜像
  await page.locator('[data-ascii-offset="0"]').click()
  await page.keyboard.press('X')
  await expect(page.getByText('58 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('Xello').first()).toBeVisible()
  await expect(page.getByText('偏移 0x00000001', { exact: true })).toBeVisible()
})

// ── P0-3 保存通道回归（脏状态 → Cmd+S → 净效果片段 → 脏状态清零） ───────────

test('dirty badge, Cmd+S saves edit pieces atomically, badge clears', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 未修改：无脏徽章
  await expect(page.getByText('• 已修改')).toHaveCount(0)

  // 编辑首字节高 nibble：0x48 → 0x18（键入 '1'）→ 脏徽章出现
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('1')
  await expect(page.getByText('18 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('已修改 1 处', { exact: true })).toBeVisible()

  // Cmd+S：保存通道收到净效果片段（edit 1B + base 剩余 31B），脏徽章清除
  await page.keyboard.press('Meta+s')
  await expect(page.getByText('• 已修改')).toHaveCount(0)

  const calls = await page.evaluate(() => (window as any).__saveCalls)
  expect(calls.length).toBe(1)
  expect(calls[0].path).toBe('/fw/firmware.bin')
  expect(calls[0].pieces).toEqual([
    { kind: 'edit', base64: 'GA==' },          // 0x18
    { kind: 'base', start: 1, length: 31 }     // 源文件剩余区间
  ])

  // 保存后再编辑 → 脏状态以新保存点为基准重现
  await page.keyboard.press('2')               // 低 nibble：0x18 → 0x12
  await expect(page.getByText('12 65 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('已修改 1 处', { exact: true })).toBeVisible()
})

// ── P0-4 收尾回归：Insert 模式 / 多字节粘贴 / 未保存关闭守卫 ─────────────────

/** 直接向 hex 滚动区派发 paste 事件（绕开剪贴板权限）。 */
async function dispatchPaste(page: Page, text: string): Promise<void> {
  await page.evaluate((payload: string) => {
    const event = new ClipboardEvent('paste', { clipboardData: new DataTransfer() })
    ;(event as unknown as { clipboardData: DataTransfer }).clipboardData.setData('text/plain', payload)
    document.querySelector('.overflow-y-auto.font-mono')?.dispatchEvent(event)
  }, text)
}

test('insert mode shifts bytes right and undo restores', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // Insert 键切换：segmented「插入」段点亮（模式 chip 同步为插入）
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('Insert')
  await expect(page.getByRole('button', { name: '插入', exact: true })).toHaveClass(/is-active/)

  // 高 nibble 'a' → 行首插入 a0，原字节右移
  await page.keyboard.press('a')
  await expect(page.getByText('a0 48 65 6c 6c').first()).toBeVisible()
  // 低 nibble '5' → a5
  await page.keyboard.press('5')
  await expect(page.getByText('a5 48 65 6c 6c').first()).toBeVisible()

  // 两次 Undo（插入 + 补全各一条）→ 完全还原
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Meta+z')
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible()
})

test('paste valid hex overwrites, invalid hex reports error without changes', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 点击字节 0（覆写模式）→ 粘贴 "4142"：48 65 → 41 42
  await page.locator('[data-hex-offset="0"]').click()
  await dispatchPaste(page, '41 42')
  await expect(page.getByText('41 42 6c 6c 6f').first()).toBeVisible()
  await expect(page.getByText('偏移 0x00000002', { exact: true })).toBeVisible()

  // 非法粘贴：字节不变 + 就地报错
  await dispatchPaste(page, '4z')
  await expect(page.getByText(/非法字符/)).toBeVisible()
  await expect(page.getByText('41 42 6c 6c 6f').first()).toBeVisible()

  // 奇数位：明确报错
  await dispatchPaste(page, '414')
  await expect(page.getByText(/位数须为偶数/)).toBeVisible()
})

test('closing a dirty hex tab shows confirm bar; cancel keeps, discard closes', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 无修改：关闭直接生效（无确认条）→ 重新打开
  await page.getByLabel('关闭 firmware.bin').click()
  await expect(page.getByText('HEX', { exact: true })).toHaveCount(0)
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 制造未保存修改 → 点关闭 → 确认条出现，tab 仍在
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('9')
  await expect(page.getByText('已修改 1 处', { exact: true })).toBeVisible()
  await page.getByLabel('关闭 firmware.bin').click()
  await expect(page.getByText('存在未保存修改，关闭前如何处理？')).toBeVisible()
  await expect(page.getByText('98 65 6c 6c 6f').first()).toBeVisible()  // tab 未关闭

  // 取消：确认条消失，tab 保留
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByText('存在未保存修改，关闭前如何处理？')).toHaveCount(0)
  await expect(page.getByText('98 65 6c 6c 6f').first()).toBeVisible()

  // 再次关闭 → 放弃修改 → tab 关闭
  await page.getByLabel('关闭 firmware.bin').click()
  await expect(page.getByText('存在未保存修改，关闭前如何处理？')).toBeVisible()
  await page.getByRole('button', { name: '放弃修改' }).click()
  await expect(page.getByText('HEX', { exact: true })).toHaveCount(0)
})

// ── P0-5 回归：相对跳转 / 跳转历史 / 查找（通配）/ 全部替换 ────────────────────

test('relative jump (+0x20 / -16) and jump history back/forward', async ({ page }) => {
  await page.locator('[data-file-path="/fw/big.bin"]').dblclick()
  await expect(page.locator('.hex-offset', { hasText: '00000000' }).first()).toBeVisible({ timeout: 5000 })
  const input = page.locator('input[placeholder*="0x1A2B"]')

  // 绝对跳转 0x40 → 光标 0x40
  await input.fill('0x40')
  await input.press('Enter')
  await expect(page.getByText('偏移 0x00000040', { exact: true })).toBeVisible()

  // 相对 +0x20 → 0x60
  await input.fill('+0x20')
  await input.press('Enter')
  await expect(page.getByText('偏移 0x00000060', { exact: true })).toBeVisible()

  // 相对 -16（十进制）→ 0x50
  await input.fill('-16')
  await input.press('Enter')
  await expect(page.getByText('偏移 0x00000050', { exact: true })).toBeVisible()

  // 历史：Alt+← 回 0x60；再回 0x40；Alt+→ 前进 0x60
  await page.locator('.overflow-y-auto.font-mono').click()  // 焦点移回 hex 区
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.getByText('偏移 0x00000060', { exact: true })).toBeVisible()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.getByText('偏移 0x00000040', { exact: true })).toBeVisible()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.getByText('偏移 0x00000060', { exact: true })).toBeVisible()
})

test('find with count, wildcard, navigation and selection highlight', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // Cmd+F → 查找条出现；查找 '65'（'e' ×3）
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('Meta+f')
  await expect(page.getByPlaceholder('48 65 / 4? ??')).toBeVisible()
  await page.getByPlaceholder('48 65 / 4? ??').fill('65')
  await page.getByPlaceholder('48 65 / 4? ??').press('Enter')
  await expect(page.getByText('匹配 1/3', { exact: true })).toBeVisible()
  // 光标落在首个匹配（offset 1）
  await expect(page.getByText('偏移 0x00000001', { exact: true })).toBeVisible()

  // F3 循环 2/3 → 3/3 → 1/3
  await page.getByPlaceholder('48 65 / 4? ??').press('F3')
  await expect(page.getByText('匹配 2/3', { exact: true })).toBeVisible()
  await page.getByPlaceholder('48 65 / 4? ??').press('F3')
  await expect(page.getByText('匹配 3/3', { exact: true })).toBeVisible()
  await page.getByPlaceholder('48 65 / 4? ??').press('F3')
  await expect(page.getByText('匹配 1/3', { exact: true })).toBeVisible()

  // 通配 '6?'：高 nibble 6 → 0x65(1,8,13) 0x6c(2,3) 0x6f(4) 0x69(12) 共 7 处
  await page.getByPlaceholder('48 65 / 4? ??').fill('6?')
  await page.getByPlaceholder('48 65 / 4? ??').press('Enter')
  await expect(page.getByText('匹配 1/7', { exact: true })).toBeVisible()

  // 非法输入：奇数位（状态栏通知槽报错）
  await page.getByPlaceholder('48 65 / 4? ??').fill('645')
  await page.getByPlaceholder('48 65 / 4? ??').press('Enter')
  await expect(page.getByText(/位数须为偶数/)).toBeVisible()

  // Esc：清空查询与匹配（字段常驻工具栏，不清除输入框本身）
  await page.getByPlaceholder('48 65 / 4? ??').fill('6?')
  await page.getByPlaceholder('48 65 / 4? ??').press('Enter')
  await expect(page.getByText('匹配 1/7', { exact: true })).toBeVisible()
  await page.getByPlaceholder('48 65 / 4? ??').press('Escape')
  await expect(page.getByText(/匹配 \d/)).toHaveCount(0)
  await expect(page.getByPlaceholder('48 65 / 4? ??')).toHaveValue('')
})

test('replace all with confirmation replaces every match', async ({ page }) => {
  await page.locator('[data-file-path="/fw/firmware.bin"]').dblclick()
  await expect(page.getByText('48 65 6c 6c 6f').first()).toBeVisible({ timeout: 5000 })

  // 打开查找条并展开替换：查 '6c'（'l' ×2）替换为 '4c'（'L'）
  await page.locator('[data-hex-offset="0"]').click()
  await page.keyboard.press('Meta+f')
  await page.getByPlaceholder('48 65 / 4? ??').fill('6c')
  await page.getByPlaceholder('48 65 / 4? ??').press('Enter')
  await expect(page.getByText('匹配 1/2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '替换', exact: true }).click()  // 展开替换区
  await page.getByPlaceholder('替换字节（如 41 42）').fill('4c')

  // 全部替换 → 确认条（2 处）→ 执行 → "HeLLo"、计数 0/0
  await page.getByRole('button', { name: '全部替换' }).click()
  await expect(page.getByText('将替换 2 处匹配，确定执行？')).toBeVisible()
  await page.getByRole('button', { name: '替换 2 处' }).click()
  await expect(page.getByText('已替换 2 处')).toBeVisible()
  await expect(page.getByText('48 65 4c 4c 6f').first()).toBeVisible()   // "HeLLo"
  await expect(page.getByText('HeLLo').first()).toBeVisible()
  await expect(page.getByText('匹配 0/0', { exact: true })).toBeVisible()
  // 替换产生未保存修改
  await expect(page.getByText('已修改 1 处', { exact: true })).toBeVisible()
})
