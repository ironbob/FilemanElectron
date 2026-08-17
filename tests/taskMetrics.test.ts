/**
 * 任务进度度量纯函数 — 最小断言 harness
 *
 * 仓库无测试框架；本文件经 esbuild 打包后以 node 运行（package.json
 * test:task-metrics）。不被应用代码引用，不进生产 bundle。
 *
 * 覆盖：全局加权进度（字节加权/瞬时回退/pending 排除）、ETA 守卫、
 * 速度滑窗（含时间淘汰）、时长拆分、历史日期分组边界。
 */

import assert from 'node:assert/strict'
import {
  computeEtaSeconds,
  computeGlobalProgress,
  createSpeedSmoother,
  formatBytes,
  formatSpeed,
  groupHistoryByDate,
  splitDuration
} from '../src/utils/taskMetrics'
import type { FileOperationTask } from '../src/types/fileOperation'

// ============ 构造辅助 ============

let seq = 0
function mkTask(over: Partial<FileOperationTask> & Pick<FileOperationTask, 'status'>): FileOperationTask {
  seq += 1
  return {
    id: `t${seq}`,
    type: 'copy',
    sourceDeviceId: 'local',
    sourcePaths: ['/a/b.pdf'],
    status: 'running',
    progress: {
      currentFile: 'b.pdf',
      currentFileIndex: 1,
      totalFiles: 1,
      bytesTransferred: 0,
      totalBytes: 0,
      speed: 0,
      itemResults: []
    },
    createdAt: Date.now(),
    ...over
  }
}

// ============ computeGlobalProgress ============

// 空任务 → 0
assert.equal(computeGlobalProgress([]), 0)
// pending 不参与（串行队列下 pending=0% 会拉低读数）
assert.equal(computeGlobalProgress([mkTask({ status: 'pending' })]), 0)

// 单个字节任务 62%
{
  const t = mkTask({})
  t.progress.totalBytes = 1000
  t.progress.bytesTransferred = 620
  assert.equal(computeGlobalProgress([t]), 62)
}

// 两个 running 字节任务按 totalBytes 加权：(0.5*100 + 1*300) / 400 = 87.5 → 88
{
  const a = mkTask({}); a.progress.totalBytes = 100; a.progress.bytesTransferred = 50
  const b = mkTask({}); b.progress.totalBytes = 300; b.progress.bytesTransferred = 300
  assert.equal(computeGlobalProgress([a, b]), 88)
}

// 全瞬时任务：等权条目比 (1/2 + 1/4) / 2 = 37.5 → 38
{
  const a = mkTask({ type: 'rename' }); a.progress.currentFileIndex = 1; a.progress.totalFiles = 2
  const b = mkTask({ type: 'rename' }); b.progress.currentFileIndex = 1; b.progress.totalFiles = 4
  assert.equal(computeGlobalProgress([a, b]), 38)
}

// 无任何可度量信息（totalBytes=0 且 totalFiles=0）→ 0
{
  const t = mkTask({})
  t.progress.totalFiles = 0
  t.progress.currentFileIndex = 0
  assert.equal(computeGlobalProgress([t]), 0)
}

// ============ computeEtaSeconds ============

// speed≤0 / 总量未知 / 已完成 → null
{
  const t = mkTask({}); t.progress.totalBytes = 100; t.progress.bytesTransferred = 10; t.progress.speed = 0
  assert.equal(computeEtaSeconds(t), null)
}
{
  const t = mkTask({}); t.progress.totalBytes = 0; t.progress.speed = 10
  assert.equal(computeEtaSeconds(t), null)
}
{
  const t = mkTask({}); t.progress.totalBytes = 100; t.progress.bytesTransferred = 100; t.progress.speed = 10
  assert.equal(computeEtaSeconds(t), null)
}
// 正常推导：剩 100B，1.4MB/s
{
  const t = mkTask({})
  t.progress.totalBytes = 100 + 1.4 * 1024 * 1024
  t.progress.bytesTransferred = 1.4 * 1024 * 1024
  t.progress.speed = 1.4 * 1024 * 1024
  assert.equal(computeEtaSeconds(t), 100 / (1.4 * 1024 * 1024))
}

// ============ createSpeedSmoother（窗口淘汰用假时钟） ============

{
  const realNow = Date.now
  try {
    let fake = 1_000_000
    Date.now = () => fake
    const smoother = createSpeedSmoother(3000)
    assert.equal(smoother.value(), 0)
    assert.equal(smoother.push(100), 100)
    fake += 1000
    assert.equal(smoother.push(300), 200) // (100+300)/2
    fake += 1000
    assert.equal(smoother.push(500), 300) // (100+300+500)/3
    fake += 3000 // 首样本已出 3s 窗口
    assert.equal(smoother.push(900), 700) // (500+900)/2，100/300 已淘汰
  } finally {
    Date.now = realNow
  }
}

// ============ formatBytes / formatSpeed ============

assert.equal(formatBytes(0), '1 byte')
assert.equal(formatBytes(500), '500 B')
assert.equal(formatBytes(2048), '2.0 KB')
assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB')
assert.equal(formatSpeed(1.4 * 1024 * 1024), '1.4 MB/s')

// ============ splitDuration ============

assert.deepEqual(splitDuration(3000), { value: 3, unitKey: 'tasks.time.seconds' })
assert.deepEqual(splitDuration(90_000), { value: 2, unitKey: 'tasks.time.minutes' }) // Math.round(1.5)=2
assert.deepEqual(splitDuration(3600_000), { value: 1, unitKey: 'tasks.time.hours' })
assert.deepEqual(splitDuration(0), { value: 1, unitKey: 'tasks.time.seconds' }) // 不足 1 秒按 1 秒
assert.equal(splitDuration(-1), null)

// ============ groupHistoryByDate ============

const NOW = new Date(2026, 7, 17, 15, 30).getTime()
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const TODAY = startOfDay(NOW)
const HOUR = 3600_000
const DAY = 24 * HOUR

{
  const groups = groupHistoryByDate(
    [
      mkTask({ status: 'completed', completedAt: NOW, createdAt: NOW }),
      mkTask({ status: 'failed', completedAt: NOW - HOUR, createdAt: NOW - HOUR }),
      mkTask({ status: 'completed', completedAt: TODAY - HOUR, createdAt: TODAY - HOUR }),
      mkTask({ status: 'cancelled', completedAt: TODAY - 3 * DAY, createdAt: TODAY - 3 * DAY }),
      mkTask({ status: 'completed', completedAt: TODAY - 10 * DAY, createdAt: TODAY - 10 * DAY })
    ],
    NOW
  )
  assert.deepEqual(
    groups.map(g => g.key),
    ['today', 'yesterday', 'week', 'earlier']
  )
  assert.equal(groups[0].tasks.length, 2)
  assert.equal(groups[1].tasks.length, 1)
  assert.equal(groups[2].tasks.length, 1)
  assert.equal(groups[3].tasks.length, 1)
}

// 空组不输出；无 completedAt 时回落 createdAt
{
  const groups = groupHistoryByDate(
    [mkTask({ status: 'completed', completedAt: undefined, createdAt: TODAY - 2 * DAY })],
    NOW
  )
  assert.deepEqual(
    groups.map(g => g.key),
    ['week']
  )
}

// 边界：恰为今天 00:00 → today；恰为昨天 00:00 → yesterday；第 7 天起点外 → earlier
{
  const groups = groupHistoryByDate(
    [
      mkTask({ status: 'completed', completedAt: TODAY, createdAt: TODAY }),
      mkTask({ status: 'completed', completedAt: TODAY - DAY, createdAt: TODAY - DAY }),
      mkTask({ status: 'completed', completedAt: TODAY - 7 * DAY - 1, createdAt: TODAY - 7 * DAY - 1 })
    ],
    NOW
  )
  assert.deepEqual(
    groups.map(g => g.key),
    ['today', 'yesterday', 'earlier']
  )
}

console.log('[taskMetrics] all assertions passed ✓')
