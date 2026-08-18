import { expect, test } from '@playwright/test'

// 快速跳转面板（⌘⇧P）回归——只做「最近打开目录」的搜索与跳转：
// 1. 快捷键呼出/关闭；输入框自动聚焦；面板只有「跳转到」分组（无命令/收藏/路径入口）
// 2. MRU 倒序双行条目（名称 + 完整路径）
// 3. 目录名/路径片段实时过滤 + ↑↓ 键盘导航 + Enter 跳转当前面板
// 4. 无历史时的 Finder 式空状态
// 5. 点击面板外部关闭
//
// initScript 内定义 mock（initScript 内定义 mock 配方）；数组每次 concat
// 新数组（fileman mock 数组必须拷贝，防 Pinia 持原引用双倍计数）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({ favorites: [] }),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath === '/Users/demo/项目') {
          return [{ name: 'a.ts', path: '/Users/demo/项目/a.ts', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-15T10:00:00Z', extension: '.ts' }]
        }
        if (dirPath === '/Users/demo/Downloads/线稿') {
          return [{ name: 'sketch.png', path: '/Users/demo/Downloads/线稿/sketch.png', isDirectory: false, isFile: true, size: 2, modifiedTime: '2026-08-15T10:00:00Z', extension: '.png' }]
        }
        return [{ name: 'home.txt', path: `${dirPath === '/' ? '' : dirPath}/home.txt`, isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }]
      },
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 12, isDirectory: true, isFile: false, modifiedTime: '', createdTime: '', mode: 0 }),
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
        id: 't1', title: 'home', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
    // 最近目录（数组序即 MRU：项目 较新，线稿 较旧）
    localStorage.setItem('fileman-recent-locations', JSON.stringify([
      { deviceId: 'local', path: '/Users/demo/项目', visitedAt: 2 },
      { deviceId: 'local', path: '/Users/demo/Downloads/线稿', visitedAt: 1 }
    ]))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/home.txt"]')).toBeVisible()
})

test('⌘⇧P toggles the panel; input is focused; Esc closes', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('input')).toBeFocused()
  await expect(panel.locator('input')).toHaveAttribute('placeholder', '搜索最近打开的目录')

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  // 再次呼出再关闭（切换语义）
  await page.keyboard.press('Meta+Shift+KeyP')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
})

test('shows only the 跳转到 group with two-line MRU history rows', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })

  // 唯一可见分组
  await expect(panel.getByText('跳转到')).toBeVisible()

  // 两条历史记录，MRU 倒序：首行「项目」，双行结构（名称 + 完整路径）
  const rows = panel.locator('.qj-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first().locator('.qj-row-name')).toHaveText('项目')
  await expect(rows.first().locator('.qj-row-path')).toHaveText('/Users/demo')
  await expect(rows.nth(1).locator('.qj-row-name')).toHaveText('线稿')
  await expect(rows.nth(1).locator('.qj-row-path')).toHaveText('/Users/demo/Downloads')

  // 原命令/收藏/快捷键 footer 均不再出现（词表逐字节匹配 zh-CN 词表）
  for (const legacy of ['新建标签页', '切换深/浅色主题', '打开设置', '刷新当前目录', '打开/关闭任务抽屉', '收藏目录', '↑↓ 选择']) {
    await expect(panel.getByText(legacy, { exact: false })).toHaveCount(0)
  }
})

test('filters by name or path fragment; Enter navigates the active pane', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })
  const rows = panel.locator('.qj-row')

  // 路径片段过滤（名称是「线稿」，匹配到的是 detail 里的 Downloads）
  await panel.locator('input').fill('Downloads')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.qj-row-name')).toHaveText('线稿')

  // 清空后按名称过滤，↑↓ 选中第二条，Enter 跳转
  await panel.locator('input').fill('')
  await expect(rows).toHaveCount(2)
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')

  await expect(panel).toBeHidden()
  await expect(page.locator('[data-file-path="/Users/demo/Downloads/线稿/sketch.png"]')).toBeVisible()
})

test('no-match filter shows the empty result hint', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })
  await panel.locator('input').fill('不存在的目录')
  await expect(panel.getByText('无匹配目录')).toBeVisible()
})

test('empty history shows the Finder-style empty state without group header', async ({ page }) => {
  // 追加 initScript 在文件级种子之后执行（注册序即执行序），清空历史后重载
  await page.addInitScript(() => {
    localStorage.setItem('fileman-recent-locations', '[]')
  })
  await page.goto('/')

  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })
  await expect(panel.getByText('暂无最近打开的目录')).toBeVisible()
  await expect(panel.getByText('跳转到')).toHaveCount(0)
})

test('clicking outside closes the panel without touching the background list', async ({ page }) => {
  await page.keyboard.press('Meta+Shift+KeyP')
  const panel = page.getByRole('dialog', { name: '快速跳转目录' })
  await expect(panel).toBeVisible()

  // 点击后方文件列表区域（行左段在面板覆盖区之外）：面板关闭，原目录列表保持不变
  await page.locator('[data-file-path="/home.txt"]').click({ position: { x: 30, y: 10 } })
  await expect(panel).toBeHidden()
  await expect(page.locator('[data-file-path="/home.txt"]')).toBeVisible()
})
