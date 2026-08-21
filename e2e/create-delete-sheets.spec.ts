import { expect, test, type Page } from '@playwright/test'

// 四类弹窗 Finder 化（2026-08-21）：新建文件夹/新建文件/从剪贴板新建 三合一
// CreateItemSheet + 删除确认 DeleteConfirmSheet 的契约锁：
// - 新建：标题/创建位置（标签独立行不折行）/30px 输入框/文件名默认只选主体
//   （保留扩展名）/Enter 创建/Esc 取消/取消钮 → touch|mkdir 任务入队；
// - 剪贴板：探针 image → inset 预览区 + 「PNG 图像 · WxH」元信息行 + 直写链路；
// - 删除：⌘⌫ → alertdialog 单选「要将“a.txt”移到废纸篓吗？」/多选计数标题 +
//   恢复说明；无 OK/确定类模糊钮；遮罩点击不关闭；确认 → recycle 任务。
//
// mock 要点（同 paste-select-copy 先例）：listFiles 每次返回新数组；探针经
// window 桥注入（App mount 即探测，菜单打开的兜底刷新受 2s 节流拿不到新值）。

async function setup(page: Page) {
  await page.addInitScript(() => {
    const operations: any[] = []
    const writes: Array<{ deviceId: string; path: string }> = []
    // 剪贴板探针（mount 时即返回 image——菜单项可见性依赖 mount 探测缓存）
    let probe: any = {
      kind: 'image',
      byteSize: 4096,
      previewDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      imageWidth: 1920,
      imageHeight: 1080,
      truncated: false,
      tooLarge: false
    }
    const file = (name: string) => ({
      name, path: `/${name}`, isDirectory: false, isFile: true, size: 4,
      modifiedTime: '2026-08-14T10:00:00Z', extension: name.slice(name.lastIndexOf('.'))
    })
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dir: string) => {
        if (dir === '/') return [file('a.txt'), file('b.md'), file('c.png')]
        return []
      },
      exists: async () => false,
      probeClipboardContent: async () => ({ ...probe }),
      readClipboardData: async () => ({ kind: 'image', base64: 'aW1n' }),
      writeFile: async (deviceId: string, path: string) => {
        writes.push({ deviceId, path })
        return true
      },
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
    ;(window as any).__writes = writes
    ;(window as any).__setProbe = (next: any) => { probe = next }
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      tabs: [{
        id: 't1', title: '本机',
        panes: [{
          id: 't1-p', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0,
          viewMode: 'list', selectedFiles: [], gridSize: 'large'
        }],
        activePaneId: 't1-p'
      }],
      activeTabId: 't1'
    }))
  })
  await page.goto('/')
  await expect(page.locator('.finder-list-row').first()).toBeVisible()
}

async function openCreateSheet(page: Page, item: string) {
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

test('new-file sheet: stem-only selection, location rows, create task', async ({ page }) => {
  await setup(page)
  await openCreateSheet(page, '新建文件')

  const sheet = page.getByRole('dialog', { name: '创建文件' })
  await expect(sheet).toBeVisible()
  // 标题 17px semibold（Finder sheet 规格）
  expect(await sheet.locator('.sheet-title').evaluate(el => getComputedStyle(el).fontSize)).toBe('17px')
  expect(await sheet.locator('.sheet-title').evaluate(el => getComputedStyle(el).fontWeight)).toBe('600')
  // 创建位置：标签独立成行且不折行（「创建位/置：」回归项）；路径单独一行
  await expect(sheet.locator('.sheet-path-label')).toHaveText('创建位置：')
  expect(await sheet.locator('.sheet-path-label').evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap')
  await expect(sheet.locator('.sheet-path')).toHaveText('/')
  // e2e 旧契约：placeholder example.txt；文件名默认只选主体（untitled，保 .txt）
  const input = sheet.getByPlaceholder('example.txt')
  const selection = await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value])
  expect(selection).toEqual([0, 8, 'untitled.txt'])

  await input.fill('notes.txt')
  await sheet.getByRole('button', { name: '创建' }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps)).toMatchObject([
    { type: 'touch', targetPath: '/notes.txt' }
  ])
})

test('new-folder sheet: full default name selected, mkdir task', async ({ page }) => {
  await setup(page)
  await openCreateSheet(page, '新建文件夹')

  const sheet = page.getByRole('dialog', { name: '创建文件夹' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText('新建文件夹')
  const input = sheet.getByPlaceholder('文件夹名称')
  const selection = await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value])
  expect(selection).toEqual([0, 5, '新建文件夹'])

  await sheet.getByRole('button', { name: '创建' }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps)).toMatchObject([
    { type: 'mkdir', targetPath: '/新建文件夹' }
  ])
})

test('create sheets close via Esc and cancel without queuing tasks', async ({ page }) => {
  await setup(page)
  await openCreateSheet(page, '新建文件')
  const sheet = page.getByRole('dialog', { name: '创建文件' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  await openCreateSheet(page, '新建文件')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: '取消' }).click()
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => (window as any).__fileOps.length)).toBe(0)
})

test('delete sheet: single and multi titles, recover note, no vague OK', async ({ page }) => {
  await setup(page)

  // 单选：标题带名称 + 恢复说明 + 取消/移到废纸篓 双钮
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.keyboard.press('Meta+Backspace')
  const sheet = page.getByRole('alertdialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText('要将“a.txt”移到废纸篓吗？')
  await expect(sheet.getByText('移到废纸篓的项目之后可以恢复。')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '取消' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: '移到废纸篓' })).toBeVisible()
  // 不允许含义模糊的 OK/确定
  await expect(sheet.getByRole('button', { name: '确定', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'OK', exact: true })).toHaveCount(0)

  // 遮罩点击不关闭（危险确认惯例）
  await page.mouse.click(8, 400)
  await expect(sheet).toBeVisible()

  // 取消：不入队
  await sheet.getByRole('button', { name: '取消' }).click()
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => (window as any).__fileOps.length)).toBe(0)

  // 多选（⌘-点击追加）：计数标题 + 名字列表
  await page.locator('[data-file-path="/a.txt"]').click()
  await page.locator('[data-file-path="/b.md"]').click({ modifiers: ['Meta'] })
  await page.locator('[data-file-path="/c.png"]').click({ modifiers: ['Meta'] })
  await page.keyboard.press('Meta+Backspace')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText('要将 3 个项目移到废纸篓吗？')
  await expect(sheet.getByText('a.txt')).toBeVisible()

  // 确认：recycle 任务携带全部选中路径
  await sheet.getByRole('button', { name: '移到废纸篓' }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).__fileOps)).toMatchObject([
    { type: 'recycle', sourcePaths: ['/a.txt', '/b.md', '/c.png'] }
  ])
})

test('clipboard sheet: inset preview, resolution meta, direct write chain', async ({ page }) => {
  await setup(page)
  await openCreateSheet(page, '新建图片文件（来自剪贴板）')

  const sheet = page.getByRole('dialog', { name: '从剪贴板新建文件' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText('从剪贴板新建文件')
  // 浅灰凹陷预览区（inset group，非嵌套弹窗）+ contain 图片
  await expect(sheet.locator('[data-testid="clipboard-preview-area"]')).toBeVisible()
  await expect(sheet.locator('[data-testid="clipboard-preview-area"] img')).toBeVisible()
  // 元信息行：类型 · 原图分辨率 · 大小（探针 imageWidth/Height 字段）
  await expect(sheet.getByText('PNG 图像 · 1920×1080 · 4.0 KB')).toBeVisible()
  // 默认名 Screenshot-*.png，只选主体保扩展名
  const input = sheet.getByTestId('create-item-name-input')
  const name = await input.evaluate((el: HTMLInputElement) => el.value)
  expect(name).toMatch(/^Screenshot-.*\.png$/)
  const selection = await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])
  expect(selection).toEqual([0, name.length - 4])
  // 创建位置行沿用统一规格
  await expect(sheet.locator('.sheet-path-label')).toHaveText('创建位置：')

  await input.fill('shot.png')
  await sheet.getByRole('button', { name: '创建' }).click()
  await expect(sheet).toBeHidden()
  // 直写链路（不进任务队列）：readClipboardData 全量 → writeFile
  await expect.poll(() => page.evaluate(() => (window as any).__writes)).toEqual([
    { deviceId: 'local', path: '/shot.png' }
  ])
  expect(await page.evaluate(() => (window as any).__fileOps.length)).toBe(0)
})
