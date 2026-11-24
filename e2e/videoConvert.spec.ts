import { expect, test, type Page } from '@playwright/test'

// 视频转换（video-convert）入口回归：右键门控（全为视频才出现）→ 参数 Sheet（镜像图片转换）
// → 确认后 createVideoConvert 的 spec。ffmpeg 真实管道由仓库外冒烟脚本覆盖，此处 mock fileman。

const DIR = '/vids'
const MENU_ITEM = '转换为 MP4…'
const DIALOG = '.finder-sheet[role="dialog"]'
const SHEET_TITLE = '转换视频'

function file(name: string, size: number) {
  return { name, path: `${DIR}/${name}`, isDirectory: false, isFile: true, size, modifiedTime: '2026-11-23T10:00:00Z', extension: `.${name.split('.').pop()}` }
}

async function setup(page: Page, deviceId = 'local') {
  await page.addInitScript(({ dir, deviceId: paneDevice }) => {
    const ops: any[] = []
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
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
        { id: 'ssh-nas', type: 'ssh', name: 'NAS', status: 'connected' }
      ],
      listFiles: async () => [
        file('a.mov', 10 * 1024 * 1024),
        file('b.MOV', 2 * 1024 * 1024),
        file('clip.mp4', 5 * 1024 * 1024),
        file('pic.jpg', 300 * 1024),
        file('notes.txt', 12)
      ],
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      getStats: async () => ({ size: 12, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      exists: async () => false,
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      volumes: { list: async () => [], onChanged: () => () => undefined },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 },
      createVideoConvert: async (dev: string, sourcePaths: string[], spec: any) => {
        ops.push({ kind: 'createVideoConvert', deviceId: dev, sourcePaths, spec })
        return { id: 't1', type: 'video-convert', status: 'completed', sourceDeviceId: dev, sourcePaths, videoConvert: spec, progress: { itemResults: [] } }
      }
    }
    function file(name: string, size: number) {
      return { name, path: `${dir}/${name}`, isDirectory: false, isFile: true, size, modifiedTime: '2026-11-23T10:00:00Z', extension: `.${name.split('.').pop()}` }
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
  }, { dir: DIR, deviceId })
  await page.goto('/')
  await expect(page.locator(`[data-file-path="${DIR}/a.mov"]`)).toBeVisible()
}

async function select(page: Page, paths: string[]) {
  await page.locator(`[data-file-path="${paths[0]}"]`).click()
  for (const p of paths.slice(1)) await page.locator(`[data-file-path="${p}"]`).click({ modifiers: ['Meta'] })
  await page.locator(`[data-file-path="${paths[paths.length - 1]}"]`).click({ button: 'right' })
  await expect(page.locator('.context-menu')).toBeVisible()
}

const ops = (page: Page) => page.evaluate(() => (window as any).__ops as any[])

test('选中 .mov：「转换为 MP4…」出现；Sheet 默认标准/保持；确认后 createVideoConvert 收到正确 spec', async ({ page }) => {
  await setup(page)
  await select(page, [`${DIR}/a.mov`])
  // 与「图片转换」并列：视频项出现，图片项不出现
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(1)
  await expect(page.locator('.context-menu-item', { hasText: '转换为…' })).toHaveCount(0)

  await page.locator('.context-menu-item', { hasText: MENU_ITEM }).click()
  await expect(page.locator(DIALOG, { hasText: SHEET_TITLE })).toBeVisible()
  // 副标题：MP4（H.264）说明 + 数量 + 总体积
  await expect(page.locator('.sheet-sub')).toContainText('共 1 个视频，10.0 MB')
  await expect(page.getByRole('radio', { name: '标准' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: '保持' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: '转换 1 个' })).toBeVisible()

  await page.getByRole('button', { name: '转换 1 个' }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  const calls = (await ops(page)).filter(o => o.kind === 'createVideoConvert')
  expect(calls).toHaveLength(1)
  expect(calls[0].deviceId).toBe('local')
  expect(calls[0].sourcePaths).toEqual([`${DIR}/a.mov`])
  expect(calls[0].spec).toEqual({ format: 'mp4', quality: 'standard', resolution: 'keep', dir: undefined, suffix: '' })
})

test('混选图片 + 视频：「转换为 MP4…」与「转换为…」都不出现', async ({ page }) => {
  await setup(page)
  await select(page, [`${DIR}/a.mov`, `${DIR}/pic.jpg`])
  await expect(page.locator('.context-menu')).toBeVisible()
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(0)
  await expect(page.locator('.context-menu-item', { hasText: '转换为…' })).toHaveCount(0)
  // 仅图片时：图片项出现、视频项不出现（image-convert 行为不变）
  await page.keyboard.press('Escape')
  await select(page, [`${DIR}/pic.jpg`])
  await expect(page.locator('.context-menu-item', { hasText: '转换为…' })).toHaveCount(1)
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(0)
})

test('多选 3 个视频（含大写 .MOV）：Sheet 计数/体积/按钮随选择；质量、分辨率、后缀反映到 spec', async ({ page }) => {
  await setup(page)
  await select(page, [`${DIR}/a.mov`, `${DIR}/b.MOV`, `${DIR}/clip.mp4`])
  await page.locator('.context-menu-item', { hasText: MENU_ITEM }).click()
  await expect(page.locator(DIALOG, { hasText: SHEET_TITLE })).toBeVisible()
  await expect(page.locator('.sheet-sub')).toContainText('共 3 个视频，17.0 MB')
  await page.getByRole('radio', { name: '小体积' }).click()
  await page.getByRole('radio', { name: '720p' }).click()
  await page.getByPlaceholder('例如 _mp4').fill('_mp4')
  await page.getByRole('button', { name: '转换 3 个' }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  const calls = (await ops(page)).filter(o => o.kind === 'createVideoConvert')
  expect(calls).toHaveLength(1)
  expect(calls[0].sourcePaths).toEqual([`${DIR}/a.mov`, `${DIR}/b.MOV`, `${DIR}/clip.mp4`])
  expect(calls[0].spec).toEqual({ format: 'mp4', quality: 'small', resolution: '720p', dir: undefined, suffix: '_mp4' })
})

test('「取消」关闭 Sheet 且不发起任务', async ({ page }) => {
  await setup(page)
  await select(page, [`${DIR}/clip.mp4`])
  await page.locator('.context-menu-item', { hasText: MENU_ITEM }).click()
  await expect(page.locator(DIALOG, { hasText: SHEET_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator(DIALOG)).toHaveCount(0)
  expect((await ops(page)).filter(o => o.kind === 'createVideoConvert')).toHaveLength(0)
})

test('远程设备（SSH）：菜单不出现（仅本机）', async ({ page }) => {
  await setup(page, 'ssh-nas')
  await select(page, [`${DIR}/a.mov`])
  await expect(page.locator('.context-menu')).toBeVisible()
  await expect(page.locator('.context-menu-item', { hasText: MENU_ITEM })).toHaveCount(0)
})
