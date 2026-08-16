import { computed, ref, watch } from 'vue'
import type { GrepMatch, GrepProgress } from '@shared/types'
import { useLongTaskProgress } from '@/composables/useLongTaskProgress'
import { t } from '@/i18n'

/**
 * 内容搜索会话状态（useDuplicates 同款配方）。
 *
 * matches 为增量批量累加（searching 事件批量推送），终态只改状态位；
 * 分组视图（按文件折叠）由 computed 从平铺 matches 派生。
 */
export function useGrepSearch(session: { id: string; deviceId: string; rootPath: string }) {
  const sessionId = `grep-${session.id}`
  const matches = ref<GrepMatch[]>([])
  const truncated = ref(false)
  const message = ref<string | null>(null)

  const { progress, isRunning, start, cancel } = useLongTaskProgress<
    Parameters<typeof window.fileman.startGrep>[0],
    GrepProgress
  >({
    start: request => window.fileman.startGrep(request),
    cancel: taskId => window.fileman.cancelGrep(taskId),
    subscribe: callback => window.fileman.onGrepProgress(callback)
  })

  // 增量累加：每批 matches append（去重不必要——主进程单流顺序产出）
  let seenTerminal = false
  watch(progress, event => {
    if (!event || seenTerminal) return
    if (event.matches.length > 0 && event.status === 'searching') {
      matches.value = matches.value.concat(event.matches)
    }
    if (event.status === 'completed') {
      truncated.value = event.truncated === true
      message.value = null
      seenTerminal = true
    } else if (event.status === 'failed') {
      message.value = event.message ?? t('grep.failed')
      seenTerminal = true
    } else if (event.status === 'cancelled') {
      message.value = t('grep.cancelled')
      seenTerminal = true
    }
  })

  async function run(options: { pattern: string; isRegex: boolean; caseSensitive: boolean; includeGlob?: string; excludeGlob?: string }): Promise<void> {
    matches.value = []
    truncated.value = false
    message.value = null
    seenTerminal = false
    await start({
      sessionId,
      deviceId: session.deviceId,
      rootPath: session.rootPath,
      pattern: options.pattern,
      isRegex: options.isRegex,
      caseSensitive: options.caseSensitive,
      includeGlob: options.includeGlob || undefined,
      excludeGlob: options.excludeGlob || undefined
    })
  }

  /** 按文件分组（保持主进程产出顺序）。 */
  const groupedMatches = computed(() => {
    const groups: Array<{ path: string; matches: GrepMatch[] }> = []
    const byPath = new Map<string, { path: string; matches: GrepMatch[] }>()
    for (const match of matches.value) {
      let group = byPath.get(match.path)
      if (!group) {
        group = { path: match.path, matches: [] }
        byPath.set(match.path, group)
        groups.push(group)
      }
      group.matches.push(match)
    }
    return groups
  })

  const fileCount = computed(() => groupedMatches.value.length)

  return {
    progress, isRunning, matches, groupedMatches, fileCount, truncated, message,
    run, cancel
  }
}
