import { computed, nextTick, ref, type Ref } from 'vue'
import type {
  CompareEntry,
  CompareSideError,
  ContentVerificationPair,
  DirCompareSession,
  FileInfo
} from '@/types'
import {
  applyVerificationProgress,
  computeStats,
  flattenEntries,
  isDifference,
  makeEntries,
  queuedVerification,
  resetCancelledVerification,
  verificationCandidate,
  type DirectoryReadResult
} from './compareDomain'

const log = console

async function readDirectory(deviceId: string, path: string, side: 'left' | 'right'): Promise<DirectoryReadResult> {
  try {
    return { files: await window.fileman.listFiles(deviceId, path) }
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取目录失败'
    const detail: CompareSideError = { side, deviceId, path, message }
    log.warn('[DirCompare] Directory read failed', detail)
    return { error: detail }
  }
}

function resetVerification(entries: CompareEntry[]) {
  entries.forEach(entry => {
    entry.verification = { status: 'not-requested' }
    if (entry.children) resetVerification(entry.children)
  })
}

export function useDirCompare(session: Ref<DirCompareSession>) {
  const rootEntries = ref<CompareEntry[]>([])
  const isLoading = ref(false)
  const isVerifying = ref(false)
  const verificationProgress = ref({ completed: 0, total: 0 })
  const activeTaskId = ref<string | null>(null)
  const dataRevision = ref(0)
  const currentDiffIndex = ref(-1)

  const flatEntries = computed(() => flattenEntries(rootEntries.value, session.value.filter))
  const stats = computed(() => computeStats(rootEntries.value, flatEntries.value))
  const diffIndices = computed(() => flatEntries.value
    .map((entry, index) => isDifference(entry) ? index : -1)
    .filter(index => index >= 0))

  async function compareDirectories(
    leftDeviceId: string,
    leftPath: string | undefined,
    rightDeviceId: string,
    rightPath: string | undefined,
    depth: number,
    parentRelativePath: string
  ) {
    const [left, right] = await Promise.all([
      leftPath ? readDirectory(leftDeviceId, leftPath, 'left') : Promise.resolve({ files: [] as FileInfo[] }),
      rightPath ? readDirectory(rightDeviceId, rightPath, 'right') : Promise.resolve({ files: [] as FileInfo[] })
    ])
    return makeEntries(left, right, session.value.rule, depth, parentRelativePath)
  }

  async function refresh() {
    if (activeTaskId.value) await cancelVerification()
    isLoading.value = true
    log.info('[DirCompare] refreshing directories', { leftDeviceId: session.value.leftDeviceId, rightDeviceId: session.value.rightDeviceId })
    currentDiffIndex.value = -1
    let refreshed = false
    try {
      rootEntries.value = await compareDirectories(
        session.value.leftDeviceId, session.value.leftRootPath,
        session.value.rightDeviceId, session.value.rightRootPath, 0, ''
      )
      refreshed = true
    } finally {
      isLoading.value = false
    }
    if (refreshed) {
      // Let the virtual scroller mount with the new list before changing its key.
      await nextTick()
      dataRevision.value++
    }
  }

  async function toggleExpand(entry: CompareEntry) {
    if (!entry.isDirectory || entry.error) return
    if (entry.expanded) {
      entry.expanded = false
      return
    }
    if (!entry.children) {
      isLoading.value = true
      try {
        entry.children = await compareDirectories(
          session.value.leftDeviceId, entry.left?.path,
          session.value.rightDeviceId, entry.right?.path,
          entry.depth + 1, entry.relativePath
        )
      } finally {
        isLoading.value = false
      }
    }
    entry.expanded = true
  }

  function setExpanded(entries: CompareEntry[], value: boolean) {
    entries.forEach(entry => {
      if (entry.isDirectory) {
        entry.expanded = value
        if (entry.children) setExpanded(entry.children, value)
      }
    })
  }

  function expandAll() { setExpanded(rootEntries.value, true) }
  function collapseAll() { setExpanded(rootEntries.value, false) }

  function goNextDiff(scrollIntoView: (index: number) => void) {
    if (!diffIndices.value.length) return
    currentDiffIndex.value = diffIndices.value.find(index => index > currentDiffIndex.value) ?? diffIndices.value[0]
    scrollIntoView(currentDiffIndex.value)
  }

  function goPrevDiff(scrollIntoView: (index: number) => void) {
    if (!diffIndices.value.length) return
    currentDiffIndex.value = [...diffIndices.value].reverse().find(index => index < currentDiffIndex.value)
      ?? diffIndices.value[diffIndices.value.length - 1]
    scrollIntoView(currentDiffIndex.value)
  }

  async function verifyContent(entries: CompareEntry[]) {
    const pairs: ContentVerificationPair[] = entries
      .filter(verificationCandidate)
      .map(entry => ({
        relativePath: entry.relativePath,
        leftDeviceId: session.value.leftDeviceId,
        leftPath: entry.left!.path,
        leftSize: entry.left!.size,
        rightDeviceId: session.value.rightDeviceId,
        rightPath: entry.right!.path,
        rightSize: entry.right!.size
      }))
    if (!pairs.length) return
    entries.filter(verificationCandidate).forEach(entry => { entry.verification = queuedVerification() })
    const result = await window.fileman.startContentVerification({ sessionId: session.value.id, pairs })
    log.info('[DirCompare] content verification started', { taskId: result.taskId, pairCount: result.total })
    activeTaskId.value = result.taskId
    isVerifying.value = true
    verificationProgress.value = { completed: 0, total: result.total }
  }

  async function cancelVerification() {
    const taskId = activeTaskId.value
    if (!taskId) return
    await window.fileman.cancelContentVerification(taskId)
    log.info('[DirCompare] content verification cancelled', { taskId })
    resetCancelledVerification(rootEntries.value, taskId)
    activeTaskId.value = null
    isVerifying.value = false
  }

  const unsubscribeVerification = window.fileman.onContentVerificationProgress(progress => {
    if (progress.sessionId !== session.value.id) return
    applyVerificationProgress(rootEntries.value, progress)
    verificationProgress.value = { completed: progress.completed, total: progress.total }
    if (['content-equal', 'content-different', 'failed'].includes(progress.status) && progress.completed >= progress.total) {
      activeTaskId.value = null
      isVerifying.value = false
    }
  })

  function dispose() {
    unsubscribeVerification()
  }

  return {
    rootEntries, flatEntries, stats, isLoading, isVerifying, verificationProgress, dataRevision,
    refresh, toggleExpand, expandAll, collapseAll, goNextDiff, goPrevDiff, currentDiffIndex,
    verifyContent, cancelVerification, resetVerification, dispose
  }
}
