import { ref, computed, type Ref } from 'vue'
import type { FileInfo, CompareEntry, CompareStatus, DirCompareFilter, DirCompareSession, CompareRule } from '@/types'

// ── Sorting helper ────────────────────────────────────────────────────────────

function sortEntries(entries: CompareEntry[]) {
  entries.sort((a, b) => {
    // Directories first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

// ── Status determination ──────────────────────────────────────────────────────

function determineStatus(
  left: FileInfo | undefined,
  right: FileInfo | undefined,
  rule: CompareRule
): CompareStatus {
  if (!left) return 'right-only'
  if (!right) return 'left-only'

  // Both exist — directories get 'equal' at this stage (refined after child scan)
  if (left.isDirectory && right.isDirectory) return 'equal'

  switch (rule) {
    case 'name':
      return 'equal'

    case 'size':
      return left.size === right.size ? 'equal' : 'different'

    case 'timestamp': {
      const lt = new Date(left.modifiedTime).getTime()
      const rt = new Date(right.modifiedTime).getTime()
      const timeDiff = Math.abs(lt - rt)
      // Treat ≤2 s difference as equal (FAT32 / cross-fs timestamp rounding)
      if (timeDiff <= 2000) {
        return left.size === right.size ? 'equal' : 'different'
      }
      return lt > rt ? 'left-newer' : 'right-newer'
    }
  }
}

// ── Core compare algorithm ────────────────────────────────────────────────────

async function compareDirectories(
  deviceId: string,
  leftPath: string,
  rightPath: string,
  rule: CompareRule,
  depth: number,
  parentRelPath: string
): Promise<CompareEntry[]> {
  const [leftFiles, rightFiles] = await Promise.all([
    window.fileman.listFiles(deviceId, leftPath).catch(() => [] as FileInfo[]),
    window.fileman.listFiles(deviceId, rightPath).catch(() => [] as FileInfo[])
  ])

  const leftMap = new Map<string, FileInfo>()
  for (const f of leftFiles) leftMap.set(f.name, f)

  const rightMap = new Map<string, FileInfo>()
  for (const f of rightFiles) rightMap.set(f.name, f)

  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])

  const entries: CompareEntry[] = []
  for (const name of allNames) {
    const left = leftMap.get(name)
    const right = rightMap.get(name)
    const isDirectory = !!(left?.isDirectory || right?.isDirectory)
    const relativePath = parentRelPath ? `${parentRelPath}/${name}` : name

    entries.push({
      relativePath,
      name,
      status: determineStatus(left, right, rule),
      left,
      right,
      isDirectory,
      expanded: false,
      depth,
      children: undefined
    })
  }

  sortEntries(entries)
  return entries
}

// ── Stats helper ──────────────────────────────────────────────────────────────

export interface CompareStats {
  equal: number
  different: number
  leftOnly: number
  rightOnly: number
  total: number
}

function computeStats(entries: CompareEntry[]): CompareStats {
  const stats: CompareStats = { equal: 0, different: 0, leftOnly: 0, rightOnly: 0, total: 0 }

  function walk(list: CompareEntry[]) {
    for (const entry of list) {
      if (!entry.isDirectory) {
        stats.total++
        switch (entry.status) {
          case 'equal':       stats.equal++;     break
          case 'different':
          case 'left-newer':
          case 'right-newer': stats.different++; break
          case 'left-only':   stats.leftOnly++;  break
          case 'right-only':  stats.rightOnly++; break
        }
      }
      if (entry.children) walk(entry.children)
    }
  }

  walk(entries)
  return stats
}

// ── Filter helper ─────────────────────────────────────────────────────────────

function shouldShowEntry(entry: CompareEntry, filter: DirCompareFilter): boolean {
  if (entry.isDirectory) return true // always show dirs (they may have visible children)
  switch (entry.status) {
    case 'equal':
      return filter.showEqual
    case 'different':
    case 'left-newer':
    case 'right-newer':
      return filter.showDifferent
    case 'left-only':
      return filter.showLeftOnly
    case 'right-only':
      return filter.showRightOnly
  }
}

function flattenEntries(entries: CompareEntry[], filter: DirCompareFilter): CompareEntry[] {
  const result: CompareEntry[] = []
  for (const entry of entries) {
    if (!shouldShowEntry(entry, filter)) continue
    result.push(entry)
    if (entry.isDirectory && entry.expanded && entry.children) {
      result.push(...flattenEntries(entry.children, filter))
    }
  }
  return result
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useDirCompare(session: Ref<DirCompareSession>) {
  const rootEntries = ref<CompareEntry[]>([])
  const isLoading = ref(false)

  const stats = computed<CompareStats>(() => computeStats(rootEntries.value))

  const flatEntries = computed<CompareEntry[]>(() =>
    flattenEntries(rootEntries.value, session.value.filter)
  )

  // ── Navigation: next/prev diff ──────────────────────────────────────────────

  const currentDiffIndex = ref(-1)

  const diffIndices = computed(() => {
    const indices: number[] = []
    const flat = flatEntries.value
    for (let i = 0; i < flat.length; i++) {
      if (flat[i].status !== 'equal') indices.push(i)
    }
    return indices
  })

  function goNextDiff(scrollIntoView: (index: number) => void) {
    if (diffIndices.value.length === 0) return
    const next = diffIndices.value.find(i => i > currentDiffIndex.value)
    currentDiffIndex.value = next ?? diffIndices.value[0]
    scrollIntoView(currentDiffIndex.value)
  }

  function goPrevDiff(scrollIntoView: (index: number) => void) {
    if (diffIndices.value.length === 0) return
    const prev = [...diffIndices.value].reverse().find(i => i < currentDiffIndex.value)
    currentDiffIndex.value = prev ?? diffIndices.value[diffIndices.value.length - 1]
    scrollIntoView(currentDiffIndex.value)
  }

  // ── Load / refresh ──────────────────────────────────────────────────────────

  async function refresh() {
    isLoading.value = true
    currentDiffIndex.value = -1
    try {
      rootEntries.value = await compareDirectories(
        session.value.leftDeviceId,
        session.value.leftRootPath,
        session.value.rightRootPath,
        session.value.rule,
        0,
        ''
      )
    } finally {
      isLoading.value = false
    }
  }

  // ── Expand / collapse ───────────────────────────────────────────────────────

  async function toggleExpand(entry: CompareEntry) {
    if (!entry.isDirectory) return

    if (entry.expanded) {
      entry.expanded = false
      return
    }

    // Load children if not yet loaded
    if (!entry.children) {
      isLoading.value = true
      try {
        const leftChildPath = entry.left?.path
          ?? `${session.value.leftRootPath}/${entry.relativePath}`
        const rightChildPath = entry.right?.path
          ?? `${session.value.rightRootPath}/${entry.relativePath}`

        entry.children = await compareDirectories(
          session.value.leftDeviceId,
          leftChildPath,
          rightChildPath,
          session.value.rule,
          entry.depth + 1,
          entry.relativePath
        )
      } finally {
        isLoading.value = false
      }
    }

    entry.expanded = true
  }

  function _setExpandedRecursive(entries: CompareEntry[], value: boolean) {
    for (const entry of entries) {
      if (entry.isDirectory) {
        entry.expanded = value
        if (entry.children) _setExpandedRecursive(entry.children, value)
      }
    }
  }

  function expandAll() { _setExpandedRecursive(rootEntries.value, true) }
  function collapseAll() { _setExpandedRecursive(rootEntries.value, false) }

  return {
    rootEntries,
    isLoading,
    stats,
    flatEntries,
    diffIndices,
    currentDiffIndex,
    refresh,
    toggleExpand,
    expandAll,
    collapseAll,
    goNextDiff,
    goPrevDiff
  }
}
