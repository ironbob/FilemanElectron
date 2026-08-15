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

import { ComposedExpression, ComposeOptions, ExpressionNode, LineContext, ParseResult } from './types'
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

// Re-export types for external use
export * from './types'
