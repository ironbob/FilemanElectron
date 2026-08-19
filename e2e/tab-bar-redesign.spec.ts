import { expect, test, type Page } from '@playwright/test'

// 标签栏 Finder 式重设计：
// 1. 同名消歧（两个 report → 「父 › 叶」双方升级）
// 2. 右键菜单（关闭其他 / 固定 / 取消固定 / 别名还原）
// 3. 标签总览弹层（计数 / 搜索过滤 + 空态 / Enter 切换 / 行内关闭 / Esc 关闭）
// 4. 快捷键（⌘T 复制当前位 / ⌘W never-empty / ⌘2 ⌘9 直达）
// 5. 文本预览脏态（圆点 + 三键确认条，经 localStorage 种子直接开预览标签）
// 6. 指针拖拽重排
// 7. 同路径重复标签保持裸叶子（不把全路径当文件名升级展示）
//
// 词表硬约束：断言的中文串须与 shared/locales/zh-CN.ts 逐字节一致。

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
  return { id, title: path === '/' ? 'Root' : path.split('/').filter(Boolean).pop(), panes: [pane], activePaneId: pane.id }
}

async function setup(page: Page, state?: { tabs: Array<Record<string, unknown>>; activeTabId: string }) {
  await page.addInitScript((stateJson: string | undefined) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, _path: string) => [
        { name: 'docs', path: '/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-14T10:00:00Z', extension: '' },
        { name: 'a.txt', path: '/a.txt', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' }
      ],
      readFile: async () => btoa('hi'),
      getStats: async (_deviceId: string, path: string) => ({
        size: 0, isDirectory: path === '/docs', isFile: path !== '/docs',
        modifiedTime: '', createdTime: '', mode: 0
      }),
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
    if (stateJson) {
      localStorage.setItem('fileman-tabs-state', stateJson)
    } else {
      localStorage.removeItem('fileman-tabs-state')
    }
  }, state ? JSON.stringify(state) : undefined)
  await page.goto('/')
  await expect(page.locator('.finder-tab-strip .tab-item').first()).toBeVisible()
}

function tabs(page: Page) {
  return page.locator('.finder-tab-strip .tab-item')
}

// ============ 同名消歧 ============

test('same-name tabs both upgrade to parent › leaf', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a/report'), browseTab('t2', '/b/report')],
    activeTabId: 't1'
  })
  await expect(tabs(page).nth(0)).toHaveText(/a ›\s*report/)
  await expect(tabs(page).nth(1)).toHaveText(/b ›\s*report/)
})

test('unique leaf keeps bare name', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a/report'), browseTab('t2', '/b/other')],
    activeTabId: 't1'
  })
  await expect(tabs(page).nth(0)).toHaveText(/^report/)
  await expect(tabs(page).nth(1)).toHaveText(/^other/)
})

// ============ 右键菜单 ============

test('context menu closes other tabs', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b'), browseTab('t3', '/c')],
    activeTabId: 't2'
  })
  await tabs(page).nth(0).click({ button: 'right' })
  await page.getByText('关闭其他标签').click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toHaveText(/a/)
})

test('context menu pins a tab to the left in compact form', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b')],
    activeTabId: 't2'
  })
  await tabs(page).nth(1).click({ button: 'right' })
  await page.getByText('固定标签').click()
  await expect(tabs(page).nth(0)).toHaveClass(/is-pinned/)
  // 取消固定恢复
  await tabs(page).nth(0).click({ button: 'right' })
  await page.getByText('取消固定').click()
  await expect(tabs(page).nth(0)).not.toHaveClass(/is-pinned/)
})

test('double-click renames a tab locally and context menu restores it', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b')],
    activeTabId: 't1'
  })
  await tabs(page).nth(0).dblclick()
  await page.locator('.tab-rename-input').fill('我的别名')
  await page.keyboard.press('Enter')
  await expect(tabs(page).nth(0)).toHaveText('我的别名')
  // 别名只是本地显示名：另一标签不受影响
  await expect(tabs(page).nth(1)).toHaveText(/b/)
  await tabs(page).nth(0).click({ button: 'right' })
  await page.getByText('还原默认名称').click()
  await expect(tabs(page).nth(0)).toHaveText(/a/)
})

// ============ 标签总览 ============

test('overview lists all tabs with search, switch and row close', async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) => browseTab(`t${i + 1}`, `/dir${String(i + 1).padStart(2, '0')}`))
  await setup(page, { tabs: many, activeTabId: 't1' })

  await page.locator('[aria-label="标签总览"]').click()
  await expect(page.getByText('标签 · 12')).toBeVisible()

  // 搜索过滤：空态 → 命中计数 → Enter 切换
  await page.getByPlaceholder('搜索标签').fill('zzz')
  await expect(page.getByText('无匹配标签')).toBeVisible()
  await page.getByPlaceholder('搜索标签').fill('dir07')
  await expect(page.getByText('1/12')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab-item[aria-selected="true"]')).toHaveText(/dir07/)

  // 行内 ✕ 关闭一个标签
  await page.locator('[aria-label="标签总览"]').click()
  await page.getByPlaceholder('搜索标签').fill('dir07')
  await page.locator('.tab-overview-row .tab-overview-close').click()
  await expect(tabs(page)).toHaveCount(11)

  // Esc 关闭弹层
  await expect(page.locator('.tab-overview-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.tab-overview-menu')).toHaveCount(0)
})

// ============ 快捷键 ============

test('⌘T duplicates the current location', async ({ page }) => {
  await setup(page, { tabs: [browseTab('t1', '/docs')], activeTabId: 't1' })
  await page.keyboard.press('Meta+t')
  await expect(tabs(page)).toHaveCount(2)
  // ⌘T = 当前位置旁开新标签：仍停在 /docs（mock 对任意路径返回 docs + 根下 a.txt）
  await expect(page.locator('[data-file-path="/a.txt"]')).toBeVisible()
})

test('⌘W closes tabs but never leaves the window empty', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b')],
    activeTabId: 't2'
  })
  await page.keyboard.press('Meta+w')
  await expect(tabs(page)).toHaveCount(1)
  // 最后一个标签：never-empty 规则，数量保持 1
  await page.keyboard.press('Meta+w')
  await expect(tabs(page)).toHaveCount(1)
})

test('⌘2 and ⌘9 jump to direct and last tab', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b'), browseTab('t3', '/c')],
    activeTabId: 't1'
  })
  await page.keyboard.press('Meta+2')
  await expect(page.locator('.tab-item[aria-selected="true"]')).toHaveText(/b/)
  await page.keyboard.press('Meta+9')
  await expect(page.locator('.tab-item[aria-selected="true"]')).toHaveText(/c/)
})

// ============ 文本预览脏态（圆点 + 三键确认条） ============

test('dirty text preview shows dot and guard strip, discard closes', async ({ page }) => {
  // 用 .log（非 markdown）：markdown 默认走渲染视图没有 Monaco 源码编辑器
  const previewTab = {
    id: 'tp',
    title: 'app.log',
    panes: [],
    activePaneId: '',
    preview: {
      id: 'sp',
      file: { name: 'app.log', path: '/docs/app.log', isDirectory: false, isFile: true, size: 2, modifiedTime: '2026-08-14T10:00:00Z', extension: '.log' },
      deviceId: 'local',
      type: 'text'
    }
  }
  await setup(page, { tabs: [browseTab('t1', '/a'), previewTab], activeTabId: 'tp' })

  // Monaco 就绪后在编辑器里输入 → isModified → 圆点
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  await expect(page.locator('.tab-dirty-dot').first()).toBeVisible()

  // ⌘W 被守卫拦下，就地弹三键确认条
  await page.keyboard.press('Meta+w')
  await expect(page.getByText('存在未保存修改，关闭前如何处理？')).toBeVisible()
  await page.getByRole('button', { name: '放弃修改' }).click()
  await expect(tabs(page)).toHaveCount(1)
})

// ============ 同路径重复标签（全路径误作文件名回归） ============

test('identical-path duplicate tabs keep bare leaf, not full path', async ({ page }) => {
  // 同设备同路径的两个标签（安卓浏览中 ⌘T 复制当前位置的典型形态）：
  // 任何前缀都必然相同、毫无区分度，必须保持裸叶子——不得升级成
  // 「… › sdcard › DCIM」把全路径当文件名展示。
  const androidTabAt = (id: string, path: string) => {
    const pane: SeedPane = {
      id: `${id}-p`, deviceId: 'android-abc', path, history: [path], historyIndex: 0,
      viewMode: 'list', selectedFiles: [], gridSize: 'large'
    }
    return { id, title: 'DCIM', panes: [pane], activePaneId: pane.id }
  }
  await setup(page, {
    tabs: [androidTabAt('t1', '/sdcard/DCIM'), androidTabAt('t2', '/sdcard/DCIM')],
    activeTabId: 't1'
  })
  await expect(tabs(page).nth(0)).toHaveText(/^DCIM/)
  await expect(tabs(page).nth(1)).toHaveText(/^DCIM/)
  // ⌘T（复制当前位置）再开一个同路径标签，仍保持裸叶子
  await page.keyboard.press('Meta+T')
  await page.waitForTimeout(200)
  await expect(tabs(page)).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    await expect(tabs(page).nth(i)).toHaveText(/^DCIM/)
  }
})

// ============ 拖拽重排 ============

test('pointer drag reorders tabs', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/alpha'), browseTab('t2', '/beta')],
    activeTabId: 't1'
  })
  await expect(tabs(page).nth(0)).toHaveText(/alpha/)
  await tabs(page).nth(1).dragTo(tabs(page).nth(0))
  await expect(tabs(page).nth(0)).toHaveText(/beta/)
  await expect(tabs(page).nth(1)).toHaveText(/alpha/)
})

// ============ 溢出滚轮（很多打开项时「无法活动」回归） ============
// Chromium 不把垂直 wheel 重定向到仅横向可滚的容器、横向滚动条又隐藏——
// 原生行为下普通滚轮/触控板上下滑在标签溢出后完全无法移动标签条。
// 真机已验证（CGEvent 实测）：接管前 scrollLeft 纹丝不动。

test('vertical wheel scrolls the overflowing strip horizontally', async ({ page }) => {
  // 20 个长名标签 → 必然溢出（min-width 96px × 20 > 视口宽）
  const many = Array.from({ length: 20 }, (_, i) => browseTab(`t${i}`, `/workspace-${i}/folder-number-${i}`))
  await setup(page, { tabs: many, activeTabId: 't0' })

  const overflowing = await page.evaluate(() => {
    const el = document.querySelector('.finder-tab-strip .tab-scroll') as HTMLElement
    return el.scrollWidth > el.clientWidth + 1
  })
  expect(overflowing).toBe(true)

  // 垂直滚轮（dy>0，触控板/滚轮最自然的手势）→ 横向滚动
  const box = await tabs(page).first().boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 600)
  await expect.poll(() =>
    page.evaluate(() => (document.querySelector('.finder-tab-strip .tab-scroll') as HTMLElement).scrollLeft)
  ).toBeGreaterThan(0)

  // 反向滚回左缘（clamp 到 0，不越界）
  await page.mouse.wheel(0, -6000)
  await expect.poll(() =>
    page.evaluate(() => (document.querySelector('.finder-tab-strip .tab-scroll') as HTMLElement).scrollLeft)
  ).toBe(0)
})

test('wheel is not hijacked when strip does not overflow', async ({ page }) => {
  await setup(page, {
    tabs: [browseTab('t1', '/a'), browseTab('t2', '/b')],
    activeTabId: 't1'
  })
  const box = await tabs(page).first().boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(150)
  const scrollLeft = await page.evaluate(() =>
    (document.querySelector('.finder-tab-strip .tab-scroll') as HTMLElement).scrollLeft
  )
  expect(scrollLeft).toBe(0)
})
