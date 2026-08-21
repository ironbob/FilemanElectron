import { expect, test, type Page } from '@playwright/test'

// FileList 行内重命名 Finder 化（2026-08-21）：底部 rename-bar 退场，名称原地
// 换输入框（三视图）。契约锁：
// - Enter（单选）进入编辑：输入框出现在行内，默认只选主体（保留扩展名）；
// - Enter/Tab 提交 → createFileOperation 携 { type:'rename', sourcePaths, newName }；
// - Esc 取消 → 零任务；外点（空白 mousedown 被 preventDefault 吞 blur 的路径）
//   显式 blur 提交；右键「重新命名…」同链路；grid 视图输入框居中。
//
// mock 要点（同 create-delete-sheets 先例）：listFiles 每次返回新数组；
// volumes 必须mock（工具栏 onMounted 依赖），否则毒化整页。

async function setup(page: Page, viewMode: 'list' | 'grid' = 'list') {
  await page.addInitScript((mode: string) => {
    const operations: any[] = []
    const file = (name: string) => ({
      name, path: `/${name}`, isDirectory: false, isFile: true, size: 4,
      modifiedTime: '2026-08-14T10:00:00Z', extension: name.slice(name.lastIndexOf('.'))
    })
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      // 全能力（同 context-menu.spec 先例）：不 mock 会经 Proxy 兜底返回
      // undefined，caps?.canRename 为假 →「重新命名…」不出现
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
      listFiles: async (_d: string, dir: string) => {
        if (dir === '/') return [file('a.txt'), file('b.md'), file('c.png')]
        return []
      },
      exists: async () => false,
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
      onFileOperationUpdated: () => () => undefined,
      canTransferBetween: async () => true,
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
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      tabs: [{
        id: 't1', title: '本机',
        panes: [{
          id: 't1-p', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0,
          viewMode: mode, selectedFiles: [], gridSize: 'large'
        }],
        activePaneId: 't1-p'
      }],
      activeTabId: 't1'
    }))
  }, viewMode)
  await page.goto('/')
  const row = page.locator('.file-item').first()
  await expect(row).toBeVisible()
}

/** 选中 a.txt 后回车，返回行内输入框 */
async function startEditing(page: Page) {
  await page.locator('.file-item', { hasText: 'a.txt' }).first().click()
  await page.keyboard.press('Enter')
  const input = page.locator('.file-item input').first()
  await expect(input).toBeVisible()
  return input
}

test('enter starts in-place edit with stem-only selection', async ({ page }) => {
  await setup(page)
  const input = await startEditing(page)
  // 默认只选主体：a.txt → [0,1)，扩展名 .txt 保留不选
  const state = await input.evaluate(el => [el.value, el.selectionStart, el.selectionEnd])
  expect(state).toEqual(['a.txt', 0, 1])
  // 输入框获得焦点（进入编辑即聚焦）
  await expect(input).toBeFocused()
})

test('enter commits rename task and closes editor', async ({ page }) => {
  await setup(page)
  const input = await startEditing(page)
  await input.fill('renamed.txt')
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps)).toMatchObject([
    { type: 'rename', sourcePaths: ['/a.txt'], newName: 'renamed.txt' }
  ])
})

test('escape cancels with zero tasks', async ({ page }) => {
  await setup(page)
  const input = await startEditing(page)
  await input.fill('renamed.txt')
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
  await expect(page.locator('.file-item', { hasText: 'a.txt' }).first()).toBeVisible()
  expect(await page.evaluate(() => (window as any).__fileOps)).toEqual([])
})

test('click on blank area commits (blur path past preventDefault)', async ({ page }) => {
  await setup(page)
  const input = await startEditing(page)
  await input.fill('blurred.txt')
  // 表头左端（非按钮区）：容器 mousedown → 空白路径 startRubberBand 会
  // preventDefault 吞掉默认 blur，靠显式 blur 提交（Finder「外点提交」语义）
  await page.locator('.finder-list-header').click({ position: { x: 8, y: 8 } })
  await expect(input).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps)).toMatchObject([
    { type: 'rename', sourcePaths: ['/a.txt'], newName: 'blurred.txt' }
  ])
})

test('context menu 重新命名… enters in-place edit', async ({ page }) => {
  await setup(page)
  await page.locator('.file-item', { hasText: 'a.txt' }).first().click({ button: 'right' })
  // 菜单项 aria-label 为「标签+快捷键」复合串（重新命名… Return），须子串匹配
  await page.getByRole('menuitem', { name: '重新命名…' }).click()
  const input = page.locator('.file-item input').first()
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
})

test('grid view: centered editor inside the icon cell', async ({ page }) => {
  await setup(page, 'grid')
  const input = await startEditing(page)
  expect(await input.evaluate(el => getComputedStyle(el).textAlign)).toBe('center')
  // 单行输入（原 line-clamp-2 标签换 nowrap 输入框）
  expect(await input.evaluate(el => getComputedStyle(el).webkitLineClamp || 'none')).toBe('none')
})
