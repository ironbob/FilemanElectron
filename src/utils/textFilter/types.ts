/**
 * Text Filter Expression Engine - Type Definitions
 *
 * Based on SYNTAX.md specification
 */

/**
 * Token types produced by the lexer
 */
export enum TokenType {
  Keyword = 'Keyword',     // co, CO, eq, EQ, word, WORD, reg, REG
  And = 'And',             // and (case insensitive)
  Or = 'Or',               // or (case insensitive)
  Not = 'Not',             // not (case insensitive)
  LParen = 'LParen',       // (
  RParen = 'RParen',       // )
  EndOfInput = 'EndOfInput',
  Error = 'Error'
}

/**
 * Match predicate keywords (case determines case sensitivity)
 * - Lowercase: case insensitive
 * - Uppercase: case sensitive
 */
export type MatchPredicate =
  | 'co'   // contains (case insensitive)
  | 'CO'   // contains (case sensitive)
  | 'eq'   // equals (case insensitive)
  | 'EQ'   // equals (case sensitive)
  | 'word' // whole word match (case insensitive)
  | 'WORD' // whole word match (case sensitive)
  | 'reg'  // regex match (case insensitive)
  | 'REG'  // regex match (case sensitive)

/**
 * Token produced by the lexer
 */
export interface Token {
  type: TokenType
  /** For Keyword tokens, the predicate name (co, CO, etc.) */
  value?: MatchPredicate
  /** Error message for Error tokens */
  error?: string
  /** Position in the input string */
  position: number
}

/**
 * AST node for a term expression (leaf node): keyword(value)
 */
export interface TermNode {
  type: 'term'
  predicate: MatchPredicate
  value: string
}

/**
 * AST node for a unary expression: NOT expr
 */
export interface UnaryNode {
  type: 'unary'
  operator: 'not'
  operand: ExpressionNode
}

/**
 * AST node for a binary expression: expr AND/OR expr
 */
export interface BinaryNode {
  type: 'binary'
  operator: 'and' | 'or'
  left: ExpressionNode
  right: ExpressionNode
}

/**
 * Union type for all AST nodes
 */
export type ExpressionNode = TermNode | UnaryNode | BinaryNode

/**
 * Result of parsing an expression
 */
export interface ParseResult {
  /** The parsed AST, or null if parsing failed */
  ast: ExpressionNode | null
  /** Error message if parsing failed */
  error: string | null
}

/**
 * Composed expression object returned by ComposeExpression()
 */
export interface ComposedExpression {
  /** Returns true if the expression was parsed successfully */
  isValid(): boolean
  /** Returns the error message if parsing failed, or null if successful */
  error(): string | null
  /** Tests if the given text matches the expression */
  match(text: string): boolean
  /** Returns the parsed AST, or null if parsing failed */
  getAst(): ExpressionNode | null
}
