import { expect, test, type Page } from '@playwright/test'

// 图片集合面板文件管理回归（多选 + 右键菜单 + 任务同步 + 定位）：
// 1. 多选语义：单击=跳转+单选；⌘单击=加选（不跳转）；Shift=范围选；⌘A 全选；Esc 取消
// 2. 右键菜单项齐全；定位 → 新 tab 打开所在文件夹并选中该文件
// 3. 拷贝/剪切 → 应用内剪贴板 + 系统板镜像；剪切后在定位 tab 粘贴 → move 任务
// 4. 移到废纸篓 → 确认 Sheet → recycle 任务 → 完成事件移除列表项并 clamp 当前项
// 5. ⌥⌫ 立即删除 → delete 任务；重命名 → rename 任务 → 完成事件改名同步
// 6. ⌘D 制作副本 → 同目录 copy(rename) → 完成事件重扫，副本出现在列表
//
// mock 要点（同 image-edit / paste-select-copy 先例）：
// - search 递归返回 4 张（/docs 两张 + /docs/sub 两张）；
// - 完成事件用 __taskPush 驱动（preview store 应用级订阅消费）；
// - writeFileClipboard/readFileClipboard 模拟系统板镜像，供剪切→粘贴决策。

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAAB4CAIAAAA48Cq8AAABTElEQVR4nO3SUQkAIBTAQIO9/hjLEw5BDi7APrb2DFy3nhfwJWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFokDDtc23OlfnesAAAAASUVORK5CYII='

async function setup(page: Page) {
  await page.addInitScript((png: string) => {
    const operations: any[] = []
    const clipCalls: string[][] = []
    const listeners: Array<(t: any) => void> = []
    let systemClip: string[] = []
    let dupLanded = false
    const img = (name: string, dir: string) => ({
      name, path: `${dir}/${name}`, isDirectory: false, isFile: true, size: 100,
      modifiedTime: '2026-08-16T10:00:00Z', extension: '.png'
    })
    const dir = (name: string, path: string) => ({
      name, path, isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-16T10:00:00Z', extension: ''
    })
    const allImages = () => {
      const list = [img('a.png', '/docs'), img('b.png', '/docs'), img('c.png', '/docs/sub'), img('d.png', '/docs/sub')]
      if (dupLanded) list.push(img('b 副本.png', '/docs'))
      return list.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
    }
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [{ id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }],
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
        canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
        canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true
      }),
      listFiles: async (_d: string, path: string) => {
        if (path === '/docs') {
          const list = [img('a.png', '/docs'), img('b.png', '/docs'), dir('sub', '/docs/sub')]
          if (dupLanded) list.push(img('b 副本.png', '/docs'))
          return list
        }
        if (path === '/docs/sub') return [img('c.png', '/docs/sub'), img('d.png', '/docs/sub')]
        return [dir('docs', '/docs')]
      },
      search: async (_d: string, root: string) => allImages().filter(f => f.path.startsWith(root + '/')),
      readFile: async () => png,
      getStats: async (_d: string, path: string) => ({
        size: 100, isDirectory: !path.endsWith('.png'), isFile: path.endsWith('.png'),
        modifiedTime: '', createdTime: '', mode: 0
      }),
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      canTransferBetween: async () => true,
      createFileOperation: async (params: any) => {
        operations.push(params)
        return {
          id: `t${operations.length}`, type: params.type, status: 'pending',
          sourcePaths: params.sourcePaths || [], progress: { itemResults: [] }
        }
      },
      onFileOperationUpdated: (cb: (t: any) => void) => {
        listeners.push(cb)
        return () => undefined
      },
      writeFileClipboard: async (paths: string[]) => {
        systemClip = [...paths]
        clipCalls.push([...paths])
        return true
      },
      readFileClipboard: async () => [...systemClip],
      clearFileClipboard: async () => { systemClip = []; return true },
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
    ;(window as any).__clipCalls = clipCalls
    ;(window as any).__dupLanded = (v?: boolean) => { if (v !== undefined) dupLanded = v; return dupLanded }
    ;(window as any).__taskPush = { push: (t: any) => listeners.forEach(cb => cb(t)) }
    localStorage.removeItem('fileman-tabs-state')
  }, PNG_B64)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/docs"]')).toBeVisible()
}

/** 目录右键 → 图片 → 预览图片（递归）→ 集合面板 4 张。 */
async function openCollection(page: Page) {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览图片（递归）').click()
  await expect(page.locator('.icn-cell')).toHaveCount(4)
}

const cell = (page: Page, path: string) => page.locator(`.icn-cell[data-path="${path}"]`)
const chip = (page: Page) => page.getByTestId('icn-selection-chip')

function completedTask(fields: Record<string, any>) {
  return {
    id: `t${Math.random().toString(36).slice(2, 8)}`,
    sourceDeviceId: 'local',
    status: 'completed',
    progress: { currentFile: '', currentFileIndex: 0, totalFiles: 0, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [] },
    createdAt: 1, startedAt: 1, completedAt: 2,
    ...fields
  }
}

test.beforeEach(async ({ page }) => {
  await setup(page)
})

test('multi-select: click / cmd-click / shift-range / select-all / escape', async ({ page }) => {
  await openCollection(page)

  // 单击：跳转预览 + 单选
  await cell(page, '/docs/a.png').click()
  await expect(cell(page, '/docs/a.png')).toHaveAttribute('data-selected', 'true')
  await expect(chip(page)).toContainText('已选 1 张')
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('1 / 4')).toBeVisible()

  // ⌘单击：加选，预览不动（仍 1 / 4）
  await cell(page, '/docs/sub/c.png').click({ modifiers: ['Meta'] })
  await expect(chip(page)).toContainText('已选 2 张')
  await expect(cell(page, '/docs/a.png')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('1 / 4')).toBeVisible()

  // Shift 单击：从锚点 c 到 d 范围选（替换选区，a 退出）
  await cell(page, '/docs/sub/d.png').click({ modifiers: ['Shift'] })
  await expect(chip(page)).toContainText('已选 2 张')
  await expect(cell(page, '/docs/a.png')).not.toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '/docs/sub/c.png')).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '/docs/sub/d.png')).toHaveAttribute('data-selected', 'true')

  // ⌘A 全选 → Esc 取消
  await page.keyboard.press('Meta+a')
  await expect(chip(page)).toContainText('已选 4 张')
  await page.keyboard.press('Escape')
  await expect(chip(page)).toHaveCount(0)
})

test('context menu offers file actions; locate opens folder tab with file selected', async ({ page }) => {
  await openCollection(page)
  await cell(page, '/docs/b.png').click({ button: 'right' })

  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()
  for (const label of ['定位', '拷贝', '剪切', '制作副本', '重新命名…', '全选', '移到废纸篓', '立即删除']) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible()
  }
  // 右键未选中项 → 自动单选
  await expect(cell(page, '/docs/b.png')).toHaveAttribute('data-selected', 'true')

  await menu.getByText('定位', { exact: true }).click()
  // 原浏览 tab + 预览 tab + 定位新 tab
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(3)
  const row = page.locator('.finder-list-row[data-file-path="/docs/b.png"]')
  await expect(row).toBeVisible()
  await expect(row.locator('.finder-selected')).toHaveCount(1)
})

test('copy mirrors to system clipboard; cut then paste in located tab queues move', async ({ page }) => {
  await openCollection(page)
  await cell(page, '/docs/a.png').click()
  await cell(page, '/docs/b.png').click({ modifiers: ['Meta'] })
  await cell(page, '/docs/b.png').click({ button: 'right' })
  await page.locator('.context-menu').getByText('拷贝', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__clipCalls.length)).toBe(1)
  expect(await page.evaluate(() => (window as any).__clipCalls[0])).toEqual(['/docs/a.png', '/docs/b.png'])

  // 剪切 a.png（单选）→ 定位到 /docs → 在该 tab 粘贴 → move 任务
  await cell(page, '/docs/a.png').click()
  await page.keyboard.press('Meta+x')
  await cell(page, '/docs/a.png').click({ button: 'right' })
  await page.locator('.context-menu').getByText('定位', { exact: true }).click()
  await expect(page.locator('.finder-list-row[data-file-path="/docs/b.png"]')).toBeVisible()
  await page.locator('.finder-list-row[data-file-path="/docs/b.png"]').click()
  await page.keyboard.press('Meta+v')

  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(1)
  const op = await page.evaluate(() => (window as any).__fileOps[0])
  expect(op.type).toBe('move')
  expect(op.sourcePaths).toEqual(['/docs/a.png'])
  expect(op.targetPath).toBe('/docs')
})

test('move to trash: confirm sheet → recycle task → completion removes item and clamps current', async ({ page }) => {
  await openCollection(page)
  // 当前预览跳到 c.png（index 2）
  await cell(page, '/docs/sub/c.png').click()
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('3 / 4')).toBeVisible()
  await cell(page, '/docs/sub/c.png').click({ button: 'right' })
  await page.locator('.context-menu').getByText('移到废纸篓', { exact: true }).click()

  await expect(page.getByTestId('delete-sheet')).toBeVisible()
  await expect(page.getByText('要将“c.png”移到废纸篓吗？')).toBeVisible()
  await page.getByTestId('delete-confirm').click()

  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(1)
  const op = await page.evaluate(() => (window as any).__fileOps[0])
  expect(op.type).toBe('recycle')
  expect(op.sourcePaths).toEqual(['/docs/sub/c.png'])

  // 完成事件 → 列表移除 c.png，当前项 clamp 到邻近 d.png（3 / 3）
  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask({
    type: 'recycle',
    sourcePaths: ['/docs/sub/c.png'],
    progress: { currentFile: '', currentFileIndex: 1, totalFiles: 1, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [{ sourcePath: '/docs/sub/c.png', status: 'success' }] }
  }))
  await expect(page.locator('.icn-cell')).toHaveCount(3)
  await expect(cell(page, '/docs/sub/c.png')).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('3 / 3')).toBeVisible()
  await expect(chip(page)).toHaveCount(0)
})

test('alt-backspace deletes permanently; rename syncs via completion event', async ({ page }) => {
  await openCollection(page)

  // ⌥⌫ → 永久删除确认（红色「立即删除」）→ delete 任务
  await cell(page, '/docs/sub/d.png').click()
  await page.keyboard.press('Alt+Backspace')
  await expect(page.getByTestId('delete-sheet')).toBeVisible()
  await expect(page.getByText('要立即删除“d.png”吗？')).toBeVisible()
  await page.getByTestId('delete-confirm').click()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(1)
  expect(await page.evaluate(() => (window as any).__fileOps[0].type)).toBe('delete')
  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask({
    type: 'delete', sourcePaths: ['/docs/sub/d.png'],
    progress: { currentFile: '', currentFileIndex: 1, totalFiles: 1, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [{ sourcePath: '/docs/sub/d.png', status: 'success' }] }
  }))
  await expect(page.locator('.icn-cell')).toHaveCount(3)

  // 重命名 a.png → renamed.png：rename 任务 + 完成事件改名同步
  await cell(page, '/docs/a.png').click({ button: 'right' })
  await page.locator('.context-menu').getByText('重新命名…', { exact: true }).click()
  const input = page.locator('.sheet-name-input')
  await expect(input).toHaveValue('a.png')
  await input.fill('renamed.png')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(2)
  const renameOp = await page.evaluate(() => (window as any).__fileOps[1])
  expect(renameOp.type).toBe('rename')
  expect(renameOp.newName).toBe('renamed.png')
  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask({
    type: 'rename', sourcePaths: ['/docs/a.png'], newName: 'renamed.png',
    progress: { currentFile: '', currentFileIndex: 1, totalFiles: 1, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [{ sourcePath: '/docs/a.png', targetPath: '/docs/renamed.png', status: 'success' }] }
  }))
  await expect(cell(page, '/docs/renamed.png')).toBeVisible()
  await expect(cell(page, '/docs/a.png')).toHaveCount(0)
})

test('cmd-D duplicates in place; completion rescan surfaces the copy', async ({ page }) => {
  await openCollection(page)
  await cell(page, '/docs/b.png').click()
  await page.keyboard.press('Meta+d')
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps.length)).toBe(1)
  const op = await page.evaluate(() => (window as any).__fileOps[0])
  expect(op.type).toBe('copy')
  expect(op.conflictStrategy).toBe('rename')
  expect(op.targetPath).toBe('/docs')
  expect(op.sourcePaths).toEqual(['/docs/b.png'])

  // 副本落地 + 完成事件 → 重扫 → 列表出现副本（当前项 b.png 保持）
  await page.evaluate(() => (window as any).__dupLanded(true))
  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask({
    type: 'copy', sourcePaths: ['/docs/b.png'], targetDeviceId: 'local', targetPath: '/docs',
    progress: { currentFile: '', currentFileIndex: 1, totalFiles: 1, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [{ sourcePath: '/docs/b.png', targetPath: '/docs/b 副本.png', status: 'success' }] }
  }))
  await expect(page.locator('.icn-cell')).toHaveCount(5)
  await expect(cell(page, '/docs/b 副本.png')).toBeVisible()
  // 当前项按路径保持 b.png；副本「b 副本.png」排序在其前 → 序号 3 / 5
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('3 / 5')).toBeVisible()
})
