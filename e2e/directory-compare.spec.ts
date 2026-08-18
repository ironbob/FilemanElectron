import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks: Array<(event: any) => void> = []
    const operationCallbacks: Array<(task: any) => void> = []
    const files = (deviceId: string, path: string) => {
      if (deviceId === 'left-device' && path === '/left') return [
        { name: 'same.txt', path: '/left/same.txt', isDirectory: false, isFile: true, size: 3, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' },
        { name: 'left-only.txt', path: '/left/left-only.txt', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' },
        { name: 'photo.png', path: '/left/photo.png', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-14T10:00:00Z', extension: '.png' }
      ]
      if (deviceId === 'right-device' && path === '/right') return [
        { name: 'same.txt', path: '/right/same.txt', isDirectory: false, isFile: true, size: 3, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' },
        { name: 'right-only.txt', path: '/right/right-only.txt', isDirectory: false, isFile: true, size: 8, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' },
        { name: 'photo.png', path: '/right/photo.png', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-14T10:00:07Z', extension: '.png' }
      ]
      return []
    }
    const api: Record<string, any> = {
      getDevices: async () => [
        { id: 'left-device', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
        { id: 'right-device', type: 'ssh', name: '远程 NAS', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (deviceId: string, path: string) => {
        ;(window as any).__listCalls = [...((window as any).__listCalls ?? []), { deviceId, path }]
        return files(deviceId, path)
      },
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      startContentVerification: async ({ sessionId, pairs }: any) => {
        const taskId = 'verify-task'
        window.setTimeout(() => pairs.forEach((pair: any, index: number) => {
          callbacks.forEach(callback => callback({ sessionId, taskId, relativePath: pair.relativePath, status: 'content-equal', completed: index + 1, total: pairs.length }))
        }), 20)
        return { taskId, total: pairs.length }
      },
      cancelContentVerification: async () => true,
      onContentVerificationProgress: (callback: (event: any) => void) => {
        callbacks.push(callback)
        return () => callbacks.splice(callbacks.indexOf(callback), 1)
      },
      createFileOperation: async (task: any) => {
        ;(window as any).__copyTasks = [...((window as any).__copyTasks ?? []), task]
        ;(window as any).__createdTasks = [...((window as any).__createdTasks ?? []), task]
        const created = { id: `task-${(window as any).__createdTasks.length}`, ...task, status: 'pending', progress: { itemResults: [] } }
        window.setTimeout(() => operationCallbacks.forEach(callback => callback({ ...created, status: 'completed' })), 20)
        return created
      },
      onFileOperationUpdated: (callback: (task: any) => void) => {
        operationCallbacks.push(callback)
        return () => operationCallbacks.splice(operationCallbacks.indexOf(callback), 1)
      }
    }
    ;(window as any).fileman = new Proxy(api, {
      get(target, property) {
        if (property in target) return target[property as string]
        if (String(property).startsWith('on')) return () => () => undefined
        return async () => undefined
      }
    })
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      tabs: [{
        id: 'compare-tab', title: 'left ↔ right', panes: [], activePaneId: '',
        compareSession: {
          id: 'compare-session', leftDeviceId: 'left-device', leftRootPath: '/left',
          rightDeviceId: 'right-device', rightRootPath: '/right', rule: 'timestamp',
          filter: { showEqual: true, showDifferent: true, showLeftOnly: true, showRightOnly: true }
        }
      }], activeTabId: 'compare-tab'
    }))
    localStorage.setItem('fileman-recent-locations', JSON.stringify([
      { deviceId: 'left-device', path: '/Volumes/JINGZAO/avideo', visitedAt: Date.now() }
    ]))
  })
  await page.goto('/')
})

test('compares cross-device rows and verifies selected content', async ({ page }) => {
  await page.getByRole('button', { name: '刷新对比' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__listCalls?.length ?? 0)).toBe(2)
  await expect(page.getByText('左侧设备 · /left')).toBeVisible()
  await expect(page.getByText('右侧设备 · /right')).toBeVisible()
  // Exercise a real filter state transition before asserting virtualized rows.
  await page.getByTitle('仅显示差异').click()
  await page.getByTitle('显示全部').click()
  await expect(page.getByText('left-only.txt')).toBeVisible()
  await expect(page.getByText('right-only.txt')).toBeVisible()

  await page.getByText('same.txt').first().click()
  await page.getByRole('button', { name: '校验选中项内容' }).click()
  await expect(page.getByText('内容相同').first()).toBeVisible()
})

test('keeps the new-tab control available with a single tab', async ({ page }) => {
  const newTabButton = page.getByRole('button', { name: '新建标签页' })
  await expect(newTabButton).toBeVisible()
  await newTabButton.click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
})

test('renders recent locations on an opaque popup surface', async ({ page }) => {
  await page.getByRole('button', { name: '新建标签页' }).click()
  await page.getByRole('button', { name: '最近访问的位置' }).click()
  const menu = page.getByRole('menu', { name: '最近访问的位置' })
  await expect(menu).toBeVisible()
  // Finder 浮层材质：背景不透明度 ≥0.9（底层列表不可辨认）+ backdrop blur
  const bg = await menu.evaluate(el => getComputedStyle(el).backgroundColor)
  expect(bg).toMatch(/^rgba?\(/)
  const alpha = bg.startsWith('rgba') ? Number(bg.match(/,\s*([\d.]+)\)$/)![1]) : 1
  expect(alpha).toBeGreaterThanOrEqual(0.9)
  await expect(menu).toHaveCSS('backdrop-filter', /blur/)
  await expect(menu.getByText('/Volumes/JINGZAO/avideo')).toBeVisible()
  await page.getByPlaceholder('搜索或 tag:work').click()
  await expect(menu).toBeHidden()
})

test('keeps navigation and search available in a narrow file pane', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 })
  await page.getByRole('button', { name: '新建标签页' }).click()
  await expect(page.getByRole('button', { name: '后退' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索或 tag:work')).toBeVisible()
  await expect(page.locator('.file-pane-toolbar-breadcrumb')).toBeHidden()
})

test('creates a file through the toolbar and refreshes the directory', async ({ page }) => {
  await page.getByRole('button', { name: '新建标签页' }).click()
  await page.getByRole('button', { name: '新建文件', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: '创建文件' })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('example.txt').fill('notes.txt')
  await dialog.getByRole('button', { name: '创建' }).click()

  await expect.poll(() => page.evaluate(() => (window as any).__createdTasks?.[0])).toMatchObject({
    type: 'touch',
    targetPath: '/notes.txt'
  })
  await expect.poll(() => page.evaluate(() => ((window as any).__listCalls ?? [])
    .filter((call: any) => call.deviceId === 'local' && call.path === '/').length)).toBeGreaterThan(1)
})

test('filters differences and submits an explicit copy plan', async ({ page }) => {
  await page.getByRole('button', { name: '刷新对比' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__listCalls?.length ?? 0)).toBe(2)
  await page.getByTitle('仅显示差异').click()
  await expect(page.getByText('已过滤：显示')).toBeVisible()
  await expect(page.getByText('right-only.txt')).toBeVisible()

  await page.getByText('left-only.txt').click()
  await page.getByRole('button', { name: '复制到右侧' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('将复制的路径')).toBeVisible()
  await page.getByRole('button', { name: '确认复制' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__copyTasks?.length ?? 0)).toBe(1)
})
