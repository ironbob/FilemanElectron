/**
 * 文本预览 着色方案 + 表达式语法帮助 e2e（2026-08-19）
 *
 * 背景：着色方案入口随 LogAnalysisToolbar（548bb14 删除）被埋进查找选项
 * Popover「高级」区三级深；本套锁定回迁后的契约：
 *  1. 工具栏常驻着色菜单钮（阅读组，与语法菜单同 idiom）
 *  2. 选内置「日志级别」→ Monaco 行级装饰（fma-hl-line-red/orange）实际渲染
 *  3. 管理方案… → SchemeEditorDialog
 *  4. 查找选项 Popover 不再有着色 select（入口唯一化），新增表达式语法面板
 *
 * 打开路径沿用 text-preview-filter.spec.ts 的 grep 链路。
 */
import { test, expect, type Page } from '@playwright/test'

test.beforeEach(({ page }) => {
  // NOTE: addInitScript 的参数走结构化克隆，函数会丢失 —— mock 必须整体内联
  void page.addInitScript(() => {
    const lines: string[] = []
    for (let i = 1; i <= 30; i++) lines.push(`# filler comment line ${i}`)
    lines[4] = '2026-08-19 10:00:00 ERROR something failed'
    lines[9] = '2026-08-19 10:00:01 WARN something odd'
    lines[14] = '2026-08-19 10:00:02 INFO all good'
    const content = lines.join('\n')

    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'app.log', path: '/src/app.log', isDirectory: false, isFile: true, size: 1200, modifiedTime: '2026-08-19T10:00:00Z', extension: '.log' }
      ],
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      startGrep: async () => {
        const push = (window as any).__pushGrep
        setTimeout(() => push?.({
          sessionId: 'g1', taskId: 't1', status: 'searching', matchCount: 1,
          matches: [
            { path: '/src/app.log', line: 5, column: 22, lineText: '2026-08-19 10:00:00 ERROR something failed', matchStart: 21, matchEnd: 26 }
          ]
        }), 10)
        setTimeout(() => push?.({ sessionId: 'g1', taskId: 't1', status: 'completed', matchCount: 1, matches: [] }), 40)
        return { taskId: 't1' }
      },
      cancelGrep: async () => true,
      onGrepProgress: (callback: (progress: unknown) => void) => {
        ;(window as any).__pushGrep = callback
        return () => { (window as any).__pushGrep = undefined }
      },
      readFile: async () => btoa(content),
      getStats: async () => ({ size: 1200, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
        id: 't1', title: 'src', activePaneId: 'p1',
        panes: [{ id: 'p1', deviceId: 'local', path: '/src', history: ['/src'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }]
      }]
    }))
    // 着色激活态持久化键清零，保证「无着色」初始态
    localStorage.setItem('fileman.logAnalysis.activeSchemeId', '')
  })
})

async function openTextPreview(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-file-path="/src/app.log"]').waitFor({ state: 'visible' })
  await page.locator('.relative.flex-1.flex.flex-col').first()
    .click({ button: 'right', position: { x: 400, y: 300 } })
  await page.locator('.context-menu .context-menu-item', { hasText: '在此搜索内容' }).click()
  const input = page.locator('input[placeholder*="搜索内容"]')
  await input.fill('ERROR')
  await input.press('Enter')
  await page.getByText('something failed').first().click()
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 8000 })
}

test('着色方案：常驻菜单钮 → 选「日志级别」→ 行级装饰渲染 + aria-pressed', async ({ page }) => {
  await openTextPreview(page)

  // 常驻入口（无需先展开搜索框）+ 初始无激活
  const schemeBtn = page.locator('[data-testid="text-scheme-menu"]')
  await expect(schemeBtn).toBeVisible()
  await expect(schemeBtn).not.toHaveAttribute('aria-pressed', 'true')

  // 菜单：无着色 + 两个内置方案 + 管理方案…
  await schemeBtn.click()
  const menu = page.locator('[data-testid="text-scheme-popover"]')
  await expect(menu).toBeVisible()
  await expect(menu.getByText('无着色')).toBeVisible()
  await expect(menu.getByText('日志级别 (内置)')).toBeVisible()
  await expect(menu.getByText('通用增强 (内置)')).toBeVisible()
  await expect(menu.getByText('管理着色方案')).toBeVisible()

  // 选「日志级别」→ ERROR 红行 / WARN 橙行装饰（视口内行）
  await menu.getByText('日志级别 (内置)').click()
  await expect(page.locator('.monaco-editor .fma-hl-line-red').first()).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.monaco-editor .fma-hl-line-orange').first()).toBeVisible({ timeout: 5000 })
  // 菜单关闭 + 按钮进入低调激活态
  await expect(menu).toHaveCount(0)
  await expect(schemeBtn).toHaveAttribute('aria-pressed', 'true')

  // 切回无着色 → 装饰消失、按钮退出激活态
  await schemeBtn.click()
  await page.locator('[data-testid="text-scheme-popover"]').getByText('无着色').click()
  await expect(page.locator('.monaco-editor .fma-hl-line-red')).toHaveCount(0)
  await expect(schemeBtn).not.toHaveAttribute('aria-pressed', 'true')
})

test('着色方案：管理方案… → SchemeEditorDialog；Esc 收起菜单', async ({ page }) => {
  await openTextPreview(page)

  await page.locator('[data-testid="text-scheme-menu"]').click()
  await page.locator('[data-testid="text-scheme-popover"]').getByText('管理着色方案').click()
  await expect(page.locator('[data-testid="scheme-editor"]')).toBeVisible()
})

test('查找选项 Popover：着色 select 已移除 + 表达式语法面板', async ({ page }) => {
  await openTextPreview(page)

  await page.keyboard.press('Meta+f')
  await page.locator('[data-testid="text-find-options-btn"]').click()
  const popover = page.locator('[data-testid="find-options-popover"]')
  await expect(popover).toBeVisible()
  // 着色入口唯一化：Popover 内不再有 select
  await expect(popover.locator('select')).toHaveCount(0)

  // 表达式语法… 二级面板：谓词速查
  await popover.getByText('表达式语法…').click()
  const help = page.locator('[data-testid="syntax-help-panel"]')
  await expect(help).toBeVisible()
  const panel = popover.filter({ has: page.locator('[data-testid="syntax-help-panel"]') })
  await expect(panel.getByText('co(x) / CO(x)')).toBeVisible()
  await expect(panel.getByText('reg(x) / REG(x)')).toBeVisible()
  await expect(panel.getByText('level(a,b)')).toBeVisible()
  await expect(panel.getByText('lines(n-m)')).toBeVisible()
})
