import { expect, test, type Page } from '@playwright/test'

// 侧边栏右键菜单回归（AppSidebar 五种行型）：
// 1. 常用位置行全量结构：导航组(含在对面面板中打开)/工具组(对比子菜单单面板门控)/
//    宿主组(仅 local)/显示简介 —— 分隔线随组出入
// 2. 动作接线：打开/新标签页/对面面板(单面板自动分屏)/终端/copy-path/简介
// 3. 收藏管理组：重命名(行内编辑 Enter 提交·Esc 取消)/上移下移(组内换位·边界禁用)/移除
// 4. 门控：远程收藏无宿主组；无搜索能力的设备工具组隐藏
// 5. 卷「弹出」与失败 alert；设备行断开连接；外点/Esc 关闭；底部工具钮 2 个回归
// mock 计数暴露用 getter 函数且返回拷贝（e2e mock 数组别名坑，见会话记忆）

interface MockFavorite {
  deviceId: string
  path: string
  name: string
}

interface CapsPreset {
  full: boolean
}

async function installMock(
  page: Page,
  options: { favorites?: MockFavorite[]; volumes?: Array<Record<string, unknown>>; remoteCaps?: CapsPreset } = {}
): Promise<void> {
  await page.addInitScript((opts: { favorites: MockFavorite[]; volumes: Array<Record<string, unknown>>; remoteCaps: CapsPreset }) => {
    // 注意：addInitScript 只序列化函数体——模块作用域常量在页面里不存在，
    // FULL_CAPS 必须定义在函数内，否则 caps mock 一律 ReferenceError（被 .catch 吞成 null）。
    const FULL_CAPS = {
      canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
      canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
      canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true,
      canStream: true, canCaptureScreenshot: false, canArchive: true, canRecycle: true,
      canGrepContent: true, canSymlink: true, canChmod: true, canChown: true
    }
    const savedConfigs: Array<Record<string, unknown>> = []
    const ejectCalls: string[] = []
    const terminalCalls: string[] = []
    const revealCalls: string[] = []
    const disconnectCalls: string[] = []
    const infoCalls: Array<Record<string, unknown>> = []
    const DEVICES = [
      { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
      { id: 'smb-x', type: 'smb', name: 'NAS', status: 'connected', rootPath: '/' }
    ]
    const MARKER_DIRS = new Set(['/Applications', '/Volumes/Backup'])
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({ favorites: opts.favorites.map(f => ({ ...f })) }),
      saveConfig: async (cfg: Record<string, unknown>) => { savedConfigs.push(JSON.parse(JSON.stringify(cfg))) },
      getDeviceCapabilities: async (deviceId: string) =>
        deviceId === 'local'
          ? { ...FULL_CAPS }
          : opts.remoteCaps.full
            ? { ...FULL_CAPS }
            : { ...FULL_CAPS, canList: false, canStat: false, canSearch: false, canGrepContent: false },
      getDevices: async () => DEVICES.map(d => ({ ...d })),
      disconnectDevice: async (deviceId: string) => { disconnectCalls.push(deviceId) },
      listFiles: async (_d: string, dirPath: string) => {
        if (!MARKER_DIRS.has(dirPath)) return []
        const name = dirPath === '/Applications' ? 'AppStore.app' : 'backup.db'
        return [{ name, path: `${dirPath}/${name}`, isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-20T10:00:00Z', extension: '' }].map(f => ({ ...f }))
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async (_d: string, path: string) => ({ size: 4096, isDirectory: true, isFile: false, modifiedTime: '2026-08-20T10:00:00Z', createdTime: '2026-08-20T10:00:00Z', mode: 0o40755, path }),
      openFileInfoWindow: async (ctx: Record<string, unknown>) => { infoCalls.push(JSON.parse(JSON.stringify(ctx))) },
      openInTerminal: async (dir: string) => { terminalCalls.push(dir) },
      showInFolder: async (p: string) => { revealCalls.push(p) },
      exists: async () => true,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      onMobileDevicesChanged: (cb: (devices: Array<Record<string, unknown>>) => void) => {
        // 立即推一台未连接 Android，驱动移动设备区渲染
        queueMicrotask(() => cb([{ id: 'android-1', type: 'android', name: 'Pixel 8', pairingStatus: 'paired' }]))
        return () => undefined
      },
      volumes: {
        list: async () => opts.volumes.map(v => ({ ...v })),
        eject: async (mountPath: string) => {
          ejectCalls.push(mountPath)
          if (mountPath === '/Volumes/Fail') throw new Error('disk busy')
        },
        onChanged: () => () => undefined
      },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 }
    }
    ;(window as any).fileman = new Proxy(api, {
      get(target, property) {
        if (property in target) return target[property as string]
        if (String(property).startsWith('on')) return () => () => undefined
        return async () => undefined
      }
    })
    ;(window as any).__savedConfigs = () => savedConfigs.map(c => ({ ...c }))
    ;(window as any).__ejectCalls = () => [...ejectCalls]
    ;(window as any).__terminalCalls = () => [...terminalCalls]
    ;(window as any).__revealCalls = () => [...revealCalls]
    ;(window as any).__disconnectCalls = () => [...disconnectCalls]
    ;(window as any).__infoCalls = () => infoCalls.map(c => ({ ...c }))
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  }, {
    favorites: options.favorites ?? [],
    volumes: options.volumes ?? [],
    remoteCaps: options.remoteCaps ?? { full: true }
  })
  await (page.context() as any).grantPermissions?.(['clipboard-read', 'clipboard-write'])
}

/** 行定位器：`:text-is` 只匹配最小元素，行容器里还有图标 svg——以名称 span 为锚。 */
function rowByName(page: Page, name: string) {
  return page.locator(`.finder-sidebar .sidebar-item span:text-is("${name}")`)
}

/** 收藏/设备/卷 store 异步加载完成信号：侧栏出现指定名字。 */
async function waitForSidebarRow(page: Page, name: string): Promise<void> {
  await expect(rowByName(page, name)).toBeVisible({ timeout: 5_000 })
}

async function openRowMenu(page: Page, name: string): Promise<void> {
  await rowByName(page, name).click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
}

/** 顶层（不含子菜单）叶子标签序列。 */
function topLevelLabels(page: Page) {
  return page.locator('.context-menu > .context-menu-item > .menu-label')
}

// ============ 常用位置行 ============

test('place row menu has full structure with pane-gated compare submenu', async ({ page }) => {
  await installMock(page)
  await page.goto('/')
  await waitForSidebarRow(page, 'Applications')

  await openRowMenu(page, 'Applications')

  // 分组顺序：导航 ▸ 工具(含对比子菜单) ▸ 宿主 ▸ 简介；分隔线 3 条
  await expect(topLevelLabels(page)).toHaveText([
    '打开', '在新标签页中打开', '在新分屏标签页中打开', '在对面面板中打开',
    '查找重复文件', '分析空间', '目录对比', '在此文件夹中搜索',
    '在 Finder 中显示', '在终端中打开', '拷贝路径',
    '显示简介'
  ])
  await expect(page.locator('.context-menu > .context-menu-separator')).toHaveCount(3)

  // 对比子菜单：单面板 fixture → 左面板可用、右面板禁用
  const compareItem = page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("目录对比"))')
  await compareItem.hover()
  const sub = compareItem.locator('.context-submenu')
  await expect(sub).toBeVisible()
  await expect(sub.locator('> .context-menu-item').nth(0)).not.toHaveClass(/disabled/)
  await expect(sub.locator('> .context-menu-item').nth(1)).toHaveClass(/disabled/)

  // 拷贝路径子菜单：POSIX / file:// URI / 文件名（无「相对另一面板」——侧栏无面板语境）
  const copyItem = page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("拷贝路径"))')
  await copyItem.hover()
  const copySub = copyItem.locator('.context-submenu')
  await expect(copySub).toBeVisible()
  await expect(copySub.locator('> .context-menu-item > .menu-label')).toHaveText(['POSIX 路径', 'file:// URI', '文件名'])
})

test('place row menu actions navigate, open tabs, split opposite pane and invoke host shell', async ({ page }) => {
  await installMock(page)
  await page.goto('/')
  await waitForSidebarRow(page, 'Applications')

  // 打开：活动面板导航到 /Applications，列表出现特征文件
  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("打开"))').click()
  await expect(page.locator('[data-file-path="/Applications/AppStore.app"]')).toBeVisible()

  // 在新标签页中打开：标签 1 → 2
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(1)
  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("在新标签页中打开"))').click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(2)

  // 关回一个标签，保持后续断言单标签语境
  await page.locator('.finder-tab-strip .tab-item').nth(1).locator('button').click()
  await expect(page.locator('.finder-tab-strip .tab-item')).toHaveCount(1)

  // 在对面面板中打开：单面板 → 自动分屏，右面板加载行目录
  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("在对面面板中打开"))').click()
  await expect(page.locator('.file-pane')).toHaveCount(2)
  await expect(page.locator('.file-pane').nth(1).locator('[data-file-path="/Applications/AppStore.app"]')).toBeVisible()

  // 在终端中打开 / 在 Finder 中显示：直连 IPC 记录
  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("在终端中打开"))').click()
  await expect.poll(() => page.evaluate(() => (window as any).__terminalCalls())).toEqual(['/Applications'])

  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("在 Finder 中显示"))').click()
  await expect.poll(() => page.evaluate(() => (window as any).__revealCalls())).toEqual(['/Applications'])

  // 拷贝路径 ▸ POSIX：剪贴板拿到行路径
  await openRowMenu(page, 'Applications')
  const copyItem = page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("拷贝路径"))')
  await copyItem.hover()
  await copyItem.locator('.context-submenu > .context-menu-item:has(.menu-label:text-is("POSIX 路径"))').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/Applications')

  // 显示简介：getStats + openFileInfoWindow（FileStats 补 name/path 成 FileInfo）
  await openRowMenu(page, 'Applications')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("显示简介"))').click()
  await expect.poll(() => page.evaluate(() => (window as any).__infoCalls())).toEqual([
    expect.objectContaining({
      deviceId: 'local',
      deviceType: 'local',
      files: [expect.objectContaining({ name: 'Applications', path: '/Applications', isDirectory: true })]
    })
  ])
})

// ============ 收藏行 ============

test('favorite row menu renames inline, reorders within group and removes', async ({ page }) => {
  await installMock(page, {
    favorites: [
      { deviceId: 'local', path: '/a', name: '甲' },
      { deviceId: 'local', path: '/b', name: '乙' }
    ]
  })
  await page.goto('/')
  await waitForSidebarRow(page, '乙')

  // 管理组位于导航组之后：上移(首项禁用)/下移/重命名/移除
  await openRowMenu(page, '甲')
  await expect(topLevelLabels(page)).toHaveText([
    '打开', '在新标签页中打开', '在新分屏标签页中打开', '在对面面板中打开',
    '重新命名…', '上移', '下移', '从边栏中移除',
    '查找重复文件', '分析空间', '目录对比', '在此文件夹中搜索',
    '在 Finder 中显示', '在终端中打开', '拷贝路径',
    '显示简介'
  ])
  await expect(page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("上移"))')).toHaveClass(/disabled/)
  await expect(page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("下移"))')).not.toHaveClass(/disabled/)

  // 下移：组内换位 + 持久化
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("下移"))').click()
  await expect(rowByName(page, '乙')).toBeVisible()
  const favRows = page.locator('.finder-sidebar .sidebar-item:has-text("甲"), .finder-sidebar .sidebar-item:has-text("乙")')
  await expect.poll(async () => favRows.nth(0).innerText()).toContain('乙')
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs()))
    .toContainEqual(expect.objectContaining({ favorites: [{ deviceId: 'local', path: '/b', name: '乙' }, { deviceId: 'local', path: '/a', name: '甲' }] }))

  // 重新命名…：行内输入框预填旧名，Enter 提交 + 持久化
  await openRowMenu(page, '甲')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("重新命名…"))').click()
  const input = page.locator('.finder-sidebar input')
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('甲')
  await input.fill('甲改名')
  await page.keyboard.press('Enter')
  await expect(rowByName(page, '甲改名')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs()))
    .toContainEqual(expect.objectContaining({ favorites: expect.arrayContaining([expect.objectContaining({ name: '甲改名' })]) }))

  // 重新命名 + Esc：取消不改名
  await openRowMenu(page, '乙')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("重新命名…"))').click()
  await page.locator('.finder-sidebar input').fill('不该出现')
  await page.keyboard.press('Escape')
  await expect(rowByName(page, '乙')).toBeVisible()
  await expect(page.locator('.finder-sidebar input')).toHaveCount(0)

  // 从边栏中移除：持久化数组剔除该项
  await openRowMenu(page, '甲改名')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("从边栏中移除"))').click()
  await expect(rowByName(page, '甲改名')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).__savedConfigs()))
    .toContainEqual(expect.objectContaining({ favorites: [{ deviceId: 'local', path: '/b', name: '乙' }] }))
})

// ============ 门控 ============

test('remote favorite hides host group; restricted caps hide tool group', async ({ page }) => {
  await installMock(page, {
    favorites: [{ deviceId: 'smb-x', path: '/pub', name: 'NAS 共享' }],
    remoteCaps: { full: false }
  })
  await page.goto('/')
  await waitForSidebarRow(page, 'NAS 共享')

  await openRowMenu(page, 'NAS 共享')
  // 无宿主组（非 local），无工具组（canList/canStat/canSearch/canGrepContent 全 false）
  await expect(topLevelLabels(page)).toHaveText([
    '打开', '在新标签页中打开', '在新分屏标签页中打开', '在对面面板中打开',
    '重新命名…', '上移', '下移', '从边栏中移除',
    '显示简介'
  ])
  await expect(page.locator('.context-menu > .context-menu-separator')).toHaveCount(2)
})

// ============ 卷 ============

test('volume row menu ejects via IPC and reports failure with alert', async ({ page }) => {
  await installMock(page, {
    volumes: [
      { id: '/Volumes/Backup', name: 'Backup', mountPath: '/Volumes/Backup', isRemovable: true },
      { id: '/Volumes/Fail', name: 'Fail', mountPath: '/Volumes/Fail', isRemovable: true }
    ]
  })
  await page.goto('/')
  await waitForSidebarRow(page, 'Backup')

  // 卷行：目录菜单 + 弹出（位于显示简介前）
  await openRowMenu(page, 'Backup')
  await expect(topLevelLabels(page)).toContainText(['弹出“Backup”', '显示简介'])

  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("弹出“Backup”"))').click()
  await expect.poll(() => page.evaluate(() => (window as any).__ejectCalls())).toEqual(['/Volumes/Backup'])

  // 弹出失败 → alert 文案（侧栏既有反馈通道）。alert 阻塞渲染进程：必须在
  // click 派发前挂好处理器并就地 dismiss，否则 click 的返回与 dialog 互等死锁。
  const dialogPromise = page.waitForEvent('dialog').then(dialog => {
    expect(dialog.message()).toContain('Fail')
    return dialog.dismiss()
  })
  await openRowMenu(page, 'Fail')
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("弹出“Fail”"))').click()
  await dialogPromise
})

// ============ 设备行（位置区 / 移动设备区） ============

test('device rows offer slim menus with connection-aware items', async ({ page }) => {
  await installMock(page)
  await page.goto('/')
  await waitForSidebarRow(page, 'Pixel 8')

  // 本机行：只有导航两项
  await openRowMenu(page, '本机')
  await expect(topLevelLabels(page)).toHaveText(['打开', '在新标签页中打开'])
  await expect(page.locator('.context-menu > .context-menu-separator')).toHaveCount(0)

  // 旧菜单盖在下一行上方会拦截右键事件——切换目标行前先 Esc 关闭
  await page.keyboard.press('Escape')
  await expect(page.locator('.context-menu')).toHaveCount(0)

  // 远程设备（已连接）：断开连接 + 移除设备
  await openRowMenu(page, 'NAS')
  await expect(topLevelLabels(page)).toHaveText(['打开', '在新标签页中打开', '断开连接', '移除设备'])
  await page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("断开连接"))').click()
  await expect.poll(() => page.evaluate(() => (window as any).__disconnectCalls())).toEqual(['smb-x'])

  // 移动设备（未连接）：无断开连接、无移除设备（忘记走 hover 钮）
  await openRowMenu(page, 'Pixel 8')
  await expect(topLevelLabels(page)).toHaveText(['打开', '在新标签页中打开'])
})

// ============ 关闭行为 ============

test('sidebar menu closes on outside click and Escape', async ({ page }) => {
  await installMock(page)
  await page.goto('/')
  await waitForSidebarRow(page, 'Applications')

  // 外点（点标签栏）关闭
  await openRowMenu(page, 'Applications')
  await page.locator('.finder-tab-strip').click({ position: { x: 10, y: 10 } })
  await expect(page.locator('.context-menu')).toHaveCount(0)

  // Esc 关闭
  await openRowMenu(page, 'Applications')
  await page.keyboard.press('Escape')
  await expect(page.locator('.context-menu')).toHaveCount(0)

  // 底部工具钮回归（task-drawer.spec 契约）：主题 + 设置 2 个
  await expect(page.locator('.sidebar-utility-bar .sidebar-utility-button')).toHaveCount(2)
})
