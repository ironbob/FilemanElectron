import { expect, test, type Page } from '@playwright/test'

// 弹层打开期间放行标题栏拖拽区（useAppDragSuspend）回归：
// 根因：macOS 上 -webkit-app-region: drag 区域（标题栏/标签条 .app-drag）由
// 窗口层整片吞掉鼠标事件，弹层的 document 级外点关闭收不到标题栏点击，
// 表现为「点标题栏弹层不消失」。修复：弹层存续期间 <html> 置
// data-app-drag-suspended，全局规则把 .app-drag 降级为 no-drag。
//
// 验证（历史目录/标签总览/标签右键菜单三条链路）：
// 1. 打开 → html 带标记，标题栏/标签条 computed app-region 变 no-drag
// 2. 点标题栏空白（红绿灯保留区，app-drag 区域）→ 弹层关闭、标记清除、region 回 drag
// 3. Esc 关闭同样还原（非标题栏路径不残留挂起）
//
// 说明：Playwright 合成事件不经 OS 窗口层（真实 Electron 里 drag 区会吞掉
// 原生点击），本用例验证放行机制本身——标记置位/清除与 CSS 规则命中；
// OS 级 region 动态更新由 Chromium 保证。

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

async function setup(page: Page) {
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
        size: 0, isDirectory: path.startsWith('/tb/'), isFile: !path.startsWith('/tb/'),
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
    state: JSON.stringify({ tabs: [browseTab('t-seed', '/tb/start')], activeTabId: 't-seed' }),
    recents: JSON.stringify([
      { deviceId: 'local', path: '/tb/dir-a', visitedAt: 1_700_000_002_000 },
      { deviceId: 'local', path: '/tb/dir-b', visitedAt: 1_700_000_001_000 }
    ])
  })
  await page.goto('/')
  await expect(page.locator('.finder-tab-strip .tab-item').first()).toBeVisible()
}

/** 拖拽放行状态：<html> 标记 + 标题栏/标签条的 computed app-region。 */
function dragState(page: Page) {
  return page.evaluate(() => ({
    suspended: document.documentElement.hasAttribute('data-app-drag-suspended'),
    titlebarRegion: document.querySelector('.finder-window-titlebar') !== null
      ? getComputedStyle(document.querySelector('.finder-window-titlebar')!).getPropertyValue('-webkit-app-region').trim()
      : null,
    stripRegion: document.querySelector('.finder-tab-strip') !== null
      ? getComputedStyle(document.querySelector('.finder-tab-strip')!).getPropertyValue('-webkit-app-region').trim()
      : null
  }))
}

/** 点标题栏空白（红绿灯保留区上方，落在 app-drag 的标题栏根上；该处无交互元素）。 */
async function clickTitlebarBlank(page: Page) {
  const box = await page.locator('.finder-window-titlebar').boundingBox()
  // 红绿灯保留区中点（w-16=64px）：空 div 高度为 0，点击落在标题栏根本体
  await page.mouse.click(box!.x + 32, box!.y + box!.height / 2)
}

test('初始无挂起，历史目录弹层点标题栏关闭并还原拖拽区', async ({ page }) => {
  await setup(page)

  // 初始：未挂起，拖拽区生效
  expect(await dragState(page)).toEqual({ suspended: false, titlebarRegion: 'drag', stripRegion: 'drag' })

  // 打开历史目录 → 挂起置位，两处拖拽区均放行
  await page.getByRole('button', { name: '历史目录' }).click()
  const menu = page.locator('.tab-history-menu')
  await expect(menu).toBeVisible()
  expect(await dragState(page)).toEqual({ suspended: true, titlebarRegion: 'no-drag', stripRegion: 'no-drag' })

  // 点标题栏空白（drag 区域）→ 弹层关闭、挂起清除、拖拽区还原
  await clickTitlebarBlank(page)
  await expect(menu).toBeHidden()
  expect(await dragState(page)).toEqual({ suspended: false, titlebarRegion: 'drag', stripRegion: 'drag' })
})

test('标签总览弹层点标题栏关闭并还原拖拽区', async ({ page }) => {
  await setup(page)

  await page.getByRole('button', { name: '标签总览' }).click()
  const menu = page.locator('.tab-overview-menu')
  await expect(menu).toBeVisible()
  expect(await dragState(page)).toEqual({ suspended: true, titlebarRegion: 'no-drag', stripRegion: 'no-drag' })

  await clickTitlebarBlank(page)
  await expect(menu).toBeHidden()
  expect(await dragState(page)).toEqual({ suspended: false, titlebarRegion: 'drag', stripRegion: 'drag' })
})

test('标签右键菜单（FinderContextMenu 链路）点标题栏关闭并还原', async ({ page }) => {
  await setup(page)

  await page.locator('.finder-tab-strip .tab-item').first().click({ button: 'right' })
  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()
  expect(await dragState(page)).toEqual({ suspended: true, titlebarRegion: 'no-drag', stripRegion: 'no-drag' })

  await clickTitlebarBlank(page)
  await expect(menu).toBeHidden()
  expect(await dragState(page)).toEqual({ suspended: false, titlebarRegion: 'drag', stripRegion: 'drag' })
})

test('Esc 关闭不残留挂起', async ({ page }) => {
  await setup(page)

  await page.getByRole('button', { name: '历史目录' }).click()
  await expect(page.locator('.tab-history-menu')).toBeVisible()
  expect((await dragState(page)).suspended).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.locator('.tab-history-menu')).toBeHidden()
  expect(await dragState(page)).toEqual({ suspended: false, titlebarRegion: 'drag', stripRegion: 'drag' })
})
