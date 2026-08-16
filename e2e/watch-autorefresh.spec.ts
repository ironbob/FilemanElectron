import { expect, test } from '@playwright/test'

// 目录监听自动刷新（watch:changed）回归：
// 1. 订阅随 FileList 挂载建立（watchSubscribe 以当前 deviceId+path 调用）
// 2. 推送到达但列表签名无变化 → 不刷新（保护选区）
// 3. 推送到达且列表有变化 → 自动出现新条目（300ms 合并 + diff 守卫 + 重载）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      // 列表内容受 window.__mutate 控制：true 时追加一个新文件（模拟外部变化）
      listFiles: async () => {
        const base = Array.from({ length: 5 }, (_, i) => {
          const name = `file-${String(i + 1).padStart(2, '0')}.txt`
          return {
            name, path: `/${name}`, isDirectory: false, isFile: true, size: 12,
            modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt'
          }
        })
        if ((window as any).__mutate) {
          base.push({
            name: 'new-file.txt', path: '/new-file.txt', isDirectory: false, isFile: true,
            size: 99, modifiedTime: '2026-08-15T11:00:00Z', extension: '.txt'
          })
        }
        return base
      },
      watchSubscribe: async (deviceId: string, dirPath: string) => {
        ;(window as any).__watchSubscribed = { deviceId, dirPath }
        return { ok: true }
      },
      watchUnsubscribe: async () => undefined,
      onWatchChanged: (callback: (event: { deviceId: string; dirPath: string }) => void) => {
        // 多订阅者语义（真实 ipcRenderer.on 支持多监听；App 的 git store 与
        // FileList 都会订阅，单槽 mock 会互相覆盖）
        ;(window as any).__watchListeners = ((window as any).__watchListeners ?? []).concat([callback])
        return () => {
          ;(window as any).__watchListeners = ((window as any).__watchListeners ?? []).filter((cb: unknown) => cb !== callback)
        }
      },
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
    localStorage.removeItem('fileman-tabs-state')
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toBeVisible()
})

test('subscribes to the visible directory on mount', async ({ page }) => {
  const subscribed = await page.evaluate(() => (window as any).__watchSubscribed)
  expect(subscribed).toEqual({ deviceId: 'local', dirPath: '/' })
})

test('watch event with unchanged listing does not disturb selection', async ({ page }) => {
  await page.locator('[data-file-path="/file-01.txt"]').click()
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toHaveClass(/finder-selected/)

  // 无变化推送（__mutate 未开）：diff 守卫应拦截刷新
  await page.evaluate(() => { for (const cb of (window as any).__watchListeners ?? []) cb({ deviceId: 'local', dirPath: '/' }) })
  await page.waitForTimeout(700) // 300ms 合并 + diff 拉取余量

  await expect(page.locator('[data-file-path="/new-file.txt"]')).toHaveCount(0)
  // 选区必须原样保留
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toHaveClass(/finder-selected/)
})

test('watch event with changed listing reloads and shows the new file', async ({ page }) => {
  await page.evaluate(() => { (window as any).__mutate = true })
  await page.evaluate(() => { for (const cb of (window as any).__watchListeners ?? []) cb({ deviceId: 'local', dirPath: '/' }) })
  await expect(page.locator('[data-file-path="/new-file.txt"]')).toBeVisible({ timeout: 3000 })
})

test('watch events for a different directory are ignored', async ({ page }) => {
  await page.evaluate(() => { (window as any).__mutate = true })
  await page.evaluate(() => { for (const cb of (window as any).__watchListeners ?? []) cb({ deviceId: 'local', dirPath: '/other' }) })
  await page.waitForTimeout(700)
  await expect(page.locator('[data-file-path="/new-file.txt"]')).toHaveCount(0)
})
