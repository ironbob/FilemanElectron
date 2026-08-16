import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { FileInfo, Tab } from '@/types'
import { useTabsStore } from './tabs'
import type { QuickLookSession, PreviewType } from '@/types/preview'
import { getPreviewType } from '@/types/preview'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewStore] ${message}`, ...args)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export const usePreviewStore = defineStore('preview', () => {
  // ── 预览 tab：统一挂在主 tabs store 的 Tab.preview 上 ────────────────────────
  // 本 store 只是服务层：负责创建/去重，tab 生命周期（关闭、激活、持久化剥离）
  // 全部由 tabs store 拥有。内容加载/清理由各 Preview*Content 组件自行管理。

  // Inline preview state
  const inlinePreviewFile = ref<FileInfo | null>(null)
  const inlinePreviewDeviceId = ref<string>('local')

  // ── Quick Look session（空格键瞬态预览） ─────────────────────────────────────
  // 与 preview tab 系统解耦，↑↓ 只换 index，
  // 内容加载/清理由各 Preview*Content 自行管理。
  const quickLook = shallowRef<QuickLookSession | null>(null)
  const quickLookOpen = ref(false)
  const quickLookFile = computed<FileInfo | null>(
    () => (quickLook.value && quickLook.value.files[quickLook.value.index]) || null
  )

  function openQuickLook(file: FileInfo, deviceId: string, paneId: string, files: FileInfo[]) {
    const idx = files.findIndex(f => f.path === file.path)
    const list = files.length > 0 ? files : [file]
    quickLook.value = { paneId, deviceId, files: list, index: Math.max(0, idx) }
    quickLookOpen.value = true
    log('Opened quick look:', file.name, 'of', list.length, 'items')
  }

  function stepQuickLook(delta: number) {
    const s = quickLook.value
    if (!s) return
    const next = Math.max(0, Math.min(s.index + delta, s.files.length - 1))
    if (next !== s.index) {
      quickLook.value = { ...s, index: next }
    }
  }

  function closeQuickLook() {
    quickLook.value = null
    quickLookOpen.value = false
    log('Closed quick look')
  }

  /**
   * 在主 tab 栏打开（或激活已有的）文件预览 tab。
   * 按 path + deviceId 去重；重复打开只切换激活。显式 forceType（如
   * 「以十六进制查看」）会就地更新已有 tab 的强制类型——用户此刻点名
   * 要 hex，不能复用旧的文本预览。
   */
  function openPreview(file: FileInfo, deviceId: string, initialLine?: number, forceType?: PreviewType): Tab {
    const tabsStore = useTabsStore()

    const existing = tabsStore.tabs.find(
      t => t.preview && t.preview.file.path === file.path && t.preview.deviceId === deviceId
    )
    if (existing) {
      log('Preview already open, activating tab:', existing.id)
      if (forceType && existing.preview) {
        existing.preview.forceType = forceType
        existing.preview.type = forceType
      }
      tabsStore.setActiveTab(existing.id)
      return existing
    }

    const tab: Tab = {
      id: generateId(),
      title: file.name,
      panes: [],
      activePaneId: '',
      preview: {
        id: generateId(),
        file,
        deviceId,
        type: forceType ?? getPreviewType(file),
        initialLine,
        forceType
      }
    }
    tabsStore.tabs.push(tab)
    tabsStore.activeTabId = tab.id
    log('Opened preview tab:', tab.id, file.name, 'deviceId:', deviceId)
    return tab
  }

  // Inline preview methods
  function setInlinePreview(file: FileInfo | null, deviceId: string = 'local') {
    if (file) {
      log('Setting inline preview:', file.name, 'deviceId:', deviceId)
    } else {
      log('Clearing inline preview')
    }
    inlinePreviewFile.value = file
    inlinePreviewDeviceId.value = deviceId
  }

  function clearInlinePreview() {
    log('Clearing inline preview')
    inlinePreviewFile.value = null
  }

  return {
    inlinePreviewFile,
    inlinePreviewDeviceId,
    openPreview,
    setInlinePreview,
    clearInlinePreview,
    quickLook,
    quickLookOpen,
    quickLookFile,
    openQuickLook,
    stepQuickLook,
    closeQuickLook,
  }
})
