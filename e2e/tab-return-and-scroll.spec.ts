import { expect, test, type Page } from '@playwright/test'

// 双击开预览 tab 的「关回来源」与面板滚动位置记忆回归：
// 1. 末位预览 tab 关闭 → 回到打开它的来源 tab（而非左侧相邻）
// 2. 再次双击已打开的文件 → 复用激活已有预览 tab，且来源记忆重定向到本次打开者
// 3. 切 tab 后滚动位置保留；面板内导航（进子目录）确定性回顶
//
// 定位约定：.finder-tab-strip .tab-item + aria-selected（tab-bar-redesign 同款）；
// 滚动容器用 .vue-recycle-scroller 根元素（quick-look / context-menu 同款契约）。

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

async function setup(page: Page, tabs: Array<Record<string, unknown>>, activeTabId: string) {
  await page.addInitScript((stateJson: string) => {
    const state = JSON.parse(stateJson)
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        // 路径拼接需容 '/'（goUp 会到根）：'/' + '/f-0' 会成 '//f-0'
        const base = path === '/' ? '' : path
        const dir = { name: 'sub', path: `${base}/sub`, isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' }
        // 固定绝对路径的共享文件：两个 tab 里双击的是同一 path+deviceId，用于命中
        // openPreview 的去重复用（retarget）分支。命名 aaa- 保证排在 f-* 之前、
        // 落在首屏（虚拟滚动只渲染可见行）
        const shared = { name: 'aaa-shared.txt', path: '/shared/aaa-shared.txt', isDirectory: false, isFile: true, size: 2, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' }
        const files = Array.from({ length: 200 }, (_, i) => ({
          name: `f-${String(i).padStart(3, '0')}.txt`,
          path: `${base}/f-${String(i).padStart(3, '0')}.txt`,
          isDirectory: false, isFile: true, size: 1,
          modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt'
        }))
        return [dir, shared, ...files]
      },
      readFile: async () => btoa('hi'),
      getStats: async (_deviceId: string, path: string) => ({
        size: 0, isDirectory: path.endsWith('/sub'), isFile: !path.endsWith('/sub'),
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
    localStorage.setItem('fileman-tabs-state', JSON.stringify(state))
  }, JSON.stringify({ tabs, activeTabId }))
  await page.goto('/')
  await expect(page.locator('.finder-tab-strip .tab-item').first()).toBeVisible()
}

function tabs(page: Page) {
  return page.locator('.finder-tab-strip .tab-item')
}

function activeTab(page: Page) {
  return page.locator('.tab-item[aria-selected="true"]')
}

async function scrollerTop(page: Page): Promise<number> {
  return page.locator('.vue-recycle-scroller').first().evaluate(el => el.scrollTop)
}

// ============ 关预览 tab 回来源 ============

test('closing a preview tab opened by dblclick returns to its origin tab', async ({ page }) => {
  // 来源 t1 排在首位：若无来源记忆，关末位预览 tab 会错误落到左侧相邻 t3
  await setup(page, [browseTab('t1', '/dirA'), browseTab('t2', '/dirB'), browseTab('t3', '/dirC')], 't1')

  // 双击 txt → 末位追加预览 tab 并激活
  await page.locator('[data-file-path="/shared/aaa-shared.txt"]').dblclick()
  await expect(tabs(page)).toHaveCount(4)
  await expect(activeTab(page)).toHaveText(/aaa-shared\.txt/)

  // ⌘W 关闭 → 回来源 t1（dirA），而非 dirC
  await page.keyboard.press('Meta+w')
  await expect(tabs(page)).toHaveCount(3)
  await expect(activeTab(page)).toHaveText(/dirA/)
})

test('reopening the same file retargets origin to the current tab', async ({ page }) => {
  await setup(page, [browseTab('t1', '/dirA'), browseTab('t2', '/dirB'), browseTab('t3', '/dirC')], 't1')

  // t1 打开预览 → 切到 t2 → 再次双击同一文件（同 path+deviceId 复用激活）
  await page.locator('[data-file-path="/shared/aaa-shared.txt"]').dblclick()
  await expect(activeTab(page)).toHaveText(/aaa-shared\.txt/)
  await tabs(page).filter({ hasText: 'dirB' }).click()
  await expect(page.locator('[data-file-path="/dirB/f-000.txt"]')).toBeVisible()
  await page.locator('[data-file-path="/shared/aaa-shared.txt"]').dblclick()
  await expect(tabs(page)).toHaveCount(4)
  await expect(activeTab(page)).toHaveText(/aaa-shared\.txt/)

  // 关闭 → 回到本次打开者 t2（dirB），而非最初的 t1
  await page.keyboard.press('Meta+w')
  await expect(tabs(page)).toHaveCount(3)
  await expect(activeTab(page)).toHaveText(/dirB/)
})

// ============ 滚动位置记忆 ============

test('scroll position survives tab switches and resets on navigation', async ({ page }) => {
  await setup(page, [browseTab('t1', '/dirA'), browseTab('t2', '/dirB')], 't1')

  // 程序化滚动（派发 scroll 事件 → rAF 保存），等一拍让保存落定
  const scroller = page.locator('.vue-recycle-scroller').first()
  await scroller.evaluate(el => { el.scrollTop = 520 })
  await page.waitForTimeout(150)
  expect(await scrollerTop(page)).toBe(520)

  // 切到 t2（p1 卸载）再切回（重挂载）→ 恢复 520
  await tabs(page).filter({ hasText: 'dirB' }).click()
  await expect(page.locator('[data-file-path="/dirB/f-000.txt"]')).toBeVisible()
  await tabs(page).filter({ hasText: 'dirA' }).click()
  await expect(page.locator('[data-file-path="/dirA/f-000.txt"]')).toBeVisible()
  await page.waitForTimeout(150)
  expect(await scrollerTop(page)).toBe(520)

  // 面板内导航（工具栏「前往上级」）→ 确定性回顶。不能双击 sub 行：恢复到 520
  // 后第 0 行已被虚拟滚动回收，不在 DOM。导航后 mock 对 '/' 仍返回同一批文件，
  // 断言只看 scrollTop 被重置为 0
  await page.locator('button[title="前往上级文件夹"]').click()
  await expect(page.locator('[data-file-path="/f-000.txt"]')).toBeVisible()
  await page.waitForTimeout(150)
  expect(await scrollerTop(page)).toBe(0)
})
