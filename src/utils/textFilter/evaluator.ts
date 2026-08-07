/**
 * Text Filter Expression Engine - Evaluator
 *
 * Compiles an AST into a single match function with short-circuit evaluation.
 */

import { ExpressionNode } from './types'
import { executePredicate } from './predicates'

/**
 * Evaluate an AST against a text string
 */
export function evaluate(ast: ExpressionNode, text: string): boolean {
  switch (ast.type) {
    case 'term':
      return executePredicate(ast.predicate, ast.value, text)

    case 'unary':
      if (ast.operator === 'not') {
        return !evaluate(ast.operand, text)
      }
      // Unknown unary operator (should not happen with valid AST)
      return false

    case 'binary':
      if (ast.operator === 'and') {
        // Short-circuit: if left is false, don't evaluate right
        return evaluate(ast.left, text) && evaluate(ast.right, text)
      }
      if (ast.operator === 'or') {
        // Short-circuit: if left is true, don't evaluate right
        return evaluate(ast.left, text) || evaluate(ast.right, text)
      }
      // Unknown binary operator (should not happen with valid AST)
      return false

    default:
      // Unknown node type
      return false
  }
}

/**
 * Compile an AST into a match function
 * Returns a function that can be called repeatedly with different texts
 */
export function compile(ast: ExpressionNode): (text: string) => boolean {
  return (text: string) => evaluate(ast, text)
}
