import { expect, test } from '@playwright/test'

// 重复文件查找工具页回归：
// 1. 背景右键「查找重复文件…」→ 打开瞬态工具页（标签标题、工具栏 root）
// 2. 推送进度（scanning → completed 携带 groups）→ 分组渲染、冗余量正确
// 3. 「勾选旧副本」批量勾选组内非最新文件；删除按钮计数随之更新
// 4. 重开同目录复用已有标签（不重复开页）

const GROUPS = [
  {
    hash: 'a'.repeat(64),
    size: 1000,
    files: [
      { path: '/data/old/a.bin', size: 1000, modifiedTime: '2026-08-01T00:00:00Z' },
      { path: '/data/new/a.bin', size: 1000, modifiedTime: '2026-08-10T00:00:00Z' },
      { path: '/data/mid/a.bin', size: 1000, modifiedTime: '2026-08-05T00:00:00Z' }
    ]
  },
  {
    hash: 'b'.repeat(64),
    size: 50,
    files: [
      { path: '/data/x.txt', size: 50, modifiedTime: '2026-08-02T00:00:00Z' },
      { path: '/backup/x.txt', size: 50, modifiedTime: '2026-08-09T00:00:00Z' }
    ]
  }
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript((groups: unknown) => {
    ;(window as any).__groups = groups
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'readme.md', path: '/data/readme.md', isDirectory: false, isFile: true, size: 10, modifiedTime: '2026-08-15T10:00:00Z', extension: '.md' }
      ],
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      startDuplicateScan: async () => {
        const push = (window as any).__pushDupes
        // 模拟三阶段：scanning → partial → completed(带 groups)
        setTimeout(() => push?.({ sessionId: 's1', taskId: 't1', status: 'scanning', fileCount: 5, candidateCount: 5, groupCount: 0 }), 10)
        setTimeout(() => push?.({ sessionId: 's1', taskId: 't1', status: 'partial-hashing', fileCount: 5, candidateCount: 5, groupCount: 0 }), 30)
        setTimeout(() => push?.({
          sessionId: 's1', taskId: 't1', status: 'completed',
          fileCount: 5, candidateCount: 5, groupCount: (window as any).__groups.length,
          groups: (window as any).__groups
        }), 60)
        return { taskId: 't1' }
      },
      cancelDuplicateScan: async () => true,
      onDuplicateScanProgress: (callback: (progress: unknown) => void) => {
        ;(window as any).__pushDupes = callback
        return () => { (window as any).__pushDupes = undefined }
      },
      createFileOperation: async (params: unknown) => {
        ;(window as any).__lastDeleteParams = params
        return { id: 'task-1', status: 'pending', progress: { currentFile: '', currentFileIndex: 0, totalFiles: 0, bytesTransferred: 0, totalBytes: 0, speed: 0, itemResults: [] }, createdAt: 0 }
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
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: 'data', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/data', history: ['/data'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  }, GROUPS)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/data/readme.md"]')).toBeVisible()
})

async function openDuplicateFinder(page: import('@playwright/test').Page): Promise<void> {
  // 列表容器空白处右键（避开文件行；容器根有 @contextmenu 背景 handler）
  await page.locator('.relative.flex-1.flex.flex-col').first()
    .click({ button: 'right', position: { x: 400, y: 300 } })
  await page.locator('.context-menu .context-menu-item', { hasText: '查找重复文件' }).click()
}

test('context menu opens the duplicate finder tab and renders groups', async ({ page }) => {
  await openDuplicateFinder(page)

  // 工具页出现并完成扫描
  await expect(page.getByText('3 个相同文件')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('2 个相同文件')).toBeVisible()
  // 冗余量：组1 1000×2 + 组2 50×1 = 2050 B ≈ 2.0 KB（底部动作栏「可回收」行）
  await expect(page.locator('div', { hasText: /^2 组 · 可回收/ })).toContainText('2.0 KB')
})

test('select older copies and delete via file operations', async ({ page }) => {
  await openDuplicateFinder(page)
  await expect(page.getByText('3 个相同文件')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '勾选旧副本' }).click()
  // 3 文件组勾 2 + 2 文件组勾 1 = 3
  const checkboxes = page.locator('input[type="checkbox"]:checked')
  await expect.poll(async () => checkboxes.count()).toBe(3)

  await page.getByRole('button', { name: /删除勾选/ }).click()
  await expect.poll(async () => page.evaluate(() => (window as any).__lastDeleteParams)).toMatchObject({
    type: 'delete',
    sourceDeviceId: 'local'
  })
  const paths = await page.evaluate(() => (window as any).__lastDeleteParams.sourcePaths)
  // 每组保留最新：勾选 08-01/08-05 的 a.bin 副本 + 08-02 的 data 侧 x.txt
  expect(paths.sort()).toEqual(['/data/mid/a.bin', '/data/old/a.bin', '/data/x.txt'].sort())
})
