import { expect, test } from '@playwright/test'

// 命令面板（⌘⇧P）回归：
// 1. 快捷键呼出/关闭；面板内 Esc 关闭且不触发其它快捷键
// 2. 中文模糊过滤 + Enter 执行（以「切换为分栏视图」为例，验证视图切换）
// 3. 手输绝对路径 + Enter → 当前面板导航
// 4. 收藏目录出现在候选中并可跳转

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({
        favorites: [
          { deviceId: 'local', path: '/Users/demo/项目', name: '项目目录' }
        ]
      }),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dirPath: string) => {
        ;(window as any).__listedPaths = ((window as any).__listedPaths ?? []).concat([dirPath])
        return dirPath === '/Users/demo/项目'
          ? [{ name: 'a.ts', path: '/Users/demo/项目/a.ts', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-15T10:00:00Z', extension: '.ts' }]
          : [{ name: 'home.txt', path: `${dirPath === '/' ? '' : dirPath}/home.txt`, isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }]
      },
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
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
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: 'home', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
    localStorage.setItem('fileman-favorites', JSON.stringify([
      { deviceId: 'local', path: '/Users/demo/项目', name: '项目目录' }
    ]))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/home.txt"]')).toBeVisible()
})

test('⌘⇧P toggles the palette; Esc closes it', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await expect(palette).toBeVisible()
  await expect(palette.locator('input')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()

  // 再次呼出再关闭（切换语义）
  await page.keyboard.press('Meta+Shift+KeyP')
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('filter and execute a view-mode command', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await expect(palette).toBeVisible()

  await palette.locator('input').fill('分栏')
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()

  // 视图切换生效：分栏视图容器出现（columns view 为横向滚动多列布局）
  await expect(page.locator('.file-pane .flex-1.flex.min-h-0.overflow-x-auto').first()).toBeVisible()
})

test('typing an absolute path navigates the active pane', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await palette.locator('input').fill('/Users/demo/项目')
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  await expect(page.locator('[data-file-path="/Users/demo/项目/a.ts"]')).toBeVisible()
})

test('favorites appear as jump candidates', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await palette.locator('input').fill('项目目录')
  await expect(palette.locator('div', { hasText: '项目目录' }).last()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-file-path="/Users/demo/项目/a.ts"]')).toBeVisible()
})
