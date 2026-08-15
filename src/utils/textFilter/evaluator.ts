/**
 * Text Filter Expression Engine - Evaluator
 *
 * Compiles an AST into a single match function with short-circuit evaluation.
 */

import { ExpressionNode, LineContext, LevelVocabulary } from './types'
import { executePredicate, PredicateContext } from './predicates'

/**
 * Evaluate an AST against a text string
 */
export function evaluate(ast: ExpressionNode, text: string, ctx?: PredicateContext): boolean {
  switch (ast.type) {
    case 'term':
      return executePredicate(ast.predicate, ast.value, text, ctx)

    case 'unary':
      if (ast.operator === 'not') {
        return !evaluate(ast.operand, text, ctx)
      }
      // Unknown unary operator (should not happen with valid AST)
      return false

    case 'binary':
      if (ast.operator === 'and') {
        // Short-circuit: if left is false, don't evaluate right
        return evaluate(ast.left, text, ctx) && evaluate(ast.right, text, ctx)
      }
      if (ast.operator === 'or') {
        // Short-circuit: if left is true, don't evaluate right
        return evaluate(ast.left, text, ctx) || evaluate(ast.right, text, ctx)
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
 * Returns a function that can be called repeatedly with different texts;
 * an optional LineContext enables lines(), a level vocabulary customizes level()
 */
export function compile(
  ast: ExpressionNode,
  options?: { levels?: LevelVocabulary }
): (text: string, line?: LineContext) => boolean {
  return (text: string, line?: LineContext) => evaluate(ast, text, { line, levels: options?.levels })
}

/**
 * True when the AST contains a lines() term, i.e. the caller must pass a
 * LineContext for match() results to be meaningful.
 */
export function astRequiresLineContext(ast: ExpressionNode): boolean {
  switch (ast.type) {
    case 'term':
      return ast.predicate === 'lines'
    case 'unary':
      return astRequiresLineContext(ast.operand)
    case 'binary':
      return astRequiresLineContext(ast.left) || astRequiresLineContext(ast.right)
    default:
      return false
  }
}
