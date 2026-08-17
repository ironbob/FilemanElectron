import { expect, test } from '@playwright/test'

// ZIP 容器格式（pptx/aar/docx…——@shared/fileKinds zipOf 注册表）行为回归：
// 1. 双击容器格式 → 系统默认应用（openDefault），不开应用内预览 tab
// 2. 双击普通文件不受影响（不触发 openDefault）
// 3. 右键仍提供 ZIP 子菜单，「浏览」在新标签页进入虚拟目录

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
        if (dirPath !== '/alpha') return []
        return [
          { name: 'deck.pptx', path: '/alpha/deck.pptx', isDirectory: false, isFile: true, size: 100, modifiedTime: '2026-08-17T10:00:00Z', extension: '.pptx' },
          { name: 'lib.aar', path: '/alpha/lib.aar', isDirectory: false, isFile: true, size: 200, modifiedTime: '2026-08-17T10:00:00Z', extension: '.aar' },
          { name: 'note.txt', path: '/alpha/note.txt', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-17T10:00:00Z', extension: '.txt' }
        ]
      },
      zip: {
        // innerPath 为 zip 内相对路径（渲染层 joinZipPath 拼虚拟路径）
        listDirectory: async (zipPath: string) => {
          if (zipPath !== '/alpha/deck.pptx') return []
          return [{ name: 'slide1.xml', path: 'slide1.xml', isDirectory: false, size: 10, compressedSize: 5, modifiedTime: '2026-08-17T10:00:00Z' }]
        }
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
          { id: 'p1', deviceId: 'local', path: '/alpha', history: ['/alpha'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/alpha/deck.pptx"]')).toBeVisible()
})

test('双击 pptx（zip 容器格式）走系统默认应用，不开预览 tab', async ({ page }) => {
  const tabsBefore = await page.locator('.tab-item').count()
  await page.dblclick('[data-file-path="/alpha/deck.pptx"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([{ api: 'openDefault', path: '/alpha/deck.pptx' }])
  // 不开应用内预览 tab（openDefault 直开系统应用）
  expect(await page.locator('.tab-item').count()).toBe(tabsBefore)
})

test('双击 aar 同样走系统默认应用', async ({ page }) => {
  await page.dblclick('[data-file-path="/alpha/lib.aar"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([{ api: 'openDefault', path: '/alpha/lib.aar' }])
})

test('双击普通文件不触发 openDefault', async ({ page }) => {
  await page.dblclick('[data-file-path="/alpha/note.txt"]')
  await page.waitForTimeout(400)
  const probes = await page.evaluate(() => (window as any).__probe)
  expect(probes).toEqual([])
})

test('右键 pptx 提供 ZIP 子菜单，「浏览」在新标签页进入虚拟目录', async ({ page }) => {
  await page.locator('[data-file-path="/alpha/deck.pptx"]').click({ button: 'right' })
  const parent = page.locator('.context-menu .context-menu-item.has-submenu', { hasText: 'ZIP' })
  await expect(parent).toBeVisible()
  await parent.hover()
  await page.locator('.context-submenu .context-menu-item', { hasText: '浏览' }).click()
  await page.waitForTimeout(500)
  // 新 tab 已开且活动，虚拟目录内容来自 zip.listDirectory
  expect(await page.locator('.tab-item').count()).toBe(2)
  await expect(page.locator('[data-file-path="/alpha/deck.pptx::slide1.xml"]')).toBeVisible()
})
