import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks: Array<(event: any) => void> = []
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
        return { id: 'copy-task', ...task, status: 'pending', progress: { itemResults: [] } }
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
  const newTabButton = page.getByRole('button', { name: 'New Tab' })
  await expect(newTabButton).toBeVisible()
  await newTabButton.click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
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
