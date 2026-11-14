import { expect, test, type Page } from '@playwright/test'

// 文件面板扩展快捷键契约（P0/P1/P2 一批）：
// ⌘A 全选 / ⌘⌥A 反选 / ⌘F 搜索聚焦 / ⌘[ ] 历史导航 / ⇧⌘N 新建文件夹 /
// Delete 废纸篓 / F2 重命名 / ⌘D 制作副本 / ⌘V 移动到这里 / ⌥C 复制路径 /
// ⇧D 目录对比 / Tab 双面板切换。
//
// mock 要点（同 paste-select-copy 先例）：listFiles 每次返回新数组；任务入队
// 记录到 window.__fileOps；剪贴板读写显式 mock（镜像成功 + 系统板为空 →
// 粘贴源决策走内部剪贴板）。alt 组合用 event.code 匹配，Playwright 的
// Meta+Alt+x 合成事件 code 恒为 KeyX，不受 Option 改写 key 影响。

interface SetupOpts {
  path?: string
  history?: string[]
  historyIndex?: number
  dual?: boolean
}

async function setup(page: Page, opts: SetupOpts = {}) {
  const path = opts.path ?? '/'
  const history = opts.history ?? [path]
  const historyIndex = opts.historyIndex ?? history.length - 1
  const dual = opts.dual ?? false
  await page.addInitScript(({ path, history, historyIndex, dual }) => {
    const operations: any[] = []
    const entry = (name: string, dir: string, isDirectory = false) => ({
      name, path: `${dir}/${name}`, isDirectory, isFile: !isDirectory,
      size: isDirectory ? 0 : 1, modifiedTime: '2026-08-14T10:00:00Z',
      extension: isDirectory ? '' : name.slice(name.lastIndexOf('.'))
    })
    const listing = (dir: string) => {
      if (dir === '/') return [
        entry('docs', '', true), entry('media', '', true),
        entry('a.txt', ''), entry('b.md', ''), entry('c.png', '')
      ]
      if (dir === '/docs') return [entry('readme.md', '/docs')]
      if (dir === '/media') return [entry('clip.mp4', '/media')]
      return []
    }
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
        canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
        canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true,
        canStream: true, canCaptureScreenshot: false, canArchive: true, canRecycle: true,
        canGrepContent: true, canSymlink: true, canChmod: true, canChown: true
      }),
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dir: string) => listing(dir),
      readFile: async () => btoa('hi'),
      getStats: async () => ({ size: 0, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      onWatchChanged: () => () => undefined,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      createFileOperation: async (params: any) => {
        operations.push(params)
        return {
          id: `t${operations.length}`, type: params.type, status: 'pending',
          sourcePaths: params.sourcePaths || [], progress: { itemResults: [] }
        }
      },
      canTransferBetween: async () => true,
      writeFileClipboard: async () => true,
      readFileClipboard: async () => [],
      clearFileClipboard: async () => undefined,
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
    ;(window as any).__fileOps = operations
    const pane = (id: string, p: string, hist: string[], idx: number) => ({
      id, deviceId: 'local', path: p, history: hist, historyIndex: idx,
      viewMode: 'list', selectedFiles: [], gridSize: 'large'
    })
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      tabs: [{
        id: 't1', title: path.split('/').pop() || 'root',
        panes: dual
          ? [pane('p1', '/', ['/'], 0), pane('p2', '/docs', ['/docs'], 0)]
          : [pane('p1', path, history, historyIndex)],
        activePaneId: 'p1'
      }],
      activeTabId: 't1'
    }))
  }, { path, history, historyIndex, dual })
  await page.goto('/')
  await expect(page.locator('.finder-list-row').first()).toBeVisible()
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

test('Meta+A selects all visible files and Meta+Alt+A inverts', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await expect(page.locator('.finder-list-row .finder-selected')).toHaveCount(1)

  await page.keyboard.press('Meta+Alt+a')
  await expect(page.locator('.finder-list-row .finder-selected')).toHaveCount(4)
  await expect(page.locator('[data-file-path="/a.txt"] .finder-selected')).toHaveCount(0)

  await page.keyboard.press('Meta+a')
  await expect(page.locator('.finder-list-row .finder-selected')).toHaveCount(5)
})

test('Meta+A inside the search input selects text, not files', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+f')
  const search = page.getByPlaceholder('搜索 ⌘F')
  await expect(search).toBeFocused()

  await search.fill('a')
  await page.keyboard.press('Meta+a')
  expect(await search.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 1])
  // 输入框内的 ⌘A 不触碰文件选中
  await expect(page.locator('[data-file-path="/a.txt"] .finder-selected')).toHaveCount(1)
})

test('Meta+F focuses search with live filter and Escape returns focus to the list', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('Meta+f')
  const search = page.getByPlaceholder('搜索 ⌘F')
  await expect(search).toBeFocused()

  // 虚拟列表收缩后可能残留离屏池节点（仍在 DOM），故按「视口内行数」断言过滤
  const visibleRows = () => page.evaluate(() => {
    const scroller = document.querySelector('.vue-recycle-scroller')
    if (!scroller) return -1
    const rect = scroller.getBoundingClientRect()
    return Array.from(scroller.querySelectorAll('[data-file-path]')).filter(el => {
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.bottom > rect.top && r.top < rect.bottom
    }).length
  })
  await expect.poll(visibleRows).toBe(5)

  await search.fill('b')
  await expect(page.locator('[data-file-path="/b.md"]')).toBeVisible()
  await expect.poll(visibleRows).toBe(1)

  await page.keyboard.press('Escape')
  await expect.poll(visibleRows).toBe(5)
  await expect(search).not.toBeFocused()
  // 焦点回列表后方向键立即可用
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.finder-list-row .finder-selected')).toHaveCount(1)
})

test('Meta+[ and Meta+] walk the pane history', async ({ page }) => {
  await setup(page, { path: '/docs', history: ['/', '/docs'], historyIndex: 1 })
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()

  await page.keyboard.press('Meta+[')
  await expect(page.locator('[data-file-path="/a.txt"]')).toBeVisible()

  await page.keyboard.press('Meta+]')
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()
})

test('Meta+Shift+N opens the create-folder sheet', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('Meta+Shift+n')
  const sheet = page.getByRole('dialog', { name: '创建文件夹' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText('新建文件夹')
})

test('Delete opens the trash confirmation for the selection', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Delete')
  const sheet = page.getByRole('alertdialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('要将“a.txt”移到废纸篓吗？')
})

test('F2 starts inline rename with the name stem selected', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('F2')
  const input = page.locator('.finder-rename-input')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('a.txt')
})

test('Meta+D queues a rename-strategy copy task (duplicate)', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+d')

  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('copy')
  expect(ops[0].conflictStrategy).toBe('rename')
  expect(ops[0].sourcePaths).toEqual(['/a.txt'])
})

test('Meta+Alt+V moves clipboard files here and consumes the clipboard', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+c')
  await page.keyboard.press('Meta+Alt+v')

  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('move')
  expect(ops[0].sourcePaths).toEqual(['/a.txt'])

  // move 消费后剪贴板已清：再 ⌘V 不产生第二个任务
  await page.keyboard.press('Meta+v')
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(1)
})

test('Meta+Alt+C copies POSIX paths to the system clipboard', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+Alt+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/a.txt')

  // 多选 → 换行连接
  await page.locator('[data-file-path="/b.md"]').click({ modifiers: ['Meta'] })
  await page.keyboard.press('Meta+Alt+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/a.txt\n/b.md')
})

test('Meta+Shift+D opens directory compare for two selected folders', async ({ page }) => {
  await setup(page)
  await page.locator('[data-file-path="/docs"]').click()
  await page.locator('[data-file-path="/media"]').click({ modifiers: ['Meta'] })
  await page.keyboard.press('Meta+Shift+d')

  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '刷新对比' })).toBeVisible()
})

test('Tab switches the active pane in dual-pane mode', async ({ page }) => {
  await setup(page, { dual: true })
  await expect(page.locator('.finder-pane')).toHaveCount(2)
  await expect(page.locator('.file-pane.is-inactive-pane')).toHaveCount(1)

  // 初始活动面板 p1（根目录）：↓ 选中根目录首项 docs
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-file-path="/docs"] .finder-selected')).toHaveCount(1)

  // Tab → 活动面板切到 p2（/docs），工具栏降透明标识随之迁移
  await page.keyboard.press('Tab')
  await expect(page.locator('.file-pane.is-inactive-pane')).toHaveCount(1)
  await expect(page.locator('.file-pane.is-inactive-pane .file-pane-toolbar-container')).toHaveCSS('opacity', '0.6')

  // ↓ 现在落在 p2 的 readme.md（p1 的选中不受影响）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-file-path="/docs/readme.md"] .finder-selected')).toHaveCount(1)
  await expect(page.locator('[data-file-path="/docs"] .finder-selected')).toHaveCount(1)
})

test('context menus advertise the new shortcuts', async ({ page }) => {
  await setup(page)
  // 文件菜单：制作副本
  await page.locator('[data-file-path="/a.txt"]').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '制作副本' })).toBeVisible()

  // Esc 关闭文件菜单 → 选中 a.txt 并 ⌘C → 空白菜单：全选 / 反选 / 移动到这里
  await page.keyboard.press('Escape')
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+c')
  await page.mouse.click(900, 680, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: '全选' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '反选' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '移动到这里' })).toBeVisible()
})
