import { defineStore } from 'pinia'
import type { ClipboardContentKind, ClipboardProbe } from '@shared/types'

const log = console

/** in-flight 探测去重：focus 与菜单打开相继触发时复用同一次 IPC。 */
let refreshInFlight: Promise<void> | null = null

/**
 * 系统剪贴板「可保存内容」探测缓存（「从剪贴板新建文件」）。
 *
 * 与 stores/clipboard.ts 职责不同：那个管应用内文件剪贴板（含 systemMirrored
 * 镜像标志），这里只缓存主进程 probeContent 的轻量结果，供右键菜单/工具栏
 * 下拉/命名对话框同步读取——菜单项是同步 computed，探针是异步 IPC，只能
 * 后台先行探测、缓存、变更时驱动菜单重算。
 *
 * 探测时机：App mounted 初始化 + window focus（用户从别的应用 ⌘C 后切回的
 * 准确信号）+ 菜单打开时兜底刷新（供下次使用）。判定优先级 files > image >
 * text 在主进程实现（防 Finder 复制文件时板上文件名文本误判）。
 */
export const useClipboardContentStore = defineStore('clipboardContent', {
  state: (): { probe: ClipboardProbe | null; lastProbedAt: number } => ({
    probe: null,
    lastProbedAt: 0
  }),

  getters: {
    /**
     * 菜单可见性判定：null（首次探测未回）按 none 处理——宁缺勿假。
     * 'files' 时新菜单项隐藏（该场景走既有「粘贴」）。
     */
    menuKind(state): ClipboardContentKind {
      return state.probe?.kind ?? 'none'
    },
    /** 探针结果（对话框预览数据源）。 */
    currentProbe(state): ClipboardProbe | null {
      return state.probe
    }
  },

  actions: {
    /**
     * 后台刷新探测缓存。2s 节流（focus 与菜单打开可能相继触发），
     * in-flight 去重防并发抖动；force 用于 focus 等强信号。
     */
    async refresh(force = false): Promise<void> {
      const now = Date.now()
      if (!force && now - this.lastProbedAt < 2000) return
      if (refreshInFlight) return refreshInFlight
      this.lastProbedAt = now
      refreshInFlight = (async () => {
        try {
          this.probe = await window.fileman.probeClipboardContent()
        } catch (e) {
          // 失败静默：保持上次缓存（或 null→按 none 处理），不打扰用户
          log.warn('[clipboardContent] probe failed:', (e as Error).message)
        } finally {
          refreshInFlight = null
        }
      })()
      return refreshInFlight
    }
  }
})
