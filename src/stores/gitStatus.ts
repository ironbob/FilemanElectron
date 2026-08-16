import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import type { GitDirectoryStatus } from '@shared/types'

const log = (message: string, ...args: unknown[]) => {
  console.log(`[GitStatusStore] ${message}`, ...args)
}

/**
 * Git 状态徽标的渲染层缓存（只读）。
 *
 * 职责：按 (deviceId, dirPath) 缓存快照、在途去重、订阅 watch:changed
 * 失效重取（M1 watch 的回报点——IDE 保存后徽标即时变化）。
 * 非本地设备不查询；非仓库目录缓存负结果（主进程另有 30s 负缓存，
 * 双层避免导航时重复 exec）。
 *
 * 设计依据：fileBrowser store「presentation state only」惯例——本 store
 * 只持有查询结果与失效逻辑，I/O 经 window.fileman。
 */
export const useGitStatusStore = defineStore('gitStatus', () => {
  /** key = `${deviceId}:${dirPath}`。 */
  const cache = reactive(new Map<string, GitDirectoryStatus>())
  const inflight = new Map<string, Promise<void>>()

  function keyOf(deviceId: string, dirPath: string): string {
    return `${deviceId}:${dirPath}`
  }

  /** 触发一次（去重）查询；结果写入缓存。 */
  async function fetch(deviceId: string, dirPath: string): Promise<void> {
    if (deviceId !== 'local') return
    const key = keyOf(deviceId, dirPath)
    const existing = inflight.get(key)
    if (existing) return existing
    const promise = (async () => {
      try {
        const status = await window.fileman.getGitStatus(deviceId, dirPath)
        // 桥接异常/返回异常值时不写缓存（防止 undefined 毒化后续读取）
        if (status && typeof status.isRepo === 'boolean') {
          cache.set(key, status)
          if (status.isRepo) {
            log('repo status', { dirPath, branch: status.branch, entries: status.entries.length })
          }
        }
      } catch (error) {
        // 查询失败：不缓存（下次导航/事件重试），不抛出（徽标是旁路装饰）
        log('fetch failed', dirPath, error)
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, promise)
    return promise
  }

  /** 取当前快照（未查询过返回 undefined——调用方据此区分「无数据」与「非仓库」）。 */
  function statusFor(deviceId: string, dirPath: string): GitDirectoryStatus | undefined {
    if (deviceId !== 'local') return undefined
    return cache.get(keyOf(deviceId, dirPath))
  }

  /** 供 FileList 徽标查询：path → (x,y)。仅当该目录已确认是仓库时可用。 */
  const entryMapFor = (deviceId: string, dirPath: string): Map<string, { x: string; y: string }> | null => {
    const status = statusFor(deviceId, dirPath)
    if (!status?.isRepo) return null
    const map = new Map<string, { x: string; y: string }>()
    for (const entry of status.entries) {
      map.set(entry.path, { x: entry.x, y: entry.y })
    }
    return map
  }

  let unsubscribed = false
  let unsubscribeWatch: (() => void) | null = null

  /** 订阅目录变化：本地目录变化 → 失效受影响缓存并重取（面板所在目录）。 */
  function initialize(): void {
    if (unsubscribeWatch || unsubscribed) return
    unsubscribeWatch = window.fileman.onWatchChanged(event => {
      if (event.deviceId !== 'local') return
      const changed = event.dirPath
      for (const [key, status] of Array.from(cache)) {
        // 失效条件：变化目录本身被缓存，或变化发生在某已缓存仓库的范围内
        // （仓库任一位置的变化都可能影响徽标集合与 ahead/behind）。
        const belongs = key.endsWith(':' + changed) ||
          (status?.isRepo === true && status.repoRoot !== undefined && (changed + '/').startsWith(status.repoRoot + '/'))
        if (belongs) {
          cache.delete(key)
          // 重取被缓存的面板目录（key 去掉 deviceId: 前缀），而非变化目录
          const deviceId = key.slice(0, key.lastIndexOf(':'))
          const dirPath = key.slice(deviceId.length + 1)
          void fetch(deviceId, dirPath)
        }
      }
    })
  }

  function shutdown(): void {
    unsubscribeWatch?.()
    unsubscribeWatch = null
    unsubscribed = true
  }

  const cachedCount = computed(() => cache.size)

  return { fetch, statusFor, entryMapFor, initialize, shutdown, cachedCount }
})
