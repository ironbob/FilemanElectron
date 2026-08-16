import { expect, test } from '@playwright/test'

// 标签页打开入口回归：
// 1. 文件夹右键 "Open in New Tab" → 新标签页定位到该目录
// 2. 文件夹右键 "Open in Dual-Pane Tab" → 新标签页双面板（目录 + 参照位置）
// 3. 拖文件夹到标签栏 → 新标签页打开（非文件夹不响应）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        if (path === '/docs') return [
          { name: 'readme.md', path: '/docs/readme.md', isDirectory: false, isFile: true, size: 3, modifiedTime: '2026-08-14T10:00:00Z', extension: '.md' }
        ]
        return [
          { name: 'docs', path: '/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' },
          { name: 'a.txt', path: '/a.txt', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' }
        ]
      },
      readFile: async () => btoa('hi'),
      getStats: async (_deviceId: string, path: string) => ({
        size: 0, isDirectory: path === '/docs', isFile: path !== '/docs',
        modifiedTime: '', createdTime: '', mode: 0
      }),
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
    localStorage.removeItem('fileman-tabs-state')
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/docs"]')).toBeVisible()
})

test('folder context menu opens the folder in a new tab', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('在新标签页中打开').click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
  // 新 tab 激活并进入 /docs
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()
})

test('folder context menu opens a dual-pane tab anchored at the source pane', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('在双面板标签页中打开').click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
  // 双面板：两个 pane 同时渲染，一个在 /docs，一个留在 /
  await expect(page.locator('.finder-pane')).toHaveCount(2)
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()
  await expect(page.locator('[data-file-path="/a.txt"]')).toBeVisible()
})

test('dropping a folder on the tab strip opens it in a new tab', async ({ page }) => {
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/json', JSON.stringify({ paneId: 'p1', deviceId: 'local', files: ['/docs'] }))
    document.querySelector('.finder-tab-strip')!.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true })
    )
  })
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()
})

test('dropping a file (non-folder) on the tab strip is ignored', async ({ page }) => {
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/json', JSON.stringify({ paneId: 'p1', deviceId: 'local', files: ['/a.txt'] }))
    document.querySelector('.finder-tab-strip')!.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true })
    )
  })
  await page.waitForTimeout(300)
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(1)
})
