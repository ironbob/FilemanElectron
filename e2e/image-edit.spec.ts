import { expect, test } from '@playwright/test'

// 图片编辑 UI 链路回归（mock fileman）：
// 1. 双击 local 图片 → 预览 tab 展示编辑工具条（裁剪/压缩）
// 2. 裁剪模式进入/退出（Esc 零副作用）
// 3. 压缩 → 保存对话框（覆盖/另存 + 参数）→ 确认调用 imageEdit.apply
// 4. 集合会话（目录右键预览所有图片）→ 批量入口 + 批量改名对话框（预览/冲突禁提交）
// 注：sharp/sips 真实管道由真机 CDP 手动验证（见架构文档验证证据）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const operations: any[] = []
    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' }
      ],
      listFiles: async (_deviceId: string, path: string) => {
        if (path === '/docs') return [imageFile('a.png'), imageFile('b.png')]
        return [{ name: 'docs', path: '/docs', isDirectory: true, isFile: false, size: 0, modifiedTime: '2026-08-16T10:00:00Z', extension: '' }]
      },
      search: async () => [imageFile('a.png'), imageFile('b.png')],
      readFile: async () =>
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      getStats: async (_deviceId: string, path: string) => ({
        size: 100, isDirectory: path === '/docs', isFile: path !== '/docs',
        modifiedTime: '', createdTime: '', mode: 0
      }),
      getFileOperationQueue: async () => [],
      getFileOperationHistory: async () => [],
      canTransferBetween: async () => true,
      startNativeDrag: async () => undefined,
      createFileOperation: async (params: any) => {
        operations.push(params)
        return { id: `t${operations.length}`, type: params.type, status: 'completed', sourcePaths: params.sourcePaths || [], progress: { itemResults: [] } }
      },
      imageEdit: {
        estimate: async () => ({ estimatedBytes: 42, format: 'png', width: 1, height: 1 }),
        apply: async (filePath: string, ops: any, save: any) => {
          operations.push({ kind: 'imageEdit.apply', filePath, ops, save })
          return { writtenPath: save.mode === 'overwrite' ? filePath : '/docs/a_edited.png', bytes: 42 }
        },
        batchStart: async (request: any) => {
          operations.push({ kind: 'imageEdit.batchStart', request })
          return { taskId: 'bt1' }
        },
        batchCancel: async () => true,
        onBatchProgress: () => () => undefined,
      },
      volumes: { list: async () => [], onChanged: () => () => undefined },
      thumbnail: { get: async () => '', clearCache: async () => {}, getCacheSize: async () => 0 }
    }
    function imageFile(name: string) {
      return { name, path: `/docs/${name}`, isDirectory: false, isFile: true, size: 100, modifiedTime: '2026-08-16T10:00:00Z', extension: '.png' }
    }
    ;(window as any).fileman = new Proxy(api, {
      get(target, property) {
        if (property in target) return target[property as string]
        if (String(property).startsWith('on')) return () => () => undefined
        return async () => undefined
      }
    })
    ;(window as any).__ops = operations
    localStorage.removeItem('fileman-tabs-state')
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/docs"]')).toBeVisible()
})

test('double-click image opens preview tab with edit toolbar', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').dblclick()
  await page.waitForSelector('[data-file-path="/docs/a.png"]')
  await page.locator('[data-file-path="/docs/a.png"]').dblclick()
  await page.waitForTimeout(600)
  await expect(page.getByRole('toolbar', { name: '图片编辑' })).toBeVisible()
})

test('crop mode enters with overlay and Esc exits', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').dblclick()
  await page.waitForSelector('[data-file-path="/docs/a.png"]')
  await page.locator('[data-file-path="/docs/a.png"]').dblclick()
  await page.waitForTimeout(600)
  await page.getByRole('toolbar', { name: '图片编辑' }).getByTitle('裁剪').click()
  await expect(page.getByText('在图片上拖拽选择裁剪区域')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('在图片上拖拽选择裁剪区域')).toHaveCount(0)
})

test('compress opens save dialog and confirm calls imageEdit.apply', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').dblclick()
  await page.waitForSelector('[data-file-path="/docs/a.png"]')
  await page.locator('[data-file-path="/docs/a.png"]').dblclick()
  await page.waitForTimeout(600)
  await page.getByRole('toolbar', { name: '图片编辑' }).getByTitle('压缩').click()
  await expect(page.getByText('保存图片')).toBeVisible()
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  const applyCall = ops.find((o: any) => o.kind === 'imageEdit.apply')
  expect(applyCall).toBeTruthy()
  expect(applyCall.filePath).toBe('/docs/a.png')
  expect(applyCall.save.mode).toBe('copy')
  expect(applyCall.ops.compress).toBeTruthy()
})

test('collection session shows batch entries and rename dialog validates conflicts', async ({ page }) => {
  // 目录右键 → 图片 → 预览所有图片（search mock 返回 2 张）
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览所有图片').click()
  await page.waitForTimeout(800)
  await expect(page.getByRole('toolbar', { name: '图片编辑' })).toBeVisible()
  await expect(page.getByText('批量压缩')).toBeVisible()
  await expect(page.getByText('批量改名')).toBeVisible()

  // 批量改名：默认无规则禁提交；启用序号后可提交且走 batch-rename 任务
  await page.getByText('批量改名').click()
  await expect(page.getByText('Batch Rename')).toBeVisible()
  await expect(page.getByRole('button', { name: /Rename 2 items/ })).toBeDisabled()
  await page.getByText('序号').click()
  await expect(page.getByRole('button', { name: /Rename 2 items/ })).toBeEnabled()
  await page.getByRole('button', { name: /Rename 2 items/ }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  expect(ops.some((o: any) => o.type === 'batch-rename')).toBeTruthy()
})

test('batch compress dialog starts batch task', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览所有图片').click()
  await page.waitForTimeout(800)
  await page.getByRole('toolbar', { name: '图片编辑' }).getByText('批量压缩').click()
  await expect(page.getByRole('heading', { name: '批量压缩' })).toBeVisible()
  await page.getByRole('button', { name: '压缩 2 张' }).click()
  await page.waitForTimeout(300)
  // batchStart 已入队（进度由 push 事件驱动，mock 不推送终态）
  const ops = await page.evaluate(() => (window as any).__ops)
  const batchCall = ops.find((o: any) => o.kind === 'imageEdit.batchStart')
  expect(batchCall).toBeTruthy()
  expect(batchCall.request.items).toHaveLength(2)
})
