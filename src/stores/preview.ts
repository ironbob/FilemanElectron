import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { FileInfo, Tab } from '@/types'
import { useTabsStore } from './tabs'
import type { ImageBrowserSession, QuickLookSession } from '@/types/preview'
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

  // ── Image browser session ─────────────────────────────────────────────────
  // Folder-aware, decoupled from the per-file tab system. Per-image load state
  // (blobUrl/loading/error/EXIF/transforms) lives in the useImageBrowser
  // composable; this only holds the stable browsing identity so prev/next just
  // swap the index — no tab pile-up. Reassign .value (shallow) to notify.
  const imageBrowser = shallowRef<ImageBrowserSession | null>(null)
  const imageBrowserOpen = ref(false)
  const imageBrowserCurrent = computed<FileInfo | null>(
    () => (imageBrowser.value && imageBrowser.value.images[imageBrowser.value.index]) || null
  )

  function openImageBrowser(file: FileInfo, deviceId: string, images: FileInfo[]) {
    const imageFiles = images.filter(f => !f.isDirectory && getPreviewType(f) === 'image')
    const list = imageFiles.length > 0 ? imageFiles : [file]
    const idx = Math.max(0, list.findIndex(f => f.path === file.path))
    imageBrowser.value = { deviceId, images: list, index: idx }
    imageBrowserOpen.value = true
    log('Opened image browser:', list.length, 'images, index', idx)
  }

  function nextImage() {
    const s = imageBrowser.value
    if (s && s.index < s.images.length - 1) {
      imageBrowser.value = { ...s, index: s.index + 1 }
    }
  }

  function prevImage() {
    const s = imageBrowser.value
    if (s && s.index > 0) {
      imageBrowser.value = { ...s, index: s.index - 1 }
    }
  }

  function goToImage(index: number) {
    const s = imageBrowser.value
    if (!s) return
    const clamped = Math.max(0, Math.min(index, s.images.length - 1))
    imageBrowser.value = { ...s, index: clamped }
  }

  function closeImageBrowser() {
    // Blob cleanup is owned by useImageBrowser (current blobUrl + preload
    // cache); it revokes them on unmount when imageBrowserOpen flips to false.
    imageBrowser.value = null
    imageBrowserOpen.value = false
    log('Closed image browser')
  }

  // ── Quick Look session（空格键瞬态预览） ─────────────────────────────────────
  // 仿 imageBrowser 模式：与 preview tab 系统解耦，↑↓ 只换 index，
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
   * 按 path + deviceId 去重；重复打开只切换激活。
   */
  function openPreview(file: FileInfo, deviceId: string): Tab {
    const tabsStore = useTabsStore()

    const existing = tabsStore.tabs.find(
      t => t.preview && t.preview.file.path === file.path && t.preview.deviceId === deviceId
    )
    if (existing) {
      log('Preview already open, activating tab:', existing.id)
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
        type: getPreviewType(file)
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

  // Open inline preview in full panel
  function openInlineInFullPreview() {
    if (inlinePreviewFile.value) {
      log('Opening inline preview in full panel:', inlinePreviewFile.value.name)
      openPreview(inlinePreviewFile.value, inlinePreviewDeviceId.value)
    } else {
      log('No inline preview to open')
    }
  }

  return {
    inlinePreviewFile,
    inlinePreviewDeviceId,
    openPreview,
    setInlinePreview,
    clearInlinePreview,
    openInlineInFullPreview,
    imageBrowser,
    imageBrowserOpen,
    imageBrowserCurrent,
    openImageBrowser,
    nextImage,
    prevImage,
    goToImage,
    closeImageBrowser,
    quickLook,
    quickLookOpen,
    quickLookFile,
    openQuickLook,
    stepQuickLook,
    closeQuickLook,
  }
})
