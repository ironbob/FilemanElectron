import { expect, test } from '@playwright/test'

// Git 状态徽标回归：
// 1. 本地仓库目录：修改/未跟踪文件出现对应字母徽标，干净文件无徽标
// 2. 工具栏出现分支 chip（branch + ahead/behind）
// 3. 非仓库目录：无徽标、无 chip（isRepo:false 路径零渲染开销）
// 4. watch:changed 后徽标集合随新状态刷新（M1 watch 的失效回报点）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // git 状态由 window.__gitStatus 控制（测试中切换以模拟仓库状态变化）
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'modified.ts', path: '/repo/modified.ts', isDirectory: false, isFile: true, size: 10, modifiedTime: '2026-08-15T10:00:00Z', extension: '.ts' },
        { name: 'untracked.log', path: '/repo/untracked.log', isDirectory: false, isFile: true, size: 5, modifiedTime: '2026-08-15T10:00:00Z', extension: '.log' },
        { name: 'clean.txt', path: '/repo/clean.txt', isDirectory: false, isFile: true, size: 7, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
      ],
      getGitStatus: async (_deviceId: string, dirPath: string) => {
        const state = (window as any).__gitStatus
        if (!state || !dirPath.startsWith(state.repoRoot ?? state.dir)) {
          return { isRepo: false, entries: [] }
        }
        return state
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      onWatchChanged: (callback: (event: { deviceId: string; dirPath: string }) => void) => {
        ;(window as any).__fireWatchChanged = callback
        return () => { (window as any).__fireWatchChanged = undefined }
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
        id: 't1', title: 'repo', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/repo', history: ['/repo'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/repo/clean.txt"]')).toBeVisible()
})

test('badges appear for modified/untracked files in a repo', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).__gitStatus = {
      isRepo: true,
      repoRoot: '/repo',
      branch: 'main',
      ahead: 2,
      entries: [
        { path: '/repo/modified.ts', x: ' ', y: 'M' },
        { path: '/repo/untracked.log', x: '?', y: '?' }
      ]
    }
    ;(window as any).__fireWatchChanged?.({ deviceId: 'local', dirPath: '/repo' })
  })
  await expect(page.locator('[data-file-path="/repo/modified.ts"] .git-badge-modified')).toHaveText('M')
  await expect(page.locator('[data-file-path="/repo/untracked.log"] .git-badge-untracked')).toHaveText('U')
  // 干净文件无徽标
  await expect(page.locator('[data-file-path="/repo/clean.txt"] .git-badge')).toHaveCount(0)
})

test('branch chip shows branch with ahead/behind', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).__gitStatus = {
      isRepo: true,
      repoRoot: '/repo',
      branch: 'feature/x',
      ahead: 1,
      behind: 4,
      entries: []
    }
    ;(window as any).__fireWatchChanged?.({ deviceId: 'local', dirPath: '/repo' })
  })
  await expect(page.locator('.file-pane-toolbar-breadcrumb-content span', { hasText: 'feature/x' })).toBeVisible()
  await expect(page.locator('.file-pane-toolbar-breadcrumb-content span', { hasText: 'feature/x' })).toContainText('↑1')
})

test('no badges or chip outside a repo', async ({ page }) => {
  await expect(page.locator('.git-badge')).toHaveCount(0)
  await expect(page.locator('.file-pane-toolbar-breadcrumb-content span', { hasText: 'Git' })).toHaveCount(0)
})

test('badges refresh after a watch event changes repo state', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).__gitStatus = {
      isRepo: true, repoRoot: '/repo', branch: 'main',
      entries: [{ path: '/repo/modified.ts', x: ' ', y: 'M' }]
    }
    ;(window as any).__fireWatchChanged?.({ deviceId: 'local', dirPath: '/repo' })
  })
  await expect(page.locator('[data-file-path="/repo/modified.ts"] .git-badge-modified')).toBeVisible()

  // 状态变化：modified.ts 恢复干净，clean.txt 变为未跟踪
  await page.evaluate(() => {
    ;(window as any).__gitStatus = {
      isRepo: true, repoRoot: '/repo', branch: 'main',
      entries: [{ path: '/repo/clean.txt', x: '?', y: '?' }]
    }
    ;(window as any).__fireWatchChanged?.({ deviceId: 'local', dirPath: '/repo' })
  })
  await expect(page.locator('[data-file-path="/repo/modified.ts"] .git-badge')).toHaveCount(0)
  await expect(page.locator('[data-file-path="/repo/clean.txt"] .git-badge-untracked')).toBeVisible()
})
