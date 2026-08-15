import { expect, test } from '@playwright/test'

// 双面板拖放传输回归（合成 DragEvent + mocked fileman）：
// 1. 拖文件到另一面板背景 → 同设备默认 move，任务入队
// 2. 按住 Option(altKey) 拖到另一面板背景 → copy
// 3. 拖到另一面板的文件夹行 → 目标为该文件夹
// 4. 同面板背景放置 → 无任务
// 5. 拖入自身文件夹 → 拒绝
//
// 注：dragstart 事件由 FileList 真实处理器执行（写入 JSON payload + dragSession），
// startNativeDrag 被mock，因此与「远程设备 HTML5 拖拽」同路径；
// 原生拖拽的会话回落分支由文件名匹配逻辑保证，无法在合成事件中覆盖。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const operations: any[] = []
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        if (path === '/docs') return [
          { name: 'readme.md', path: '/docs/readme.md', isDirectory: false, isFile: true, size: 3, modifiedTime: '2026-08-14T10:00:00Z', extension: '.md' }
        ]
        return [
          { name: 'docs', path: '/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' },
          { name: 'dest', path: '/dest', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' },
          { name: 'a.txt', path: '/a.txt', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' }
        ]
      },
      readFile: async () => btoa('hi'),
      getStats: async (_deviceId: string, path: string) => ({
        size: 0, isDirectory: path === '/docs' || path === '/dest', isFile: !(path === '/docs' || path === '/dest'),
        modifiedTime: '', createdTime: '', mode: 0
      }),
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      canTransferBetween: async () => true,
      startNativeDrag: async () => undefined,
      createFileOperation: async (params: any) => {
        operations.push(params)
        return { id: `t${operations.length}`, type: params.type, status: 'pending', sourcePaths: params.sourcePaths || [], progress: {} }
      },
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
    localStorage.removeItem('fileman-tabs-state')
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/dest"]')).toBeVisible()

  // 进入双面板：左面板 /docs，右面板停留在 /
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('Open in Dual-Pane Tab').click()
  await expect(page.locator('.finder-pane')).toHaveCount(2)
  await expect(page.locator('[data-file-path="/docs/readme.md"]')).toBeVisible()
})

async function drag(page: any, opts: { fromPath: string; toSelector: string; altKey?: boolean }) {
  await page.evaluate(({ fromPath, toSelector, altKey }) => {
    const from = document.querySelector(`[data-file-path="${fromPath}"]`)!
    const to = document.querySelector(toSelector)!
    const dt = new DataTransfer()
    // 真实 dragstart 处理器负责写入 JSON payload 并开启 dragSession
    from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    to.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
    to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, altKey }))
  }, opts)
}

test('dragging a file onto the other pane background queues a move (same device)', async ({ page }) => {
  await drag(page, { fromPath: '/docs/readme.md', toSelector: '.finder-pane:nth-of-type(2)' })
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('move')
  expect(ops[0].sourcePaths).toEqual(['/docs/readme.md'])
  expect(ops[0].targetPath).toBe('/')
})

test('holding Option while dropping on the other pane queues a copy', async ({ page }) => {
  await drag(page, { fromPath: '/docs/readme.md', toSelector: '.finder-pane:nth-of-type(2)', altKey: true })
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('copy')
  expect(ops[0].targetPath).toBe('/')
})

test('dropping onto a folder row in the other pane targets that folder', async ({ page }) => {
  await drag(page, { fromPath: '/docs/readme.md', toSelector: '[data-file-path="/dest"]' })
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('move')
  expect(ops[0].targetPath).toBe('/dest')
})

test('dropping onto the source pane background is a no-op', async ({ page }) => {
  await drag(page, { fromPath: '/docs/readme.md', toSelector: '.finder-pane:nth-of-type(1)' })
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(0)
})

test('dropping a folder onto itself is rejected', async ({ page }) => {
  await drag(page, { fromPath: '/docs', toSelector: '[data-file-path="/docs"]' })
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(0)
})
