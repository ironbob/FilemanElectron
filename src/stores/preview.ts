import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileInfo } from '@/types'
import type { PreviewTab, PreviewType } from '@/types/preview'
import { getPreviewType, getMimeType } from '@/types/preview'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewStore] ${message}`, ...args)
}

// File size limits
const FILE_SIZE_LIMITS = {
  text: 10 * 1024 * 1024,  // 10MB for text files
  image: 50 * 1024 * 1024, // 50MB for images
  video: 500 * 1024 * 1024, // 500MB for videos
  audio: 100 * 1024 * 1024, // 100MB for audio
  pdf: 100 * 1024 * 1024,   // 100MB for PDFs
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function checkFileSize(file: FileInfo, type: PreviewType): { allowed: boolean; limit: string } {
  const limit = FILE_SIZE_LIMITS[type as keyof typeof FILE_SIZE_LIMITS] || FILE_SIZE_LIMITS.text
  const allowed = file.size <= limit
  return { allowed, limit: formatSize(limit) }
}

export const usePreviewStore = defineStore('preview', () => {
  const isOpen = ref(false)
  const tabs = ref<PreviewTab[]>([])
  const activeTabId = ref<string | null>(null)
  const panelHeight = ref(400)
  const isResizing = ref(false)
  const previewWidth = ref(500)
  const isFullscreen = ref(false)

  // Inline preview state
  const inlinePreviewFile = ref<FileInfo | null>(null)
  const inlinePreviewDeviceId = ref<string>('local')

  const activeTab = computed(() => {
    if (!activeTabId.value) return null
    return tabs.value.find(t => t.id === activeTabId.value) || null
  })

  function openPreview(file: FileInfo, deviceId: string) {
    log('Opening preview for file:', file.name, 'type:', file.extension, 'deviceId:', deviceId)

    const type = getPreviewType(file)
    log('Detected preview type:', type)

    // Check file size
    const sizeCheck = checkFileSize(file, type)
    if (!sizeCheck.allowed) {
      log('File size exceeds limit:', formatSize(file.size), '> ', sizeCheck.limit)
    }

    // Check if file is already open in a tab
    const existingTab = tabs.value.find(
      t => t.file.path === file.path && t.deviceId === deviceId
    )

    if (existingTab) {
      log('File already open in tab, activating:', existingTab.id)
      activeTabId.value = existingTab.id
      isOpen.value = true
      return existingTab
    }

    // Create new tab
    const tab: PreviewTab = {
      id: generateId(),
      file,
      deviceId,
      type,
    }

    log('Creating new tab:', tab.id)
    tabs.value.push(tab)
    activeTabId.value = tab.id
    isOpen.value = true

    // Load content based on type
    loadTabContent(tab)

    return tab
  }

  async function loadTabContent(tab: PreviewTab) {
    log('Loading content for tab:', tab.id, 'type:', tab.type)

    // Text files are loaded directly by PreviewTextContent; skip binary read here.
    if (tab.type === 'text') {
      log('Skipping store read for text tab — PreviewTextContent handles it')
      return
    }

    try {
      log('Reading file:', tab.file.path, 'from device:', tab.deviceId)
      const base64 = await window.fileman.readFile(tab.deviceId, tab.file.path)
      log('File read successfully, base64 length:', base64.length)

      const buffer = base64ToArrayBuffer(base64)
      log('Buffer size:', buffer.byteLength, 'bytes')

      if (tab.type === 'image') {
        const blob = new Blob([buffer], { type: getMimeType(tab.file.extension || '') })
        tab.blobUrl = URL.createObjectURL(blob)
        log('Image blob URL created:', tab.blobUrl)
      } else if (tab.type === 'video' || tab.type === 'audio') {
        const blob = new Blob([buffer], { type: getMimeType(tab.file.extension || '') })
        tab.blobUrl = URL.createObjectURL(blob)
        log(`${tab.type} blob URL created:`, tab.blobUrl)
      } else if (tab.type === 'pdf') {
        const blob = new Blob([buffer], { type: 'application/pdf' })
        tab.blobUrl = URL.createObjectURL(blob)
        log('PDF blob URL created:', tab.blobUrl)
      }
    } catch (e) {
      console.error('[PreviewStore] Failed to load preview content:', e)
    }
  }

  function closeTab(tabId: string) {
    log('Closing tab:', tabId)
    const index = tabs.value.findIndex(t => t.id === tabId)
    if (index === -1) {
      log('Tab not found:', tabId)
      return
    }

    // Clean up blob URLs
    const tab = tabs.value[index]
    if (tab.blobUrl) {
      log('Revoking blob URL:', tab.blobUrl)
      URL.revokeObjectURL(tab.blobUrl)
    }

    tabs.value.splice(index, 1)
    log('Tab closed, remaining tabs:', tabs.value.length)

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        // Activate the next tab, or the previous one if we closed the last tab
        const newIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIndex].id
        log('Activated tab:', activeTabId.value)
      } else {
        activeTabId.value = null
        isOpen.value = false
        log('No more tabs, closing panel')
      }
    }
  }

  function closeAllTabs() {
    log('Closing all tabs, count:', tabs.value.length)
    // Clean up all blob URLs
    for (const tab of tabs.value) {
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl)
      }
    }
    tabs.value = []
    activeTabId.value = null
    isOpen.value = false
  }

  function closeOtherTabs(tabId: string) {
    log('Closing other tabs except:', tabId)
    const currentTab = tabs.value.find(t => t.id === tabId)
    const tabsToClose = tabs.value.filter(t => t.id !== tabId)

    for (const tab of tabsToClose) {
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl)
      }
    }

    tabs.value = currentTab ? [currentTab] : []
    if (currentTab) {
      activeTabId.value = currentTab.id
    } else {
      activeTabId.value = null
      isOpen.value = false
    }
  }

  function closeTabsToRight(tabId: string) {
    log('Closing tabs to the right of:', tabId)
    const index = tabs.value.findIndex(t => t.id === tabId)
    if (index === -1) return

    const tabsToClose = tabs.value.slice(index + 1)
    for (const tab of tabsToClose) {
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl)
      }
    }
    tabs.value = tabs.value.slice(0, index + 1)
  }

  function setPreviewWidth(width: number) {
    const maxWidth = window.innerWidth * 0.8
    previewWidth.value = Math.max(300, Math.min(width, maxWidth))
    log('Setting preview width:', previewWidth.value)
  }

  function copyFilePath(tabId: string): string | null {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      navigator.clipboard.writeText(tab.file.path)
      log('Copied file path:', tab.file.path)
      return tab.file.path
    }
    return null
  }

  function revealInFinder(tabId: string): string | null {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      // Use shell API to reveal file location
      window.fileman.showInFolder(tab.file.path)
      log('Reveal in finder:', tab.file.path)
      return tab.file.path
    }
    return null
  }

  function setActiveTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      log('Setting active tab:', tabId)
      activeTabId.value = tabId
    } else {
      log('Tab not found for activation:', tabId)
    }
  }

  function closePanel() {
    log('Closing panel')
    isOpen.value = false
  }

  function openPanel() {
    if (tabs.value.length > 0) {
      log('Opening panel')
      isOpen.value = true
    } else {
      log('Cannot open panel: no tabs')
    }
  }

  function setPanelHeight(height: number) {
    log('Setting panel height:', height)
    panelHeight.value = Math.max(100, Math.min(height, 800))
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

  // Fullscreen preview mode
  function toggleFullscreen() {
    if (tabs.value.length > 0) {
      isFullscreen.value = !isFullscreen.value
      log('Toggle fullscreen:', isFullscreen.value)
    }
  }

  function openFullscreen() {
    if (tabs.value.length > 0) {
      isFullscreen.value = true
      log('Open fullscreen preview')
    }
  }

  function closeFullscreen() {
    isFullscreen.value = false
    log('Close fullscreen preview')
  }

  return {
    isOpen,
    tabs,
    activeTabId,
    activeTab,
    panelHeight,
    isResizing,
    previewWidth,
    isFullscreen,
    inlinePreviewFile,
    inlinePreviewDeviceId,
    openPreview,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    setActiveTab,
    closePanel,
    openPanel,
    setPanelHeight,
    setPreviewWidth,
    copyFilePath,
    revealInFinder,
    setInlinePreview,
    clearInlinePreview,
    openInlineInFullPreview,
    toggleFullscreen,
    openFullscreen,
    closeFullscreen,
  }
})
