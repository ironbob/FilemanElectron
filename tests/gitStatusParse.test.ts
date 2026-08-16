/**
 * git status --porcelain=v1 -z --branch 解析 — 最小断言 harness（M2 验证）。
 *
 * -z 语义关键点：NUL 分隔无引号；R 条目后跟独立原路径记录；
 * 头记录 `## branch...upstream [ahead N, behind M]`。
 */

import assert from 'node:assert/strict'
import { parseGitStatusHeader, parseGitStatusZ, toDirectoryStatus, notARepoStatus } from '../electron/src/services/support/gitStatusParse'

// ============ 头解析 ============

assert.deepEqual(parseGitStatusHeader('## master'), { branch: 'master' })
assert.deepEqual(parseGitStatusHeader('## master...origin/master'), { branch: 'master' })
assert.deepEqual(parseGitStatusHeader('## feature/x...origin/feature/x [ahead 2]'), { branch: 'feature/x', ahead: 2 })
assert.deepEqual(parseGitStatusHeader('## main...origin/main [behind 3]'), { branch: 'main', behind: 3 })
assert.deepEqual(parseGitStatusHeader('## main...origin/main [ahead 1, behind 4]'), { branch: 'main', ahead: 1, behind: 4 })
assert.deepEqual(parseGitStatusHeader('## HEAD (no branch)'), {})

// ============ -z 全量解析 ============

const sample = [
  '## master...origin/master [ahead 8]',
  ' M docs/a.md',           // 工作区修改
  'M  src/b.ts',            // 已暂存修改
  'A  new/c.txt',           // 新增已暂存
  '?? untracked dir/',      // 未跟踪
  'R  renamed/to.ts',       // 重命名（新路径）
  'renamed/from.ts',        // ↑ 的原路径（独立 NUL 记录）
  'D  gone/d.txt',          // 已暂存删除
  'DD conflict.txt',        // 双边删除（冲突）
  ''
].join('\0')

const parsed = parseGitStatusZ(sample)
assert.equal(parsed.branch, 'master')
assert.equal(parsed.ahead, 8)
assert.equal(parsed.behind, undefined)
assert.equal(parsed.entries.length, 7) // R 条目消耗两条 NUL 记录，8 条记录 → 7 个条目

assert.deepEqual(parsed.entries[0], { relPath: 'docs/a.md', x: ' ', y: 'M' })
assert.deepEqual(parsed.entries[1], { relPath: 'src/b.ts', x: 'M', y: ' ' })
assert.deepEqual(parsed.entries[2], { relPath: 'new/c.txt', x: 'A', y: ' ' })
assert.deepEqual(parsed.entries[3], { relPath: 'untracked dir/', x: '?', y: '?' })
assert.deepEqual(parsed.entries[4], { relPath: 'renamed/to.ts', x: 'R', y: ' ', renamedFrom: 'renamed/from.ts' })
assert.deepEqual(parsed.entries[5], { relPath: 'gone/d.txt', x: 'D', y: ' ' })
assert.deepEqual(parsed.entries[6], { relPath: 'conflict.txt', x: 'D', y: 'D' })

// 空输出 / 仅头
assert.equal(parseGitStatusZ('## main\0').entries.length, 0)
assert.equal(parseGitStatusZ('').entries.length, 0)

// ============ 绝对路径转换 ============

const status = toDirectoryStatus(parsed, '/work/repo')
assert.equal(status.isRepo, true)
assert.equal(status.repoRoot, '/work/repo')
assert.equal(status.branch, 'master')
assert.equal(status.entries[0].path, '/work/repo/docs/a.md')
assert.equal(status.entries[4].renamedFrom, 'renamed/from.ts')
assert.equal(status.entries[4].path, '/work/repo/renamed/to.ts')

// repoRoot 带尾斜杠容错
const status2 = toDirectoryStatus(parseGitStatusZ(' M x\0'), '/work/repo/')
assert.equal(status2.entries[0].path, '/work/repo/x')

// 非仓库负结果共享同一不可变实例
assert.equal(notARepoStatus(), notARepoStatus())
assert.deepEqual(notARepoStatus(), { isRepo: false, entries: [] })

console.log('✓ gitStatusParse 解析测试全部通过')
