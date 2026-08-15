/**
 * Log Analysis - Scheme Serializer (ROLE-D04)
 *
 * Owns the on-disk format for exported/imported highlight schemes so format
 * evolution stays behind this module (PRD QA-6 / IFC-5 in contract).
 * Format v1:
 * {
 *   "type": "fileman-color-scheme",
 *   "version": 1,
 *   "name": "...",
 *   "rules": [ { "matchType": "...", "value": "...", "scope": "...", "colorKey": "..." } ]
 * }
 */

import { HighlightRule, HighlightScheme, RuleMatchType, RuleScope, COLOR_KEYS, newSchemeId } from './schemeModel'

export const SCHEME_FILE_TYPE = 'fileman-color-scheme'
export const SCHEME_FILE_VERSION = 1

const MATCH_TYPES: readonly RuleMatchType[] = ['contains', 'equals', 'word', 'regex']
const SCOPES: readonly RuleScope[] = ['line', 'fragment']

/** Serialize a scheme to a pretty JSON string (rules keep priority order) */
export function serializeScheme(scheme: HighlightScheme): string {
  return JSON.stringify(
    {
      type: SCHEME_FILE_TYPE,
      version: SCHEME_FILE_VERSION,
      name: scheme.name,
      rules: scheme.rules.map(r => ({
        matchType: r.matchType,
        value: r.value,
        scope: r.scope,
        colorKey: r.colorKey
      }))
    },
    null,
    2
  )
}

/** Parsed scheme data (id/host assignment happens in the store) */
export interface ImportedSchemeData {
  name: string
  rules: HighlightRule[]
}

/** Parse + validate an imported scheme file body. Errors are user-presentable. */
export function deserializeScheme(raw: string): { data: ImportedSchemeData | null; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { data: null, error: `不是合法 JSON: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { data: null, error: '文件内容不是对象' }
  }
  const obj = parsed as Record<string, unknown>

  if (obj.type !== SCHEME_FILE_TYPE) {
    return { data: null, error: `缺少类型标记 "${SCHEME_FILE_TYPE}"，不是 Fileman 着色方案文件` }
  }
  if (obj.version !== SCHEME_FILE_VERSION) {
    return { data: null, error: `不支持的方案版本 ${String(obj.version)}（当前支持 ${SCHEME_FILE_VERSION}）` }
  }
  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    return { data: null, error: '方案名缺失或为空' }
  }
  if (!Array.isArray(obj.rules)) {
    return { data: null, error: '规则列表缺失' }
  }

  const rules: HighlightRule[] = []
  for (let i = 0; i < obj.rules.length; i++) {
    const item = obj.rules[i]
    if (typeof item !== 'object' || item === null) {
      return { data: null, error: `第 ${i + 1} 条规则不是对象` }
    }
    const r = item as Record<string, unknown>
    if (typeof r.matchType !== 'string' || !MATCH_TYPES.includes(r.matchType as RuleMatchType)) {
      return { data: null, error: `第 ${i + 1} 条规则匹配类型非法: ${String(r.matchType)}` }
    }
    if (typeof r.value !== 'string' || r.value === '') {
      return { data: null, error: `第 ${i + 1} 条规则值为空` }
    }
    if (typeof r.scope !== 'string' || !SCOPES.includes(r.scope as RuleScope)) {
      return { data: null, error: `第 ${i + 1} 条规则作用范围非法: ${String(r.scope)}` }
    }
    if (typeof r.colorKey !== 'string' || !COLOR_KEYS.includes(r.colorKey as never)) {
      return { data: null, error: `第 ${i + 1} 条规则颜色非法: ${String(r.colorKey)}` }
    }
    rules.push({
      id: `imported-${i}`,
      matchType: r.matchType as RuleMatchType,
      value: r.value,
      scope: r.scope as RuleScope,
      colorKey: r.colorKey
    })
  }

  return { data: { name: (obj.name as string).trim(), rules }, error: null }
}

/** Build a store-ready scheme from imported data, avoiding name collisions (PRD R-import) */
export function importedToScheme(data: ImportedSchemeData, existingNames: readonly string[]): HighlightScheme {
  return {
    id: newSchemeId(),
    name: uniqueName(existingNames, data.name),
    builtin: false,
    rules: data.rules
  }
}

/** "方案" → "方案 (2)" → "方案 (3)" ... */
export function uniqueName(existingNames: readonly string[], base: string): string {
  const taken = new Set(existingNames)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}
