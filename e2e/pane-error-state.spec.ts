import { expect, test } from '@playwright/test'

// 目录失效错误状态（Finder 改名/删除等外部变化）回归：
// 1. watch 推送 poke 到已消失目录 → 面板翻转错误态（非「该文件夹为空」）+ tab 栏 ⚠
// 2. 「重试」在目录恢复后载回内容、⚠ 消失
// 3. 「转到上级文件夹」导航到最近的存在祖先（zip-aware 逐级探测的普通路径分支）
// 4. 瞬态失败（listFiles 拒绝但 exists=true）不出错误 UI（设备瞬断容忍）
//
// mock 语义：window.__dead = true 时 '/subdir' 视为已被外部改名/删除
//（listFiles 拒绝、exists false）；其余路径不受影响。
// window.__failOnce 消费一次后自清（瞬态单次失败）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // 每次返回新数组（Pinia 持引用，共享数组 + 事件回调 = 双倍计数坑）
    const rootFiles = () => [
      ...Array.from({ length: 5 }, (_, i) => {
        const name = `file-${String(i + 1).padStart(2, '0')}.txt`
        return {
          name, path: `/${name}`, isDirectory: false, isFile: true, size: 12,
          modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt'
        }
      }),
      { name: 'subdir', path: '/subdir', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' }
    ]
    const subdirFiles = () => [
      { name: 'inner-a.txt', path: '/subdir/inner-a.txt', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' },
      { name: 'inner-b.txt', path: '/subdir/inner-b.txt', isDirectory: false, isFile: true, size: 6, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
    ]
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        if ((window as any).__failOnce) {
          ;(window as any).__failOnce = false
          throw new Error('ECONNRESET transient')
        }
        if (path === '/subdir' && (window as any).__dead) {
          throw new Error('ENOENT: no such file or directory')
        }
        return path === '/subdir' ? subdirFiles() : rootFiles()
      },
      exists: async (_deviceId: string, path: string) => {
        return !(path === '/subdir' && (window as any).__dead)
      },
      watchSubscribe: async (deviceId: string, dirPath: string) => {
        ;(window as any).__watchSubscribed = { deviceId, dirPath }
        return { ok: true }
      },
      watchUnsubscribe: async () => undefined,
      onWatchChanged: (callback: (event: { deviceId: string; dirPath: string }) => void) => {
        // 多订阅者语义（git store 与 FileList 都会订阅，单槽 mock 互相覆盖）
        ;(window as any).__watchListeners = ((window as any).__watchListeners ?? []).concat([callback])
        return () => {
          ;(window as any).__watchListeners = ((window as any).__watchListeners ?? []).filter((cb: unknown) => cb !== callback)
        }
      },
      getStats: async () => ({ size: 12, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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

/** 进入 /subdir 并等待其内容渲染。 */
async function enterSubdir(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/subdir"]').dblclick()
  await expect(page.locator('[data-file-path="/subdir/inner-a.txt"]')).toBeVisible()
}

/** 触发一次针对当前目录的 watch 推送（模拟主进程 WatchService 的失效 poke）。 */
function pokeWatch(page: import('@playwright/test').Page, dirPath: string) {
  void page.evaluate(dir => {
    for (const cb of (window as any).__watchListeners ?? []) cb({ deviceId: 'local', dirPath: dir })
  }, dirPath)
}

test('watch poke on deleted directory flips pane to error state with tab marker', async ({ page }) => {
  await enterSubdir(page)
  await page.evaluate(() => { (window as any).__dead = true })
  pokeWatch(page, '/subdir')

  await expect(page.getByText('文件夹已不存在')).toBeVisible({ timeout: 3000 })
  // 列表被错误态整体替换（不是误导性的「该文件夹为空」）
  await expect(page.locator('[data-file-path]')).toHaveCount(0)
  await expect(page.getByText('该文件夹为空')).toHaveCount(0)
  // tab 栏 ⚠ 标记
  await expect(page.locator('.tab-error-icon')).toBeVisible()
})

test('retry reloads content after the directory comes back', async ({ page }) => {
  await enterSubdir(page)
  await page.evaluate(() => { (window as any).__dead = true })
  pokeWatch(page, '/subdir')
  await expect(page.getByText('文件夹已不存在')).toBeVisible({ timeout: 3000 })

  await page.evaluate(() => { (window as any).__dead = false })
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.locator('[data-file-path="/subdir/inner-a.txt"]')).toBeVisible({ timeout: 3000 })
  await expect(page.locator('.tab-error-icon')).toHaveCount(0)
})

test('go to parent folder navigates to the nearest existing ancestor', async ({ page }) => {
  await enterSubdir(page)
  await page.evaluate(() => { (window as any).__dead = true })
  pokeWatch(page, '/subdir')
  await expect(page.getByText('文件夹已不存在')).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: '转到上级文件夹' }).click()
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toBeVisible({ timeout: 3000 })
  const subscribed = await page.evaluate(() => (window as any).__watchSubscribed)
  expect(subscribed).toEqual({ deviceId: 'local', dirPath: '/' })
})

test('transient listFiles failure does not flip to error state', async ({ page }) => {
  // 单次失败但目录仍存在（exists=true）：refreshAfterWatchEvent 保守判别应保持静默
  await page.evaluate(() => { (window as any).__failOnce = true })
  pokeWatch(page, '/')
  await page.waitForTimeout(700) // 300ms 合并 + exists 判别余量

  await expect(page.getByText('文件夹已不存在')).toHaveCount(0)
  await expect(page.getByText('无法加载文件夹')).toHaveCount(0)
  await expect(page.locator('.tab-error-icon')).toHaveCount(0)
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toBeVisible()
})
