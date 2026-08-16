import { expect, test } from '@playwright/test'

// 复制路径变体（右键菜单）回归：
// 1. 文件右键 → 复制路径 ▸ POSIX 路径 → 剪贴板得到绝对路径
// 2. file:// URI 变体 → 剪贴板得到转义后的 URI
// 3. 文件名变体 → 剪贴板得到纯文件名
// 4. 双面板下「相对另一面板」→ 剪贴板得到相对路径

test.beforeEach(async ({ page }) => {
  // 允许读取剪贴板以断言写入结果（writeText 无需权限，readText 需要）
  await (page.context() as any).grantPermissions?.(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, dirPath: string) => {
        if (dirPath === '/beta') {
          return [{ name: 'report.md', path: '/alpha/beta/report.md', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-15T10:00:00Z', extension: '.md' }]
        }
        return [
          { name: 'docs', path: '/alpha/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'file with space.txt', path: '/alpha/file with space.txt', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
        ]
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 12, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
    // 双面板：左 /alpha（当前、右键目标所在），右 /beta（「相对另一面板」的 fromDir）
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/alpha', history: ['/alpha'], historyIndex: 0, viewMode: 'list', selectedFiles: [] },
          { id: 'p2', deviceId: 'local', path: '/beta', history: ['/beta'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/alpha/file with space.txt"]')).toBeVisible()
})

async function copyViaMenu(page: import('@playwright/test').Page, submenuLabel: string): Promise<string> {
  await page.locator('[data-file-path="/alpha/file with space.txt"]').click({ button: 'right' })
  const parent = page.locator('.context-menu .context-menu-item.has-submenu', { hasText: '复制路径' })
  await expect(parent).toBeVisible()
  await parent.hover()
  await page.locator('.context-submenu .context-menu-item', { hasText: submenuLabel }).click()
  return page.evaluate(() => navigator.clipboard.readText())
}

test('copy POSIX path from context menu', async ({ page }) => {
  const text = await copyViaMenu(page, 'POSIX 路径')
  expect(text).toBe('/alpha/file with space.txt')
})

test('copy file:// URI from context menu', async ({ page }) => {
  const text = await copyViaMenu(page, 'file:// URI')
  expect(text).toBe('file:///alpha/file%20with%20space.txt')
})

test('copy file name from context menu', async ({ page }) => {
  const text = await copyViaMenu(page, '文件名')
  expect(text).toBe('file with space.txt')
})

test('copy path relative to the other pane', async ({ page }) => {
  // 目标 /alpha/file with space.txt，另一面板 /beta → ../alpha/file with space.txt
  const text = await copyViaMenu(page, '相对另一面板')
  expect(text).toBe('../alpha/file with space.txt')
})
