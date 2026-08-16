import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { FileInfo, Tab } from '@/types'
import { useTabsStore } from './tabs'
import type { QuickLookSession, PreviewType } from '@/types/preview'
import { getPreviewType } from '@/types/preview'
import { sniffPreviewKind, SNIFF_HEADER_BYTES, type FilePreviewKind } from '@shared/fileKinds'
import type { EditApplyResult } from '@shared/types'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewStore] ${message}`, ...args)
}

/**
 * 内容嗅探缓存：`${deviceId}|${path}|${size}|${mtime}` → kind。
 * 8KB 头部只读一次；同文件再次双击 / 远程列表刷新后命中缓存。
 */
const sniffCache = new Map<string, FilePreviewKind>()

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
   * unknown 类型的嗅探细化：读头部 8KB（readChunk）走 sniffPreviewKind 魔数判定，
   * 就地更新 tab.preview.type（router 响应式切换内容组件）。失败兜底 hex——
   * "Cannot preview this file type" 从此只是嗅探期间的瞬态。
   */
  async function refineUnknownType(tab: Tab, file: FileInfo, deviceId: string): Promise<void> {
    const cacheKey = `${deviceId}|${file.path}|${file.size}|${file.modifiedTime}`
    let kind = sniffCache.get(cacheKey)
    if (kind === undefined) {
      try {
        const chunk = await window.fileman.readChunk(deviceId, file.path, 0, SNIFF_HEADER_BYTES)
        const bin = atob(chunk.base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        kind = sniffPreviewKind(bytes) ?? 'hex'
      } catch (err) {
        log('Sniff read failed, fallback hex:', file.name, err)
        kind = 'hex'
      }
      sniffCache.set(cacheKey, kind)
    }
    // 仅当仍是 unknown 且无 forceType 时细化（用户可能已显式指定打开方式）
    if (tab.preview && !tab.preview.forceType && tab.preview.type === 'unknown') {
      tab.preview.type = kind
      log('Sniff refined:', file.name, '→', kind)
    }
  }

  /**
   * 在主 tab 栏打开（或激活已有的）文件预览 tab。
   * 按 path + deviceId 去重；重复打开只切换激活。显式 forceType（如
   * 「以十六进制查看」）会就地更新已有 tab 的强制类型——用户此刻点名
   * 要 hex，不能复用旧的文本预览。
   * unknown 类型（未注册扩展名/无扩展名）由 refineUnknownType 异步嗅探细化。
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
      } else if (existing.preview?.type === 'unknown') {
        void refineUnknownType(existing, file, deviceId)
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
    if (tab.preview?.type === 'unknown') {
      void refineUnknownType(tab, file, deviceId)
    }
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

  // ── 编辑结果同步（IFC-7：会话与磁盘一致性由本 store 单点维护） ────────────────

  /**
   * 单图编辑落盘后同步会话：file 替换为新对象（path/size 变化触发内容组件重载，
   * 覆盖模式 path 不变但 size/mtime 变化同样触发）；集合中对应项一并替换。
   */
  function applyEditResult(sessionId: string | undefined, sourcePath: string, result: EditApplyResult) {
    const tabsStore = useTabsStore()
    const tab = sessionId
      ? tabsStore.tabs.find(t => t.preview?.id === sessionId)
      : tabsStore.tabs.find(t => t.preview?.file.path === sourcePath)
    const session = tab?.preview
    if (!tab || !session) return

    const rebuilt: FileInfo = {
      ...session.file,
      path: result.writtenPath,
      name: result.writtenPath.split('/').pop() || session.file.name,
      size: result.bytes,
      modifiedTime: new Date().toISOString()
    }
    session.file = rebuilt
    if (session.files?.length) {
      const idx = session.files.findIndex(f => f.path === sourcePath)
      if (idx >= 0) session.files[idx] = rebuilt
    }
    tab.title = rebuilt.name
    console.info('[PreviewStore] Applied edit result to session:', sessionId || tab.id, rebuilt.path)
  }

  /**
   * 批量改名完成后按映射同步集合列表：路径/名称替换，index 指向修正为当前
   * 文件的新路径（不变量：files[index] === file 保持）。
   */
  function applyRenameMapping(sessionId: string, items: Array<{ sourcePath: string; newName: string }>) {
    const tabsStore = useTabsStore()
    const tab = tabsStore.tabs.find(t => t.preview?.id === sessionId)
    const session = tab?.preview
    if (!tab || !session?.files?.length) return

    const mapping = new Map(items.map(item => [item.sourcePath, item.newName]))
    let currentName: string | null = null
    session.files = session.files.map(file => {
      const newName = mapping.get(file.path)
      if (!newName) return file
      const dir = file.path.slice(0, file.path.lastIndexOf('/')) || '/'
      if (session.file.path === file.path) currentName = newName
      return { ...file, path: `${dir}/${newName}`, name: newName }
    })
    const current = session.files[session.index ?? 0]
    if (current) {
      session.file = current
      tab.title = current.name
    }
    console.info('[PreviewStore] Applied rename mapping to session:', sessionId, 'items:', mapping.size, 'current:', currentName)
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
    applyEditResult,
    applyRenameMapping,
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
