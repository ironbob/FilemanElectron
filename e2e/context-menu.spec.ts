import { expect, test } from '@playwright/test'

// FinderContextMenu 重设计回归（NSMenu 视觉 + 键盘导航 + 信息架构）：
// 1. 文件菜单 IA：打开 → 移到废纸篓 → 文件管理组 → 扩展能力（收藏/宿主集成/
//    hex/校验和/拷贝路径▸，2026-08-18 由「快速操作」子菜单回迁顶层直达）→
//    打开方式▸，语义组之间恰好 4 条分隔线，且分隔线不在菜单首/尾
// 2. 三列对齐体系：每个顶层项都有图标列占位（.menu-icon），快捷键列存在
// 3. 键盘：↓ 从首项开始步进（跳过分隔线）→ → 展开子菜单并进入 → ← 收起
//    → 纯键盘走到「拷贝路径▸POSIX 路径」并 Enter 写入剪贴板 → Esc 关闭
// 4. 鼠标：空白处点击关闭菜单

test.beforeEach(async ({ page }) => {
  await (page.context() as any).grantPermissions?.(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
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
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath !== '/fw') return []
        return [
          { name: 'docs', path: '/fw/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'notes.txt', path: '/fw/notes.txt', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
        ]
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
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
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/fw', history: ['/fw'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/fw/notes.txt"]')).toBeVisible()
})

async function openFileMenu(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/fw/notes.txt"]').click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
}

test('file menu IA groups and separators match Finder layout', async ({ page }) => {
  await openFileMenu(page)
  // 直接子代选择器：子菜单 label 是父项 DOM 后代，避免混入
  const labels = await page.locator('.context-menu > .context-menu-item > .menu-label').allInnerTexts()
  expect(labels).toEqual([
    '打开',
    '移到废纸篓',
    '显示简介',
    '重新命名…',
    '压缩“notes.txt”',
    '拷贝',
    '剪切',
    '制作替身',
    '快速查看',
    '计算校验和',
    '在 Finder 中显示',
    '在终端中打开',
    '以十六进制查看',
    '拷贝路径',
    '打开方式'
  ])
  // 语义组分隔线：打开后 / 移到废纸篓后 / 文件管理与校验和后 / 打开方式前 = 4 条，
  // 均不在菜单首/尾位置
  const seps = page.locator('.context-menu > .context-menu-separator')
  await expect(seps).toHaveCount(4)
  const first = await page.locator('.context-menu > *').first().evaluate(el => el.className)
  const last = await page.locator('.context-menu > *').last().evaluate(el => el.className)
  expect(first).toContain('context-menu-item')
  expect(last).toContain('context-menu-item')
})

test('three-column anatomy: icon column on every item, shortcut column present', async ({ page }) => {
  await openFileMenu(page)
  const items = page.locator('.context-menu > .context-menu-item')
  await expect(items).toHaveCount(15)
  // 每个顶层项都有图标占位（无图标项也保持三列对齐）
  await expect(page.locator('.context-menu > .context-menu-item > .menu-icon')).toHaveCount(15)
  // 图标统一 16px；行高 28px；正文 14px / 快捷键 12px（等弹出动画结束再量）
  await page.waitForTimeout(250)
  const metrics = await page.locator('.context-menu > .context-menu-item').first().evaluate(el => {
    const icon = el.querySelector(':scope > .menu-icon') as HTMLElement
    const label = el.querySelector(':scope > .menu-label') as HTMLElement
    const shortcut = el.querySelector(':scope > .menu-shortcut') as HTMLElement | null
    return {
      rowH: el.getBoundingClientRect().height,
      iconW: icon.getBoundingClientRect().width,
      labelFs: getComputedStyle(label).fontSize,
      shortcutFs: shortcut ? getComputedStyle(shortcut).fontSize : null
    }
  })
  expect(metrics.rowH).toBe(28)
  expect(metrics.iconW).toBe(16)
  expect(metrics.labelFs).toBe('14px')
  expect(metrics.shortcutFs).toBe('12px')

  // 选中态（悬停 = 键盘焦点）：系统蓝底白字，与列表 Finder 选中同语言
  // （亮色主题 accent-blue=#007aff，深色 #0a84ff，两值都接受）。
  // 行内还有快捷键列，精确锚定 label 子元素，避免「拷贝」子串同时命中「拷贝路径」
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("拷贝"))').hover()
  const active = await page.locator('.context-menu > .context-menu-item.highlighted').evaluate(el => ({
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color
  }))
  expect(active.bg).toMatch(/rgb\(0, 122, 255\)|rgb\(10, 132, 255\)/)
  expect(active.color).toBe('rgb(255, 255, 255)')
})

test('keyboard: arrows navigate, submenu enter/leave, Enter activates, Esc closes', async ({ page }) => {
  await openFileMenu(page)

  // ↓ 从首项开始（无高亮 → 第一个可导航项 = 打开）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.context-menu > .context-menu-item.highlighted > .menu-label')).toHaveText('打开')

  // ↓ 跳过分隔线，直达第二组首项（移到废纸篓）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.context-menu > .context-menu-item.highlighted > .menu-label')).toHaveText('移到废纸篓')

  // ↓↓… 走到 拷贝路径（第 14 个可导航项，中间分隔线全部跳过；
  // 扩展能力已回迁顶层，不再经过「快速操作」中转）
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown')
  await expect(page.locator('.context-menu > .context-menu-item.highlighted > .menu-label')).toHaveText('拷贝路径')

  // → 展开子菜单并进入第一个子项（POSIX 路径），Enter 写剪贴板
  await page.keyboard.press('ArrowRight')
  const sub = page.locator('.context-menu .context-submenu')
  await expect(sub).toBeVisible()
  await expect(sub.locator('.context-menu-item.highlighted > .menu-label')).toHaveText('POSIX 路径')
  await page.keyboard.press('Enter')
  await expect(page.locator('.context-menu')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/fw/notes.txt')

  // ← 收起语义：重新打开菜单，进入子菜单后 ← 高亮退回父项并收起子菜单
  // （与上段一致的步数：1 次起步 + 13 次到 拷贝路径）
  await openFileMenu(page)
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.context-menu .context-submenu')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.context-menu .context-submenu')).toHaveCount(0)
  await expect(page.locator('.context-menu > .context-menu-item.highlighted > .menu-label')).toHaveText('拷贝路径')

  // Esc 关闭整个菜单
  await page.keyboard.press('Escape')
  await expect(page.locator('.context-menu')).toHaveCount(0)
})

test('mouse: clicking blank area closes the menu', async ({ page }) => {
  await openFileMenu(page)
  await page.locator('.vue-recycle-scroller').click({ position: { x: 200, y: 260 } })
  await expect(page.locator('.context-menu')).toHaveCount(0)
})

// 防裁剪回归锁（2026-08-19）：列表底部右键时，根菜单上翻钳制、子菜单垂直钳制，
// 两者都必须完整落在视口内（8px 安全边距），不再被窗口底边裁掉
test('menu opened near viewport bottom stays fully visible (root + submenu clamp)', async ({ page }) => {
  // 空白区右键在视口右下角（720 高视口的 y=680）：菜单高度 > 剩余空间必然上翻
  await page.mouse.click(900, 680, { button: 'right' })
  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()
  await expect.poll(async () => {
    const b = await menu.boundingBox()
    return b ? b.y + b.height : 0
  }).toBeLessThanOrEqual(712)
  const rootBox = await menu.boundingBox()
  expect(rootBox!.y).toBeGreaterThanOrEqual(0)

  // 展开靠近菜单底部的「拷贝路径 ▸」：子菜单默认顶部对齐父项，越出视口须上移钳制
  await menu.locator('> .context-menu-item:has(.menu-label:text-is("拷贝路径"))').hover()
  const submenu = menu.locator('.context-submenu')
  await expect(submenu).toBeVisible()
  await expect.poll(async () => {
    const b = await submenu.boundingBox()
    return b ? b.y + b.height : 0
  }).toBeLessThanOrEqual(712)
  const subBox = await submenu.boundingBox()
  expect(subBox!.y).toBeGreaterThanOrEqual(0)
})
