/**
 * Text Filter Expression Engine - Lexer
 *
 * Single-pass scanner that produces tokens on demand.
 */

import { TokenType, Token, MatchPredicate } from './types'

/**
 * Lexer state interface
 */
export interface LexerState {
  /** The input expression string */
  input: string
  /** Current position in the input */
  position: number
  /** Current token (peeked) */
  currentToken: Token | null
}

/** List of valid predicate keywords */
const PREDICATE_KEYWORDS: readonly string[] = [
  'co', 'CO', 'eq', 'EQ', 'word', 'WORD', 'reg', 'REG'
] as const

/** Check if a string is a valid predicate keyword */
function isPredicateKeyword(s: string): s is MatchPredicate {
  return PREDICATE_KEYWORDS.includes(s as MatchPredicate)
}

/** Check if a character is whitespace */
function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

/** Check if a character is alphabetic */
function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

/**
 * Create a new lexer state for the given input
 */
export function createLexer(input: string): LexerState {
  return {
    input,
    position: 0,
    currentToken: null
  }
}

/**
 * Skip whitespace characters
 */
function skipWhitespace(state: LexerState): void {
  while (state.position < state.input.length && isWhitespace(state.input[state.position])) {
    state.position++
  }
}

/**
 * Read an identifier (sequence of letters)
 */
function readIdentifier(state: LexerState): string {
  const start = state.position
  while (state.position < state.input.length && isAlpha(state.input[state.position])) {
    state.position++
  }
  return state.input.slice(start, state.position)
}

/**
 * Get the next token from the lexer
 */
export function nextToken(state: LexerState): Token {
  // If we have a peeked token, return it
  if (state.currentToken !== null) {
    const token = state.currentToken
    state.currentToken = null
    return token
  }

  return scanToken(state)
}

/**
 * Peek at the next token without consuming it
 */
export function peekToken(state: LexerState): Token {
  if (state.currentToken !== null) {
    return state.currentToken
  }

  state.currentToken = scanToken(state)
  return state.currentToken
}

/**
 * Scan and return the next token
 */
function scanToken(state: LexerState): Token {
  skipWhitespace(state)

  const pos = state.position

  // Check for end of input
  if (state.position >= state.input.length) {
    return { type: TokenType.EndOfInput, position: pos }
  }

  const ch = state.input[state.position]

  // Single character tokens
  if (ch === '(') {
    state.position++
    return { type: TokenType.LParen, position: pos }
  }

  if (ch === ')') {
    state.position++
    return { type: TokenType.RParen, position: pos }
  }

  // Identifier (keyword or operator)
  if (isAlpha(ch)) {
    const startPos = state.position
    const identifier = readIdentifier(state)
    const lowerIdentifier = identifier.toLowerCase()

    // Check for logical operators (case insensitive)
    if (lowerIdentifier === 'and') {
      return { type: TokenType.And, position: startPos }
    }

    if (lowerIdentifier === 'or') {
      return { type: TokenType.Or, position: startPos }
    }

    if (lowerIdentifier === 'not') {
      return { type: TokenType.Not, position: startPos }
    }

    // Check for predicate keywords (case sensitive)
    if (isPredicateKeyword(identifier)) {
      return { type: TokenType.Keyword, value: identifier, position: startPos }
    }

    // Unknown identifier
    return {
      type: TokenType.Error,
      error: `Unknown identifier: '${identifier}'`,
      position: startPos
    }
  }

  // Unknown character
  state.position++
  return {
    type: TokenType.Error,
    error: `Unexpected character: '${ch}'`,
    position: pos
  }
}
