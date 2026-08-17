/**
 * 文本预览 Finder 式重设计 e2e（2026-08-17）
 * 覆盖设计契约的两个关键状态 + 查找选项 Popover + A/B 视图切换 + Esc 恢复。
 * 设计文档：docs/superpowers/specs/2026-08-17-text-preview-finder-redesign.md
 *
 * 打开路径沿用 grep-results-tab.spec.ts 的成熟链路：
 * 右键 → 在此搜索内容 → 点击命中 → 以 initialLine 打开文本预览。
 */
import { test, expect, type Page } from '@playwright/test'

test.beforeEach(({ page }) => {
  // NOTE: addInitScript 的参数走结构化克隆，函数会丢失 —— mock 必须整体内联
  // （与 grep-results-tab.spec.ts 同模式）。
  void page.addInitScript(() => {
    const lines: string[] = []
    for (let i = 1; i <= 54; i++) lines.push(`# filler comment line ${i}`)
    lines[0] = '# Install script for directory: /Users/wtb/work_space/FilemanElectron/build'
    lines[10] = 'set(INSTALL_STRING "first")'
    lines[12] = 'set(INSTALL_STRING2 "second")'
    lines[45] = 'string(TOLOWER "${CMAKE_INSTALL_COMPONENT}" COMPONENT_LC)'
    const content = lines.join('\n')

    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'cmake_install.cmake', path: '/src/cmake_install.cmake', isDirectory: false, isFile: true, size: 2148, modifiedTime: '2026-08-17T10:00:00Z', extension: '.cmake' }
      ],
      getGitStatus: async () => ({ isRepo: false, entries: [] }),
      watchSubscribe: async () => ({ ok: true }),
      watchUnsubscribe: async () => undefined,
      startGrep: async () => {
        const push = (window as any).__pushGrep
        setTimeout(() => push?.({
          sessionId: 'g1', taskId: 't1', status: 'searching', matchCount: 3,
          matches: [
            { path: '/src/cmake_install.cmake', line: 11, column: 5, lineText: 'set(INSTALL_STRING "first")', matchStart: 4, matchEnd: 10 },
            { path: '/src/cmake_install.cmake', line: 13, column: 5, lineText: 'set(INSTALL_STRING2 "second")', matchStart: 4, matchEnd: 10 },
            { path: '/src/cmake_install.cmake', line: 46, column: 1, lineText: 'string(TOLOWER "${CMAKE_INSTALL_COMPONENT}" COMPONENT_LC)', matchStart: 0, matchEnd: 6 }
          ]
        }), 10)
        setTimeout(() => push?.({ sessionId: 'g1', taskId: 't1', status: 'completed', matchCount: 3, matches: [] }), 40)
        return { taskId: 't1' }
      },
      cancelGrep: async () => true,
      onGrepProgress: (callback: (progress: unknown) => void) => {
        ;(window as any).__pushGrep = callback
        return () => { (window as any).__pushGrep = undefined }
      },
      readFile: async () => btoa(content),
      getStats: async () => ({ size: 2148, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
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
  })
})

async function openTextPreview(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-file-path="/src/cmake_install.cmake"]').waitFor({ state: 'visible' })
  await page.locator('.relative.flex-1.flex.flex-col').first()
    .click({ button: 'right', position: { x: 400, y: 300 } })
  await page.locator('.context-menu .context-menu-item', { hasText: '在此搜索内容' }).click()
  const input = page.locator('input[placeholder*="搜索内容"]')
  await input.fill('string')
  await input.press('Enter')
  await page.getByText('set(INSTALL_STRING "first")').first().click()
  // 文本预览标签页打开（Monaco 文本视图）
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 8000 })
}

test('状态1: 全文预览——三段工具栏/元信息/查找框/禁用导航', async ({ page }) => {
  await openTextPreview(page)

  await expect(page.locator('[data-testid="text-preview-toolbar"]')).toBeVisible()
  // 左段：类型徽标 + 行数·大小元信息（grep 链路构建的 FileInfo 无 size，只断言行数）
  await expect(page.locator('[data-testid="text-meta-detail"]')).toHaveText(/54 行 · /)
  // 中段：搜索框占位、无计数
  await expect(page.locator('[data-testid="text-find-input"]')).toBeVisible()
  await expect(page.locator('[data-testid="text-match-count"]')).toHaveCount(0)
  // 无匹配时 ▲▼ 禁用
  await expect(page.locator('[data-testid="text-find-prev"]')).toBeDisabled()
  await expect(page.locator('[data-testid="text-find-next"]')).toBeDisabled()
  // 状态条不出现
  await expect(page.locator('[data-testid="text-filter-statusbar"]')).toHaveCount(0)
})

test('状态2: 搜索 co(string) → 3 匹配 + 上下文 + 省略块 + A/B 切换 + Esc 恢复', async ({ page }) => {
  await openTextPreview(page)

  // 输入表达式查询（即时过滤，200ms 防抖）
  await page.locator('[data-testid="text-find-input"]').fill('co(string)')
  await expect(page.locator('[data-testid="text-match-count"]')).toHaveText('3 个匹配', { timeout: 5000 })

  // 状态条：查询摘要 + 上下文描述（默认关）+ 显示全文按钮
  const status = page.locator('[data-testid="text-filter-statusbar"]')
  await expect(status).toBeVisible()
  await expect(status).toContainText('“co(string)”：3 个匹配')
  await expect(status).toContainText('仅显示匹配行')

  // 省略块：头(1-10)/中(14-45)/尾(47-54) 三段都有明确文案
  await expect(page.locator('.fma-gap-chip', { hasText: '⋯ 10 行未显示 ⋯' }).first()).toBeVisible()
  await expect(page.locator('.fma-gap-chip', { hasText: '⋯ 32 行未显示 ⋯' }).first()).toBeVisible()
  await expect(page.locator('.fma-gap-chip', { hasText: '⋯ 8 行未显示 ⋯' }).first()).toBeVisible()

  // 查找选项 Popover：上下文分段 0/1/3/5，切到 3
  await page.locator('[data-testid="text-find-options-btn"]').click()
  const popover = page.locator('[data-testid="find-options-popover"]')
  await expect(popover).toBeVisible()
  await expect(popover).toContainText('匹配规则')
  await expect(popover).toContainText('上下文行数')
  // 表达式查询：规则开关禁用（谓词糖不可用）
  await expect(popover.locator('button[role="switch"]').first()).toBeDisabled()
  await popover.getByRole('radio', { name: '3' }).click()
  await page.keyboard.press('Escape') // 关 popover
  await expect(popover).toHaveCount(0)

  // 上下文生效：状态条描述更新 + 上下文行进入视图（行 12 filler 出现）
  await expect(status).toContainText('仅显示匹配行与前后 3 行')
  await expect(page.locator('.monaco-editor .view-line', { hasText: '# filler comment line 12' }).first()).toBeVisible()

  // ▼ 下一个匹配：计数变为 1 / 3
  await page.locator('[data-testid="text-find-next"]').click()
  await expect(page.locator('[data-testid="text-match-count"]')).toHaveText('1 / 3 个匹配')

  // A→B：显示全文（全文 + 软高亮），按钮翻转为「仅显示匹配行」
  await page.locator('[data-testid="text-status-toggle"]').click()
  await expect(status).toContainText('全文已高亮')
  await expect(status).toContainText('仅显示匹配行')
  // B 视图恢复全文：A 视图中被头部省略块隐藏的行 2 重新可见
  // （Monaco 懒渲染，只断言视口内近顶部的行）
  await expect(page.locator('.monaco-editor .view-line', { hasText: '# filler comment line 2' }).first()).toBeVisible()

  // Esc：清除搜索并立即恢复全文（状态条消失、计数消失、查询清空）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="text-filter-statusbar"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="text-match-count"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="text-find-input"]')).toHaveValue('')
  await expect(page.locator('.monaco-editor .view-line', { hasText: '# filler comment line 2' }).first()).toBeVisible()
})

test('纯文本查询（非表达式）走包含匹配 + 0 匹配空态', async ({ page }) => {
  await openTextPreview(page)

  // 普通文本（无谓词语法）→ 自动按 co() 包含匹配
  await page.locator('[data-testid="text-find-input"]').fill('INSTALL_STRING')
  await expect(page.locator('[data-testid="text-match-count"]')).toHaveText('2 个匹配', { timeout: 5000 })

  // 0 匹配空态（非错误样式）+ 调整搜索选项入口
  await page.locator('[data-testid="text-find-input"]').fill('zzz_no_such_token')
  await expect(page.locator('[data-testid="text-no-match"]')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('[data-testid="text-no-match"]')).toContainText('没有匹配 “zzz_no_such_token”')
  await expect(page.locator('[data-testid="text-no-match"]')).toContainText('调整搜索选项')

  // Esc 恢复
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="text-no-match"]')).toHaveCount(0)
})
