import type {
  CompareEntry,
  CompareRule,
  CompareSideError,
  CompareStatus,
  ContentVerificationProgress,
  DirCompareCopyPlan,
  DirCompareCopyPlanItem,
  DirCompareFilter,
  FileInfo,
  VerificationState
} from '@/types'
import { t } from '@/i18n'

export interface CompareStats {
  metadataEqual: number
  contentEqual: number
  different: number
  leftOnly: number
  rightOnly: number
  failed: number
  total: number
  visible: number
  hidden: number
}

export interface DirectoryReadResult {
  files?: FileInfo[]
  error?: CompareSideError
}

export function determineQuickStatus(
  left: FileInfo | undefined,
  right: FileInfo | undefined,
  rule: CompareRule,
  hasReadError = false
): CompareStatus {
  if (hasReadError) return 'uncomparable'
  if (!left) return 'right-only'
  if (!right) return 'left-only'
  if (left.isDirectory !== right.isDirectory) return 'type-mismatch'
  if (left.isDirectory) return 'metadata-equal'
  if (rule === 'name') return 'metadata-equal'
  if (rule === 'size') return left.size === right.size ? 'metadata-equal' : 'different'

  const timeDifference = Math.abs(new Date(left.modifiedTime).getTime() - new Date(right.modifiedTime).getTime())
  if (timeDifference <= 2000) return left.size === right.size ? 'metadata-equal' : 'different'
  return new Date(left.modifiedTime).getTime() > new Date(right.modifiedTime).getTime()
    ? 'left-newer'
    : 'right-newer'
}

export function displayStatus(entry: CompareEntry): CompareStatus {
  if (entry.error) return 'verification-failed'
  switch (entry.verification?.status) {
    case 'queued':
    case 'verifying': return 'verifying'
    case 'content-equal': return 'content-equal'
    case 'content-different': return 'different'
    case 'failed': return 'verification-failed'
    default: return entry.status
  }
}

export function makeEntries(
  leftResult: DirectoryReadResult,
  rightResult: DirectoryReadResult,
  rule: CompareRule,
  depth: number,
  parentRelativePath: string
): CompareEntry[] {
  const leftMap = new Map((leftResult.files ?? []).map(file => [file.name, file]))
  const rightMap = new Map((rightResult.files ?? []).map(file => [file.name, file]))
  const names = new Set([...leftMap.keys(), ...rightMap.keys()])
  const hasReadError = Boolean(leftResult.error || rightResult.error)
  const entries: CompareEntry[] = [...names].map(name => {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    return {
      relativePath: parentRelativePath ? `${parentRelativePath}/${name}` : name,
      name,
      status: determineQuickStatus(left, right, rule, hasReadError),
      left,
      right,
      isDirectory: Boolean(left?.isDirectory || right?.isDirectory),
      expanded: false,
      depth,
      verification: { status: 'not-requested' }
    }
  })

  for (const error of [leftResult.error, rightResult.error]) {
    if (!error) continue
    entries.push({
      relativePath: `__compare_error__/${error.side}/${parentRelativePath || 'root'}`,
      name: error.side === 'left' ? t('compare.error.leftDirUnreadable') : t('compare.error.rightDirUnreadable'),
      status: 'verification-failed',
      isDirectory: false,
      expanded: false,
      depth,
      error,
      verification: { status: 'failed', message: error.message }
    })
  }
  return entries.sort(sortEntries)
}

export function sortEntries(a: CompareEntry, b: CompareEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

export function isDifference(entry: CompareEntry): boolean {
  return !['metadata-equal', 'content-equal'].includes(displayStatus(entry))
}

export function shouldShowEntry(entry: CompareEntry, filter: DirCompareFilter): boolean {
  const status = displayStatus(entry)
  if (entry.error || status === 'verification-failed' || status === 'uncomparable') return true
  if (entry.isDirectory) return true
  if (status === 'metadata-equal' || status === 'content-equal') return filter.showEqual
  if (status === 'left-only') return filter.showLeftOnly
  if (status === 'right-only') return filter.showRightOnly
  return filter.showDifferent
}

export function flattenEntries(entries: CompareEntry[], filter: DirCompareFilter): CompareEntry[] {
  return entries.flatMap(entry => {
    if (!shouldShowEntry(entry, filter)) return []
    return entry.isDirectory && entry.expanded && entry.children
      ? [entry, ...flattenEntries(entry.children, filter)]
      : [entry]
  })
}

export function computeStats(entries: CompareEntry[], visibleEntries: CompareEntry[]): CompareStats {
  const stats: CompareStats = {
    metadataEqual: 0, contentEqual: 0, different: 0, leftOnly: 0, rightOnly: 0,
    failed: 0, total: 0, visible: visibleEntries.filter(entry => !entry.isDirectory).length, hidden: 0
  }
  const walk = (list: CompareEntry[]) => list.forEach(entry => {
    if (!entry.isDirectory) {
      stats.total++
      switch (displayStatus(entry)) {
        case 'metadata-equal': stats.metadataEqual++; break
        case 'content-equal': stats.contentEqual++; break
        case 'left-only': stats.leftOnly++; break
        case 'right-only': stats.rightOnly++; break
        case 'verification-failed':
        case 'uncomparable': stats.failed++; break
        default: stats.different++
      }
    }
    if (entry.children) walk(entry.children)
  })
  walk(entries)
  stats.hidden = Math.max(0, stats.total - stats.visible)
  return stats
}

export function verificationCandidate(entry: CompareEntry): boolean {
  return !entry.isDirectory && !entry.error && Boolean(entry.left && entry.right) &&
    entry.left!.size === entry.right!.size && entry.verification?.status !== 'verifying'
}

export function applyVerificationProgress(entries: CompareEntry[], progress: ContentVerificationProgress): boolean {
  for (const entry of entries) {
    if (entry.relativePath === progress.relativePath) {
      entry.verification = { status: progress.status, taskId: progress.taskId, message: progress.message }
      return true
    }
    if (entry.children && applyVerificationProgress(entry.children, progress)) return true
  }
  return false
}

export function resetCancelledVerification(entries: CompareEntry[], taskId: string) {
  entries.forEach(entry => {
    if (entry.verification?.taskId === taskId && ['queued', 'verifying', 'cancelled'].includes(entry.verification.status)) {
      entry.verification = { status: 'not-requested' }
    }
    if (entry.children) resetCancelledVerification(entry.children, taskId)
  })
}

export function buildCopyPlan(input: {
  direction: DirCompareCopyPlan['direction']
  entries: CompareEntry[]
  visibleEntries: CompareEntry[]
  filterActive: boolean
  selectedPaths: Set<string>
  leftDeviceId: string
  leftRootPath: string
  rightDeviceId: string
  rightRootPath: string
  revision: number
}): DirCompareCopyPlan {
  const items: DirCompareCopyPlanItem[] = []
  const blockedItems: string[] = []
  const visiblePaths = new Set(input.visibleEntries.map(entry => entry.relativePath))
  const selected = flattenAll(input.entries)
    .filter(entry => visiblePaths.has(entry.relativePath) && input.selectedPaths.has(entry.relativePath))
  for (const entry of selected) {
    const source = input.direction === 'left-to-right' ? entry.left : entry.right
    if (!source || entry.error) continue
    if (entry.isDirectory && (!entry.children || input.filterActive)) {
      blockedItems.push(entry.relativePath)
      continue
    }
    const sourceDeviceId = input.direction === 'left-to-right' ? input.leftDeviceId : input.rightDeviceId
    const targetDeviceId = input.direction === 'left-to-right' ? input.rightDeviceId : input.leftDeviceId
    const targetRoot = input.direction === 'left-to-right' ? input.rightRootPath : input.leftRootPath
    items.push({
      relativePath: entry.relativePath,
      sourceDeviceId,
      sourcePath: source.path,
      targetDeviceId,
      targetDirectory: directoryForRelativePath(targetRoot, entry.relativePath),
      isDirectory: entry.isDirectory
    })
  }
  return { revision: input.revision, direction: input.direction, items, blockedItems, strategy: 'ask' }
}

function flattenAll(entries: CompareEntry[]): CompareEntry[] {
  return entries.flatMap(entry => [entry, ...(entry.children ? flattenAll(entry.children) : [])])
}

function directoryForRelativePath(root: string, relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? root : `${root}/${relativePath.slice(0, slash)}`
}

export function queuedVerification(): VerificationState {
  return { status: 'queued' }
}
