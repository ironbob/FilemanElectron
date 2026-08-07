/**
 * Text Filter Expression Engine - Match Predicates
 *
 * 8 predicate implementations:
 * - co(x)  : contains substring (case insensitive)
 * - CO(x)  : contains substring (case sensitive)
 * - eq(x)  : equals (case insensitive)
 * - EQ(x)  : equals (case sensitive)
 * - word(x): whole word match (case insensitive)
 * - WORD(x): whole word match (case sensitive)
 * - reg(x) : regex match (case insensitive)
 * - REG(x) : regex match (case sensitive)
 */

import { MatchPredicate } from './types'

/**
 * Match function type
 */
export type MatchFunction = (text: string, pattern: string) => boolean

/**
 * Contains substring - case insensitive
 */
function containsInsensitive(text: string, pattern: string): boolean {
  return text.toLowerCase().includes(pattern.toLowerCase())
}

/**
 * Contains substring - case sensitive
 */
function containsSensitive(text: string, pattern: string): boolean {
  return text.includes(pattern)
}

/**
 * Equals - case insensitive
 */
function equalsInsensitive(text: string, pattern: string): boolean {
  return text.toLowerCase() === pattern.toLowerCase()
}

/**
 * Equals - case sensitive
 */
function equalsSensitive(text: string, pattern: string): boolean {
  return text === pattern
}

/**
 * Whole word match - case insensitive
 * Uses word boundary regex
 */
function wordInsensitive(text: string, pattern: string): boolean {
  try {
    const escaped = escapeRegex(pattern)
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    return regex.test(text)
  } catch {
    return false
  }
}

/**
 * Whole word match - case sensitive
 * Uses word boundary regex
 */
function wordSensitive(text: string, pattern: string): boolean {
  try {
    const escaped = escapeRegex(pattern)
    const regex = new RegExp(`\\b${escaped}\\b`)
    return regex.test(text)
  } catch {
    return false
  }
}

/**
 * Regex match - case insensitive
 */
function regexInsensitive(text: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i')
    return regex.test(text)
  } catch {
    // Invalid regex pattern
    return false
  }
}

/**
 * Regex match - case sensitive
 */
function regexSensitive(text: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern)
    return regex.test(text)
  } catch {
    // Invalid regex pattern
    return false
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Map of predicate names to their match functions
 */
const PREDICATE_FUNCTIONS: Record<MatchPredicate, MatchFunction> = {
  co: containsInsensitive,
  CO: containsSensitive,
  eq: equalsInsensitive,
  EQ: equalsSensitive,
  word: wordInsensitive,
  WORD: wordSensitive,
  reg: regexInsensitive,
  REG: regexSensitive
}

/**
 * Get the match function for a predicate
 */
export function getPredicateFunction(predicate: MatchPredicate): MatchFunction {
  return PREDICATE_FUNCTIONS[predicate]
}

/**
 * Execute a predicate match
 */
export function executePredicate(predicate: MatchPredicate, pattern: string, text: string): boolean {
  const fn = getPredicateFunction(predicate)
  return fn(text, pattern)
}
