/**
 * Text Filter Expression Engine - Parser
 *
 * Recursive descent parser that builds an AST from the token stream.
 * Grammar (BNF):
 *   expression := term ( OR term )*
 *   term       := factor ( AND factor )*
 *   factor     := NOT factor
 *              | '(' expression ')'
 *              | keyword '(' value ')'
 */

import { TokenType, ExpressionNode, TermNode, ParseResult } from './types'
import { LexerState, nextToken, peekToken } from './lexer'

/**
 * Parser state
 */
interface ParserState {
  lexer: LexerState
  error: string | null
}

/**
 * Parse an expression string and return the AST
 */
export function parse(input: string): ParseResult {
  const state: ParserState = {
    lexer: { input, position: 0, currentToken: null },
    error: null
  }

  if (input.trim() === '') {
    return { ast: null, error: 'Empty expression' }
  }

  const ast = parseExpression(state)

  // Check for errors during parsing
  if (state.error !== null) {
    return { ast: null, error: state.error }
  }

  // Ensure all tokens are consumed
  const token = peekToken(state.lexer)
  if (token.type !== TokenType.EndOfInput) {
    return { ast: null, error: `Unexpected token after expression at position ${token.position}` }
  }

  return { ast, error: null }
}

/**
 * Parse expression (handles OR - lowest precedence)
 * expression := term ( OR term )*
 */
function parseExpression(state: ParserState): ExpressionNode | null {
  let left = parseTerm(state)
  if (left === null) return null

  while (true) {
    const token = peekToken(state.lexer)
    if (token.type !== TokenType.Or) break

    nextToken(state.lexer) // consume 'or'
    const right = parseTerm(state)
    if (right === null) return null

    left = { type: 'binary', operator: 'or', left, right }
  }

  return left
}

/**
 * Parse term (handles AND)
 * term := factor ( AND factor )*
 */
function parseTerm(state: ParserState): ExpressionNode | null {
  let left = parseFactor(state)
  if (left === null) return null

  while (true) {
    const token = peekToken(state.lexer)
    if (token.type !== TokenType.And) break

    nextToken(state.lexer) // consume 'and'
    const right = parseFactor(state)
    if (right === null) return null

    left = { type: 'binary', operator: 'and', left, right }
  }

  return left
}

/**
 * Parse factor (handles NOT, parentheses, and keywords)
 * factor := NOT factor
 *        | '(' expression ')'
 *        | keyword '(' value ')'
 */
function parseFactor(state: ParserState): ExpressionNode | null {
  const token = peekToken(state.lexer)

  // NOT factor
  if (token.type === TokenType.Not) {
    nextToken(state.lexer) // consume 'not'
    const operand = parseFactor(state)
    if (operand === null) return null
    return { type: 'unary', operator: 'not', operand }
  }

  // '(' expression ')'
  if (token.type === TokenType.LParen) {
    nextToken(state.lexer) // consume '('
    const expr = parseExpression(state)
    if (expr === null) return null

    const closeToken = nextToken(state.lexer)
    if (closeToken.type !== TokenType.RParen) {
      state.error = `Expected ')' at position ${closeToken.position}`
      return null
    }
    return expr
  }

  // keyword '(' value ')'
  if (token.type === TokenType.Keyword) {
    return parseKeywordExpression(state)
  }

  // Error cases
  if (token.type === TokenType.Error) {
    state.error = token.error || 'Lexer error'
    return null
  }

  if (token.type === TokenType.EndOfInput) {
    state.error = 'Unexpected end of expression'
    return null
  }

  state.error = `Unexpected token at position ${token.position}`
  return null
}

/**
 * Parse keyword '(' value ')'
 * Value extraction bypasses the lexer and uses bracket counting
 * to support nested parentheses in values.
 */
function parseKeywordExpression(state: ParserState): TermNode | null {
  const keywordToken = nextToken(state.lexer)
  const predicate = keywordToken.value!

  // Expect '('
  const lparenPos = state.lexer.position
  const lparenToken = nextToken(state.lexer)
  if (lparenToken.type !== TokenType.LParen) {
    state.error = `Expected '(' after '${predicate}' at position ${lparenPos}`
    return null
  }

  // Extract value using bracket counting
  const valueResult = extractValue(state)
  if (valueResult === null) return null

  const { value, endPosition } = valueResult

  // Check for empty value
  if (value === '') {
    state.error = `Empty value for '${predicate}()' at position ${lparenPos}`
    return null
  }

  // Update lexer position
  state.lexer.position = endPosition

  // Predicate-specific value validation (reported at parse time, not silently at match time)
  if (predicate === 'lines') {
    // lines(n) or lines(n-m), positive integers, n <= m
    const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(value)
    if (rangeMatch === null) {
      state.error = `Invalid lines() range '${value}' (expected lines(n) or lines(n-m)) at position ${lparenPos}`
      return null
    }
    if (rangeMatch[2] !== undefined && Number(rangeMatch[1]) > Number(rangeMatch[2])) {
      state.error = `Invalid lines() range '${value}' (start must be <= end) at position ${lparenPos}`
      return null
    }
  }
  if (predicate === 'reg' || predicate === 'REG') {
    // Surface invalid regex at parse time instead of silently matching nothing
    try {
      new RegExp(value)
    } catch (e) {
      state.error = `Invalid regex in ${predicate}(): ${e instanceof Error ? e.message : String(e)} at position ${lparenPos}`
      return null
    }
  }

  // Consume the closing ')'
  const closeToken = nextToken(state.lexer)
  if (closeToken.type !== TokenType.RParen) {
    state.error = `Expected ')' to close '${predicate}(...' at position ${endPosition}`
    return null
  }

  return { type: 'term', predicate, value }
}

/**
 * Extract the value inside parentheses using bracket counting.
 * Returns the value string and the position after the closing ')'.
 */
function extractValue(state: ParserState): { value: string; endPosition: number } | null {
  const input = state.lexer.input
  let pos = state.lexer.position
  let parenCount = 1 // We're already inside one '('
  const valueStart = pos

  while (pos < input.length && parenCount > 0) {
    const ch = input[pos]
    if (ch === '(') {
      parenCount++
    } else if (ch === ')') {
      parenCount--
      if (parenCount === 0) {
        // Found the matching closing paren; return its position so the
        // caller can consume it via nextToken
        const value = input.slice(valueStart, pos)
        return { value, endPosition: pos }
      }
    }
    pos++
  }

  // Never found matching ')'
  state.error = `Unclosed parentheses starting at position ${state.lexer.position}`
  return null
}
