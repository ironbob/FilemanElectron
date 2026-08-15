/**
 * Text Filter Expression Engine - Match Predicates
 *
 * 10 predicate implementations:
 * - co(x)  : contains substring (case insensitive)
 * - CO(x)  : contains substring (case sensitive)
 * - eq(x)  : equals (case insensitive)
 * - EQ(x)  : equals (case sensitive)
 * - word(x): whole word match (case insensitive)
 * - WORD(x): whole word match (case sensitive)
 * - reg(x) : regex match (case insensitive)
 * - REG(x) : regex match (case sensitive)
 * - level(a,b): log level whole-word match via vocabulary (case insensitive)
 * - lines(n-m): source line number range, needs LineContext
 */

import { MatchPredicate, LineContext, LevelVocabulary } from './types'

/**
 * Evaluation context handed to predicates alongside (text, pattern).
 * Existing predicates ignore it; level() reads the vocabulary, lines() reads the line number.
 */
export interface PredicateContext {
  line?: LineContext
  levels?: LevelVocabulary
}

/**
 * Match function type
 */
export type MatchFunction = (text: string, pattern: string, ctx?: PredicateContext) => boolean

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
 * Built-in level vocabulary for level() (case-insensitive whole-word synonyms)
 */
export const DEFAULT_LEVEL_VOCABULARY: LevelVocabulary = {
  error: ['error', 'err', 'fatal', 'critical', 'severe', 'exception', 'panic'],
  warn: ['warn', 'warning', 'caution'],
  info: ['info', 'information', 'notice', 'log'],
  debug: ['debug', 'trace', 'verbose', 'finest', 'fine', 'finer'],
}

/**
 * Compiled level regex cache, keyed by the expanded synonym list.
 * Keeps per-line evaluation allocation-free for large files.
 */
const levelRegexCache = new Map<string, RegExp>()

/**
 * level(a,b,c) - matches when the line contains any synonym of the listed
 * levels as a whole word (case insensitive). Unknown level names match the
 * word itself so users can filter on custom levels without vocabulary setup.
 */
function levelMatch(text: string, pattern: string, ctx?: PredicateContext): boolean {
  const requested = pattern.split(',').map(w => w.trim().toLowerCase()).filter(w => w !== '')
  if (requested.length === 0) return false

  const vocabulary = { ...DEFAULT_LEVEL_VOCABULARY, ...ctx?.levels }
  const synonyms: string[] = []
  for (const name of requested) {
    const words = vocabulary[name]
    if (words !== undefined) {
      synonyms.push(...words.map(w => w.toLowerCase()))
    } else {
      synonyms.push(name)
    }
  }

  const cacheKey = synonyms.join('|')
  let regex = levelRegexCache.get(cacheKey)
  if (regex === undefined) {
    regex = new RegExp(`\\b(?:${synonyms.map(escapeRegex).join('|')})\\b`, 'i')
    if (levelRegexCache.size > 100) levelRegexCache.clear() // bound the cache
    levelRegexCache.set(cacheKey, regex)
  }
  return regex.test(text)
}

/**
 * lines(n) / lines(n-m) - matches when the source line number is in range.
 * Requires LineContext; without it the predicate is false (legacy callers
 * that only pass text are unaffected in behaviour for other predicates).
 */
function linesMatch(text: string, pattern: string, ctx?: PredicateContext): boolean {
  void text // line-range matching never inspects the text
  const lineNumber = ctx?.line?.lineNumber
  if (lineNumber === undefined) return false

  const dash = pattern.indexOf('-')
  if (dash === -1) {
    return lineNumber === Number(pattern)
  }
  return lineNumber >= Number(pattern.slice(0, dash)) && lineNumber <= Number(pattern.slice(dash + 1))
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
  REG: regexSensitive,
  level: levelMatch,
  lines: linesMatch
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
export function executePredicate(
  predicate: MatchPredicate,
  pattern: string,
  text: string,
  ctx?: PredicateContext
): boolean {
  const fn = getPredicateFunction(predicate)
  return fn(text, pattern, ctx)
}
