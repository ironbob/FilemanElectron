/**
 * Text Filter Expression Engine - Public API
 *
 * Usage:
 *   const filter = ComposeExpression('co(error) and not co(warning)')
 *   if (filter.isValid()) {
 *     filter.match('[ERROR] Connection failed') // true
 *     filter.match('[ERROR] with warning')      // false
 *   }
 *
 * Log-scoped predicates:
 *   const logFilter = ComposeExpression('level(error,warn) and lines(1000-2000)')
 *   logFilter.match('2026-08-15 ERROR boom', { lineNumber: 1200 }) // true
 */

import { ComposedExpression, ComposeOptions, ExpressionNode, LineContext, MatchPredicate, ParseResult, TermNode } from './types'
import { parse } from './parser'
import { compile, astRequiresLineContext } from './evaluator'

/**
 * Create a composed expression from a filter expression string.
 *
 * @param expression - The filter expression to parse
 * @param options - Optional level vocabulary merged over the built-in defaults for level()
 * @returns A ComposedExpression object with isValid(), error(), match(), getAst() and requiresLineContext() methods
 */
export function ComposeExpression(expression: string, options?: ComposeOptions): ComposedExpression {
  const result: ParseResult = parse(expression)

  // Pre-compile the match function if parsing succeeded
  const matchFn = result.ast !== null ? compile(result.ast, { levels: options?.levels }) : null

  return {
    isValid(): boolean {
      return result.ast !== null
    },

    error(): string | null {
      return result.error
    },

    match(text: string, ctx?: LineContext): boolean {
      if (matchFn === null) {
        return false
      }
      return matchFn(text, ctx)
    },

    getAst(): ExpressionNode | null {
      return result.ast
    },

    requiresLineContext(): boolean {
      return result.ast !== null && astRequiresLineContext(result.ast)
    }
  }
}

/**
 * Plain-query match modes surfaced by the find-options popover (predicate sugar:
 * the popover toggles — case / whole word / regex — simply select which
 * predicate wraps the raw text).
 */
export type PlainQueryMode = 'contains' | 'contains-case' | 'word' | 'word-case' | 'regex' | 'regex-case'

const PLAIN_MODE_PREDICATE: Record<PlainQueryMode, MatchPredicate> = {
  'contains': 'co',
  'contains-case': 'CO',
  'word': 'word',
  'word-case': 'WORD',
  'regex': 'reg',
  'regex-case': 'REG'
}

/**
 * Create a ComposedExpression directly from raw query text (no string round-trip,
 * so parentheses/quotes in the query can never break the expression syntax).
 * Used by the redesigned find field: plain text is the base mode; predicate
 * expressions typed by power users still go through ComposeExpression.
 *
 * For 'regex' mode the text is used as a case-insensitive regex source; validity
 * is the caller's concern (match() simply returns false for invalid patterns —
 * surface errors via new RegExp(text) before calling).
 */
export function ComposePlainQuery(text: string, mode: PlainQueryMode, options?: ComposeOptions): ComposedExpression {
  const ast: ExpressionNode = {
    type: 'term',
    predicate: PLAIN_MODE_PREDICATE[mode],
    value: text
  } satisfies TermNode
  const matchFn = compile(ast, { levels: options?.levels })

  return {
    isValid(): boolean {
      return true
    },

    error(): string | null {
      return null
    },

    match(text_, ctx?: LineContext): boolean {
      return matchFn(text_, ctx)
    },

    getAst(): ExpressionNode | null {
      return ast
    },

    requiresLineContext(): boolean {
      return false
    }
  }
}

/**
 * Heuristic: does the input look like an intentional predicate expression?
 * (starts with a predicate keyword followed by "("). When true but parsing
 * fails, the find field shows the parse error instead of silently falling back
 * to a literal contains-search of the user's typo.
 */
const EXPRESSION_PREFIX = /^\s*(co|eq|word|reg|level|lines)\s*\(/i

export function looksLikeExpression(input: string): boolean {
  return EXPRESSION_PREFIX.test(input)
}

// Re-export types for external use
export * from './types'
