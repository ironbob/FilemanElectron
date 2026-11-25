import { expect, test, type Page } from '@playwright/test'

// APK 安装入口回归（mock window.fileman）：双击路由（有设备 → 安装 Sheet；无设备 →
// 退回「浏览 ZIP」同款导航）、右键门控（全为 apk 且存在目标设备）、Sheet 内容（应用名 /
// 版本 / 设备列表 / 未授权置灰）、确认后 createAppInstall 收到正确目标；手机上的 APK
// 双击 → 确认 Sheet 不列设备。真实 adb 管道由仓库外冒烟脚本覆盖。

const DIR = '/apks'
const DIALOG = '.finder-sheet[role="dialog"]'
const SHEET_TITLE = '安装应用'
const MENU_ITEM = '安装到 Android 设备…'
const APK = `${DIR}/app-debug.apk`

function file(name: string, size: number) {
  return { name, path: `${DIR}/${name}`, isDirectory: false, isFile: true, size, modifiedTime: '2026-11-24T10:00:00Z', extension: `.${name.split('.').pop()}` }
}

const TARGETS = [
  { deviceId: 'android-aaa', serial: 'aaa', name: 'Pixel 8', authorized: true },
  { deviceId: 'android-bbb', serial: 'bbb', name: 'OnePlus 7T', authorized: false }
]

async function setup(page: Page, deviceId = 'local') {
  await page.addInitScript(({ dir, deviceId: paneDevice, targets }) => {
    const ops: any[] = []
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
        { id: 'android-aaa', type: 'android', name: 'Pixel 8', status: 'connected', rootPath: '/' },
        { id: 'android-bbb', type: 'android', name: 'OnePlus 7T', status: 'connected', rootPath: '/' }
      ],
      // 扫描器推送的 Android 设备（右键「存在目标」门控）；测试经 __emitMobile 按需注入
      onMobileDevicesChanged: (cb: (devices: unknown[]) => void) => {
        ;(window as any).__emitMobile = cb
        return () => undefined
      },
      getDeviceCapabilities: async () => ({
        canRead: true, canWrite: true, canDelete: true, canRename: true, canMkdir: true,
        canList: true, canStat: true, canCopy: true, canMove: true, canSearch: true,
        canCopyFrom: true, canCopyTo: true, canMoveFrom: true, canMoveTo: true,
        canStream: true, canCaptureScreenshot: false, canArchive: true, canRecycle: true,
        canGrepContent: true, canSymlink: true, canChmod: true, canChown: true
      }),
      listFiles: async () => [
        file('app-debug.apk', 2 * 1024 * 1024),
        file('tool.apk', 1024 * 1024),
        file('pic.jpg', 300 * 1024),
        file('notes.txt', 12)
      ],
      zip: {
        listDirectory: async (zipPath: string) => (
          zipPath.toLowerCase().endsWith('.apk')
            ? [{ name: 'AndroidManifest.xml', path: 'AndroidManifest.xml', isDirectory: false, size: 2 * 1024, compressedSize: 1024, modifiedTime: '2026-11-24T10:00:00Z' }]
            : []
        )
      },
      apkInstallTargets: async () => ((window as any).__targets ?? targets),
      getApkInfo: async (path: string) => ({
        packageName: 'com.example.app', appName: '示例应用', versionName: '1.2.3', versionCode: 1024, minSdk: 24, targetSdk: 33,
        sourcePath: path
      }),
      createAppInstall: async (sourceDeviceId: string, sourcePaths: string[], targetDeviceId: string) => {
        ops.push({ kind: 'createAppInstall', sourceDeviceId, sourcePaths, targetDeviceId })
        return { id: 't1', type: 'app-install', status: 'completed', sourceDeviceId, sourcePaths, targetDeviceId, appInstall: { kind: 'apk' }, progress: { itemResults: [] } }
      },
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 2 * 1024 * 1024, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      exists: async () => false,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      volumes: { list: async () => [], onChanged: () => () => undefined },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 }
    }
    function file(name: string, size: number) {
      return { name, path: `${dir}/${name}`, isDirectory: false, isFile: true, size, modifiedTime: '2026-11-24T10:00:00Z', extension: `.${name.split('.').pop()}` }
    }
    ;(window as any).fileman = new Proxy(api, {
      get(target, property) {
        if (property in target) return target[property as string]
        if (String(property).startsWith('on')) return () => () => undefined
        return async () => undefined
      }
    })
    ;(window as any).__ops = ops
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: paneDevice, path: dir, history: [dir], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  }, { dir: DIR, deviceId, targets: TARGETS })
  await page.goto('/')
  await expect(page.locator(`[data-file-path="${APK}"]`)).toBeVisible()
}

/** 注入扫描器看到的 Android 设备（右键门控数据源）。 */
async function emitMobile(page: Page, list: Array<{ id: string; name: string }>) {
  await page.evaluate(devices => (window as any).__emitMobile(devices.map(d => ({ id: d.id, type: 'android', name: d.name }))), list)
}

async function select(page: Page, paths: string[]) {
  await page.locator(`[data-file-path="${paths[0]}"]`).click()
  for (const p of paths.slice(1)) await page.locator(`[data-file-path="${p}"]`).click({ modifiers: ['Meta'] })
  await page.locator(`[data-file-path="${paths[paths.length - 1]}"]`).click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
}

const ops = (page: Page) => page.evaluate(() => (window as any).__ops as any[])

test('双击本机 apk（有设备）：出现安装 Sheet，显示应用名 / 版本 / 设备列表；确认后 createAppInstall 收到正确目标', async ({ page }) => {
  await setup(page)
  await page.dblclick(`[data-file-path="${APK}"]`)
  const dialog = page.locator(DIALOG, { hasText: SHEET_TITLE })
  await expect(dialog).toBeVisible()
  // 包信息来自 getApkInfo；解析不到时才会退回文件名
  await expect(dialog).toContainText('示例应用')
  await expect(dialog).toContainText('版本 1.2.3 (1024)')
  await expect(dialog).toContainText('2.0 MB')
  // 设备列表：已授权可选并默认选中（唯一一台已授权）；未授权置灰不可选
  await expect(dialog.getByRole('radio', { name: /Pixel 8/ })).toBeEnabled()
  await expect(dialog.getByRole('radio', { name: /Pixel 8/ })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: /OnePlus 7T/ })).toBeDisabled()
  await expect(dialog).toContainText('请在手机上允许 USB 调试')
  // 不再触发「浏览 ZIP」回退（没有新标签页）
  expect(await page.locator('.tab-item').count()).toBe(1)

  await page.getByRole('button', { name: '安装', exact: true }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  const calls = (await ops(page)).filter(o => o.kind === 'createAppInstall')
  expect(calls).toHaveLength(1)
  expect(calls[0].sourceDeviceId).toBe('local')
  expect(calls[0].sourcePaths).toEqual([APK])
  expect(calls[0].targetDeviceId).toBe('android-aaa')
})

test('双击本机 apk（无设备）：不出 Sheet，退回与右键「浏览」相同的导航（新标签页进入 ZIP 虚拟目录）', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => { (window as any).__targets = [] })
  await page.dblclick(`[data-file-path="${APK}"]`)
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await expect(page.locator(DIALOG)).toHaveCount(0)
  await expect(page.locator(`[data-file-path="${APK}::AndroidManifest.xml"]`)).toBeVisible()
  expect((await ops(page)).filter(o => o.kind === 'createAppInstall')).toHaveLength(0)
})

test('右键本机 apk：存在目标设备时出现「安装到 Android 设备…」，与 ZIP 子菜单并列；混选时消失', async ({ page }) => {
  await setup(page)
  // 扫描器尚未看到 Android 设备：门控关闭，安装项不出现
  await select(page, [APK])
  await expect(page.locator('.context-menu-item', { hasText: 'ZIP' })).toHaveCount(1)
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await emitMobile(page, [{ id: 'android-aaa', name: 'Pixel 8' }])
  await select(page, [APK])
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(1)
  // 「浏览/解压」仍在（安装是并列项，不替代 ZIP 子菜单）
  await expect(page.locator('.context-menu-item', { hasText: 'ZIP' })).toHaveCount(1)

  // 混选 apk 与其它文件：安装项不出现
  await page.keyboard.press('Escape')
  await select(page, [APK, `${DIR}/notes.txt`])
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(0)

  // 多选两个 apk：出现；Sheet 显示「2 个安装包」。两台已授权设备且无记忆 → 不预选、
  // 「安装」置灰；选中一台后可用并装到该设备
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    ;(window as any).__targets = [
      { deviceId: 'android-aaa', serial: 'aaa', name: 'Pixel 8', authorized: true },
      { deviceId: 'android-ccc', serial: 'ccc', name: 'Galaxy S24', authorized: true }
    ]
  })
  await select(page, [APK, `${DIR}/tool.apk`])
  await page.locator('.context-menu-item', { hasText: MENU_ITEM }).click()
  const dialog = page.locator(DIALOG, { hasText: SHEET_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.sheet-sub')).toContainText('2 个安装包')
  await expect(dialog).not.toContainText('示例应用')
  await expect(dialog.getByRole('radio', { name: /Pixel 8/ })).not.toBeChecked()
  await expect(dialog.getByRole('radio', { name: /Galaxy S24/ })).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: '安装 2 个', exact: true })).toBeDisabled()
  await dialog.getByRole('radio', { name: /Pixel 8/ }).check()
  await expect(dialog.getByRole('button', { name: '安装 2 个', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '安装 2 个', exact: true }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  const calls = (await ops(page)).filter(o => o.kind === 'createAppInstall')
  expect(calls).toHaveLength(1)
  expect(calls[0].sourcePaths).toEqual([APK, `${DIR}/tool.apk`])
  expect(calls[0].targetDeviceId).toBe('android-aaa')
})

test('未授权设备：Sheet 中置灰不可选，列表只有未授权设备时「安装」置灰且提示「未检测到」不出现', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    ;(window as any).__targets = [{ deviceId: 'android-bbb', serial: 'bbb', name: 'OnePlus 7T', authorized: false }]
  })
  await page.dblclick(`[data-file-path="${APK}"]`)
  const dialog = page.locator(DIALOG, { hasText: SHEET_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /OnePlus 7T/ })).toBeDisabled()
  await expect(dialog.getByRole('radio', { name: /OnePlus 7T/ })).not.toBeChecked()
  await expect(dialog).toContainText('请在手机上允许 USB 调试')
  await expect(dialog.getByRole('button', { name: '安装', exact: true })).toBeDisabled()
  await expect(dialog).not.toContainText('未检测到 Android 设备')
})

test('设备刚好断开：右键仍出现安装项（扫描器滞后），Sheet 列表为空 → 提示「未检测到 Android 设备」且「安装」置灰', async ({ page }) => {
  await setup(page)
  await emitMobile(page, [{ id: 'android-aaa', name: 'Pixel 8' }])
  await page.evaluate(() => { (window as any).__targets = [] })
  await select(page, [APK])
  await page.locator('.context-menu-item', { hasText: MENU_ITEM }).click()
  const dialog = page.locator(DIALOG, { hasText: SHEET_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('未检测到 Android 设备')
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '安装', exact: true })).toBeDisabled()
})

test('「取消」关闭 Sheet 且不发起任务', async ({ page }) => {
  await setup(page)
  await page.dblclick(`[data-file-path="${APK}"]`)
  await expect(page.locator(DIALOG, { hasText: SHEET_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  expect((await ops(page)).filter(o => o.kind === 'createAppInstall')).toHaveLength(0)
})

test('Android 设备上的 apk：双击 → 确认 Sheet 不列设备，只显示「将安装到 <设备名>」；确认后源与目标都是该设备', async ({ page }) => {
  await setup(page, 'android-aaa')
  await page.dblclick(`[data-file-path="${APK}"]`)
  const dialog = page.locator(DIALOG, { hasText: SHEET_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('将安装到 Pixel 8')
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  // 手机上的 APK 不解析包信息：只显示文件名与大小
  await expect(dialog).toContainText('app-debug.apk')
  await expect(dialog).not.toContainText('示例应用')
  await page.getByRole('button', { name: '安装', exact: true }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  const calls = (await ops(page)).filter(o => o.kind === 'createAppInstall')
  expect(calls).toHaveLength(1)
  expect(calls[0].sourceDeviceId).toBe('android-aaa')
  expect(calls[0].targetDeviceId).toBe('android-aaa')
})

// ── 「显示简介」安装包区块（独立简介窗口路由 ?file-info-window=1） ────────────

async function setupInfoWindow(page: Page, mode: 'ok' | 'fail') {
  await page.addInitScript(({ apkMode }) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [{ id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }],
      getFileInfoWindowContext: async () => ({
        deviceId: 'local', deviceType: 'local', deviceName: '本机',
        files: [{ name: 'app-debug.apk', path: '/apks/app-debug.apk', isDirectory: false, isFile: true, size: 2 * 1024 * 1024, modifiedTime: '2026-11-24T10:00:00Z', extension: '.apk' }]
      }),
      getStats: async () => ({ size: 2 * 1024 * 1024, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0o644 }),
      getDeviceCapabilities: async () => ({ canChmod: true }),
      getFileMetadata: async () => ({ tags: [] }),
      getApkInfo: async () => {
        if (apkMode === 'fail') throw new Error('End of central directory record signature not found')
        return { packageName: 'com.example.app', appName: '示例应用', versionName: '1.2.3', versionCode: 1024, minSdk: 24, targetSdk: 33 }
      },
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
    localStorage.removeItem('fileman-tabs-state')
  }, { apkMode: mode })
  await page.goto('/?file-info-window=1')
  await expect(page.getByRole('heading', { name: 'app-debug.apk' })).toBeVisible()
}

test('显示简介：单选本机 apk 出现「安装包」区块（应用名称 / 包名 / 版本 / 最低与目标 Android 版本）', async ({ page }) => {
  await setupInfoWindow(page, 'ok')
  const section = page.locator('section', { has: page.locator('h4', { hasText: '安装包' }) })
  await expect(section).toBeVisible()
  await expect(section).toContainText('示例应用')
  await expect(section).toContainText('com.example.app')
  await expect(section).toContainText('1.2.3 (1024)')
  await expect(section).toContainText('Android 7.0（API 24）')
  await expect(section).toContainText('Android 13（API 33）')
  await expect(page.locator('text=无法解析安装包信息')).toHaveCount(0)
})

test('显示简介：Manifest 解析失败 → 一行「无法解析安装包信息」，不弹错', async ({ page }) => {
  await setupInfoWindow(page, 'fail')
  const section = page.locator('section', { has: page.locator('h4', { hasText: '安装包' }) })
  await expect(section).toBeVisible()
  await expect(section).toContainText('无法解析安装包信息')
  // 常规区照常可用
  await expect(page.locator('text=常规')).toBeVisible()
})
