import { expect, test } from '@playwright/test'

// 右侧任务抽屉 e2e（mock window.fileman + __taskPush 驱动主进程推送）：
// 1. titlebar 按钮开关抽屉、默认宽 340、选中态
// 2. Badge 三态：进度环 / 数字 / 失败红数字
// 3. 首次失败自动展开一次；再次失败仅红 Badge（会话旗标）
// 4. 运行行副行（% + 速度）与取消
// 5. 完成迁移历史 + toast「已复制 1 个项目」+ 4s 淡出
// 6. toast 撤销：同设备 move 反向 move / 远程 recycle restore
// 7. toast「显示」→ 打开抽屉定位历史
// 8. ⋯ 菜单：暂停队列翻转 / 取消全部二次确认
// 9. 历史段「清除历史」
// 10. Esc / ⌘⇧T
// 11. 拖拽调宽 + localStorage 持久化 + 双击复位
// 12. 状态栏聚合行（抽屉关时）
// 13. 窄窗 overlay 降级（双面板 + 小 viewport → absolute 覆盖）
// 14. 侧边栏旧任务入口已移除
//
// 断言中文文案与 shared/locales/zh-CN.ts 逐字节一致（locale 已固定 zh-CN）。

interface TaskFixture {
  id: string
  type: string
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
  status: string
  progress: {
    currentFile: string
    currentFileIndex: number
    totalFiles: number
    bytesTransferred: number
    totalBytes: number
    speed: number
    itemResults: Array<{ sourcePath: string; targetPath?: string; status: string; error?: string }>
  }
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

function mkTask(over: Partial<TaskFixture> = {}): TaskFixture {
  return {
    id: 't1',
    type: 'copy',
    sourceDeviceId: 'local',
    sourcePaths: ['/Users/wtb/Downloads/21天学通C++_第7版.pdf'],
    targetDeviceId: 'local',
    targetPath: '/Users/wtb/Desktop',
    status: 'running',
    progress: {
      currentFile: '21天学通C++_第7版.pdf',
      currentFileIndex: 1,
      totalFiles: 1,
      bytesTransferred: 620,
      totalBytes: 1000,
      speed: 1468006, // 1.4 MB/s
      itemResults: []
    },
    createdAt: Date.now(),
    startedAt: Date.now(),
    ...over
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const operations: any[] = []
    const cancels: string[] = []
    const retries: string[] = []
    let queuePaused = false
    let historyCleared = 0
    const listeners = { added: [] as Array<(t: any) => void>, updated: [] as Array<(t: any) => void> }
    const store = { queue: [] as any[], history: [] as any[] }

    const api: Record<string, any> = {
      getHomeDir: async () => '/',
      getConfig: async () => ({}),
      saveConfig: async () => undefined,
      getDevices: async () => [
        { id: 'local', type: 'local', name: '本机', status: 'connected', rootPath: '/' },
        { id: 'smb-nas', type: 'smb', name: 'NAS', status: 'connected', rootPath: '/' }
      ],
      listFiles: async () => [
        { name: 'a.txt', path: '/a.txt', isDirectory: false, isFile: true, size: 1, modifiedTime: '2026-08-14T10:00:00Z', extension: '.txt' }
      ],
      readFile: async () => btoa('hi'),
      getStats: async () => ({ size: 0, isDirectory: false, isFile: true, modifiedTime: '', createdTime: '', mode: 0 }),
      // 注意返回拷贝：e2e 无 IPC 边界，返回原数组引用会被 Pinia state 持有，
      // mock 侧再改动会与 added/updated 事件处理叠加成双份。
      getFileOperationQueue: async () => [...store.queue],
      getFileOperationHistory: async () => [...store.history],
      getFileOperationQueuePaused: async () => queuePaused,
      setFileOperationQueuePaused: async (paused: boolean) => {
        queuePaused = paused
        return queuePaused
      },
      createFileOperation: async (params: any) => {
        operations.push(params)
        return { id: `t${operations.length}`, type: params.type, status: 'pending', sourcePaths: params.sourcePaths || [], progress: {} }
      },
      cancelFileOperation: async (taskId: string) => {
        cancels.push(taskId)
        store.queue = store.queue.filter((t: any) => t.id !== taskId)
      },
      retryFileOperation: async (taskId: string) => {
        retries.push(taskId)
        store.history = store.history.filter((t: any) => t.id !== taskId)
        return null
      },
      clearFileOperationHistory: async () => {
        historyCleared += 1
        store.history = []
      },
      // 占位：__historyClearedRef 在 api 定义之后统一挂 window（闭包按引用读）
      onFileOperationAdded: (cb: (t: any) => void) => {
        listeners.added.push(cb)
        return () => undefined
      },
      onFileOperationUpdated: (cb: (t: any) => void) => {
        listeners.updated.push(cb)
        return () => undefined
      },
      canTransferBetween: async () => true,
      startNativeDrag: async () => undefined,
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
    ;(window as any).__taskStore = store
    ;(window as any).__fileOps = operations
    ;(window as any).__cancels = cancels
    ;(window as any).__retries = retries
    ;(window as any).__historyClearedRef = () => historyCleared
    ;(window as any).__queuePausedRef = () => queuePaused
    ;(window as any).__taskPush = {
      added: (task: any) => listeners.added.forEach(cb => cb(task)),
      updated: (task: any) => listeners.updated.forEach(cb => cb(task))
    }
    localStorage.removeItem('fileman-tabs-state')
    localStorage.removeItem('fileman-task-drawer-width')
  })
  await page.goto('/')
  await expect(page.locator('[data-file-path="/a.txt"]')).toBeVisible()
})

async function pushTask(page: import('@playwright/test').Page, task: TaskFixture): Promise<void> {
  await page.evaluate(t => {
    ;(window as any).__taskPush.added(t)
  }, task)
}

async function updateTask(page: import('@playwright/test').Page, task: TaskFixture): Promise<void> {
  await page.evaluate(t => {
    ;(window as any).__taskPush.updated(t)
  }, task)
}

const DRAWER = '[data-testid="task-drawer"]'
const TITLEBAR_BTN = '[data-testid="task-titlebar-button"]'

// ── 1. 开关与几何 ────────────────────────────────────────────────

test('titlebar 按钮开关抽屉，push 模式默认宽 340，按钮选中态', async ({ page }) => {
  await page.locator(TITLEBAR_BTN).click()
  const drawer = page.locator(DRAWER)
  await expect(drawer).toBeVisible()
  await page.waitForTimeout(300) // 宽度过渡 220ms
  await expect.poll(async () => (await drawer.boundingBox())?.width).toBe(340)
  await expect(page.locator(TITLEBAR_BTN)).toHaveClass(/is-open/)

  await page.locator(TITLEBAR_BTN).click()
  await expect(drawer).not.toBeVisible()
})

test('抽屉头部：标题「任务」+ segmented 进行中/历史 + 关闭按钮', async ({ page }) => {
  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator(DRAWER).getByText('任务').first()).toBeVisible()
  await expect(page.locator('[data-testid="task-tab-active"]')).toHaveText(/进行中/)
  await expect(page.locator('[data-testid="task-tab-history"]')).toHaveText(/历史/)
  await page.locator('[data-testid="task-drawer-close"]').click()
  await expect(page.locator(DRAWER)).not.toBeVisible()
})

// ── 2. Badge 三态 ────────────────────────────────────────────────

test('badge：单个进行中显示进度环，多个显示数字', async ({ page }) => {
  // 初始 1 个 running（beforeEach 队列为空 → 先推入）
  await pushTask(page, mkTask())
  await expect(page.locator('[data-testid="task-badge-ring"]')).toBeVisible()

  await pushTask(page, mkTask({ id: 't2' }))
  await expect(page.locator('[data-testid="task-badge-count"]')).toHaveText('2')
  await expect(page.locator('[data-testid="task-badge-ring"]')).not.toBeVisible()
})

// ── 3. 首次失败自动展开；再次失败仅红 Badge ──────────────────────

test('首次失败自动展开抽屉定位历史段；再次失败只亮红 Badge', async ({ page }) => {
  await pushTask(page, mkTask())
  await expect(page.locator('[data-testid="task-badge-ring"]')).toBeVisible()

  // 失败 → 自动展开（会话内第一次），切到历史段并可见失败行
  await updateTask(page, mkTask({ status: 'failed', error: '权限不足：目标为只读', completedAt: Date.now() }))
  await expect(page.locator(DRAWER)).toBeVisible()
  await expect(page.locator('[data-testid="task-history-group"]').first()).toHaveText('今天')
  await expect(page.locator(DRAWER).getByText('权限不足：目标为只读')).toBeVisible()

  // 用户关闭后再失败 → 不再自动展开，红 Badge 计 1
  await page.keyboard.press('Escape')
  await expect(page.locator(DRAWER)).not.toBeVisible()
  await pushTask(page, mkTask({ id: 't2' }))
  await updateTask(page, mkTask({ id: 't2', status: 'failed', error: '网络中断', completedAt: Date.now() }))
  await expect(page.locator(DRAWER)).not.toBeVisible()
  await expect(page.locator('[data-testid="task-badge-failure"]')).toHaveText('1')
})

// ── 4. 运行行 ────────────────────────────────────────────────────

test('运行行显示进度与速度副行，取消调用 cancelFileOperation', async ({ page }) => {
  await pushTask(page, mkTask())
  await page.locator(TITLEBAR_BTN).click()
  const subline = page.locator('[data-testid="task-row-subline"]').first()
  await expect(subline).toContainText('62%')
  await expect(subline).toContainText('1.4 MB/s')

  await page.locator('[data-testid="task-cancel"]').first().click()
  const cancels = await page.evaluate(() => (window as any).__cancels)
  expect(cancels).toContain('t1')
})

// ── 5. 完成 → 历史 + toast ──────────────────────────────────────

test('任务完成迁入历史并弹 toast「已复制 1 个项目」，4 秒后淡出', async ({ page }) => {
  await pushTask(page, mkTask())
  await updateTask(page, mkTask({
    status: 'completed',
    completedAt: Date.now(),
    progress: {
      currentFile: '21天学通C++_第7版.pdf', currentFileIndex: 1, totalFiles: 1,
      bytesTransferred: 1000, totalBytes: 1000, speed: 1468006,
      itemResults: [{ sourcePath: '/Users/wtb/Downloads/21天学通C++_第7版.pdf', targetPath: '/Users/wtb/Desktop/21天学通C++_第7版.pdf', status: 'success' }]
    }
  }))

  const toast = page.locator('[data-testid="task-toast-completed"]')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('已复制 1 个项目')

  // 活动段清空、历史段可见该行
  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator('[data-testid="task-tab-active"]')).toHaveText(/进行中/)
  await page.locator('[data-testid="task-tab-history"]').click()
  await expect(page.locator(DRAWER).getByText(/21天学通C\+\+_第7版\.pdf/).first()).toBeVisible()

  // toast 自动淡出（hover 未暂停场景）
  await expect(toast).not.toBeVisible({ timeout: 6000 })
})

// ── 6. toast 撤销 ────────────────────────────────────────────────

test('同设备 move 完成的 toast 可撤销（反向 move 回原目录）', async ({ page }) => {
  await pushTask(page, mkTask({
    type: 'move',
    sourcePaths: ['/Users/wtb/Downloads/a.pdf', '/Users/wtb/Downloads/b.pdf'],
    progress: {
      currentFile: 'b.pdf', currentFileIndex: 2, totalFiles: 2,
      bytesTransferred: 10, totalBytes: 10, speed: 0,
      itemResults: [
        { sourcePath: '/Users/wtb/Downloads/a.pdf', targetPath: '/Users/wtb/Desktop/a.pdf', status: 'success' },
        { sourcePath: '/Users/wtb/Downloads/b.pdf', targetPath: '/Users/wtb/Desktop/b.pdf', status: 'success' }
      ]
    }
  }))
  await updateTask(page, mkTask({
    type: 'move',
    status: 'completed',
    completedAt: Date.now(),
    sourcePaths: ['/Users/wtb/Downloads/a.pdf', '/Users/wtb/Downloads/b.pdf'],
    progress: {
      currentFile: 'b.pdf', currentFileIndex: 2, totalFiles: 2,
      bytesTransferred: 10, totalBytes: 10, speed: 0,
      itemResults: [
        { sourcePath: '/Users/wtb/Downloads/a.pdf', targetPath: '/Users/wtb/Desktop/a.pdf', status: 'success' },
        { sourcePath: '/Users/wtb/Downloads/b.pdf', targetPath: '/Users/wtb/Desktop/b.pdf', status: 'success' }
      ]
    }
  }))

  await expect(page.locator('[data-testid="task-toast-completed"]')).toBeVisible()
  await page.locator('[data-testid="task-toast-undo"]').click()

  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('move')
  expect(ops[0].sourcePaths).toEqual(['/Users/wtb/Desktop/a.pdf', '/Users/wtb/Desktop/b.pdf'])
  expect(ops[0].targetPath).toBe('/Users/wtb/Downloads')
})

test('远程 recycle 完成的 toast 撤销为 restore；copy 无撤销按钮', async ({ page }) => {
  await pushTask(page, mkTask({
    type: 'recycle',
    sourceDeviceId: 'smb-nas',
    targetDeviceId: undefined,
    targetPath: undefined,
    sourcePaths: ['/share/doc.pdf']
  }))
  await updateTask(page, mkTask({
    type: 'recycle',
    sourceDeviceId: 'smb-nas',
    status: 'completed',
    completedAt: Date.now(),
    sourcePaths: ['/share/doc.pdf'],
    progress: {
      currentFile: 'doc.pdf', currentFileIndex: 1, totalFiles: 1,
      bytesTransferred: 0, totalBytes: 0, speed: 0,
      itemResults: [{ sourcePath: '/share/doc.pdf', targetPath: '/.trash/doc.pdf', status: 'success' }]
    }
  }))
  await expect(page.locator('[data-testid="task-toast-completed"]')).toBeVisible()
  await page.locator('[data-testid="task-toast-undo"]').click()
  const ops = await page.evaluate(() => (window as any).__fileOps)
  expect(ops).toHaveLength(1)
  expect(ops[0].type).toBe('restore')

  // copy 的 toast 没有撤销按钮
  await pushTask(page, mkTask({ id: 'tc' }))
  await updateTask(page, mkTask({
    id: 'tc', status: 'completed', completedAt: Date.now(),
    progress: {
      currentFile: 'x', currentFileIndex: 1, totalFiles: 1,
      bytesTransferred: 1, totalBytes: 1, speed: 0,
      itemResults: [{ sourcePath: '/a', targetPath: '/b', status: 'success' }]
    }
  }))
  await expect(page.locator('[data-testid="task-toast-completed"]').last()).toBeVisible()
  await expect(page.locator('[data-testid="task-toast-undo"]')).toHaveCount(0)
})

test('toast「显示」打开抽屉并定位历史段', async ({ page }) => {
  await pushTask(page, mkTask())
  await updateTask(page, mkTask({ status: 'completed', completedAt: Date.now() }))
  await page.locator('[data-testid="task-toast-show"]').click()
  await expect(page.locator(DRAWER)).toBeVisible()
  await expect(page.locator('[data-testid="task-history-group"]').first()).toBeVisible()
})

// ── 7. ⋯ 菜单 / 批量 ────────────────────────────────────────────

test('⋯ 菜单暂停队列并翻转为「恢复队列」', async ({ page }) => {
  await page.locator(TITLEBAR_BTN).click()
  await page.locator('[data-testid="task-more"]').click()
  await expect(page.locator('[data-testid="task-menu-pause"]')).toHaveText('暂停队列')
  await page.locator('[data-testid="task-menu-pause"]').click()
  expect(await page.evaluate(() => (window as any).__queuePausedRef())).toBe(true)

  await page.locator('[data-testid="task-more"]').click()
  await expect(page.locator('[data-testid="task-menu-pause"]')).toHaveText('恢复队列')
})

test('取消全部需经确认对话框', async ({ page }) => {
  await pushTask(page, mkTask())
  await pushTask(page, mkTask({ id: 't2' }))
  await page.locator(TITLEBAR_BTN).click()
  await page.locator('[data-testid="task-more"]').click()
  await page.locator('[data-testid="task-menu-cancel-all"]').click()

  await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible()
  // 先取消 → 不触发
  await page.locator('[data-testid="confirm-cancel"]').click()
  expect(await page.evaluate(() => (window as any).__cancels)).toHaveLength(0)

  await page.locator('[data-testid="task-more"]').click()
  await page.locator('[data-testid="task-menu-cancel-all"]').click()
  await page.locator('[data-testid="confirm-ok"]').click()
  const cancels = await page.evaluate(() => (window as any).__cancels)
  expect(cancels).toHaveLength(2)
})

// ── 8. 历史 ──────────────────────────────────────────────────────

test('历史段清除历史后显示空态', async ({ page }) => {
  await pushTask(page, mkTask())
  await updateTask(page, mkTask({ status: 'completed', completedAt: Date.now() }))
  await page.locator(TITLEBAR_BTN).click()
  await page.locator('[data-testid="task-tab-history"]').click()
  await expect(page.locator('[data-testid="task-history-group"]')).toHaveCount(1)

  await page.locator('[data-testid="task-clear-history"]').click()
  expect(await page.evaluate(() => (window as any).__historyClearedRef())).toBe(1)
  await expect(page.locator(DRAWER).getByText('暂无历史记录')).toBeVisible()
})

test('失败行重试 / 完成行重新执行调用 retryFileOperation', async ({ page }) => {
  await pushTask(page, mkTask())
  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator(DRAWER)).toBeVisible()
  // 抽屉已开 → 失败不自动切段；toast 已让位（右移），头部可点
  await updateTask(page, mkTask({ status: 'failed', error: '只读', completedAt: Date.now() }))
  await page.locator('[data-testid="task-tab-history"]').click()
  await page.locator('[data-testid="task-retry"]').first().click({ force: true })
  expect(await page.evaluate(() => (window as any).__retries)).toEqual(['t1'])
})

// ── 9. 键盘 / 拖宽 / 状态栏 ─────────────────────────────────────

test('Esc 关闭抽屉；⌘⇧T 切换', async ({ page }) => {
  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator(DRAWER)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator(DRAWER)).not.toBeVisible()

  await page.keyboard.press('Meta+Shift+KeyT')
  await expect(page.locator(DRAWER)).toBeVisible()
  await page.keyboard.press('Meta+Shift+KeyT')
  await expect(page.locator(DRAWER)).not.toBeVisible()
})

test('拖拽把手调宽并持久化，双击复位 340', async ({ page }) => {
  await pushTask(page, mkTask())
  await page.locator(TITLEBAR_BTN).click()
  await page.waitForTimeout(300)

  const handle = page.locator('[data-testid="task-drawer-resize-handle"]')
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  await page.mouse.move(startX, box!.y + 40)
  await page.mouse.down()
  await page.mouse.move(startX - 60, box!.y + 40, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await page.locator(DRAWER).boundingBox())?.width).toBe(400)
  expect(await page.evaluate(() => localStorage.getItem('fileman-task-drawer-width'))).toBe('400')

  await handle.dblclick()
  await expect.poll(async () => (await page.locator(DRAWER).boundingBox())?.width).toBe(340)
})

test('状态栏聚合行：抽屉关闭时显示「正在复制 1 个项目 · 62%」', async ({ page }) => {
  await pushTask(page, mkTask())
  await expect(page.locator('.h-7 .text-text-secondary').first()).toHaveText(/正在复制 1 个项目 · 62%/)

  // 打开抽屉后聚合行隐藏（回到 Ready）
  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator('.h-7 .text-text-secondary').first()).not.toHaveText(/正在复制/)
})

// ── 10. 窄窗 overlay / 旧入口移除 ───────────────────────────────

test('窄窗双面板下抽屉降级为 overlay 覆盖（panes 宽度不变）', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 })
  // 预置双面板 tab（copy-path.spec 同款；必须走 addInitScript——
  // beforeEach 的 init script 会 removeItem，注册晚于它才能保住预置）
  await page.addInitScript(() => {
    localStorage.setItem('fileman-tabs-state', JSON.stringify({
      activeTabId: 't1',
      tabs: [{
        id: 't1', title: '/', activePaneId: 'p1',
        panes: [
          { id: 'p1', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0, viewMode: 'list', selectedFiles: [] },
          { id: 'p2', deviceId: 'local', path: '/', history: ['/'], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
        ]
      }]
    }))
  })
  await page.goto('/')
  await expect(page.locator('.finder-pane')).toHaveCount(2)

  await pushTask(page, mkTask())
  const paneBoxBefore = await page.locator('.finder-pane').first().boundingBox()

  await page.locator(TITLEBAR_BTN).click()
  await expect(page.locator(DRAWER)).toBeVisible()
  // overlay 模式：抽屉 absolute 定位
  await expect.poll(async () =>
    page.locator(DRAWER).evaluate(el => getComputedStyle(el).position)
  ).toBe('absolute')

  const paneBoxAfter = await page.locator('.finder-pane').first().boundingBox()
  expect(Math.abs(paneBoxAfter!.width - paneBoxBefore!.width)).toBeLessThan(2)
})

test('侧边栏旧任务入口已移除（工具区仅 2 个按钮）', async ({ page }) => {
  await expect(page.locator('.sidebar-utility-bar .sidebar-utility-button')).toHaveCount(2)
})
