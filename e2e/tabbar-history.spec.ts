import { expect, test, type Page } from '@playwright/test'

// 顶部「历史目录」弹层（时钟按钮）回归：
// 1. 种 12 条 recent locations → 弹层截到 10 条，首条最新、副行为父路径
// 2. 点击条目 → 新 tab 打开并激活，标题为目录尾段；打开动作把该条重新置顶
// 3. 键盘 ↓ 移动选中、Enter 打开、Esc 关闭
// 4. 清除后重开为空态（计数 0 + 空态文案 + 清除钮禁用）
//
// 定位约定：.tab-cluster 按钮用中文 aria 名称（locale 已固定 zh-CN）；
// 浮层根 .tab-history-menu、行 .tab-history-row（tab-bar-redesign 同款契约）；
// tab 用 .finder-tab-strip .tab-item + aria-selected。

interface SeedPane {
  id: string
  deviceId: string
  path: string
  history: string[]
  historyIndex: number
  viewMode: string
  selectedFiles: string[]
  gridSize: string
}

function browseTab(id: string, path: string): Record<string, unknown> {
  const pane: SeedPane = {
    id: `${id}-p`, deviceId: 'local', path, history: [path], historyIndex: 0,
    viewMode: 'list', selectedFiles: [], gridSize: 'large'
  }
  return { id, title: path.split('/').filter(Boolean).pop(), panes: [pane], activePaneId: pane.id }
}

/** recent 数组顺序即展示顺序（rememberLocation 新的在前）：dir-11 … dir-02（取前 count 条）。 */
function seedRecents(count: number): Array<Record<string, number | string>> {
  return Array.from({ length: count }, (_, i) => ({
    deviceId: 'local',
    path: `/hist/dir-${String(11 - i).padStart(2, '0')}`,
    visitedAt: 1_700_000_000_000 + (12 - i) * 1000
  }))
}

async function setup(page: Page, recents: Array<Record<string, number | string>>) {
  await page.addInitScript((payload: { state: string; recents: string }) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        const base = path === '/' ? '' : path
        return Array.from({ length: 5 }, (_, i) => ({
          name: `f-${i}.txt`, path: `${base}/f-${i}.txt`,
          isDirectory: false, isFile: true, size: 1,
          modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt'
        }))
      },
      readFile: async () => btoa('hi'),
      getStats: async (_deviceId: string, path: string) => ({
        size: 0, isDirectory: path.startsWith('/hist/'), isFile: !path.startsWith('/hist/'),
        modifiedTime: '', createdTime: '', mode: 0
      }),
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      onWatchChanged: () => () => undefined,
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
    localStorage.setItem('fileman-tabs-state', JSON.stringify(JSON.parse(payload.state)))
    localStorage.setItem('fileman-recent-locations', JSON.stringify(JSON.parse(payload.recents)))
  }, {
    state: JSON.stringify({ tabs: [browseTab('t-seed', '/hist/start')], activeTabId: 't-seed' }),
    recents: JSON.stringify(recents)
  })
  await page.goto('/')
  await expect(page.locator('.finder-tab-strip .tab-item').first()).toBeVisible()
}

test('12 条截到 10，点击开新 tab 并置顶', async ({ page }) => {
  await setup(page, seedRecents(12))

  const historyBtn = page.getByRole('button', { name: '历史目录' })
  await expect(historyBtn).toBeVisible()
  await expect(historyBtn).toHaveAttribute('aria-expanded', 'false')

  const menu = page.locator('.tab-history-menu')
  await historyBtn.click()
  await expect(menu).toBeVisible()
  await expect(historyBtn).toHaveAttribute('aria-expanded', 'true')

  // 截断：12 → 10；顺序最新在前；副行为父路径
  const rows = menu.locator('.tab-history-row')
  await expect(rows).toHaveCount(10)
  await expect(rows.first().locator('.tab-history-name')).toHaveText('dir-11')
  await expect(rows.first().locator('.tab-history-path')).toHaveText('/hist')

  // 点击 dir-05 → 新 tab 打开并激活，标题为目录尾段
  await rows.filter({ hasText: 'dir-05' }).first().click()
  await expect(menu).toBeHidden()
  const tabItems = page.locator('.finder-tab-strip .tab-item')
  await expect(tabItems).toHaveCount(2)
  const activeTab = page.locator('.finder-tab-strip .tab-item[aria-selected="true"]')
  await expect(activeTab.locator('.tab-title-leaf')).toHaveText('dir-05')

  // 重新打开：被打开的目录已置顶（打开动作显式 rememberLocation）
  await historyBtn.click()
  await expect(menu).toBeVisible()
  await expect(rows.first().locator('.tab-history-name')).toHaveText('dir-05')
})

test('键盘 ↓/Enter 打开，Esc 关闭，清除后空态', async ({ page }) => {
  await setup(page, seedRecents(3)) // dir-11 / dir-10 / dir-09

  const historyBtn = page.getByRole('button', { name: '历史目录' })
  await historyBtn.click()
  const menu = page.locator('.tab-history-menu')
  const rows = menu.locator('.tab-history-row')
  await expect(rows).toHaveCount(3)

  // 键盘：默认第 0 行选中，↓ 到第 1 行，Enter 在新 tab 打开
  await expect(rows.nth(0)).toHaveClass(/is-active/)
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toHaveClass(/is-active/)
  await page.keyboard.press('Enter')
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
  const activeTab = page.locator('.finder-tab-strip .tab-item[aria-selected="true"]')
  await expect(activeTab.locator('.tab-title-leaf')).toHaveText('dir-10')

  // Esc 关闭
  await historyBtn.click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // 清除 → 重开为空态
  await historyBtn.click()
  await menu.getByRole('button', { name: '清除历史记录' }).click()
  await expect(menu).toBeHidden()
  await historyBtn.click()
  await expect(menu).toBeVisible()
  await expect(menu.locator('.tab-history-count')).toHaveText('最近访问 · 0')
  await expect(menu.locator('.tab-history-empty')).toHaveText('暂无访问记录')
  await expect(menu.locator('.tab-history-row')).toHaveCount(0)
})
