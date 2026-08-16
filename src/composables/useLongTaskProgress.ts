import { computed, onUnmounted, shallowRef } from 'vue'

/**
 * 长时任务进度 harness（start / cancel / push 三件套通用化）
 *
 * FileInfoDialog 与各工具视图此前各自手写「订阅推送 → start 拿 taskId →
 * 终态检测 → 卸载退订」。本 composable 收敛该模式，供 checksum / grep /
 * 重复查找 / 空间分析等所有走 CH.push 推送进度的任务消费。
 *
 * 约定（与 DirectoryStatsService 等主进程服务一致）：
 *  - start(request) 同步返回 { taskId }，工作异步执行；
 *  - 进度经 subscribe(handler) 推送，事件自带 sessionId/taskId；
 *  - 终态为 status ∈ { completed, cancelled, failed }，随同一推送通道下发；
 *  - subscribe 返回退订函数（preload 惯例）。
 *
 * progress 用 shallowRef：事件为 IPC 克隆的普通对象，整体替换即可，
 * 深响应在大数组（grep matches）上是纯开销。
 */
export interface LongTaskApi<Req, Prog> {
  start: (request: Req) => Promise<{ taskId: string }>
  cancel?: (taskId: string) => Promise<boolean>
  subscribe: (callback: (progress: Prog) => void) => () => void
}

const DEFAULT_TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed'])

export function isTerminalStatus(status: string): boolean {
  return DEFAULT_TERMINAL_STATUSES.has(status)
}

export function useLongTaskProgress<Req, Prog extends { status: string; taskId?: string }>(api: LongTaskApi<Req, Prog>) {
  const progress = shallowRef<Prog | null>(null)
  const isRunning = computed(() => progress.value !== null && !isTerminalStatus(progress.value.status))
  const hasFinished = computed(() => progress.value !== null && isTerminalStatus(progress.value.status))

  let unsubscribe: (() => void) | null = null
  let activeTaskId: string | null = null

  /** 事件过滤：只接受当前任务的事件（快速重开后旧任务终态迟到不得覆盖新任务）。 */
  function onProgress(event: Prog): void {
    if (activeTaskId && event.taskId && event.taskId !== activeTaskId) return
    progress.value = event
  }

  /** 启动任务（若已有在途任务，先退订旧订阅；服务端同 session 自动取消旧任务）。 */
  async function start(request: Req): Promise<void> {
    teardownSubscription()
    progress.value = null
    unsubscribe = api.subscribe(onProgress)
    const { taskId } = await api.start(request)
    activeTaskId = taskId
  }

  function cancel(): void {
    if (activeTaskId) void api.cancel?.(activeTaskId)
  }

  function teardownSubscription(): void {
    unsubscribe?.()
    unsubscribe = null
    activeTaskId = null
  }

  // 组件卸载：退订推送；在途任务请求取消（服务端同 session 重开也会取消）。
  onUnmounted(() => {
    if (activeTaskId) void api.cancel?.(activeTaskId)
    teardownSubscription()
  })

  return { progress, isRunning, hasFinished, start, cancel }
}
