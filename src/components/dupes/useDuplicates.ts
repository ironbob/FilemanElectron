import { computed, ref, watch } from 'vue'
import type { DuplicateGroup, DuplicateScanProgress } from '@shared/types'
import { useLongTaskProgress } from '@/composables/useLongTaskProgress'
import { t } from '@/i18n'

/**
 * 重复文件查找的会话状态（useDirCompare 配方：composable 持有运行会话，
 * store 只放持久库——本功能无持久库）。
 *
 * 职责：驱动 start/cancel、接收节流进度与终态 groups、维护分组/勾选
 * 展示状态。删除动作由视图经 fileOperations store 发起，本 composable
 * 不拥有删除语义。
 */
export function useDuplicates(session: { id: string; deviceId: string; rootPath: string; minSize: number }) {
  const sessionId = `dupes-${session.id}`
  const groups = ref<DuplicateGroup[]>([])
  const truncated = ref(false)
  const checkedPaths = ref(new Set<string>())
  const message = ref<string | null>(null)

  const { progress, isRunning, start, cancel } = useLongTaskProgress<
    Parameters<typeof window.fileman.startDuplicateScan>[0],
    DuplicateScanProgress
  >({
    start: request => window.fileman.startDuplicateScan(request),
    cancel: taskId => window.fileman.cancelDuplicateScan(taskId),
    subscribe: callback => window.fileman.onDuplicateScanProgress(callback)
  })

  // 进度到达时抽取终态载荷（groups 只随 completed 携带）
  watch(progress, event => {
    if (!event) return
    if (event.status === 'completed') {
      groups.value = event.groups ?? []
      truncated.value = event.truncated === true
      message.value = null
    } else if (event.status === 'failed') {
      message.value = event.message ?? t('dupes.scanFailed')
    } else if (event.status === 'cancelled') {
      message.value = t('dupes.cancelled')
    }
  })

  async function run(): Promise<void> {
    groups.value = []
    truncated.value = false
    checkedPaths.value = new Set()
    message.value = null
    await start({ sessionId, deviceId: session.deviceId, rootPath: session.rootPath, minSize: session.minSize })
  }

  /** 组内「保留最新」之外的其它文件全部勾选（批量清理最常用姿态）。 */
  function selectDuplicatesOlderThanNewest(): void {
    const next = new Set<string>()
    for (const group of groups.value) {
      const sorted = [...group.files].sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime))
      for (const file of sorted.slice(1)) next.add(file.path)
    }
    checkedPaths.value = next
  }

  function clearSelection(): void {
    checkedPaths.value = new Set()
  }

  const checkedList = computed(() => Array.from(checkedPaths.value))

  const wastedBytes = computed(() => {
    let total = 0
    for (const group of groups.value) {
      total += group.size * (group.files.length - 1)
    }
    return total
  })

  const phaseLabel = computed(() => {
    const p = progress.value
    if (!p) return ''
    switch (p.status) {
      case 'scanning': return t('dupes.phase.scanning', p.fileCount)
      case 'partial-hashing': return t('dupes.phase.partialHashing', p.candidateCount)
      case 'full-hashing': return t('dupes.phase.fullHashing', p.candidateCount)
      case 'completed': return t('dupes.phase.completed', p.groupCount)
      case 'cancelled': return t('dupes.cancelled')
      case 'failed': return t('dupes.phase.failed', { message: p.message ?? '' })
    }
  })

  return {
    progress, isRunning, groups, truncated, checkedPaths, checkedList, message,
    wastedBytes, phaseLabel, run, cancel,
    selectDuplicatesOlderThanNewest, clearSelection
  }
}
