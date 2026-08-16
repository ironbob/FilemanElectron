import type { GitDirectoryStatus, GitStatusEntry } from '@shared/types'

/**
 * `git status --porcelain=v1 -z --branch` 输出解析（纯函数，可单测）。
 *
 * -z 语义：记录以 NUL 分隔，路径不做引号转义；
 *   - 头记录以 `## ` 开头：`## main...origin/main [ahead 1, behind 2]`
 *     或 detached HEAD：`## HEAD (no branch)`；
 *   - 条目记录：`XY path`（X=暂存区、Y=工作区）；
 *   - R（重命名）条目的「原路径」是紧随其后的独立 NUL 记录。
 *
 * porcelain 路径始终相对仓库根（与执行时 -C 的 cwd 无关），由调用方
 * （GitStatusService）结合 rev-parse 的 repoRoot 转绝对路径。
 */

/** 解析 `## ...` 头记录：分支名与 ahead/behind。 */
export function parseGitStatusHeader(header: string): { branch?: string; ahead?: number; behind?: number } {
  // 形如 "## master...origin/master [ahead 8]" / "## HEAD (no branch)"
  const body = header.startsWith('## ') ? header.slice(3) : header
  const detached = body.startsWith('HEAD (no branch)')
  if (detached) return {}

  const bracket = body.match(/\[([^\]]*)\]\s*$/)
  let ahead: number | undefined
  let behind: number | undefined
  if (bracket) {
    const aheadMatch = bracket[1].match(/ahead (\d+)/)
    const behindMatch = bracket[1].match(/behind (\d+)/)
    if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
    if (behindMatch) behind = parseInt(behindMatch[1], 10)
  }
  const withoutBracket = bracket ? body.slice(0, bracket.index).trimEnd() : body
  // 分支名止于 `...`（有 upstream）或行尾
  const dotIdx = withoutBracket.indexOf('...')
  const branch = (dotIdx >= 0 ? withoutBracket.slice(0, dotIdx) : withoutBracket).trim()
  const result: { branch?: string; ahead?: number; behind?: number } = {}
  if (branch) result.branch = branch
  if (ahead !== undefined) result.ahead = ahead
  if (behind !== undefined) result.behind = behind
  return result
}

/**
 * 解析 -z 全量输出（不含 repoRoot 转换；entries.path 为仓库根相对路径）。
 * 供单测与 GitStatusService 使用；后者再补 repoRoot 前缀。
 */
export function parseGitStatusZ(output: string): { branch?: string; ahead?: number; behind?: number; entries: Array<Omit<GitStatusEntry, 'path'> & { relPath: string }> } {
  const records = output.split('\0').filter(record => record.length > 0)
  const result: ReturnType<typeof parseGitStatusZ> = { entries: [] }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.startsWith('## ')) {
      Object.assign(result, parseGitStatusHeader(record))
      continue
    }
    if (record.length < 4) continue // 形如 "XY path"，至少 4 字符
    const x = record[0]
    const y = record[1]
    const relPath = record.slice(3)
    const entry: ReturnType<typeof parseGitStatusZ>['entries'][number] = { relPath, x, y }
    // porcelain 规范：R（任一列）条目的原路径是紧随其后的独立 NUL 记录（必然存在）
    if ((x === 'R' || y === 'R') && i + 1 < records.length) {
      entry.renamedFrom = records[i + 1]
      i++
    }
    result.entries.push(entry)
  }
  return result
}

/** 将解析结果结合 repoRoot 转为对外契约（绝对路径）。 */
export function toDirectoryStatus(parsed: ReturnType<typeof parseGitStatusZ>, repoRoot: string): GitDirectoryStatus {
  return {
    isRepo: true,
    repoRoot,
    branch: parsed.branch,
    ahead: parsed.ahead,
    behind: parsed.behind,
    entries: parsed.entries.map(entry => ({
      path: joinRepoPath(repoRoot, entry.relPath),
      x: entry.x,
      y: entry.y,
      renamedFrom: entry.renamedFrom
    }))
  }
}

const EMPTY_STATUS: GitDirectoryStatus = { isRepo: false, entries: [] }
export function notARepoStatus(): GitDirectoryStatus {
  return EMPTY_STATUS
}

function joinRepoPath(repoRoot: string, relPath: string): string {
  if (relPath.startsWith('/')) return relPath
  return repoRoot.endsWith('/') ? repoRoot + relPath : repoRoot + '/' + relPath
}
