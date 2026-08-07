/**
 * Text Filter Expression Engine - Public API
 *
 * Usage:
 *   const filter = ComposeExpression('co(error) and not co(warning)')
 *   if (filter.isValid()) {
 *     filter.match('[ERROR] Connection failed') // true
 *     filter.match('[ERROR] with warning')      // false
 *   }
 */

import { ComposedExpression, ExpressionNode, ParseResult } from './types'
import { parse } from './parser'
import { compile } from './evaluator'

/**
 * Create a composed expression from a filter expression string.
 *
 * @param expression - The filter expression to parse
 * @returns A ComposedExpression object with isValid(), error(), match(), and getAst() methods
 */
export function ComposeExpression(expression: string): ComposedExpression {
  const result: ParseResult = parse(expression)

  // Pre-compile the match function if parsing succeeded
  const matchFn = result.ast !== null ? compile(result.ast) : null

  return {
    isValid(): boolean {
      return result.ast !== null
    },

    error(): string | null {
      return result.error
    },

    match(text: string): boolean {
      if (matchFn === null) {
        return false
      }
      return matchFn(text)
    },

    getAst(): ExpressionNode | null {
      return result.ast
    }
  }
}

// Re-export types for external use
export * from './types'
