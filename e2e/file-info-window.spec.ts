import { expect, test } from '@playwright/test'

function installFilemanMock(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [{ id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }],
      listFiles: async () => [{
        name: 'report.txt', path: '/report.txt', isDirectory: false, isFile: true, size: 12,
        modifiedTime: '2026-08-16T10:00:00Z', extension: '.txt'
      }],
      getStats: async () => ({ size: 12, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0o644 }),
      getDeviceCapabilities: async () => ({ canChmod: true }),
      getFileMetadata: async () => ({ tags: [] }),
      listXattrs: async () => [
        { name: 'com.apple.quarantine', sizeBytes: 47, textPreview: '0083;66f2a1b3;Safari;7A3C5E21-9F0B-4D2A-8E11-3C2B1D4F5A6B', isQuarantine: true },
        { name: 'com.test.flag', sizeBytes: 5, textPreview: 'hello', isQuarantine: false }
      ],
      openFileInfoWindow: async (context: unknown) => {
        ;(window as any).__fileInfoContext = context
      },
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
}

test('⌘I sends the current selection to the native file-info window', async ({ page }) => {
  await installFilemanMock(page)
  await page.goto('/')
  await page.locator('[data-file-path="/report.txt"]').click()
  await page.keyboard.press('Meta+KeyI')

  await expect.poll(() => page.evaluate(() => (window as any).__fileInfoContext)).toEqual({
    deviceId: 'local',
    deviceType: 'local',
    deviceName: '本机',
    files: [{
      name: 'report.txt', path: '/report.txt', isDirectory: false, isFile: true, size: 12,
      modifiedTime: '2026-08-16T10:00:00Z', extension: '.txt'
    }]
  })
})

test('file-info entry renders as a standalone panel rather than the main app', async ({ page }) => {
  await installFilemanMock(page)
  await page.addInitScript(() => {
    ;(window as any).fileman.getFileInfoWindowContext = async () => ({
      deviceId: 'local', deviceType: 'local', deviceName: '本机',
      files: [{
        name: 'report.txt', path: '/report.txt', isDirectory: false, isFile: true, size: 12,
        modifiedTime: '2026-08-16T10:00:00Z', extension: '.txt'
      }]
    })
  })
  await page.goto('/?file-info-window=1')

  await expect(page.getByRole('heading', { name: 'report.txt' })).toBeVisible()
  await expect(page.locator('.fixed.inset-0')).toHaveCount(0)
  await expect(page.locator('text=常规')).toBeVisible()
})

// 扩展属性 section（2026-08-20）：默认折叠；展开后懒加载列表，
// quarantine 行高亮卡片 + 来源解码 + 专用移除钮，普通行可删/可编辑
test('xattrs section: collapsed by default, lazy loads with quarantine card on expand', async ({ page }) => {
  await installFilemanMock(page)
  await page.addInitScript(() => {
    ;(window as any).fileman.getFileInfoWindowContext = async () => ({
      deviceId: 'local', deviceType: 'local', deviceName: '本机',
      files: [{
        name: 'report.txt', path: '/report.txt', isDirectory: false, isFile: true, size: 12,
        modifiedTime: '2026-08-16T10:00:00Z', extension: '.txt'
      }]
    })
  })
  await page.goto('/?file-info-window=1')

  // 默认折叠：标题在、内容不在（懒加载未发生）
  const toggle = page.getByRole('button', { name: /扩展属性/ })
  await expect(toggle).toBeVisible()
  await expect(page.locator('text=com.test.flag')).toHaveCount(0)

  // 展开：加载 mock 列表，quarantine 卡片与普通行都在
  await toggle.click()
  await expect(page.locator('text=com.test.flag')).toBeVisible()
  await expect(page.locator('text=com.apple.quarantine')).toBeVisible()
  await expect(page.getByRole('button', { name: '移除隔离' })).toBeVisible()
  await expect(page.locator('text=来自 Safari')).toBeVisible()
})
