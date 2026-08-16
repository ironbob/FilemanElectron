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

  /**
   * 打开（或复用）文件夹图片集合预览 tab。按 collectionKey 去重：
   * 重复打开同目录同模式时就地刷新列表（目录内容可能已变化）并激活。
   */
  function openImageCollection(deviceId: string, files: FileInfo[], collectionKey: string): Tab {
    const tabsStore = useTabsStore()
    if (files.length === 0) throw new Error('openImageCollection requires a non-empty file list')

    const existing = tabsStore.tabs.find(t => t.preview?.collectionKey === collectionKey)
    if (existing?.preview) {
      existing.preview.files = files
      existing.preview.index = 0
      existing.preview.file = files[0]
      existing.title = files[0].name
      tabsStore.setActiveTab(existing.id)
      log('Image collection already open, refreshed:', collectionKey, files.length, 'images')
      return existing
    }

    const tab: Tab = {
      id: generateId(),
      title: files[0].name,
      panes: [],
      activePaneId: '',
      preview: {
        id: generateId(),
        file: files[0],
        deviceId,
        type: 'image',
        files,
        index: 0,
        collectionKey
      }
    }
    tabsStore.tabs.push(tab)
    tabsStore.activeTabId = tab.id
    log('Opened image collection tab:', tab.id, collectionKey, files.length, 'images')
    return tab
  }

  /** 集合步进（clamp 不循环，与 QuickLook 一致）：同步 file/index 与 tab 标题。 */
  function stepImageCollection(sessionId: string, delta: number) {
    const tabsStore = useTabsStore()
    const tab = tabsStore.tabs.find(t => t.preview?.id === sessionId)
    const session = tab?.preview
    if (!tab || !session?.files?.length) return
    const next = Math.max(0, Math.min((session.index ?? 0) + delta, session.files.length - 1))
    if (next === session.index) return
    session.index = next
    session.file = session.files[next]
    tab.title = session.files[next].name
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
    openImageCollection,
    stepImageCollection,
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
