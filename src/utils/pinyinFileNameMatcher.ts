import { match as matchPinyin } from 'pinyin-pro'
import type { FileInfo } from '@/types'

const log = console

export type FileNameMatchStrategy = 'name-prefix' | 'pinyin-prefix'

/** Immutable matching result with Unicode code-point highlight offsets. */
export interface FileNameMatch {
  file: FileInfo
  highlightIndices: number[]
  strategy: FileNameMatchStrategy
}

function codePointPrefixIndices(name: string, query: string): number[] | null {
  const nameChars = Array.from(name)
  const queryChars = Array.from(query)
  if (queryChars.length === 0 || queryChars.length > nameChars.length) return null

  const namePrefix = nameChars.slice(0, queryChars.length).join('').toLocaleLowerCase()
  return namePrefix === query.toLocaleLowerCase()
    ? queryChars.map((_, index) => index)
    : null
}

/** Direct names win over pinyin; pinyin-pro covers full pinyin and initials. */
export function matchFileName(file: FileInfo, query: string): FileNameMatch | null {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return null

  const directIndices = codePointPrefixIndices(file.name, normalizedQuery)
  if (directIndices) return { file, highlightIndices: directIndices, strategy: 'name-prefix' }

  let pinyinIndices: number[] | null
  try {
    pinyinIndices = matchPinyin(file.name, normalizedQuery, {
      precision: 'start',
      continuous: true,
      v: true
    })
  } catch (error) {
    log.warn('[PinyinFileNameMatcher] pinyin matching failed', { filePath: file.path, query: normalizedQuery, error })
    return null
  }
  if (!pinyinIndices || pinyinIndices.length === 0) return null
  return { file, highlightIndices: pinyinIndices, strategy: 'pinyin-prefix' }
}

export function findFileNameMatches(files: readonly FileInfo[], query: string): FileNameMatch[] {
  if (!query.trim()) return []
  return files.flatMap(file => {
    const result = matchFileName(file, query)
    return result ? [result] : []
  })
}
