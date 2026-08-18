/**
 * 视频播放页 Quick Look 式重设计 e2e（2026-08-18）
 * 设计契约：docs/design/finder-ui-standard.md §13
 *
 * 覆盖：半透明材质控制条/工具栏结构、分辨率与倍速显示、倍速 NSMenu、
 * 空格播放/暂停、进度 scrubber 点击 seek、控件静止自动淡出与移动唤醒、
 * 视频 tab 期间状态栏设备徽标让位。
 *
 * 素材：48×72 竖屏 8s VP8 webm（testsrc2 生成，base64 内联—— readFile mock
 * 只能返回 base64，无法运行时造出可解码的视频）。
 */
import { test, expect, type Page } from '@playwright/test'

const VIDEO_BASE64 = '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'

// 解码后字节数（与 mock FileInfo.size 保持一致）
const VIDEO_BYTES = Buffer.from(VIDEO_BASE64, 'base64').length

test.beforeEach(({ page }) => {
  // NOTE: addInitScript 的参数走结构化克隆，函数会丢失 —— mock 必须整体内联
  // （与 quick-look.spec.ts 同模式）。
  void page.addInitScript((payload: { b64: string; bytes: number }) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'clip.webm', path: '/clip.webm', isDirectory: false, isFile: true, size: payload.bytes, modifiedTime: '2026-08-18T10:00:00Z', extension: '.webm' }
      ],
      readFile: async () => payload.b64,
      getStats: async () => ({ size: payload.bytes, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
    localStorage.removeItem('fileman-tabs-state')
    localStorage.removeItem('fileman-video-volume')
  }, { b64: VIDEO_BASE64, bytes: VIDEO_BYTES })
})

async function openVideoPreview(page: Page) {
  await page.goto('/')
  // 常规 tab：状态栏右下设备徽标在场（限定状态栏，避免与侧边栏「本机」组名混淆）
  await expect(page.locator('.bg-bg-statusbar').getByText('本机')).toBeVisible()

  await page.locator('[data-file-path="/clip.webm"]').dblclick()
  const video = page.locator('.video-stage video')
  await expect(video).toBeVisible({ timeout: 8000 })
  // 元数据就绪后贴合框成形（分辨率可用）
  await expect(page.locator('.video-resolution')).toHaveText('48 × 72', { timeout: 5000 })
  return video
}

test('材质与结构：半透明控制条/工具栏，分辨率次要显示，倍速紧凑下拉', async ({ page }) => {
  await openVideoPreview(page)

  // 控制条与右上工具栏都是半透明材质浮层
  await expect(page.locator('.video-controls .video-glass-bar')).toBeVisible()
  await expect(page.locator('.video-topbar .video-glass-chip')).toBeVisible()

  // 倍速触发钮默认 1x；工具栏内无竖向分隔线（间距分组）
  await expect(page.locator('.video-speed-trigger')).toHaveText(/1x/)
  await expect(page.locator('.video-topbar .finder-toolbar-divider')).toHaveCount(0)

  // 时间显示 0:00 / 0:02
  await expect(page.locator('.video-time')).toHaveText('0:00 / 0:08')

  // 视频 tab 激活：状态栏设备徽标让位（窗口状态层不与媒体层混排）
  await expect(page.locator('.bg-bg-statusbar').getByText('本机')).toHaveCount(0)
})

test('空格播放/暂停；scrubber 点击 seek 到中点', async ({ page }) => {
  const video = await openVideoPreview(page)

  // 点击舞台聚焦（键盘归舞台所有）
  await page.locator('.video-stage').click()
  await page.keyboard.press('Space')
  await expect(video).toHaveJSProperty('paused', false, { timeout: 3000 })

  await page.keyboard.press('Space')
  await expect(video).toHaveJSProperty('paused', true, { timeout: 3000 })

  // 进度条点击中点 → currentTime ≈ 4s（8s 素材）
  const scrubber = page.locator('.video-scrubber')
  const box = await scrubber.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2)
  const t = await video.evaluate((el: HTMLVideoElement) => el.currentTime)
  expect(Math.abs(t - 4)).toBeLessThan(0.35)
})

test('倍速 NSMenu：打开/选档/生效/Esc 收起', async ({ page }) => {
  const video = await openVideoPreview(page)

  await page.locator('.video-speed-trigger').click()
  const menu = page.locator('.video-menu')
  await expect(menu).toBeVisible()
  await expect(menu.locator('.video-menu-item')).toHaveCount(6)
  // 当前档位 1x 打勾（menuitemradio aria-checked）
  await expect(menu.locator('.video-menu-item[aria-checked="true"]')).toHaveText(/1x/)

  await menu.locator('.video-menu-item', { hasText: '2x' }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.locator('.video-speed-trigger')).toHaveText(/2x/)
  await expect(video).toHaveJSProperty('playbackRate', 2)

  // 重开菜单，Esc 收起（捕获阶段消费，不关预览 tab）
  await page.locator('.video-speed-trigger').click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('.video-stage video')).toBeVisible()
})

test('控件静止自动淡出，指针移动唤醒（200ms 渐变，无跳变）', async ({ page }) => {
  await openVideoPreview(page)

  await page.locator('.video-stage').click()
  await page.keyboard.press('Space')
  await expect(page.locator('.video-stage video')).toHaveJSProperty('paused', false, { timeout: 3000 })

  // 播放中静止 2.6s + 渐变余量 → 控制条/工具栏进入隐藏态
  const controls = page.locator('.video-controls')
  const topbar = page.locator('.video-topbar')
  await expect(controls).toHaveClass(/is-hidden/, { timeout: 8000 })
  await expect(topbar).toHaveClass(/is-hidden/)

  // 鼠标在舞台内移动 → 平滑唤醒
  const stageBox = await page.locator('.video-stage').boundingBox()
  expect(stageBox).not.toBeNull()
  await page.mouse.move(stageBox!.x + stageBox!.width * 0.5, stageBox!.y + 40)
  await expect(controls).not.toHaveClass(/is-hidden/, { timeout: 2000 })
  await expect(topbar).not.toHaveClass(/is-hidden/)

  // 暂停后控件常显（不再自动隐藏）
  await page.keyboard.press('Space')
  await expect(page.locator('.video-stage video')).toHaveJSProperty('paused', true)
  await page.waitForTimeout(3200)
  await expect(controls).not.toHaveClass(/is-hidden/)
})
