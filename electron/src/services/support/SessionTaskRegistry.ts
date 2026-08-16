import { randomUUID } from 'crypto'

const log = console

/**
 * 长时任务的统一登记处（SessionTaskRegistry）
 *
 * DirectoryStatsService 与 ContentVerificationService 各自手写的
 * tasks Map + sessionTasks Map + 同 session 取消旧任务 + 协作式 cancelled
 * 标志，随 grep / 重复查找 / 空间分析 / 校验和等第 3..N 个长任务服务加入
 * 而抽出的公共骨架（DRY）。
 *
 * 设计依据：
 *  - SRP —— 只负责「任务生命周期登记与取消信号」，不做任何业务遍历。
 *  - OCP —— 业务服务通过 state 泛型携带私有状态（streams 集合、子进程
 *    引用等），通过 onCancel 钩子注入取消副作用（杀子进程/销毁流），
 *    无需修改本类即可扩展。
 *  - 既有行为保持：同 sessionId 重复 start 先取消旧任务（弹窗快速重开）；
 *    finish 只在 sessionTasks 仍指向本任务时清除（旧任务的 finish 不得
 *    覆盖新任务的登记）。
 */
export class TaskHandle<S = void> {
  cancelled = false
  private cancelHooks: Array<() => void> = []

  constructor(
    readonly taskId: string,
    readonly sessionId: string,
    /** 业务服务的私有任务状态（如 streams: Set<Readable>）。 */
    readonly state: S
  ) {}

  /** 取消已请求后注册的钩子立即执行（杀子进程等不得等待下一轮循环）。 */
  onCancel(fn: () => void): void {
    if (this.cancelled) {
      try { fn() } catch (error) {
        log.warn('[SessionTaskRegistry] cancel hook threw', { taskId: this.taskId, message: error instanceof Error ? error.message : String(error) })
      }
      return
    }
    this.cancelHooks.push(fn)
  }

  /** 执行并清空取消钩子（幂等：cancel 与 finish 各调一次只生效一次）。 */
  runCancelHooks(): void {
    const hooks = this.cancelHooks
    this.cancelHooks = []
    for (const fn of hooks) {
      try { fn() } catch (error) {
        log.warn('[SessionTaskRegistry] cancel hook threw', { taskId: this.taskId, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
}

export class SessionTaskRegistry {
  private readonly tasks = new Map<string, TaskHandle<unknown>>()
  private readonly sessionTasks = new Map<string, string>()

  /**
   * 登记新任务；同一 sessionId 的在途任务先取消（快速重开查询场景）。
   * @returns 任务句柄（taskId / sessionId / cancelled / state / onCancel）
   */
  create<S>(sessionId: string, state: S): TaskHandle<S> {
    const runningId = this.sessionTasks.get(sessionId)
    if (runningId) this.cancel(runningId)

    const handle = new TaskHandle<S>(randomUUID(), sessionId, state)
    this.tasks.set(handle.taskId, handle as TaskHandle<unknown>)
    this.sessionTasks.set(sessionId, handle.taskId)
    return handle
  }

  get(taskId: string): TaskHandle<unknown> | undefined {
    return this.tasks.get(taskId)
  }

  /** 请求协作式取消：置标志并同步执行取消钩子（杀子进程/销毁流）。 */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.cancelled) return false
    task.cancelled = true
    task.runCancelHooks()
    log.info('[SessionTaskRegistry] cancellation requested', { taskId })
    return true
  }

  /** 任务收尾（无论 completed/cancelled/failed）：执行残留钩子并注销登记。 */
  finish(handle: TaskHandle<unknown>): void {
    handle.runCancelHooks()
    this.tasks.delete(handle.taskId)
    if (this.sessionTasks.get(handle.sessionId) === handle.taskId) {
      this.sessionTasks.delete(handle.sessionId)
    }
  }
}
