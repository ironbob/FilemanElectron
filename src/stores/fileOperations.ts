import { defineStore } from 'pinia'
import type { ConflictStrategy, FileOperationTask } from '@/types/fileOperation'
import { computeGlobalProgress, groupHistoryByDate } from '@/utils/taskMetrics'
import { taskVerbKey, dirname } from '@/utils/taskDisplay'

const log = console

/** 完成通知（右上角轻量横幅）。停留计时与淡出归 TaskToastLayer，store 只管队列与内容。 */
export interface TaskToast {
  id: number
  taskId: string
  verbKey: string
  count: number
  kind: 'completed' | 'failed'
  canUndo: boolean
  /** canUndo 时的撤销通道：recycle→undoLastRecycle，move→undoLastMove。 */
  undoKind: 'recycle' | 'move' | null
  error?: string
}

/** 同设备 move 的反向撤销引用：撤销 = 创建反向 move 任务移回原目录。 */
export interface UndoMoveRef {
  deviceId: string
  movedPaths: string[]
  originalDir: string
}

export type DrawerTab = 'active' | 'history'

export interface FileOperationState {
  tasks: FileOperationTask[]
  history: FileOperationTask[]
  activeTaskCount: number
  undoRecycle: Array<{ trashPath: string; originalPath: string }> | null
  undoRecycleDeviceId: string | null
  // ── 任务抽屉（右侧） ──
  isDrawerOpen: boolean
  drawerTab: DrawerTab
  /** 主进程队列挂起态（initialize 回读 + setQueuePaused 镜像）。 */
  queuePaused: boolean
  /** 未看过历史分段的失败数（红 Badge 计数；openDrawer 归零）。 */
  unreadFailureCount: number
  /** 会话旗标：用户手动关过抽屉 → 本会话永不自动展开。 */
  userClosedDrawer: boolean
  /** 会话旗标：首次失败自动展开只用一次。 */
  failureRevealed: boolean
  /** 当前打开是否系统自动（供"全部完成后 3s 收起"判定）。 */
  autoOpenedBySystem: boolean
  /** 指令式定位：抽屉 watch 它 → 切历史段 + 展开该行 + scrollIntoView。 */
  revealTaskId: string | null
  toasts: TaskToast[]
  undoMove: UndoMoveRef | null
}

let toastSeq = 0
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

function cancelAutoCloseTimer(): void {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

export const useFileOperationsStore = defineStore('fileOperations', {
  state: (): FileOperationState => ({
    tasks: [],
    history: [],
    activeTaskCount: 0,
    undoRecycle: null,
    undoRecycleDeviceId: null,
    isDrawerOpen: false,
    drawerTab: 'active',
    queuePaused: false,
    unreadFailureCount: 0,
    userClosedDrawer: false,
    failureRevealed: false,
    autoOpenedBySystem: false,
    revealTaskId: null,
    toasts: [],
    undoMove: null
  }),

  getters: {
    /** 全局加权进度（0–100，只统计 running）。 */
    globalProgress: (state): number => computeGlobalProgress(state.tasks),

    /**
     * Badge 三态（优先级自上而下）：
     * 未读失败 → 红数字；单个进行中 → 蓝进度环；多个 → 蓝数字；无 → 不显示。
     */
    badgeState(state): { kind: 'failure' | 'count' | 'ring' | 'none'; value: number } {
      if (state.unreadFailureCount > 0) return { kind: 'failure', value: state.unreadFailureCount }
      if (state.activeTaskCount === 1) return { kind: 'ring', value: computeGlobalProgress(state.tasks) }
      if (state.activeTaskCount >= 2) return { kind: 'count', value: state.activeTaskCount }
      return { kind: 'none', value: 0 }
    },

    /** 历史按 今天/昨天/过去7天/更早 分组（空组不输出）。 */
    historyGroups: (state) => groupHistoryByDate(state.history, Date.now()),

    /** 状态栏聚合行：主任务动词 + 进行中数 + 总进度（无任务为 null）。 */
    statusSummary(state): { verbKey: string; count: number; percent: number } | null {
      if (state.activeTaskCount === 0) return null
      const primary = state.tasks.find(t => t.status === 'running') ?? state.tasks[0]
      return {
        verbKey: taskVerbKey(primary.type),
        count: state.activeTaskCount,
        percent: computeGlobalProgress(state.tasks)
      }
    }
  },

  actions: {
    // Initialize store and set up event listeners
    initialize() {
      // Get initial state
      window.fileman.getFileOperationQueue().then((tasks: FileOperationTask[]) => {
        this.tasks = tasks
        this.updateActiveTaskCount()
      })

      window.fileman.getFileOperationHistory().then((history) => {
        this.history = history
      })

      window.fileman.getFileOperationQueuePaused().then((paused) => {
        this.queuePaused = !!paused
      }).catch(() => {
        // e2e mock 或旧主进程可能缺该方法，静默保持 false
      })

      // Listen for task updates
      window.fileman.onFileOperationAdded((task) => {
        // 新任务入队：接管抽屉归属（取消待收起计时，视作用户在场）
        cancelAutoCloseTimer()
        this.autoOpenedBySystem = false
        this.tasks.push(task)
        this.updateActiveTaskCount()
      })

      window.fileman.onFileOperationUpdated((task) => {
        const index = this.tasks.findIndex(t => t.id === task.id)
        if (index > -1) {
          this.tasks[index] = task
          // If task is completed, move to history
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            this.tasks.splice(index, 1)
            this.history.unshift(task)
            // Keep history limited
            if (this.history.length > 100) {
              this.history = this.history.slice(0, 100)
            }
            if (task.type === 'recycle' && task.sourceDeviceId !== 'local') {
              this.undoRecycle = task.progress.itemResults
                .filter(result => result.status === 'success' && result.targetPath)
                .map(result => ({ trashPath: result.targetPath!, originalPath: result.sourcePath }))
              this.undoRecycleDeviceId = this.undoRecycle.length ? task.sourceDeviceId : null
            }

            // ── 抽屉/通知逻辑 ──
            if (task.status === 'completed') {
              this.recordUndoMove(task)
              const canUndo =
                (task.type === 'move' && !!this.undoMove) ||
                (task.type === 'recycle' && !!this.undoRecycle)
              const undoKind: 'recycle' | 'move' | null =
                task.type === 'move' ? 'move' : task.type === 'recycle' ? 'recycle' : null
              this.pushToast(task, 'completed', canUndo, canUndo ? undoKind : null)
            } else if (task.status === 'failed') {
              if (!this.isDrawerOpen) this.unreadFailureCount += 1
              this.pushToast(task, 'failed', false, null)
              // 首次失败自动展开一次（会话内）；用户手动关过则永不自动
              if (!this.failureRevealed && !this.userClosedDrawer && !this.isDrawerOpen) {
                this.failureRevealed = true
                this.autoOpenedBySystem = true
                this.openDrawer('history')
                this.revealTaskId = task.id
              }
            }
            this.scheduleAutoClose(task.status === 'completed')
          }
        }
        this.updateActiveTaskCount()
      })
    },

    async createCopyTask(
      sourceDeviceId: string,
      sourcePaths: string[],
      targetDeviceId: string,
      targetPath: string,
      conflictStrategy: ConflictStrategy = 'skip'
    ): Promise<FileOperationTask> {
      log.info('[FileOperations] queueing copy task', {
        sourceDeviceId,
        sourceCount: sourcePaths.length,
        targetDeviceId,
        targetPath,
        conflictStrategy
      })
      try {
        const task = await window.fileman.createFileOperation({
          type: 'copy',
          sourceDeviceId,
          sourcePaths: [...sourcePaths],
          targetDeviceId,
          targetPath,
          conflictStrategy
        })
        log.info('[FileOperations] copy task queued', { taskId: task.id, sourceDeviceId, targetDeviceId })
        return task
      } catch (error) {
        log.error('[FileOperations] failed to queue copy task', {
          sourceDeviceId,
          sourceCount: sourcePaths.length,
          targetDeviceId,
          targetPath,
          error
        })
        throw error
      }
    },

    async createMoveTask(
      sourceDeviceId: string,
      sourcePaths: string[],
      targetDeviceId: string,
      targetPath: string,
      conflictStrategy: ConflictStrategy = 'skip'
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'move',
        sourceDeviceId,
        sourcePaths: [...sourcePaths],
        targetDeviceId,
        targetPath,
        conflictStrategy
      })
    },

    /** Queue files dropped from Finder into any writable app destination. */
    async importExternalFiles(
      files: File[],
      targetDeviceId: string,
      targetPath: string
    ): Promise<FileOperationTask> {
      return window.fileman.importExternalFiles(files, targetDeviceId, targetPath)
    },

    async createDeleteTask(
      deviceId: string,
      paths: string[]
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'delete',
        sourceDeviceId: deviceId,
        sourcePaths: [...paths]
      })
    },

    async createRecycleTask(deviceId: string, paths: string[]): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({ type: 'recycle', sourceDeviceId: deviceId, sourcePaths: [...paths] })
    },

    async undoLastRecycle(): Promise<FileOperationTask | null> {
      if (!this.undoRecycleDeviceId || !this.undoRecycle?.length) return null
      const task = await window.fileman.createFileOperation({
        type: 'restore',
        sourceDeviceId: this.undoRecycleDeviceId,
        sourcePaths: this.undoRecycle.map(item => item.trashPath),
        restoreItems: this.undoRecycle
      })
      this.undoRecycle = null
      this.undoRecycleDeviceId = null
      return task
    },

    /** 撤销最近一次同设备 move：反向 move 回原目录（新任务入队）。 */
    async undoLastMove(): Promise<FileOperationTask | null> {
      if (!this.undoMove) return null
      const { deviceId, movedPaths, originalDir } = this.undoMove
      this.undoMove = null
      return this.createMoveTask(deviceId, movedPaths, deviceId, originalDir)
    },

    async createRenameTask(
      deviceId: string,
      oldPath: string,
      newName: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'rename',
        sourceDeviceId: deviceId,
        sourcePaths: [oldPath],
        newName
      })
    },

    async createBatchRenameTask(
      deviceId: string,
      renameItems: Array<{ sourcePath: string; newName: string }>
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'batch-rename',
        sourceDeviceId: deviceId,
        sourcePaths: renameItems.map(item => item.sourcePath),
        renameItems
      })
    },

    async createMkdirTask(
      deviceId: string,
      path: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'mkdir',
        sourceDeviceId: deviceId,
        sourcePaths: [],
        targetPath: path
      })
    },

    async createTouchTask(
      deviceId: string,
      path: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'touch',
        sourceDeviceId: deviceId,
        sourcePaths: [],
        targetPath: path
      })
    },

    cancelTask(taskId: string): void {
      window.fileman.cancelFileOperation(taskId)
      const index = this.tasks.findIndex(t => t.id === taskId)
      if (index > -1) {
        this.tasks.splice(index, 1)
      }
      this.updateActiveTaskCount()
    },

    /** 取消全部进行中/排队任务（UI 侧已做二次确认）。 */
    cancelAllTasks(): void {
      for (const task of [...this.tasks]) {
        this.cancelTask(task.id)
      }
    },

    async retryTask(taskId: string): Promise<FileOperationTask | null> {
      const task = await window.fileman.retryFileOperation(taskId)
      if (task) {
        // Remove from history
        this.history = this.history.filter(t => t.id !== taskId)
        // Add new task
        this.tasks.push(task)
        this.updateActiveTaskCount()
      }
      return task
    },

    // ── 任务抽屉 ──

    openDrawer(tab?: DrawerTab): void {
      this.isDrawerOpen = true
      this.unreadFailureCount = 0
      if (tab) this.drawerTab = tab
    },

    closeDrawer(): void {
      this.isDrawerOpen = false
      this.userClosedDrawer = true
      this.autoOpenedBySystem = false
      cancelAutoCloseTimer()
    },

    toggleDrawer(tab?: DrawerTab): void {
      if (this.isDrawerOpen) this.closeDrawer()
      else this.openDrawer(tab)
    },

    setDrawerTab(tab: DrawerTab): void {
      this.drawerTab = tab
      if (tab === 'history') this.unreadFailureCount = 0
    },

    /** 抽屉消费 revealTaskId 后回清（指令一次性）。 */
    consumeReveal(): void {
      this.revealTaskId = null
    },

    async setQueuePaused(paused: boolean): Promise<void> {
      try {
        this.queuePaused = await window.fileman.setFileOperationQueuePaused(paused)
      } catch (error) {
        log.error('[FileOperations] setQueuePaused failed', { paused, error })
      }
    },

    /** pending 任务在队列中的序（1 起）。 */
    pendingPosition(taskId: string): number {
      const pending = this.tasks.filter(t => t.status === 'pending')
      const idx = pending.findIndex(t => t.id === taskId)
      return idx >= 0 ? idx + 1 : 0
    },

    pushToast(
      task: FileOperationTask,
      kind: 'completed' | 'failed',
      canUndo: boolean,
      undoKind: 'recycle' | 'move' | null
    ): void {
      toastSeq += 1
      this.toasts.push({
        id: toastSeq,
        taskId: task.id,
        verbKey: taskVerbKey(task.type),
        count: task.sourcePaths.length || 1,
        kind,
        canUndo,
        undoKind,
        error: task.error
      })
      if (this.toasts.length > 3) this.toasts = this.toasts.slice(-3)
    },

    dismissToast(id: number): void {
      this.toasts = this.toasts.filter(t => t.id !== id)
    },

    /**
     * 同设备 move 完成时记录反向撤销引用。
     * 门控：跨设备不撤销；多父目录来源无法单目标反向；部分失败只回移成功项。
     */
    recordUndoMove(task: FileOperationTask): void {
      if (task.type !== 'move') return
      const targetDevice = task.targetDeviceId ?? task.sourceDeviceId
      if (targetDevice !== task.sourceDeviceId) return
      const movedPaths = task.progress.itemResults
        .filter(result => result.status === 'success' && result.targetPath)
        .map(result => result.targetPath!)
      if (movedPaths.length === 0) return
      const parents = new Set(task.sourcePaths.map(p => dirname(p)))
      if (parents.size !== 1) return
      this.undoMove = { deviceId: task.sourceDeviceId, movedPaths, originalDir: [...parents][0] }
    },

    /**
     * 全部任务完成后 3s 自动收起系统自动打开的抽屉。
     * 仅在最后一次终态是 completed 时排程：失败揭示不该 3 秒就被收走。
     */
    scheduleAutoClose(lastStatusCompleted: boolean): void {
      cancelAutoCloseTimer()
      if (this.tasks.length === 0 && this.autoOpenedBySystem && lastStatusCompleted) {
        autoCloseTimer = setTimeout(() => {
          autoCloseTimer = null
          if (this.tasks.length === 0 && this.autoOpenedBySystem && this.isDrawerOpen) {
            this.isDrawerOpen = false
            this.autoOpenedBySystem = false
          }
        }, 3000)
      }
    },

    clearHistory(): void {
      this.history = []
      window.fileman.clearFileOperationHistory()
    },

    updateActiveTaskCount(): void {
      this.activeTaskCount = this.tasks.filter(
        t => t.status === 'pending' || t.status === 'running'
      ).length
    }
  }
})
