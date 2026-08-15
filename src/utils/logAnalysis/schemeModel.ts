/**
 * Log Analysis - Highlight Scheme Model (ROLE-D03, DDD aggregate)
 *
 * A HighlightScheme (aggregate root) owns an ordered list of HighlightRule
 * (value objects). Array order IS priority (PRD R5). Colors are expressed as
 * theme-scoped CSS class keys (--fma-* variables under [data-theme]) so both
 * dark and light themes stay readable (PRD QA-4); components must not use
 * raw hex colors.
 *
 * Framework-free and Monaco-free: compileScheme() turns a scheme into pure
 * matchers; the Monaco highlighter (ROLE-L05) only consumes the compiled form.
 */

/** How a rule matches text inside a line */
export type RuleMatchType = 'contains' | 'equals' | 'word' | 'regex'

/** What a matched rule colors */
export type RuleScope = 'line' | 'fragment'

/** A single coloring rule (value object: immutable, compared by value) */
export interface HighlightRule {
  id: string
  matchType: RuleMatchType
  value: string
  scope: RuleScope
  /** Key into the theme color palette (COLOR_KEYS) */
  colorKey: string
}

/** A coloring scheme (aggregate root) */
export interface HighlightScheme {
  id: string
  name: string
  /** Built-in presets are read-only; personalize by duplicating (PRD R7) */
  builtin: boolean
  rules: HighlightRule[]
}

/** Theme palette keys — mapped to fma-hl-line-<key> / fma-hl-frag-<key> CSS classes */
export const COLOR_KEYS = [
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'gray'
] as const

export type ColorKey = (typeof COLOR_KEYS)[number]

/** A matched fragment range (0-based, half-open, on a single line) */
export interface FragmentRange {
  start: number
  end: number
  className: string
}

/** Per-line coloring decision produced by a compiled scheme */
export interface LineColoring {
  /** Whole-line class (first matching line-scope rule wins) or null */
  lineClass: string | null
  /** Fragment ranges, non-overlapping, higher-priority rules claim first */
  fragments: FragmentRange[]
}

/** A rule that failed validation and is skipped at render time (PRD QA-5) */
export interface InvalidRule {
  ruleId: string
  reason: string
}

interface CompiledMatcher {
  /** Returns match ranges (for fragment rules the first range is used) */
  ranges(text: string): Array<{ start: number; end: number }>
}

/** Compiled, validation-filtered scheme ready for the renderer */
export interface CompiledScheme {
  schemeId: string
  schemeName: string
  lineRules: Array<{ className: string; matcher: CompiledMatcher }>
  fragmentRules: Array<{ className: string; matcher: CompiledMatcher }>
  invalidRules: InvalidRule[]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileMatcher(rule: HighlightRule): { matcher: CompiledMatcher } | { error: string } {
  const value = rule.value
  if (value === '') {
    return { error: '规则值为空' }
  }
  try {
    switch (rule.matchType) {
      case 'contains': {
        const needle = value.toLowerCase()
        return {
          matcher: {
            ranges(text: string) {
              const lower = text.toLowerCase()
              const ranges: Array<{ start: number; end: number }> = []
              let idx = lower.indexOf(needle)
              while (idx !== -1) {
                ranges.push({ start: idx, end: idx + needle.length })
                idx = lower.indexOf(needle, idx + needle.length)
              }
              return ranges
            }
          }
        }
      }
      case 'equals':
        return {
          matcher: {
            ranges(text: string) {
              return text === value ? [{ start: 0, end: text.length }] : []
            }
          }
        }
      case 'word': {
        const regex = new RegExp(`\\b${escapeRegex(value)}\\b`, 'gi')
        return {
          matcher: {
            ranges(text: string) {
              const ranges: Array<{ start: number; end: number }> = []
              regex.lastIndex = 0
              let m: RegExpExecArray | null
              while ((m = regex.exec(text)) !== null) {
                ranges.push({ start: m.index, end: m.index + m[0].length })
                if (m.index === regex.lastIndex) regex.lastIndex++ // zero-length safety
              }
              return ranges
            }
          }
        }
      }
      case 'regex': {
        const regex = new RegExp(value, 'gi')
        return {
          matcher: {
            ranges(text: string) {
              const ranges: Array<{ start: number; end: number }> = []
              regex.lastIndex = 0
              let m: RegExpExecArray | null
              while ((m = regex.exec(text)) !== null) {
                if (m[0].length > 0) ranges.push({ start: m.index, end: m.index + m[0].length })
                else regex.lastIndex++
              }
              return ranges
            }
          }
        }
      }
      default:
        return { error: `未知匹配类型: ${rule.matchType}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Validate + compile a scheme. Invalid rules are reported (and skipped) so a
 * single bad regex never blanks out the whole scheme (PRD QA-5, IFC-3).
 */
export function compileScheme(scheme: HighlightScheme): CompiledScheme {
  const compiled: CompiledScheme = {
    schemeId: scheme.id,
    schemeName: scheme.name,
    lineRules: [],
    fragmentRules: [],
    invalidRules: []
  }

  for (const rule of scheme.rules) {
    if (!COLOR_KEYS.includes(rule.colorKey as ColorKey)) {
      compiled.invalidRules.push({ ruleId: rule.id, reason: `未知颜色: ${rule.colorKey}` })
      continue
    }
    const result = compileMatcher(rule)
    if ('error' in result) {
      compiled.invalidRules.push({ ruleId: rule.id, reason: result.error })
      continue
    }
    const className = rule.scope === 'line'
      ? `fma-hl-line-${rule.colorKey}`
      : `fma-hl-frag-${rule.colorKey}`
    if (rule.scope === 'line') {
      compiled.lineRules.push({ className, matcher: result.matcher })
    } else {
      compiled.fragmentRules.push({ className, matcher: result.matcher })
    }
  }

  return compiled
}

/** Fast check: does any rule of the compiled scheme hit this line at all */
export function lineHasAnyMatch(compiled: CompiledScheme, text: string): boolean {
  for (const r of compiled.lineRules) {
    if (r.matcher.ranges(text).length > 0) return true
  }
  for (const r of compiled.fragmentRules) {
    if (r.matcher.ranges(text).length > 0) return true
  }
  return false
}

/**
 * Apply the scheme to one line (IFC-3).
 * Invariants: array order is priority; the FIRST matching line rule provides
 * the whole-line class; fragment ranges claim text in priority order and a
 * later rule never overrides an earlier claimed fragment.
 */
export function matchLine(compiled: CompiledScheme, text: string): LineColoring {
  let lineClass: string | null = null
  for (const r of compiled.lineRules) {
    if (r.matcher.ranges(text).length > 0) {
      lineClass = r.className
      break
    }
  }

  // Overlap bookkeeping in units of code units; Monaco ranges use the same unit
  const claimed = new Uint8Array(text.length + 1)
  const fragments: FragmentRange[] = []
  for (const r of compiled.fragmentRules) {
    for (const range of r.matcher.ranges(text)) {
      let overlap = false
      for (let i = range.start; i < range.end; i++) {
        if (claimed[i] === 1) { overlap = true; break }
      }
      if (overlap) continue
      for (let i = range.start; i < range.end; i++) claimed[i] = 1
      fragments.push({ start: range.start, end: range.end, className: r.className })
    }
  }
  fragments.sort((a, b) => a.start - b.start)

  return { lineClass, fragments }
}

/** Generate a rule id (collision-safe enough for local scheme editing) */
export function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Generate a scheme id */
export function newSchemeId(): string {
  return `scheme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Built-in presets (PRD assumption 2): one level-based scheme, one
 * general-purpose enhancement scheme. Read-only; duplicate to personalize.
 */
export const BUILTIN_SCHEMES: HighlightScheme[] = [
  {
    id: 'builtin-log-levels',
    name: '日志级别',
    builtin: true,
    rules: [
      { id: 'bl-1', matchType: 'word', value: 'ERROR', scope: 'line', colorKey: 'red' },
      { id: 'bl-2', matchType: 'word', value: 'WARN', scope: 'line', colorKey: 'orange' },
      { id: 'bl-3', matchType: 'word', value: 'INFO', scope: 'fragment', colorKey: 'cyan' },
      { id: 'bl-4', matchType: 'word', value: 'DEBUG', scope: 'fragment', colorKey: 'gray' }
    ]
  },
  {
    id: 'builtin-enhanced',
    name: '通用增强',
    builtin: true,
    rules: [
      {
        // ISO-8601 / common log timestamps
        id: 'be-1', matchType: 'regex', value: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?',
        scope: 'fragment', colorKey: 'blue'
      },
      { id: 'be-2', matchType: 'regex', value: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b', scope: 'fragment', colorKey: 'purple' },
      { id: 'be-3', matchType: 'regex', value: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', scope: 'fragment', colorKey: 'cyan' },
      { id: 'be-4', matchType: 'word', value: 'Exception', scope: 'line', colorKey: 'red' }
    ]
  }
]
