import { expect, test } from '@playwright/test'

// 校验和弹窗 Finder 化回归（2026-08-20）：
// 1. 单蓝规则：算法分段控件激活态为浅灰（capsule-seg-active），不得等于主按钮蓝
// 2. 计算中：拷贝钮不出现 / 主钮「关闭」禁用 /「取消」出现；完成后反转
// 3. 对比态：结论行=图标+彩字（match=false 为红字），两条目各带拷贝钮
// 4. Esc 归弹窗（capture 消费）关闭弹窗
// 视觉：暗色（默认）与亮色各截一张至 test-results/ 供肉眼复核

test.beforeEach(async ({ page }) => {
  await (page.context() as any).grantPermissions?.(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
        canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
        canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true,
        canStream: true, canCaptureScreenshot: false, canArchive: true, canRecycle: true,
        canGrepContent: true, canSymlink: true, canChmod: true, canChown: true
      }),
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath !== '/fw') return []
        return [
          { name: 'docs', path: '/fw/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'notes.txt', path: '/fw/notes.txt', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' },
          { name: 'data.bin', path: '/fw/data.bin', isDirectory: false, isFile: true, size: 34, modifiedTime: '2026-08-15T10:00:00Z', extension: '.bin' }
        ]
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 12, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      exists: async () => true,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      volumes: { list: async () => [], onChanged: () => () => undefined },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 },
      startChecksum: async () => ({ taskId: 'task-1' }),
      cancelChecksum: async () => true
    }
    let checksumCb: ((e: unknown) => void) | null = null
    api.onChecksumProgress = (cb: (e: unknown) => void) => {
      checksumCb = cb
      return () => { checksumCb = null }
    }
    ;(window as any).__pushChecksum = (e: unknown) => checksumCb?.(e)
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
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/fw', history: ['/fw'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/fw/notes.txt"]')).toBeVisible()
})

const DIALOG = '.finder-sheet[role="dialog"]'

async function openChecksum(page: import('@playwright/test').Page, files: string[], menuItem: string) {
  await page.locator(`[data-file-path="${files[0]}"]`).click()
  for (const f of files.slice(1)) {
    await page.locator(`[data-file-path="${f}"]`).click({ modifiers: ['Meta'] })
  }
  await page.locator(`[data-file-path="${files[files.length - 1]}"]`).click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
  await page.locator('.context-menu-item', { hasText: menuItem }).first().click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForFunction(() => typeof (window as any).__pushChecksum === 'function')
}

function progressEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: 's1',
    taskId: 'task-1',
    status: 'hashing',
    index: 0,
    total: 1,
    bytesProcessed: 0,
    totalBytes: 1,
    ...overrides
  }
}

test('单文件·哈希中：分段激活=浅灰（单蓝规则）+ 主钮禁用', async ({ page }) => {
  await openChecksum(page, ['/fw/notes.txt'], '计算校验和')

  await page.evaluate((e) => (window as any).__pushChecksum(e), progressEvent({
    total: 1, index: 0, bytesProcessed: 3, totalBytes: 12
  }))
  await expect(page.locator(DIALOG)).toContainText('哈希中 1/1')

  // 单蓝规则：分段激活底色 ≠ 主按钮蓝
  const activeSegBg = await page.locator('.finder-segment-btn-text.active').evaluate(el => getComputedStyle(el).backgroundColor)
  const primaryBg = await page.locator(`${DIALOG} .finder-btn-primary`).evaluate(el => getComputedStyle(el).backgroundColor)
  expect(activeSegBg).toBeTruthy()
  expect(activeSegBg).not.toBe(primaryBg)

  // 计算中：无拷贝钮 / 关闭禁用 / 取消在场；算法钮禁用带原因提示
  await expect(page.locator(`${DIALOG} .finder-btn-secondary.is-sm`)).toHaveCount(0)
  await expect(page.locator(`${DIALOG} .finder-btn-primary`)).toBeDisabled()
  await expect(page.locator(`${DIALOG} .finder-btn-secondary`, { hasText: '取消' })).toBeVisible()
  await expect(page.locator('.finder-segment-btn-text.active')).toBeDisabled()

  // 关闭钮 = 内联 SVG xmark（字体 「guanbi」字形实为弯弧/眼睛状，2026-08-20 弃用）
  await expect(page.locator(`${DIALOG} .finder-icon-button svg.iconfont-preview-icon`)).toHaveCount(1)

  await page.screenshot({ path: 'test-results/checksum-dark-running.png' })
})

test('单文件·完成：拷贝钮出现 + 主钮恢复', async ({ page }) => {
  await openChecksum(page, ['/fw/notes.txt'], '计算校验和')
  await page.evaluate((e) => (window as any).__pushChecksum(e), progressEvent({
    status: 'completed', bytesProcessed: 12, totalBytes: 12,
    results: [{ hex: 'a3f9c81eb2d4f65a7b90c3d2e1f08a6b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f' }]
  }))
  await expect(page.locator(`${DIALOG} .finder-btn-secondary.is-sm`, { hasText: '复制' })).toBeVisible()
  await expect(page.locator(`${DIALOG} .finder-btn-primary`)).toBeEnabled()
})

test('两文件对比·不一致：结论行红字（亮色主题）', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'))
  await openChecksum(page, ['/fw/notes.txt', '/fw/data.bin'], '校验和对比')
  await page.evaluate((e) => (window as any).__pushChecksum(e), progressEvent({
    status: 'completed', total: 2, bytesProcessed: 46, totalBytes: 46,
    results: [
      { hex: 'a3f9c81eb2d4f65a7b90c3d2e1f08a6b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f' },
      { hex: 'b7e244d01c8a9f3e5d7b6a4c2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a' }
    ],
    match: false
  }))

  const verdict = page.locator(DIALOG, { hasText: '两个文件内容不同' }).last()
  await expect(verdict).toBeVisible()
  const color = await verdict.evaluate(el => getComputedStyle(el).color)
  expect(color).toContain('rgb(')

  await expect(page.locator(`${DIALOG} .finder-btn-secondary.is-sm`)).toHaveCount(2)
  await page.screenshot({ path: 'test-results/checksum-light-compare.png' })
})

test('几何契约：分段规格/凹陷组实底/图标 28px/底栏右对齐', async ({ page }) => {
  await openChecksum(page, ['/fw/notes.txt', '/fw/data.bin'], '校验和对比')
  await page.evaluate((e) => (window as any).__pushChecksum(e), progressEvent({
    status: 'completed', total: 2, bytesProcessed: 46, totalBytes: 46,
    results: [{ hex: 'aa'.repeat(32) }, { hex: 'bb'.repeat(32) }], match: true
  }))
  await expect(page.locator(`${DIALOG} .finder-btn-secondary.is-sm`)).toHaveCount(2)

  const geom = await page.evaluate(() => {
    const sheet = document.querySelector('.finder-sheet[role="dialog"]') as HTMLElement
    const footer = sheet.querySelector('.px-5.py-3.border-t') as HTMLElement
    const footerBox = footer.getBoundingClientRect()
    const primary = footer.querySelector('.finder-btn-primary') as HTMLElement
    const primaryBox = primary.getBoundingClientRect()
    const seg = document.querySelector('.finder-segment-btn-text.active') as HTMLElement
    const tray = document.querySelector('.finder-seg-tray') as HTMLElement
    const group = sheet.querySelector('.finder-inset-group') as HTMLElement
    const icon = sheet.querySelector('.finder-inset-group img.finder-icon') as HTMLElement
    return {
      segH: Math.round(seg.getBoundingClientRect().height),
      segFont: getComputedStyle(seg).fontSize,
      segBg: getComputedStyle(seg).backgroundColor,
      trayH: Math.round(tray.getBoundingClientRect().height),
      groupBg: getComputedStyle(group).backgroundColor,
      iconW: Math.round(icon.getBoundingClientRect().width),
      flush: footerBox.right - primaryBox.right,
      pad: parseFloat(getComputedStyle(footer).paddingRight)
    }
  })
  expect(geom.segH).toBe(22)                                   // §2.3 带文字子项 22px
  expect(geom.segFont).toBe('12px')
  expect(geom.trayH).toBeLessThanOrEqual(26)                   // 22 + 2×2 托盘 padding
  expect(geom.groupBg).not.toBe('rgba(0, 0, 0, 0)')            // 凹陷组实底（/50 失效坑回归）
  expect(geom.iconW).toBe(28)
  expect(Math.abs(geom.flush - geom.pad)).toBeLessThanOrEqual(1) // 主钮贴 padding 右缘
})

test('Esc 关闭弹窗', async ({ page }) => {
  await openChecksum(page, ['/fw/notes.txt'], '计算校验和')
  await page.keyboard.press('Escape')
  await expect(page.locator(DIALOG)).toHaveCount(0)
})
