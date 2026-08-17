/**
 * 任务进度度量纯函数（无 Vue/Pinia 依赖）
 *
 * 服务于右侧任务抽屉：全局加权进度（Badge 进度环/状态栏聚合行）、
 * ETA 推导、速度平滑、历史日期分组。主进程 progress 只有
 * bytesTransferred/totalBytes/speed（无 ETA），推导全在渲染层完成。
 *
 * 速度平滑说明：主进程 speed 是单文件内 delta 算出的瞬时值，跨文件
 * 切换会跳变归零，滑窗均值可避免行内速度/ETA 抖动。
 */

import type { FileOperationTask } from '@/types/fileOperation'

/** 瞬时类任务（重命名/新建等）通常无字节量，按条目数折算进度。 */
export function taskRatio(task: FileOperationTask): number | null {
  const { progress } = task
  if (progress.totalBytes > 0) {
    return progress.bytesTransferred / progress.totalBytes
  }
  if (progress.totalFiles > 0) {
    return progress.currentFileIndex / progress.totalFiles
  }
  return null
}

/**
 * 全局加权进度（0–100 整数）。
 *
 * 只统计 running 任务：队列严格串行，running 即当前任务；pending 以
 * 0 进度参与会拉低读数（"复制 3 个项目 · 33%"的误导），故不纳入。
 * 字节任务按 totalBytes 加权；全部无字节量时退化为等权条目比。
 */
export function computeGlobalProgress(tasks: FileOperationTask[]): number {
  const running = tasks.filter(t => t.status === 'running')
  if (running.length === 0) return 0

  let weightSum = 0
  let done = 0
  for (const task of running) {
    const ratio = taskRatio(task)
    if (ratio === null) continue
    const weight = task.progress.totalBytes > 0 ? task.progress.totalBytes : 0
    weightSum += weight
    done += weight * Math.min(1, Math.max(0, ratio))
  }
  if (weightSum > 0) return Math.round((done / weightSum) * 100)

  // 全瞬时任务：等权平均条目比
  const ratios = running.map(taskRatio).filter(r => r !== null) as number[]
  if (ratios.length === 0) return 0
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
}

/**
 * ETA（秒）。speed≤0（主进程尚未采到样本/网络挂起）或总量未知时
 * 返回 null，由调用方决定显示「计算中…」或「等待中」。
 */
export function computeEtaSeconds(task: FileOperationTask): number | null {
  const { totalBytes, bytesTransferred, speed } = task.progress
  if (totalBytes <= 0 || speed <= 0 || bytesTransferred >= totalBytes) return null
  return (totalBytes - bytesTransferred) / speed
}

export interface SpeedSmoother {
  /** 推入一次 speed 样本（bytes/s），返回滑窗均值。 */
  push(sample: number): number
  /** 当前滑窗均值（无样本为 0）。 */
  value(): number
}

/** 最近 windowMs 毫秒 speed 样本的滑动平均。 */
export function createSpeedSmoother(windowMs = 3000): SpeedSmoother {
  const samples: Array<{ at: number; v: number }> = []
  return {
    push(sample: number): number {
      const now = Date.now()
      samples.push({ at: now, v: sample })
      while (samples.length > 0 && now - samples[0].at > windowMs) samples.shift()
      return this.value()
    },
    value(): number {
      if (samples.length === 0) return 0
      return samples.reduce((sum, s) => sum + s.v, 0) / samples.length
    }
  }
}

/** 字节数格式化（沿用旧底部任务面板风格：1.4 MB / 86.4 GB）。 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '1 byte'
  if (bytes < 1024) return `${Math.max(1, Math.round(bytes))} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

export type DurationParts = {
  value: number
  unitKey: 'tasks.time.seconds' | 'tasks.time.minutes' | 'tasks.time.hours'
}

/** 毫秒 → 最大单位时长（3 秒 / 2 分钟 / 1 小时），文案由 i18n 模板拼装。 */
export function splitDuration(ms: number): DurationParts | null {
  if (!Number.isFinite(ms) || ms < 0) return null
  const seconds = ms / 1000
  if (seconds < 60) return { value: Math.max(1, Math.round(seconds)), unitKey: 'tasks.time.seconds' }
  if (seconds < 3600) return { value: Math.round(seconds / 60), unitKey: 'tasks.time.minutes' }
  return { value: Math.round(seconds / 3600), unitKey: 'tasks.time.hours' }
}

export type HistoryGroupKey = 'today' | 'yesterday' | 'week' | 'earlier'

export interface HistoryGroup {
  key: HistoryGroupKey
  tasks: FileOperationTask[]
}

/**
 * 历史按完成时间分组：今天 / 昨天 / 过去 7 天 / 更早（空组不输出，
 * 组内保持 history 的 unshift 新→旧顺序）。
 */
export function groupHistoryByDate(history: FileOperationTask[], now: number): HistoryGroup[] {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000

  const buckets: Record<HistoryGroupKey, FileOperationTask[]> = {
    today: [],
    yesterday: [],
    week: [],
    earlier: []
  }
  for (const task of history) {
    const at = task.completedAt ?? task.createdAt
    if (at >= todayStart) buckets.today.push(task)
    else if (at >= yesterdayStart) buckets.yesterday.push(task)
    else if (at >= weekStart) buckets.week.push(task)
    else buckets.earlier.push(task)
  }
  const order: HistoryGroupKey[] = ['today', 'yesterday', 'week', 'earlier']
  return order.filter(key => buckets[key].length > 0).map(key => ({ key, tasks: buckets[key] }))
}
