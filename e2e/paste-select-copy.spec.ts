import { expect, test, type Page } from '@playwright/test'

// cmd+C → cmd+V 复制落地后的「选中新副本 + 滚动揭示」回归：
// 1. 同目录粘贴 → createFileOperation 携 rename 策略；任务完成推送后
//    新副本行出现、带 finder-selected 选中态，原文件不再选中；
//    副本命名 mock 为「zz-landed 副本.txt」排在 150 行长列表最末（视口外），
//    行可见 + scrollTop > 0 即证明滚动揭示生效。
// 2. 跨目录粘贴全部 skip（目标已存在）→ 完成后不抢选中（列表无选中态）。
//
// mock 要点（同 task-drawer 先例）：
// - listFiles 每次返回新数组（Pinia 持原引用会与事件回调叠加双份）；
// - 落地开关用 window 桥（getter/setter 函数，避免值快照）；
// - 完成事件用 __taskPush.updated 驱动，itemResults.targetPath 携最终名。

async function setup(page: Page, path: string) {
  await page.addInitScript((pathArg: string) => {
    // 落地开关：cmd+V 前false（列表无副本）；完成事件推送前置true（刷新后可见）
    let copyLanded = false
    const operations: any[] = []
    const listeners = { updated: [] as Array<(t: any) => void> }
    const file = (name: string, dir: string) => ({
      name, path: `${dir}/${name}`, isDirectory: false, isFile: true, size: 1,
      modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt'
    })
    const listing = (dir: string) => {
      // 150 个 f-* 撑长列表；z-orig 排最末 → 副本落在视口外，验证滚动揭示
      const names = Array.from({ length: 150 }, (_, i) => `f-${String(i).padStart(3, '0')}.txt`)
      if (dir === '/src') {
        return [
          { name: 'dst', path: '/dst', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' },
          file('a.txt', '/src'), file('z-orig.txt', '/src'), ...names.map(n => file(n, '/src'))
        ]
      }
      if (dir === '/dst') return [file('a.txt', '/dst')]
      return []
    }
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dir: string) => {
        const base = listing(dir)
        if (copyLanded && dir === pathArg) return [...base, file('zz-landed 副本.txt', pathArg)]
        return [...base]
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
    ;(window as any).__copyLanded = (v?: boolean) => {
      if (v !== undefined) copyLanded = v
      return copyLanded
    }
    ;(window as any).__fileOps = operations
    ;(window as any).__taskPush = {
      push: (t: any) => listeners.updated.forEach(cb => cb(t))
    }
    // FilePane 侧订阅（onFileOperationUpdated）在 Proxy 兜底之外，需真注册
    api.onFileOperationUpdated = (cb: (t: any) => void) => {
      listeners.updated.push(cb)
      return () => undefined
    }
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      tabs: [{
        id: 't1', title: pathArg.split('/').pop(),
        panes: [{
          id: 't1-p', deviceId: 'local', path: pathArg, history: [pathArg], historyIndex: 0,
          viewMode: 'list', selectedFiles: [], gridSize: 'large'
        }],
        activePaneId: 't1-p'
      }],
      activeTabId: 't1'
    }))
  }, path)
  await page.goto('/')
  await expect(page.locator('.finder-list-row').first()).toBeVisible()
}

function completedTask(targetPath: string, results: Array<{ sourcePath: string; targetPath?: string; status: string }>) {
  return {
    id: 't1', type: 'copy', sourceDeviceId: 'local',
    sourcePaths: results.map(r => r.sourcePath),
    targetDeviceId: 'local', targetPath,
    status: 'completed',
    progress: { currentFile: '', currentFileIndex: results.length, totalFiles: results.length, bytesTransferred: 1, totalBytes: 1, speed: 0, itemResults: results },
    createdAt: 1, startedAt: 1, completedAt: 2
  }
}

test('same-dir paste selects and reveals the newly copied file', async ({ page }) => {
  await setup(page, '/src')

  // 选中可见的首屏源文件 a.txt → ⌘C → ⌘V（同目录 → rename 策略）。
  // mock 让落地文件叫「zz-landed 副本.txt」：排序在 150 行列表最末（视口外），
  // 它能被看见本身就证明滚动揭示生效（虚拟滚动只渲染可见行）。
  await page.locator('[data-file-path="/src/a.txt"]').click()
  await expect(page.locator('[data-file-path="/src/a.txt"] .finder-selected')).toHaveCount(1)
  await page.keyboard.press('Meta+c')
  await page.keyboard.press('Meta+v')

  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('copy')
  expect(ops[0].conflictStrategy).toBe('rename')

  // 副本落地（下一次 listFiles 起可见）+ 完成事件推送
  await page.evaluate(() => (window as any).__copyLanded(true))
  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask('/src', [
    { sourcePath: '/src/a.txt', targetPath: '/src/zz-landed 副本.txt', status: 'success' }
  ]))

  // 新副本行可见 + 带选中态，原文件退出选中
  await expect(page.locator('[data-file-path="/src/zz-landed 副本.txt"]')).toBeVisible()
  await expect(page.locator('[data-file-path="/src/zz-landed 副本.txt"] .finder-selected')).toHaveCount(1)
  await expect(page.locator('[data-file-path="/src/a.txt"] .finder-selected')).toHaveCount(0)
  const scrollTop = await page.locator('.vue-recycle-scroller').first().evaluate(el => el.scrollTop)
  expect(scrollTop).toBeGreaterThan(0)
})

test('cross-dir paste fully skipped keeps selection untouched', async ({ page }) => {
  await setup(page, '/src')

  // 在 /src 复制 a.txt → 双击 dst 目录导航 → /dst 粘贴 → skip 策略，目标已存在全部跳过
  await page.locator('[data-file-path="/src/a.txt"]').click()
  await page.keyboard.press('Meta+c')
  await page.locator('[data-file-path="/dst"]').dblclick()
  await expect(page.locator('[data-file-path="/dst/a.txt"]')).toBeVisible()
  await page.keyboard.press('Meta+v')

  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].conflictStrategy).toBe('skip')

  await page.evaluate(t => (window as any).__taskPush.push(t), completedTask('/dst', [
    { sourcePath: '/src/a.txt', status: 'skipped' }
  ]))
  // 完成后刷新回列表，但不应出现任何选中（skip 无落地文件，不抢选中）
  await expect(page.locator('[data-file-path="/dst/a.txt"]')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.locator('.finder-list-row .finder-selected')).toHaveCount(0)
})
