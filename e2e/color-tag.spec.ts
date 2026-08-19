import { expect, test } from '@playwright/test'

// 颜色标记（Finder 式彩色标签）e2e：
// 1. 文件右键 标记颜色▸ → 子菜单 7 色色板 + 清除标记（未标记时 disabled）
//    → 选红 → 行内圆点出现 + saveConfig 落盘 colorTags
// 2. 重开菜单当前色项带 ✓（打开瞬间快照）
// 3. 空白右键标记当前目录 → 主 tab 圆点出现（活动面板路径）
// 4. 清除标记 → 圆点消失 + 落盘空数组

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // saveConfig 记录型 mock（深拷贝防引用漂移），断言落盘形状
    const savedConfigs: unknown[] = []
    ;(window as any).__savedConfigs = savedConfigs
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({ colorTags: [] }),
      saveConfig: async (cfg: unknown) => { savedConfigs.push(JSON.parse(JSON.stringify(cfg))) },
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
          { name: 'notes.txt', path: '/fw/notes.txt', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
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

/** 打开文件右键菜单并悬停「标记颜色…」展开子菜单。 */
async function openColorTagSubmenu(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/fw/notes.txt"]').click({ button: 'right' })
  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()
  await menu.locator('> .context-menu-item:has(.menu-label:text-is("标记颜色…"))').hover()
  const sub = page.locator('.context-submenu')
  await expect(sub).toBeVisible()
  return sub
}

test('file menu: tag red shows row dot, persists colorTags, current color gets check', async ({ page }) => {
  const sub = await openColorTagSubmenu(page)
  // 色板 7 色（实心色点非 svg 图标）+ 清除标记（无标记时 disabled）
  await expect(sub.locator('.menu-swatch')).toHaveCount(7)
  const clearItem = sub.locator('.context-menu-item:has(.menu-label:text-is("清除标记"))')
  await expect(clearItem).toHaveClass(/disabled/)
  // 初始无当前色：7 项都不带 ✓
  await expect(sub.locator('.menu-shortcut')).toHaveCount(0)

  await sub.locator('.context-menu-item:has(.menu-label:text-is("红"))').click()
  await expect(page.locator('.context-menu')).toHaveCount(0)

  // 行内圆点出现（名称左前），title = 色名
  const dot = page.locator('[data-file-path="/fw/notes.txt"] .color-tag-dot')
  await expect(dot).toBeVisible()
  await expect(dot).toHaveAttribute('title', '红')

  // 落盘形状：[{ deviceId, path, color }]
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs.at(-1)?.colorTags)).toEqual([
    { deviceId: 'local', path: '/fw/notes.txt', color: 'red' }
  ])

  // 重开菜单：当前色项带 ✓（快捷键列）
  const sub2 = await openColorTagSubmenu(page)
  const redItem = sub2.locator('.context-menu-item:has(.menu-label:text-is("红"))')
  await expect(redItem.locator('.menu-shortcut')).toHaveText('✓')
  await page.keyboard.press('Escape')
})

test('background menu: tagging current directory lights the tab dot', async ({ page }) => {
  // 空白处右键（列表行间留白）
  await page.locator('.vue-recycle-scroller').click({ button: 'right', position: { x: 200, y: 260 } })
  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()
  await menu.locator('> .context-menu-item:has(.menu-label:text-is("标记颜色…"))').hover()
  const sub = page.locator('.context-submenu')
  await expect(sub).toBeVisible()
  await sub.locator('.context-menu-item:has(.menu-label:text-is("蓝"))').click()

  // 主 tab 圆点（活动面板 path=/fw）
  await expect(page.locator('.tab-color-dot')).toBeVisible()
  // 目录行圆点也即时出现（当前目录以行呈现于上级时才可见，此处断言 tab 即可）
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs.at(-1)?.colorTags)).toEqual([
    { deviceId: 'local', path: '/fw', color: 'blue' }
  ])
})

test('clear tag removes dot and persists empty array', async ({ page }) => {
  // 先标记红
  const sub = await openColorTagSubmenu(page)
  await sub.locator('.context-menu-item:has(.menu-label:text-is("红"))').click()
  await expect(page.locator('[data-file-path="/fw/notes.txt"] .color-tag-dot')).toBeVisible()

  // 清除标记（此时已可用）
  const sub2 = await openColorTagSubmenu(page)
  const clearItem = sub2.locator('.context-menu-item:has(.menu-label:text-is("清除标记"))')
  await expect(clearItem).not.toHaveClass(/disabled/)
  await clearItem.click()

  await expect(page.locator('[data-file-path="/fw/notes.txt"] .color-tag-dot')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs.at(-1)?.colorTags)).toEqual([])
})
