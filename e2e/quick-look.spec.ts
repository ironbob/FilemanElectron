import { expect, test } from '@playwright/test'

// Quick Look（空格键瞬态预览）回归：
// 1. Space 打开 / 再按 Space 关闭，且按键的浏览器默认滚动不得带动 FileList
//    （stopImmediatePropagation 只拦监听器，不拦默认滚动——必须 preventDefault）
// 2. ↑↓ 步进必须刷新浮窗内容——包括用户点击预览内容使 Monaco 获得焦点之后
//    （模态期间 Space/↑↓/Esc 归浮层所有，不得落入 Monaco 的隐藏 textarea）

const N_FILES = 40

test.beforeEach(async ({ page }) => {
  await page.addInitScript((fileCount: number) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => {
        ;(window as any).__listCalls = ((window as any).__listCalls ?? 0) + 1
        return Array.from({ length: fileCount }, (_, i) => {
          const name = `file-${String(i + 1).padStart(2, '0')}.txt`
          return {
            name, path: `/${name}`, isDirectory: false, isFile: true, size: 12,
            modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt'
          }
        })
      },
      readFile: async () => btoa('hello quick look'),
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
    localStorage.removeItem('fileman-tabs-state')
  }, N_FILES)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/file-01.txt"]')).toBeVisible()
})

async function openQuickLook(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/file-01.txt"]').click()
  await page.keyboard.press('Space')
  const overlay = page.getByRole('dialog', { name: '快速预览' })
  await expect(overlay).toBeVisible()
  return overlay
}

function headerName(overlay: import('@playwright/test').Locator) {
  return overlay.locator('.text-sm.font-medium').first()
}

test('Space toggles Quick Look without scrolling the file list', async ({ page }) => {
  const overlay = await openQuickLook(page)
  await expect(headerName(overlay)).toHaveText('file-01.txt')

  const scrollBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.vue-recycle-scroller')).map(s => s.scrollTop)
      .concat([document.scrollingElement?.scrollTop ?? 0])
  )

  // 关闭：浮层消失，且列表滚动位置不变（默认 Space 滚动必须被 preventDefault）
  await page.keyboard.press('Space')
  await expect(overlay).toBeHidden()
  const scrollAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.vue-recycle-scroller')).map(s => s.scrollTop)
      .concat([document.scrollingElement?.scrollTop ?? 0])
  )
  expect(scrollAfter).toEqual(scrollBefore)
})

test('ArrowDown/Up steps the Quick Look content (text preview)', async ({ page }) => {
  const overlay = await openQuickLook(page)

  await page.keyboard.press('ArrowDown')
  await expect(headerName(overlay)).toHaveText('file-02.txt')

  await page.keyboard.press('ArrowDown')
  await expect(headerName(overlay)).toHaveText('file-03.txt')

  await page.keyboard.press('ArrowUp')
  await expect(headerName(overlay)).toHaveText('file-02.txt')

  // Esc closes and leaves the selection on the last browsed item
  await page.keyboard.press('Escape')
  await expect(overlay).toBeHidden()
  await expect(page.locator('[data-file-path="/file-02.txt"]')).toHaveClass(/bg-accent-blue/)
})

test('arrows still step after clicking into the preview content (Monaco focus)', async ({ page }) => {
  const overlay = await openQuickLook(page)
  // 点击文本预览内部 → Monaco 隐藏 textarea 获得焦点
  const editor = overlay.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await editor.click()
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA')

  await page.keyboard.press('ArrowDown')
  await expect(headerName(overlay)).toHaveText('file-02.txt')

  // Monaco 持有焦点时，Space 仍然关闭浮层
  await page.keyboard.press('Space')
  await expect(overlay).toBeHidden()
})

test('selected rows keep the accent-blue background while hovered', async ({ page }) => {
  // 选中两个文件，hover 其中一个：选中态背景不得被 hover 灰底覆盖
  await page.locator('[data-file-path="/file-01.txt"]').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  const hovered = page.locator('[data-file-path="/file-02.txt"]')
  const idle = page.locator('[data-file-path="/file-03.txt"]')
  await expect(hovered).toHaveClass(/bg-accent-blue/)
  await expect(idle).toHaveClass(/bg-accent-blue/)
  await hovered.hover()
  await page.waitForTimeout(200)
  const colors = await page.evaluate(() => {
    const get = (p: string) => {
      const el = document.querySelector(`[data-file-path="${p}"]`) as HTMLElement | null
      return el ? getComputedStyle(el).backgroundColor : 'missing'
    }
    return { hovered: get('/file-02.txt'), idle: get('/file-03.txt') }
  })
  // hover 中的选中行与未 hover 的选中行背景必须完全一致（蓝底）
  expect(colors.hovered).toBe(colors.idle)
})
