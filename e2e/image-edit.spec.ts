import { expect, test } from '@playwright/test'

// 图片编辑 UI 链路回归（Finder 式三区布局重设计 2026-08-16；mock fileman）：
// 1. 双击 local 图片 → 预览 tab：顶部工具栏恒显，无右下角 FAB
// 2. 标注模式：右侧轨道 + 参数 Popover；绘制 → 状态栏「已编辑」→ 完成 → 保存 Sheet
//    （segmented 意图/存储为/导出选项折叠）→ 存储副本 → imageEdit.apply 带 annotate op
// 3. dirty Esc → 未保存确认（不保存 → 丢弃退出）
// 4. 裁剪模式进入/退出（Esc 零副作用）
// 5. ⋯ 菜单「另存为…」入口（原「压缩」并入）→ Sheet 选项默认展开 → confirm 带 compress op
// 6. 替换原文件：警示 + 二次确认 → overwrite
// 7. 集合会话：导航收进顶栏（‹ › + n/n），批量入口在 ⋯ 菜单
// 注：sharp/sips 真实管道由真机 CDP 手动验证（见架构文档验证证据）。


/** 进入图片预览 tab（双击目录 → 双击 a.png）。 */
async function openImagePreview(page: import('@playwright/test').Page) {
  await page.locator('[data-file-path="/docs"]').dblclick()
  await page.waitForSelector('[data-file-path="/docs/a.png"]')
  await page.locator('[data-file-path="/docs/a.png"]').dblclick()
  await page.waitForTimeout(600)
}

/** 进入标注模式并绘制一个矩形（点轨道「矩形」后拖拽画布）。 */
async function drawRectAnnotation(page: import('@playwright/test').Page) {
  await page.getByTitle('标注', { exact: true }).click()
  await expect(page.getByRole('toolbar', { name: '标注工具' })).toBeVisible()
  await page.getByTitle('矩形 (R)').click()
  // 参数 Popover 随绘制工具自动弹出；画布开始绘制后按设计自动收起
  await expect(page.getByRole('group', { name: '标注参数' })).toBeVisible()
  const container = await page.locator('.image-container').boundingBox()
  if (container) {
    await page.mouse.move(container.x + container.width / 2 - 50, container.y + container.height / 2 - 30)
    await page.mouse.down()
    await page.mouse.move(container.x + container.width / 2 + 50, container.y + container.height / 2 + 30, { steps: 5 })
    await page.mouse.up()
  }
}

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
      readFile: async () => 'iVBORw0KGgoAAAANSUhEUgAAAMgAAAB4CAIAAAA48Cq8AAABTElEQVR4nO3SUQkAIBTAQIO9/hjLEw5BDi7APrb2DFy3nhfwJWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFgljkTAWCWORMBYJY5EwFokDDtc23OlfnesAAAAASUVORK5CYII=',
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
        estimate: async () => ({ estimatedBytes: 42, format: 'png', width: 200, height: 200 }),
        apply: async (filePath: string, ops: any, save: any) => {
          operations.push({ kind: 'imageEdit.apply', filePath, ops, save })
          const outPath = save.mode === 'overwrite' ? filePath : `/docs/${save.name || 'a_edited'}.png`
          return { writtenPath: outPath, bytes: 42 }
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

test('double-click image opens preview with persistent top toolbar (no FAB)', async ({ page }) => {
  await openImagePreview(page)
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' })).toBeVisible()
  // 旧 FAB 入口已删除
  await expect(page.getByRole('button', { name: '展开编辑工具' })).toHaveCount(0)
  // 顶栏含缩放读数与标注入口
  await expect(page.getByTitle('标注', { exact: true })).toBeVisible()
})

test('annotate: rail + param popover, dirty badge, done → save sheet → apply annotate op', async ({ page }) => {
  await openImagePreview(page)
  await drawRectAnnotation(page)

  // 绘制后 Popover 已自动收起（画布交互隐藏）；状态栏出现「已编辑」
  await expect(page.getByRole('group', { name: '标注参数' })).toHaveCount(0)
  await expect(page.getByText('已编辑')).toBeVisible()

  // 完成 → 保存 Sheet（导出副本默认；导出选项折叠）
  await page.getByRole('button', { name: '完成' }).click()
  await expect(page.getByRole('dialog', { name: '保存标注后的图片' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '导出副本' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('导出选项')).toBeVisible()
  await expect(page.getByLabel('格式')).toHaveCount(0)

  // 自定义文件名回归（2026-08-17 bugfix）：默认 a_edited → 改为 myshot，落盘名随之
  const nameField = page.locator('#save-sheet-name')
  await expect(nameField).toHaveValue('a_edited')
  await nameField.fill('myshot')

  // 存储副本 → apply：annotate op + copy + 用户输入的完整文件名
  await page.getByRole('button', { name: '存储副本' }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  const applyCall = ops.filter((o: any) => o.kind === 'imageEdit.apply').pop()
  expect(applyCall?.ops?.annotate?.overlayBase64?.length).toBeGreaterThan(100)
  expect(applyCall.save.mode).toBe('copy')
  expect(applyCall.save.name).toBe('myshot')
  expect(applyCall.ops.compress).toBeFalsy()

  // 保存成功 → 退出标注 + flash
  await expect(page.getByRole('toolbar', { name: '标注工具' })).toHaveCount(0)
  await expect(page.getByText('已存储 myshot.png')).toBeVisible()
})

test('dirty Esc opens unsaved alert; discard exits annotate mode', async ({ page }) => {
  await openImagePreview(page)
  await drawRectAnnotation(page)
  await page.keyboard.press('Escape')
  await expect(page.getByText('要存储对“a.png”的标注更改吗？')).toBeVisible()
  await page.getByRole('button', { name: '不保存' }).click()
  await expect(page.getByRole('toolbar', { name: '标注工具' })).toHaveCount(0)
  await expect(page.getByText('已编辑')).toHaveCount(0)
})

test('closing preview tab with unsaved annotations prompts before discard', async ({ page }) => {
  await openImagePreview(page)
  await drawRectAnnotation(page)
  // 直接点预览 tab 的 ✕：关闭守卫拦截（AppTabBar/Esc/命令面板统一走 closeTab）
  await page.getByRole('button', { name: '关闭 a.png' }).click({ force: true })
  await expect(page.getByText('要存储对“a.png”的标注更改吗？')).toBeVisible()
  await page.getByRole('button', { name: '不保存' }).click()
  await page.waitForTimeout(300)
  // 标注丢弃后 tab 真正关闭，回到浏览 tab（预览前已进入 /docs）
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' })).toHaveCount(0)
  await expect(page.locator('[data-file-path="/docs/a.png"]')).toBeVisible()
})

test('crop mode enters with overlay and Esc exits', async ({ page }) => {
  await openImagePreview(page)
  await page.getByTitle('裁剪 (⌥⌘C)').click()
  await expect(page.getByText('在图片上拖拽选择裁剪区域')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('在图片上拖拽选择裁剪区域')).toHaveCount(0)
})

test('save-as entry in more menu opens sheet with expanded options', async ({ page }) => {
  await openImagePreview(page)
  await page.getByRole('button', { name: '更多集合操作' }).click()
  // 2026-08-20「压缩」并入「另存为…」：无 pending 编辑 → 纯导出，标题「另存为」
  await page.getByRole('button', { name: '另存为…', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '另存为' })).toBeVisible()
  // 另存为入口：导出选项默认展开
  await expect(page.getByLabel('格式')).toBeVisible()
  await page.getByRole('button', { name: '存储副本' }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  const applyCall = ops.filter((o: any) => o.kind === 'imageEdit.apply').pop()
  expect(applyCall.ops.compress).toBeTruthy()
  expect(applyCall.save.mode).toBe('copy')
})

test('replace mode shows warning and requires second confirmation', async ({ page }) => {
  await openImagePreview(page)
  await page.getByTitle('标注', { exact: true }).click()
  await page.getByTitle('矩形 (R)').click()
  const container = await page.locator('.image-container').boundingBox()
  if (container) {
    await page.mouse.move(container.x + container.width / 2 - 40, container.y + container.height / 2 - 20)
    await page.mouse.down()
    await page.mouse.move(container.x + container.width / 2 + 40, container.y + container.height / 2 + 20, { steps: 5 })
    await page.mouse.up()
  }
  await page.getByRole('button', { name: '完成' }).click()
  await expect(page.getByRole('dialog', { name: '保存标注后的图片' })).toBeVisible()

  // 切换意图：警示出现，主按钮文案变化
  await page.getByRole('radio', { name: '替换原文件' }).click()
  await expect(page.getByText(/将覆盖原文件 a\.png/)).toBeVisible()
  await page.getByRole('button', { name: '替换并保存' }).click()

  // 二次确认（红色「替换」）后才 apply
  await expect(page.getByText('原文件将被覆盖，此操作无法撤销。')).toBeVisible()
  const before = (await page.evaluate(() => (window as any).__ops)).length
  await page.getByRole('button', { name: '替换', exact: true }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  expect(ops.length).toBeGreaterThan(before)
  const applyCall = ops.filter((o: any) => o.kind === 'imageEdit.apply').pop()
  expect(applyCall.save.mode).toBe('overwrite')
})

test('collection session: nav in top toolbar and batch entries in more menu', async ({ page }) => {
  // 目录右键 → 图片 → 预览所有图片（search mock 返回 2 张）
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览所有图片').click()
  await page.waitForTimeout(800)

  // 导航收编进顶栏（‹ › + 1 / 2）；第一张时「上一张」禁用、「下一张」可用
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByText('1 / 2')).toBeVisible()
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByTitle(/上一张/)).toBeDisabled()
  await expect(page.getByRole('toolbar', { name: '图片视图与编辑' }).getByTitle(/下一张/)).toBeEnabled()

  // 批量入口在 ⋯ 菜单
  await page.getByRole('button', { name: '更多集合操作' }).click()
  await expect(page.getByText('批量压缩')).toBeVisible()
  await expect(page.getByText('批量改名')).toBeVisible()
})

test('batch compress dialog starts batch task from more menu', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览所有图片').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '更多集合操作' }).click()
  await page.getByText('批量压缩').click()
  await expect(page.getByRole('heading', { name: '批量压缩' })).toBeVisible()
  await page.getByRole('button', { name: '压缩 2 张' }).click()
  await page.waitForTimeout(300)
  const ops = await page.evaluate(() => (window as any).__ops)
  const batchCall = ops.find((o: any) => o.kind === 'imageEdit.batchStart')
  expect(batchCall).toBeTruthy()
  expect(batchCall.request.items).toHaveLength(2)
})

test('batch rename dialog validates conflicts from more menu', async ({ page }) => {
  await page.locator('[data-file-path="/docs"]').click({ button: 'right' })
  await page.getByText('图片', { exact: true }).hover()
  await page.getByText('预览所有图片').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '更多集合操作' }).click()
  await page.getByText('批量改名').click()
  await expect(page.getByRole('heading', { name: '批量重命名' })).toBeVisible()
  await expect(page.getByRole('button', { name: /重命名 2 项/ })).toBeDisabled()
  await page.getByText('序号').click()
  await expect(page.getByRole('button', { name: /重命名 2 项/ })).toBeEnabled()
  await page.getByRole('button', { name: /重命名 2 项/ }).click()
  await page.waitForTimeout(400)
  const ops = await page.evaluate(() => (window as any).__ops)
  expect(ops.some((o: any) => o.type === 'batch-rename')).toBeTruthy()
})
