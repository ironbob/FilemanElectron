import { expect, test } from '@playwright/test'

// 工具栏双面板切换入口回归（原侧边栏左下角按钮已移除，入口改到 FilePane 工具栏）：
// 1. 点击工具栏按钮 → 在当前面板路径克隆出第二面板（不再是根目录）
// 2. 已开启时按钮呈激活态，再点 → 收起第二面板
// 3. 侧边栏工具区不再有双面板按钮（数量断言在 task-drawer.spec，此处不重复）

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

test('toolbar button opens dual pane at the current pane path', async ({ page }) => {
  // 先进入 /docs，再开双面板：第二面板应克隆 /docs 而非落在根目录
  await page.locator('[data-file-path="/docs"]').dblclick()
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()

  const toggle = page.locator('.file-pane-toolbar-split').first()
  await expect(toggle).toHaveAttribute('title', '打开双面板（在当前路径）')
  await toggle.click()

  await expect(page.locator('.finder-pane')).toHaveCount(2)
  // 两个面板都在 /docs：readme.md 行渲染两份（每面板各一）
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toHaveCount(2)
})

test('open button turns into active close state and collapses on second click', async ({ page }) => {
  await page.locator('.file-pane-toolbar-split').first().click()
  await expect(page.locator('.finder-pane')).toHaveCount(2)

  // 已开启：两个面板的按钮都呈激活态、tooltip 变「关闭」
  await expect(page.locator('.file-pane-toolbar-split')).toHaveCount(2)
  await expect(page.locator('.file-pane-toolbar-split[aria-pressed="true"]')).toHaveCount(2)
  await expect(page.locator('.file-pane-toolbar-split').first()).toHaveAttribute('title', '关闭双面板')

  // 再点（第二面板上的按钮）→ 收起到单面板
  await page.locator('.file-pane-toolbar-split').nth(1).click()
  await expect(page.locator('.finder-pane')).toHaveCount(1)
  await expect(page.locator('.file-pane-toolbar-split[aria-pressed="true"]')).toHaveCount(0)
  await expect(page.locator('.file-pane-toolbar-split').first()).toHaveAttribute('title', '打开双面板（在当前路径）')
})
