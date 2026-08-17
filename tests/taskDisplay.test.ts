/**
 * 任务行展示纯函数 — 最小断言 harness
 *
 * 仓库无测试框架；本文件经 esbuild 打包后以 node 运行（package.json
 * test:task-display）。不被应用代码引用，不进生产 bundle。
 *
 * 覆盖：动词/图标语义组映射、动作句式零件（单名/计数/rename/mkdir）、
 * 中间截断、路径摘要（卷名最长前缀/父目录回落/远程设备名/单侧操作）。
 */

import assert from 'node:assert/strict'
import {
  actionSentenceParts,
  middleEllipsis,
  pathSummary,
  taskIconGroup,
  taskVerbKey
} from '../src/utils/taskDisplay'
import type { FileOperationTask, FileOperationType } from '../src/types/fileOperation'

// ============ 构造辅助 ============

let seq = 0
function mkTask(type: FileOperationType, over: Partial<FileOperationTask> = {}): FileOperationTask {
  seq += 1
  return {
    id: `t${seq}`,
    type,
    sourceDeviceId: 'local',
    sourcePaths: ['/Users/wtb/Downloads/a.pdf'],
    status: 'running',
    progress: {
      currentFile: 'a.pdf',
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

// ============ taskVerbKey / taskIconGroup ============

assert.equal(taskVerbKey('copy'), 'tasks.verb.copy')
assert.equal(taskVerbKey('batch-rename'), 'tasks.verb.batchRename')
assert.equal(taskVerbKey('recycle'), 'tasks.verb.recycle')

assert.equal(taskIconGroup('copy'), 'transfer')
assert.equal(taskIconGroup('move'), 'transfer')
assert.equal(taskIconGroup('restore'), 'transfer')
assert.equal(taskIconGroup('delete'), 'delete')
assert.equal(taskIconGroup('recycle'), 'delete')
assert.equal(taskIconGroup('rename'), 'create')
assert.equal(taskIconGroup('batch-rename'), 'create')
assert.equal(taskIconGroup('mkdir'), 'create')
assert.equal(taskIconGroup('touch'), 'create')

// ============ actionSentenceParts ============

// 单文件 → 文件名
assert.deepEqual(actionSentenceParts(mkTask('copy')), {
  verbKey: 'tasks.verb.copy',
  name: 'a.pdf',
  count: 1
})
// 多文件 → 计数
assert.deepEqual(actionSentenceParts(mkTask('copy', { sourcePaths: ['/a/1.pdf', '/a/2.pdf', '/a/3.pdf'] })), {
  verbKey: 'tasks.verb.copy',
  name: null,
  count: 3
})
// rename → 新名字
assert.deepEqual(actionSentenceParts(mkTask('rename', { sourcePaths: ['/a/old.pdf'], newName: 'new.pdf' })), {
  verbKey: 'tasks.verb.rename',
  name: 'new.pdf',
  count: 1
})
// mkdir → 目标路径叶子
assert.deepEqual(actionSentenceParts(mkTask('mkdir', { sourcePaths: [], targetPath: '/a/新文件夹' })), {
  verbKey: 'tasks.verb.mkdir',
  name: '新文件夹',
  count: 1
})

// ============ middleEllipsis ============

assert.equal(middleEllipsis('a.pdf'), 'a.pdf')
assert.equal(middleEllipsis('21天学通C++_第7版.pdf', 10), '21天学….pdf')
assert.equal(middleEllipsis('21天学通C++_第7版.pdf').length <= 26, true)

// ============ pathSummary ============

const VOLUMES = [
  { name: '手工', mountPath: '/Volumes/手工' },
  { name: 'Backup', mountPath: '/Volumes/Backup' }
]

// 本机路径不在任何外接卷上 → 父目录名（Downloads）
assert.deepEqual(pathSummary(
  mkTask('copy', { targetDeviceId: 'local', targetPath: '/Users/wtb/Desktop' }),
  VOLUMES,
  {}
), { source: 'Downloads', target: 'Desktop' })

// 路径在外接卷上 → 卷名（卷名优先于子文件夹名）
assert.deepEqual(pathSummary(
  mkTask('copy', { sourcePaths: ['/Volumes/手工/教程/x.zip'], targetPath: '/Users/wtb/Docs' }),
  VOLUMES,
  {}
), { source: '手工', target: 'Docs' })

// 远程设备 → 设备名；未知设备 → 设备 id 本身
assert.deepEqual(pathSummary(
  mkTask('copy', { sourceDeviceId: 'smb-nas', targetDeviceId: 'android-pixel', targetPath: '/sdcard/DCIM' }),
  VOLUMES,
  { 'smb-nas': 'NAS', 'android-pixel': 'Pixel 8' }
), { source: 'NAS', target: 'Pixel 8' })
assert.deepEqual(pathSummary(
  mkTask('copy', { sourceDeviceId: 'ssh-x', targetDeviceId: 'local', targetPath: '/tmp' }),
  VOLUMES,
  {}
), { source: 'ssh-x', target: 'tmp' })

// 单侧操作：delete/recycle 无目标侧；rename/mkdir/touch 无来源侧
assert.deepEqual(pathSummary(mkTask('recycle'), VOLUMES, {}), { source: 'Downloads', target: null })
assert.deepEqual(pathSummary(mkTask('delete'), VOLUMES, {}), { source: 'Downloads', target: null })
assert.deepEqual(pathSummary(mkTask('mkdir', { sourcePaths: [], targetPath: '/a/b' }), VOLUMES, {}), { source: null, target: 'b' })

// move 未写 targetDeviceId → 回落 sourceDeviceId（同设备）
assert.deepEqual(pathSummary(
  mkTask('move', { sourcePaths: ['/Users/wtb/Downloads/a.pdf'], targetPath: '/Users/wtb/Desktop' }),
  VOLUMES,
  {}
), { source: 'Downloads', target: 'Desktop' })

// 根路径文件：来源父目录为 / → 回落 basename；目标取叶子名
assert.deepEqual(pathSummary(mkTask('copy', { sourcePaths: ['/a.txt'], targetPath: '/Users/wtb' }), VOLUMES, {}), {
  source: 'a.txt',
  target: 'wtb'
})

console.log('[taskDisplay] all assertions passed ✓')
