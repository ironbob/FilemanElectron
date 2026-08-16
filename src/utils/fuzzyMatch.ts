/**
 * 通用模糊匹配评分（子序列匹配 + 打分），与具体领域解耦。
 *
 * 从 pinyinFileNameMatcher 的 codePointPrefixIndices 泛化：命令面板 /
 * 目录跳转需要「任意位置的子序列匹配」而非仅前缀（输入 "nb" 命中 "New
 * Bookmark"）。纯函数、Unicode code-point 感知（Array.from 处理代理对），
 * 高亮偏移与 FileNameMatchLabel 的 props 约定一致。
 *
 * 打分启发式（借鉴 fzf）：
 *  - 前缀命中（首个命中位于 0 且连续）最优；
 *  - 词首命中（前一字符为空格/斜杠/连字符等分隔符）次优；
 *  - 连续命中 > 离散命中；越靠前越好。
 */

export interface FuzzyMatchResult {
  /** 命中字符在目标串中的 code-point 索引（供 <mark> 高亮）。 */
  indices: number[]
  /** 得分，越大越靠前；不匹配返回 null。 */
  score: number
}

const SEPARATORS = new Set([' ', '/', '-', '_', '.', '(', ')', '[', ']', ':', '·'])

export function fuzzyMatch(target: string, query: string): FuzzyMatchResult | null {
  const targetChars = Array.from(target.toLocaleLowerCase())
  const queryChars = Array.from(query.trim().toLocaleLowerCase())
  if (queryChars.length === 0) return null
  if (queryChars.length > targetChars.length) return null

  const indices: number[] = []
  let score = 0
  let targetIndex = 0
  let previousHit = -2
  let firstHit = -1

  for (let queryIndex = 0; queryIndex < queryChars.length; queryIndex++) {
    const queryChar = queryChars[queryIndex]
    let found = -1
    for (let i = targetIndex; i < targetChars.length; i++) {
      if (targetChars[i] === queryChar) {
        found = i
        break
      }
    }
    if (found === -1) return null // 后续字符找不到：整体不匹配
    indices.push(found)
    if (firstHit === -1) firstHit = found
    // 连续命中加分；词首加分
    if (found === previousHit + 1) score += 8
    if (found === 0 || SEPARATORS.has(targetChars[found - 1] ?? '')) score += 6
    // 越靠前加分（衰减）
    score += Math.max(0, 4 - Math.floor(found / 4))
    previousHit = found
    targetIndex = found + 1
  }

  // 首命中位于目标开头：整体前缀，最优信号
  if (firstHit === 0) score += 12
  // 完全连续（整体即为一段连续子串）
  if (indices.length > 1 && indices.every((index, i) => i === 0 || index === indices[i - 1] + 1)) score += 4

  return { indices, score }
}

/** 对候选列表过滤 + 排序（得分降序，平分保持注册顺序）。 */
export function rankFuzzyMatches<T>(
  candidates: readonly T[],
  getText: (item: T) => string,
  query: string,
  limit?: number
): Array<{ item: T; indices: number[] }> {
  const matched: Array<{ item: T; score: number; indices: number[] }> = []
  for (const item of candidates) {
    const result = fuzzyMatch(getText(item), query)
    if (result) matched.push({ item, score: result.score, indices: result.indices })
  }
  matched.sort((a, b) => b.score - a.score)
  const sliced = limit ? matched.slice(0, limit) : matched
  return sliced.map(entry => ({ item: entry.item, indices: entry.indices }))
}
