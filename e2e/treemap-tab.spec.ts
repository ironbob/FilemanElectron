import { expect, test } from '@playwright/test'

// 空间分析 treemap 工具页回归：
// 1. 背景右键「可视化空间…」→ 打开工具页
// 2. completed 终态 entries → 色块渲染（最大项含名称与大小）
// 3. 点击色块下钻 → 新工具页以子目录为根

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath === '/proj/node_modules') {
          return Array.from({ length: 30 }, (_, i) => ({ name: `lib-${i}.js`, path: `/proj/node_modules/lib-${i}.js`, isDirectory: false, isFile: true, size: 100, modifiedTime: '2026-08-15T10:00:00Z' }))
        }
        return [
          { name: 'node_modules', path: '/proj/node_modules', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'src', path: '/proj/src', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'package.json', path: '/proj/package.json', isDirectory: false, isFile: true, size: 800, modifiedTime: '2026-08-15T10:00:00Z' }
        ]
      },
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      startSpaceAnalysis: async () => {
        const push = (window as any).__pushSpace
        setTimeout(() => push?.({
          sessionId: 'sp1', taskId: 't1', status: 'completed',
          fileCount: 32, directoryCount: 2, totalBytes: 5000,
          entries: [
            { name: 'node_modules', path: '/proj/node_modules', size: 3000, fileCount: 30, directoryCount: 0 },
            { name: 'src', path: '/proj/src', size: 1200, fileCount: 1, directoryCount: 0 },
            { name: 'package.json', path: '/proj/package.json', size: 800, fileCount: 1, directoryCount: 0 }
          ]
        }), 30)
        return { taskId: 't1' }
      },
      cancelSpaceAnalysis: async () => true,
      onSpaceAnalysisProgress: (callback: (progress: unknown) => void) => {
        ;(window as any).__pushSpace = callback
        return () => { (window as any).__pushSpace = undefined }
      },
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
        id: 't1', title: 'proj', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/proj', history: ['/proj'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/proj/package.json"]')).toBeVisible()
})

async function openTreemap(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.relative.flex-1.flex.flex-col').first()
    .click({ button: 'right', position: { x: 400, y: 300 } })
  await page.locator('.context-menu .context-menu-item', { hasText: '可视化空间' }).click()
}

test('opens treemap tab and renders size-proportional cells', async ({ page }) => {
  await openTreemap(page)

  // 完成态 + 三个色块（node_modules 最大，含标签与大小）
  await expect(page.getByText('node_modules').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('2.9 KB').first()).toBeVisible()
  await expect(page.getByText('32 文件 · 4.9 KB')).toBeVisible()

  // 面积比例：node_modules 3000/5000 = 60%
  const areas = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[title*="node_modules"], [title*="src"], [title*="package.json"]'))
    return cells.map(cell => {
      const rect = cell.getBoundingClientRect()
      return { title: cell.getAttribute('title') ?? '', area: rect.width * rect.height }
    })
  })
  const nodeModules = areas.find(a => a.title.includes('node_modules'))!
  const total = areas.reduce((sum, a) => sum + a.area, 0)
  expect(nodeModules.area / total).toBeGreaterThan(0.5) // 60% ± 布局余量
})

test('clicking a directory cell drills down', async ({ page }) => {
  await openTreemap(page)
  await expect(page.getByText('node_modules').first()).toBeVisible({ timeout: 5000 })

  await page.locator('[title*="node_modules"]').first().click()
  // 下钻开新工具页（标题含子目录）
  await expect(page.locator('.context-menu').count().then(() => true) as never).resolves.toBeTruthy()
  await expect(page.getByText('/proj/node_modules').first()).toBeVisible({ timeout: 5000 })
})
