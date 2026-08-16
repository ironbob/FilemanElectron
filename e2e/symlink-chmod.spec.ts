import { expect, test } from '@playwright/test'

// 符号链接徽标 + chmod 编辑器回归（M5）：
// 1. isSymlink 条目在列表视图渲染链接图标（title 含目标）
// 2. 属性弹窗显示符号链接目标行
// 3. 属性弹窗 chmod 编辑：勾选格 + 八进制联动 + 应用调用 fs:chmod（正确 mode）
// 4. 空白右键「新建符号链接…」→ 弹窗提交调用 createSymlink

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'real.txt', path: '/d/real.txt', isDirectory: false, isFile: true, size: 10, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' },
        { name: 'link.txt', path: '/d/link.txt', isDirectory: false, isFile: true, size: 0, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt', isSymlink: true, symlinkTarget: 'real.txt' }
      ],
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canList: true, canStat: true,
        canSymlink: true, canChmod: true, canChown: true, canGrepContent: true
      }),
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async (_d: string, path: string) => ({
        size: 10, isDirectory: false, isFile: true,
        modifiedTime: '2026-08-15T10:00:00Z', createdTime: '2026-08-15T10:00:00Z',
        mode: path.includes('link') ? 0o777 : 0o644
      }),
      chmod: async (_d: string, _p: string, mode: number, _recursive: boolean) => {
        ;(window as any).__lastChmod = { mode, recursive: _recursive }
      },
      createSymlink: async (_d: string, target: string, linkPath: string) => {
        ;(window as any).__lastSymlink = { target, linkPath }
      },
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
        if (String(property).startsWith('start')) return async () => ({ taskId: 't' })
        return async () => undefined
      }
    })
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: 'd', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/d', history: ['/d'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/d/link.txt"]')).toBeVisible()
})

test('symlink entries render a link badge with target in title', async ({ page }) => {
  const badge = page.locator('[data-file-path="/d/link.txt"] svg[title*="符号链接"]')
  await expect(badge).toHaveCount(1)
  await expect(badge).toHaveAttribute('title', '符号链接 → real.txt')
  // 非链接条目无徽标
  await expect(page.locator('[data-file-path="/d/real.txt"] svg[title*="符号链接"]')).toHaveCount(0)
})

test('info dialog shows the symlink target row', async ({ page }) => {
  await page.locator('[data-file-path="/d/link.txt"]').click()
  await page.keyboard.press('Meta+i')
  await expect(page.getByText('符号链接')).toBeVisible({ timeout: 5000 })
  // 目标值在弹窗的 InfoRow 中（列表里也有同名文件，取弹窗内的那个）
  await expect(page.locator('.break-all', { hasText: 'real.txt' })).toBeVisible()
})

test('chmod editor applies the checked mode via fs:chmod', async ({ page }) => {
  await page.locator('[data-file-path="/d/real.txt"]').click()
  await page.keyboard.press('Meta+i')
  await expect(page.getByText('修改权限')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '编辑…' }).click()
  const editor = page.locator('section', { hasText: '修改权限' }).first()

  // 初值 644：所有者 rw；组 r；其他 r
  const checkboxes = editor.locator('input[type="checkbox"]')
  const states = await checkboxes.evaluateAll(els => els.map(el => (el as HTMLInputElement).checked))
  // 9 个 rwx 复选（不含递归框——递归仅目录显示）
  expect(states.slice(0, 9)).toEqual([true, true, false, true, false, false, true, false, false])

  // 勾掉其它-读 → 640
  await checkboxes.nth(6).click()
  await expect(editor.locator('span.font-mono').first()).toHaveText('640')

  await page.getByRole('button', { name: '应用' }).click()
  const applied = await page.evaluate(() => (window as any).__lastChmod)
  expect(applied).toEqual({ mode: 0o640, recursive: false })
})

test('new symlink dialog calls createSymlink with composed path', async ({ page }) => {
  await page.locator('.relative.flex-1.flex.flex-col').first()
    .click({ button: 'right', position: { x: 400, y: 300 } })
  await page.locator('.context-menu .context-menu-item', { hasText: '新建符号链接' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().waitFor({ state: 'visible', timeout: 5000 })
  await dialog.locator('input').first().fill('/d/real.txt')
  await dialog.locator('input').nth(1).fill('alias.txt')
  await dialog.getByRole('button', { name: '创建' }).click()

  const created = await page.evaluate(() => (window as any).__lastSymlink)
  expect(created).toEqual({ target: '/d/real.txt', linkPath: '/d/alias.txt' })
})
