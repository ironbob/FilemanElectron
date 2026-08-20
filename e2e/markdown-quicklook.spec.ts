import { expect, test } from '@playwright/test'

// Markdown 快速预览 Finder 化（2026-08-20）回归锁：
// 1. YAML front matter 剥离：不再按 setext 规则渲染成大号粗体正文（title 段变 h2 的历史 bug）
// 2. 预览/源码改为 Finder 分段控件（finder-seg-tray）：激活=浅灰非蓝（单蓝规则），不再蓝底白字网页 Tab
// 3. 渲染区=独立滚动容器（flex-1/min-h-0/overflow-y-auto）：顶部对齐、阅读列 720px 宽窗居中、
//    短文结束后仅 32–48px 安全留白（无垂直居中感/大段空白）
// 4. 代码块：SF Mono 栈 · 浅灰 inset · 8px 圆角 · 长行横向滚动
// 5. 高亮 token 双主题（--md-hl-*）：亮=One Light 系 / 暗=Material 柔和色（旧版只有暗色一套）
// 6. QL markdown 窗工具栏恢复极细分隔线（is-md；纯文本窗维持无分割线不变）

const MD_SHORT = [
  '---',
  'title: 部署手册',
  'date: 2026-08-20',
  '---',
  '',
  '# 部署手册',
  '',
  '短文档正文。',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
].join('\n')

const MD_LONG = [
  '# 长文档', '',
  ...Array.from({ length: 60 }, (_, i) => `## 第 ${i + 1} 节\n\n正文段落 ${i + 1}。\n`),
].join('\n')

function fileEntry(name: string, md: string) {
  return { name, size: Buffer.byteLength(md), b64: Buffer.from(md).toString('base64') }
}

const FILES = [
  fileEntry('short.md', MD_SHORT),
  fileEntry('long.md', MD_LONG),
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript((files) => {
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => files.map((f: any) => ({
        name: f.name, path: `/${f.name}`, isDirectory: false, isFile: true, size: f.size,
        modifiedTime: '2026-08-14T10:00:00Z', extension: '.md'
      })),
      readFile: async (_d: string, path: string) => {
        const f = (files as any[]).find(x => '/' + x.name === path)
        return f ? f.b64 : btoa('missing')
      },
      getStats: async () => ({ size: 1, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
    // 主题不在此设定：默认暗色；亮色用例在测试内切换后 reload（init 不清 theme）
  }, FILES)
  await page.goto('/')
  await expect(page.locator('[data-file-path="/short.md"]')).toBeVisible()
})

async function openQuickLook(page: import('@playwright/test').Page, file: string) {
  await page.locator(`[data-file-path="/${file}"]`).click()
  await page.keyboard.press('Space')
  const overlay = page.getByRole('dialog', { name: '快速预览' })
  await expect(overlay).toBeVisible()
  await expect(overlay.locator('.md-body')).toBeVisible()
  return overlay
}

test('YAML front matter is stripped from the rendered view', async ({ page }) => {
  const overlay = await openQuickLook(page, 'short.md')
  const body = overlay.locator('.md-body')
  // 元信息不得以任何形式出现在渲染正文（历史 bug：title 段被 setext 收编成大号粗体 h2）
  await expect(body).not.toContainText('title:')
  await expect(body.locator('h1')).toHaveText('部署手册')
  await expect(body.locator('h2')).toHaveCount(0)
})

test('preview/source uses a Finder segmented control (active = gray, not blue)', async ({ page }) => {
  const overlay = await openQuickLook(page, 'short.md')
  const seg = overlay.locator('.finder-seg-tray')
  await expect(seg).toBeVisible()

  const activeBg = await overlay.locator('[data-testid="md-mode-preview"]').evaluate(el =>
    getComputedStyle(el).backgroundColor)
  // 单蓝规则：分段控件激活态为浅灰，不得出现高饱和大面积蓝底
  expect(activeBg).not.toContain('10, 132, 255')

  // 切换链路保持可用：源码=Monaco，预览=渲染视图
  await overlay.locator('[data-testid="md-mode-source"]').click()
  await expect(overlay.locator('.monaco-editor').first()).toBeVisible()
  await expect(overlay.locator('.md-body')).toHaveCount(0)
  await overlay.locator('[data-testid="md-mode-preview"]').click()
  await expect(overlay.locator('.md-body')).toBeVisible()
})

test('rendered area: independent scroller, top-aligned, 720px reading column', async ({ page }) => {
  const overlay = await openQuickLook(page, 'short.md')
  const geom = await overlay.locator('.md-rendered').evaluate((scroller: HTMLElement) => {
    const body = scroller.querySelector('.md-body') as HTMLElement | null
    const h1 = scroller.querySelector('h1')
    const card = document.querySelector('.quick-look-card') as HTMLElement | null
    const last = scroller.querySelector('.md-body > :last-child') as HTMLElement | null
    return {
      overflowY: getComputedStyle(scroller).overflowY,
      bodyMax: body ? getComputedStyle(body).maxWidth : '',
      bodyLeft: body ? body.getBoundingClientRect().left : -1,
      cardW: card ? card.getBoundingClientRect().width : 0,
      h1Top: h1 ? h1.getBoundingClientRect().top - scroller.getBoundingClientRect().top : -1,
      padTop: parseFloat(getComputedStyle(scroller).paddingTop),
      lastMarginBottom: last ? getComputedStyle(last).marginBottom : ''
    }
  })
  // 独立滚动容器：长文只在内容区滚动，工具栏常驻
  expect(geom.overflowY).toBe('auto')
  // 阅读列 ≤760px（取 720）且宽窗内自然居中
  expect(parseFloat(geom.bodyMax)).toBe(720)
  expect(geom.bodyLeft).toBeGreaterThan((geom.cardW - 720) / 2 - 40)
  // 从内容区顶部起排：首标题顶距=容器顶内边距（无垂直居中偏移）
  expect(Math.abs(geom.h1Top - geom.padTop)).toBeLessThan(4)
  // 末元素零尾距（容器 44px 底部安全留白承担收尾；QL 卡固定高下短文剩余空间
  // 属窗口稳定几何而非内容空白——08-19 决策，可滚文档的余量在长文用例锁）
  expect(geom.lastMarginBottom).toBe('0px')
})

test('long markdown scrolls inside the content area, toolbar stays fixed', async ({ page }) => {
  const overlay = await openQuickLook(page, 'long.md')
  const before = await overlay.evaluate(() => ({
    scrollable: (document.querySelector('.md-rendered') as HTMLElement).scrollHeight
      > (document.querySelector('.md-rendered') as HTMLElement).clientHeight,
    toolbarTop: (document.querySelector('.text-view-toolbar') as HTMLElement).getBoundingClientRect().top
  }))
  expect(before.scrollable).toBe(true)

  await overlay.evaluate(() => { (document.querySelector('.md-rendered') as HTMLElement).scrollTop = 800 })
  await page.waitForTimeout(150)
  const after = await overlay.evaluate(() => ({
    scrollTop: (document.querySelector('.md-rendered') as HTMLElement).scrollTop,
    toolbarTop: (document.querySelector('.text-view-toolbar') as HTMLElement).getBoundingClientRect().top,
    listScroll: (document.querySelector('.vue-recycle-scroller') as HTMLElement | null)?.scrollTop ?? 0
  }))
  expect(after.scrollTop).toBe(800)
  // 工具栏不动；外层文件列表也不被带动
  expect(Math.abs(after.toolbarTop - before.toolbarTop)).toBeLessThan(1)
  expect(after.listScroll).toBe(0)

  // 滚到底：文档末尾距滚动底边=容器底部安全留白（44px），无多余空段
  const tailGap = await overlay.evaluate(() => {
    const s = document.querySelector('.md-rendered') as HTMLElement
    s.scrollTop = s.scrollHeight
    const last = s.querySelector('.md-body > :last-child') as HTMLElement
    const gap = s.scrollHeight - (last.getBoundingClientRect().bottom - s.getBoundingClientRect().top + s.scrollTop)
    return { gap, padBottom: parseFloat(getComputedStyle(s).paddingBottom) }
  })
  expect(Math.abs(tailGap.gap - tailGap.padBottom)).toBeLessThan(1)
})

test('code blocks: SF Mono stack, light inset, 8px radius, horizontal scroll', async ({ page }) => {
  const overlay = await openQuickLook(page, 'short.md')
  const typo = await overlay.locator('.md-body pre').evaluate((pre: HTMLElement) => {
    const code = pre.querySelector('code') as HTMLElement
    return {
      radius: getComputedStyle(pre).borderRadius,
      overflowX: getComputedStyle(pre).overflowX,
      mono: getComputedStyle(code).fontFamily,
      size: getComputedStyle(code).fontSize
    }
  })
  expect(typo.radius).toBe('8px')
  expect(typo.overflowX).toBe('auto')
  expect(/SF Mono|ui-monospace/.test(typo.mono)).toBe(true)
  expect(parseFloat(typo.size)).toBe(13)
})

test('highlight tokens switch with theme (light One-Light / dark Material)', async ({ page }) => {
  // 显式设定主题再 reload：resolveInitialTheme 无存储时跟随系统 prefers-color-scheme
  // （无头 Chromium 默认 light），不得依赖默认值
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  const overlayDark = await openQuickLook(page, 'short.md')
  await expect.poll(() => overlayDark.locator('.md-body .hljs-keyword').evaluate(el =>
    getComputedStyle(el).color)).toBe('rgb(199, 146, 234)')

  // 切亮色后 reload：低饱和文档系（One Light 系洋红）
  await page.evaluate(() => localStorage.setItem('theme', 'light'))
  await page.reload()
  const overlayLight = await openQuickLook(page, 'short.md')
  await expect.poll(() => overlayLight.locator('.md-body .hljs-keyword').evaluate(el =>
    getComputedStyle(el).color)).toBe('rgb(166, 38, 164)')
})

test('quick look markdown toolbar shows a hairline divider under it', async ({ page }) => {
  const overlay = await openQuickLook(page, 'short.md')
  // is-md：QL 材质窗内工具栏恢复发丝分隔（纯文本窗保持透明不变，此处只锁 md）
  const border = await overlay.locator('.text-view-toolbar').evaluate(el =>
    getComputedStyle(el).borderBottomColor)
  expect(border).not.toBe('rgba(0, 0, 0, 0)')
})
