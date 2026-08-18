import { expect, test } from '@playwright/test'

// 面包屑长路径折叠（Finder 式中段省略）回归：
// 1. 深路径超宽：中段折成 …（首段+尾段常驻可见，被折叠段不渲染）
// 2. … 菜单列出被折叠层级，点选跳转到该祖先目录（面包屑尾段随之更新）
// 3. Esc 关闭菜单；进入路径输入态时菜单收起
//
// 定位约定：省略号按钮用 aria-haspopup="menu"（唯一），菜单根用 .context-menu
// （FinderContextMenu 类名契约），避免依赖 i18n 文案字节。

const DEEP_PATH = '/home/user/dev/projects/fileman/electron/very/deeply/nested/folder/tree/with/long/segment-names/current-level'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((deepPath: string) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'file-01.txt', path: '/whatever/file-01.txt', isDirectory: false, isFile: true, size: 10, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
      ],
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      onWatchChanged: () => () => undefined,
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
        id: 't1', title: 'deep', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: deepPath, history: [deepPath], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  }, DEEP_PATH)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/whatever/file-01.txt"]')).toBeVisible()
})

// 固定视口：面包屑容器必须 >760px（容器查询否则整体隐藏），且窄到足以折叠中段
test.use({ viewport: { width: 1280, height: 720 } })

test('deep path collapses middle into ellipsis, first and last segments stay visible', async ({ page }) => {
  const breadcrumb = page.locator('.file-pane-toolbar-breadcrumb-content')

  // 省略号按钮出现（折叠已按实测宽度收敛；折叠量自适应，只折到放得下为止）
  const ellipsis = breadcrumb.locator('button[aria-haspopup="menu"]')
  await expect(ellipsis).toBeVisible()

  // 首段与尾段（当前目录）常驻可见 —— 尾段正是此前被右侧裁掉的关键信息
  await expect(breadcrumb.locator('button', { hasText: 'home' })).toBeVisible()
  await expect(breadcrumb.locator('button', { hasText: 'current-level' })).toBeVisible()

  // 被折叠的中间段不再渲染（不是被 overflow 裁掉，而是不在 DOM）
  await expect(breadcrumb.locator('button', { hasText: 'nested' })).toHaveCount(0)
})

test('ellipsis menu lists hidden levels and navigates to the clicked ancestor', async ({ page }) => {
  const breadcrumb = page.locator('.file-pane-toolbar-breadcrumb-content')
  const menu = page.locator('.context-menu')

  await breadcrumb.locator('button[aria-haspopup="menu"]').click()
  await expect(menu).toBeVisible()

  // 菜单项 = 被折叠的中间层级（folder 图标列占位，label 为段名）
  const items = menu.getByRole('menuitem')
  await expect(items.filter({ hasText: 'nested' })).toBeVisible()
  expect(await items.count()).toBeGreaterThan(1)

  // 点选祖先段：跳转到该前缀路径，面包屑尾段随之变为该段
  await items.filter({ hasText: 'deeply' }).click()
  await expect(menu).toBeHidden()
  await expect(breadcrumb.locator('button', { hasText: 'deeply' })).toBeVisible()
  // 跳转后仍有更深的层级（deeply 之后还有 7 段），尾段按钮即 deeply
  // （button.max-w-32 只命中路径分段按钮，排除 … 与尾部铅笔/前往按钮）
  const lastSegment = breadcrumb.locator('button.max-w-32').last()
  await expect(lastSegment).toHaveText('deeply')
})

test('ellipsis menu closes on Escape and on entering path edit mode', async ({ page }) => {
  const breadcrumb = page.locator('.file-pane-toolbar-breadcrumb-content')
  const menu = page.locator('.context-menu')

  // Esc 关闭
  await breadcrumb.locator('button[aria-haspopup="menu"]').click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // 点铅笔进入路径输入态：菜单收起，输入框出现（预填当前路径）
  await breadcrumb.locator('button[aria-haspopup="menu"]').click()
  await expect(menu).toBeVisible()
  await breadcrumb.locator('button[title="输入路径前往"]').click()
  await expect(menu).toBeHidden()
  await expect(breadcrumb.locator('input')).toHaveValue(DEEP_PATH)
})
