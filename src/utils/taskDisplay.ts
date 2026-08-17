/**
 * 任务行展示纯函数（无 Vue/Pinia 依赖）
 *
 * 服务于右侧任务抽屉的任务行：类型动词/图标语义组映射、动作句式
 * 零件（单文件名 vs 项目数）、来源→目标路径摘要（卷名/设备名）、
 * 长文件名中间截断。
 *
 * 路径摘要约定（设计稿 §5.2c）：local 按 mountPath 最长前缀匹配卷名，
 * 否则取父目录 basename；远程一律设备名。完整路径仅在 hover title、
 * 展开详情与「拷贝完整路径」中出现。
 */

import type { FileOperationTask, FileOperationType } from '@/types/fileOperation'

export type TaskVerbKey =
  | 'tasks.verb.copy'
  | 'tasks.verb.move'
  | 'tasks.verb.delete'
  | 'tasks.verb.rename'
  | 'tasks.verb.mkdir'
  | 'tasks.verb.touch'
  | 'tasks.verb.batchRename'
  | 'tasks.verb.recycle'
  | 'tasks.verb.restore'
  | 'tasks.verb.archive'

const VERB_KEYS: Record<FileOperationType, TaskVerbKey> = {
  copy: 'tasks.verb.copy',
  move: 'tasks.verb.move',
  delete: 'tasks.verb.delete',
  rename: 'tasks.verb.rename',
  mkdir: 'tasks.verb.mkdir',
  touch: 'tasks.verb.touch',
  'batch-rename': 'tasks.verb.batchRename',
  recycle: 'tasks.verb.recycle',
  restore: 'tasks.verb.restore',
  archive: 'tasks.verb.archive'
}

export function taskVerbKey(type: FileOperationType): TaskVerbKey {
  return VERB_KEYS[type] ?? 'tasks.verb.copy'
}

/** 图标语义组：传输 / 删除 / 创建修改（克制的三组，不按 9 类型定制）。 */
export type TaskIconGroup = 'transfer' | 'delete' | 'create'

export function taskIconGroup(type: FileOperationType): TaskIconGroup {
  if (type === 'delete' || type === 'recycle') return 'delete'
  if (type === 'rename' || type === 'batch-rename' || type === 'mkdir' || type === 'touch' || type === 'archive') return 'create'
  return 'transfer'
}

export function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

export function dirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx < 0) return ''
  const dir = trimmed.slice(0, idx)
  return dir === '' ? '/' : dir
}

/** 长文件名中间截断（a…b.pdf，Finder 惯例；CSS 只能做尾截断）。 */
export function middleEllipsis(name: string, maxLen = 26): string {
  if (name.length <= maxLen) return name
  const keep = Math.max(2, Math.floor((maxLen - 1) / 2))
  return `${name.slice(0, keep)}…${name.slice(name.length - keep)}`
}

export interface SentenceParts {
  verbKey: TaskVerbKey
  /** 单项目时的名字（rename 取新名；mkdir/touch 取目标路径叶子）。 */
  name: string | null
  count: number
}

export function actionSentenceParts(task: FileOperationTask): SentenceParts {
  const verbKey = taskVerbKey(task.type)
  if (task.type === 'rename') {
    return { verbKey, name: task.newName ?? basename(task.sourcePaths[0] ?? ''), count: 1 }
  }
  if (task.type === 'archive') {
    // 单项压缩显示目标 zip 名（a.txt → a.zip），多项显示计数。
    const count = task.sourcePaths.length
    if (count === 1) return { verbKey, name: task.newName ?? basename(task.sourcePaths[0]), count }
    return { verbKey, name: null, count: Math.max(count, 1) }
  }
  if (task.type === 'mkdir' || task.type === 'touch') {
    return { verbKey, name: task.targetPath ? basename(task.targetPath) : null, count: 1 }
  }
  const count = task.sourcePaths.length
  if (count === 1) return { verbKey, name: basename(task.sourcePaths[0]), count }
  return { verbKey, name: null, count: Math.max(count, 1) }
}

/** 与 volumes store 的 Volume 结构兼容（避免纯函数反向依赖 store）。 */
export interface VolumeLike {
  name: string
  mountPath: string
}

/**
 * local 路径 → 卷名（最长 mountPath 前缀匹配），失败回落目录名。
 * anchor 语义：source 取文件所在目录（父目录名），target 取目标
 * 文件夹自身（叶子名）——「下载 → 桌面」两侧各自指向语义目录。
 */
function localPlaceLabel(path: string, volumes: VolumeLike[], anchor: 'parent' | 'self'): string {
  const prefix = path.replace(/\/+$/, '')
  let best: VolumeLike | null = null
  for (const vol of volumes) {
    const mount = vol.mountPath.replace(/\/+$/, '') || '/'
    if (mount === '/' || prefix === mount || prefix.startsWith(`${mount}/`)) {
      if (!best || mount.length > (best.mountPath.replace(/\/+$/, '') || '/').length) best = vol
    }
  }
  if (best) return best.name
  if (anchor === 'self') return basename(prefix) || '/'
  const parent = dirname(prefix)
  if (parent === '/') return basename(prefix) || '/'
  return basename(parent)
}

export interface PathSummary {
  source: string | null
  target: string | null
}

/**
 * 行内路径摘要：`下载 → 手工`。单侧操作（delete/recycle/rename/
 * mkdir/touch）只返回对应一侧。
 */
export function pathSummary(
  task: FileOperationTask,
  volumes: VolumeLike[],
  deviceNames: Record<string, string>
): PathSummary {
  const label = (
    deviceId: string | undefined,
    path: string | undefined,
    anchor: 'parent' | 'self'
  ): string | null => {
    if (!path) return null
    if (!deviceId || deviceId === 'local') return localPlaceLabel(path, volumes, anchor)
    return deviceNames[deviceId] ?? deviceId
  }

  // copy/move/restore 有双向；mkdir/touch/archive 只有目标侧（新建/输出位置）；
  // delete/recycle/rename 无目标侧。
  const hasTarget =
    task.type === 'copy' || task.type === 'move' || task.type === 'restore' ||
    task.type === 'mkdir' || task.type === 'touch' || task.type === 'archive'
  return {
    source: label(task.sourceDeviceId, task.sourcePaths[0], 'parent'),
    target: hasTarget ? label(task.targetDeviceId ?? task.sourceDeviceId, task.targetPath, 'self') : null
  }
}
