import { expect, test } from '@playwright/test'

// 网页族（html/htm/xhtml/shtml——@shared/fileKinds BROWSER_OPEN_EXTS 注册表）行为回归：
// 1. 双击网页族 → 系统默认应用（openDefault，通常为浏览器），不开应用内预览 tab
// 2. 大小写扩展名归一（.HTML）同样命中
// 3. 双击普通文本不触发 openDefault（保持应用内预览；QuickLook 入口另路不受影响）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const calls: any[] = []
    ;(window as any).__probe = calls
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath !== '/site') return []
        return [
          { name: 'index.html', path: '/site/index.html', isDirectory: false, isFile: true, size: 100, modifiedTime: '2026-08-23T10:00:00Z', extension: '.html' },
          { name: 'about.htm', path: '/site/about.htm', isDirectory: false, isFile: true, size: 80, modifiedTime: '2026-08-23T10:00:00Z', extension: '.htm' },
          { name: 'UPPER.HTML', path: '/site/UPPER.HTML', isDirectory: false, isFile: true, size: 60, modifiedTime: '2026-08-23T10:00:00Z', extension: '.HTML' },
          { name: 'note.txt', path: '/site/note.txt', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-23T10:00:00Z', extension: '.txt' }
        ]
      },
      openDefault: async (path: string) => { calls.push({ api: 'openDefault', path }) },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 100, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/site', history: ['/site'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/site/index.html"]')).toBeVisible()
})

test('双击 html 走系统默认应用（浏览器），不开预览 tab', async ({ page }) => {
  const tabsBefore = await page.locator('.tab-item').count()
  await page.dblclick('[data-file-path="/site/index.html"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([{ api: 'openDefault', path: '/site/index.html' }])
  // 不开应用内预览 tab（openDefault 直开系统应用）
  expect(await page.locator('.tab-item').count()).toBe(tabsBefore)
})

test('双击 htm 同样走系统默认应用', async ({ page }) => {
  await page.dblclick('[data-file-path="/site/about.htm"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([{ api: 'openDefault', path: '/site/about.htm' }])
})

test('大写扩展名 .HTML 归一后同样命中', async ({ page }) => {
  await page.dblclick('[data-file-path="/site/UPPER.HTML"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([{ api: 'openDefault', path: '/site/UPPER.HTML' }])
})

test('双击普通文本不触发 openDefault（应用内预览路径保留）', async ({ page }) => {
  await page.dblclick('[data-file-path="/site/note.txt"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([])
})
