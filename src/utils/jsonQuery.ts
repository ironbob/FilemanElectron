/**
 * JSON 路径查询（dot/bracket 子集，纯函数）。
 *
 * 刻意不复用 textFilter 引擎——那是日志行过滤域；这里是结构化取值，
 * 语义是 JSONPath 的常用子集：
 *   $.a.b        点访问
 *   $.items[0]   数组下标
 *   $.items[*]   数组展开（返回数组）
 *   $.a['k-1']   引号键（含特殊字符）
 */

export interface JsonQueryResult {
  ok: boolean
  value: unknown
  error?: string
}

const TOKEN = /^\s*(?:\.([A-Za-z_$][\w$]*)|\[(\d+|\*)\]|\['([^']+)'\]|\["([^"]+)"\])\s*/

/** 校验并解析路径为 token 序列；空串返回 []（整根）。 */
export function parseJsonPath(path: string): string[] | null {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '$') return []
  if (!trimmed.startsWith('$')) return null
  const rest = trimmed.slice(1)
  const tokens: string[] = []
  let remaining = rest
  while (remaining.length > 0) {
    const match = TOKEN.exec(remaining)
    if (!match) return null
    tokens.push(match[1] ?? match[2] ?? match[3] ?? match[4])
    remaining = remaining.slice(match[0].length)
  }
  return tokens
}

/** 沿 token 序列取值；数组下标越界/键不存在 → ok:false（不抛异常）。 */
export function queryJson(root: unknown, path: string): JsonQueryResult {
  const tokens = parseJsonPath(path)
  if (tokens === null) {
    return { ok: false, value: undefined, error: '路径语法非法（支持 $.a.b / [0] / [*] / [\'键\']）' }
  }
  let current: unknown = root
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return { ok: false, value: undefined, error: `在 ${token} 处遇到 null/undefined` }
    }
    if (token === '*') {
      if (!Array.isArray(current)) {
        return { ok: false, value: undefined, error: '[*] 只能作用于数组' }
      }
      current = current
      continue // [*] 原样透传数组（展开语义在显示层）
    }
    if (Array.isArray(current)) {
      const index = Number(token)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { ok: false, value: undefined, error: `数组下标越界：[${token}]（长度 ${current.length}）` }
      }
      current = current[index]
      continue
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>
      if (!(token in record)) {
        return { ok: false, value: undefined, error: `键不存在：${token}` }
      }
      current = record[token]
      continue
    }
    return { ok: false, value: undefined, error: `在 ${token} 处遇到标量，无法继续下钻` }
  }
  return { ok: true, value: current }
}
