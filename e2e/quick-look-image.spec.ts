import { expect, test } from '@playwright/test'

// 图片 Quick Look 单行合并工具栏（2026-08-20 Finder 化）回归：
// 1. 单行：卡片内仅一条 finder-preview-toolbar（名称/元信息 + 三胶囊组），
//    编辑工具栏(img-top-toolbar/edit-icon-btn)与底部状态栏(img-status-bar)退场
// 2. 按钮全走 finder 家族：3× finder-control-group（缩放/旋转/步进关闭）+ % 徽标
// 3. 行为：缩放钮改 % 读数；↑↓ 步进切换文件并刷新名称；边界禁用；Esc 关闭

// 1×1 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.beforeEach(async ({ page }) => {
  await page.addInitScript((png: string) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'a.png', path: '/a.png', isDirectory: false, isFile: true, size: 95, modifiedTime: '2026-08-14T10:00:00Z', extension: '.png' },
        { name: 'b.png', path: '/b.png', isDirectory: false, isFile: true, size: 95, modifiedTime: '2026-08-14T10:00:00Z', extension: '.png' }
      ],
      readFile: async (_d: string, path: string) => path.endsWith('.png') ? png : '',
      getStats: async () => ({ size: 95, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
    localStorage.removeItem('fileman-tabs-state')
  }, PNG_B64)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/a.png"]')).toBeVisible()
})

async function openImageQuickLook(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/a.png"]').click()
  await page.keyboard.press('Space')
  const overlay = page.getByRole('dialog', { name: '快速预览' })
  await expect(overlay).toBeVisible()
  await expect(overlay.locator('img')).toBeVisible()
  return overlay
}

test('单行合并：finder 家族按钮 + 编辑工具栏/状态栏退场', async ({ page }) => {
  const overlay = await openImageQuickLook(page)

  // 单行工具栏承载名称与元信息（头部已并入）
  await expect(overlay.locator('.finder-preview-toolbar [data-testid="quick-look-name"]')).toHaveText('a.png')
  await expect(overlay.locator('[data-testid="quick-look-meta"]')).toContainText('· 1 / 2')

  // 双 chrome 退场：编辑工具栏与状态栏不得出现
  await expect(overlay.locator('.img-top-toolbar')).toHaveCount(0)
  await expect(overlay.locator('.edit-icon-btn')).toHaveCount(0)
  await expect(overlay.locator('.img-status-bar')).toHaveCount(0)

  // 按钮家族：缩放/旋转/步进关闭 三胶囊组，共 8 只 28px 图标钮
  await expect(overlay.locator('.finder-control-group')).toHaveCount(3)
  await expect(overlay.locator('.finder-icon-button')).toHaveCount(8)

  // % 徽标在场（finder-preview-badge，10px mono）
  await expect(overlay.locator('[data-testid="quick-look-zoom"]')).toContainText('%')

  await page.screenshot({ path: 'test-results/quicklook-image-toolbar.png' })
})

test('缩放钮改读数 + 步进刷新 + 边界禁用', async ({ page }) => {
  const overlay = await openImageQuickLook(page)

  // 步进边界：首图 prev 禁用 / next 可用；↓ 切到次图后反转，名称刷新
  await expect(overlay.locator('.finder-icon-button').nth(5)).toBeDisabled() // prev
  const badge = overlay.locator('[data-testid="quick-look-zoom"]')
  const before = await badge.innerText()
  await overlay.locator('.finder-icon-button').nth(2).click() // zoomIn（fit,−,+ 中的 +）
  await expect(badge).not.toHaveText(before)

  await page.keyboard.press('ArrowDown')
  await expect(overlay.locator('.finder-preview-toolbar [data-testid="quick-look-name"]')).toHaveText('b.png')
  await expect(overlay.locator('.finder-icon-button').nth(5)).toBeEnabled() // prev
  await expect(overlay.locator('.finder-icon-button').nth(6)).toBeDisabled() // next（末图）

  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
})
