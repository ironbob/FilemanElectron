import { expect, test, type Page } from '@playwright/test'

// 右键「发送到 ▸ 设备 ▸ 收藏路径」回归：
// 1. 正向：已连接远程设备(smb-x)的非 ZIP 收藏出现在三级子菜单；本机收藏/ZIP 虚拟
//    收藏/断线设备收藏被过滤；点击收藏项走 createFileOperation 拷贝任务入队
// 2. 负向：无合格远程收藏时顶层「发送到」整项隐藏（勿留空 children 占位——
//    context-menu.spec 的 IA 精确断言依赖此行为）
// mock 计数暴露用 getter 函数且返回拷贝（e2e mock 数组别名坑，见会话记忆）

interface MockFavorite {
  deviceId: string
  path: string
  name: string
}

async function installMock(page: Page, favorites: MockFavorite[]): Promise<void> {
  await page.addInitScript((favs: MockFavorite[]) => {
    const calls: Array<Record<string, unknown>> = []
    const DEVICES = [
      { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
      { id: 'smb-x', type: 'smb', name: 'NAS', status: 'connected', rootPath: '/' },
      { id: 'dead-ssh', type: 'ssh', name: '断线机', status: 'disconnected', rootPath: '/' }
    ]
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({ favorites: favs.map(f => ({ ...f })) }),
      saveConfig: async () => undefined,
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
        canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
        canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true,
        canStream: true, canCaptureScreenshot: false, canArchive: true, canRecycle: true,
        canGrepContent: true, canSymlink: true, canChmod: true, canChown: true
      }),
      getDevices: async () => DEVICES.map(d => ({ ...d })),
      createFileOperation: async (op: Record<string, unknown>) => {
        calls.push({ ...op })
        return { id: 'task-1', type: (op as any).type ?? 'copy', status: 'queued' }
      },
      listFiles: async (_d: string, dirPath: string) => {
        if (dirPath !== '/fw') return []
        return [
          { name: 'docs', path: '/fw/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-15T10:00:00Z' },
          { name: 'notes.txt', path: '/fw/notes.txt', isDirectory: false, isFile: true, size: 12, modifiedTime: '2026-08-15T10:00:00Z', extension: '.txt' }
        ].map(f => ({ ...f }))
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
    ;(window as any).__sentOps = () => calls.map(c => ({ ...c }))
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/fw', history: ['/fw'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  }, favorites)
}

/** 收藏/设备 store 异步加载完成信号：侧栏收藏区渲染出给定收藏名。 */
async function waitForFavoritesLoaded(page: Page, name: string): Promise<void> {
  await page.waitForFunction(
    (n: string) => document.body.innerText.includes(n),
    name,
    { timeout: 5_000 }
  )
}

async function openFileMenu(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/fw/notes.txt"]').click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
}

const REMOTE_FAVORITES: MockFavorite[] = [
  // 合格目标：已连接远程设备的非 ZIP 收藏
  { deviceId: 'smb-x', path: '/pub/docs', name: '共享文档' },
  // 应过滤：本机收藏（仅远程设备可作目标）
  { deviceId: 'local', path: '/Users', name: '本机目录' },
  // 应过滤：ZIP 虚拟收藏（'::' 路径不能作拷贝目标）
  { deviceId: 'smb-x', path: '/pub/a.zip::in', name: 'zip内收藏' },
  // 应过滤：断线设备的收藏
  { deviceId: 'dead-ssh', path: '/home', name: '断线机收藏' },
  // 应过滤：收藏残留但设备已删除
  { deviceId: 'ghost', path: '/gone', name: '幽灵收藏' }
]

test('send-to menu lists only connected remote favorites and queues a copy task', async ({ page }) => {
  await installMock(page, REMOTE_FAVORITES)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/fw/notes.txt"]')).toBeVisible()
  await waitForFavoritesLoaded(page, '共享文档')
  await openFileMenu(page)

  // 顶层「发送到」存在
  const sendItem = page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("发送到"))')
  await expect(sendItem).toHaveCount(1)

  // 展开设备级：只有「NAS」（本机/断线机/幽灵均被过滤）
  await sendItem.hover()
  const deviceMenu = sendItem.locator('.context-submenu')
  await expect(deviceMenu).toBeVisible()
  await expect(deviceMenu.locator('> .context-menu-item > .menu-label')).toHaveText(['NAS'])

  // 展开收藏级：只有「共享文档」（本机/zip 内/断线机收藏被过滤）
  const nasItem = deviceMenu.locator('.context-menu-item:has(.menu-label:text-is("NAS"))')
  await nasItem.hover()
  const favMenu = nasItem.locator('.context-submenu')
  await expect(favMenu).toBeVisible()
  await expect(favMenu.locator('> .context-menu-item > .menu-label')).toHaveText(['共享文档'])

  // 点击 → FilePane 入队 createCopyTask（type=copy，源=本面板设备，目标=收藏设备+路径）
  await favMenu.locator('.context-menu-item:has(.menu-label:text-is("共享文档"))').click()
  await expect.poll(async () => page.evaluate(() => (window as any).__sentOps().length)).toBe(1)
  const op = await page.evaluate(() => (window as any).__sentOps()[0])
  expect(op).toMatchObject({
    type: 'copy',
    sourceDeviceId: 'local',
    sourcePaths: ['/fw/notes.txt'],
    targetDeviceId: 'smb-x',
    targetPath: '/pub/docs',
    conflictStrategy: 'skip'
  })
})

test('send-to item hidden when no eligible remote favorite exists', async ({ page }) => {
  await installMock(page, [{ deviceId: 'local', path: '/Users', name: '只有本机收藏' }])
  await page.goto('/')
  await expect(page.locator('[data-file-path="/fw/notes.txt"]')).toBeVisible()
  await waitForFavoritesLoaded(page, '只有本机收藏')
  await openFileMenu(page)

  // 顶层无「发送到」（且菜单本身正常渲染）
  await expect(page.locator('.context-menu > .context-menu-item:has(.menu-label:text-is("发送到"))')).toHaveCount(0)
  await expect(page.locator('.context-menu > .context-menu-item').first()).toBeVisible()
  // 未误触发任何传输任务
  expect(await page.evaluate(() => (window as any).__sentOps().length)).toBe(0)
})
