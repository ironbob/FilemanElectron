import { ref, computed, watch, onUnmounted } from 'vue'
import exifr from 'exifr'
import { usePreviewStore } from '@/stores/preview'
import { useImagePreview } from './useImagePreview'
import { needsNativeDecode } from '@/utils/fileTypes'
import { getMimeType, IMAGE_PREVIEW_SIZE_LIMIT } from '@/types/preview'
import type { FileInfo } from '@/types'

const log = (message: string, ...args: unknown[]) => {
  console.log(`[useImageBrowser] ${message}`, ...args)
}

/** How many images on each side of the current one to preload. */
const PRELOAD_NEIGHBORS = 1
/** Hard cap on simultaneously cached decoded images (bounds memory). */
const MAX_CACHE = 4
/** sips output longest-side cap for native-decoded images. */
const NATIVE_MAX_DIM = 2560

export interface ImageExifInfo {
  make?: string
  model?: string
  lensModel?: string
  iso?: number
  fNumber?: number
  exposureTime?: number
  focalLength?: number
  dateTimeOriginal?: Date
  gpsLatitude?: number
  gpsLongitude?: number
}

interface CacheEntry {
  url: string
  bytes: ArrayBuffer
  /** True if produced by native decode (sips) → already EXIF-oriented. */
  native: boolean
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

/**
 * Folder-aware image browser core. Owns the per-image load state (blobUrl,
 * loading, error, EXIF, dimensions) for the current session in the preview
 * store, plus a small neighbor preload cache. View transforms (zoom/pan/rotate
 * /flip/fit) come from useImagePreview.
 *
 * The session identity (deviceId/images/index) lives in the store; this
 * composable reacts to `imageBrowserCurrent` changing and reloads.
 */
export function useImageBrowser() {
  const previewStore = usePreviewStore()
  const view = useImagePreview()

  const blobUrl = ref('')
  const loading = ref(true)
  const error = ref('')
  const exif = ref<ImageExifInfo | null>(null)
  const imageDimensions = ref({ width: 0, height: 0 })
  /** True when current image was native-decoded (don't double-apply EXIF orient). */
  const nativeDecoded = ref(false)

  // path → decoded entry. Current image is always a member.
  const cache = new Map<string, CacheEntry>()
  // Invalidates in-flight loads on rapid navigation.
  let loadToken = 0

  const currentFile = computed<FileInfo | null>(() => previewStore.imageBrowserCurrent)
  const canPrev = computed(() => (previewStore.imageBrowser?.index ?? 0) > 0)
  const canNext = computed(() => {
    const s = previewStore.imageBrowser
    return !!s && s.index < s.images.length - 1
  })
  const indexLabel = computed(() => {
    const s = previewStore.imageBrowser
    return s ? `${s.index + 1} / ${s.images.length}` : ''
  })

  function revokeEntry(path: string): void {
    const entry = cache.get(path)
    if (entry) {
      URL.revokeObjectURL(entry.url)
      cache.delete(path)
    }
  }

  function evictOutsideWindow(keepPaths: Set<string>): void {
    for (const key of Array.from(cache.keys())) {
      if (!keepPaths.has(key)) revokeEntry(key)
    }
  }

  async function fetchIntoCache(file: FileInfo, deviceId: string): Promise<CacheEntry> {
    const ext = file.extension || ''
    if (needsNativeDecode(ext)) {
      const { buffer, mime } = await window.fileman.decodeNativeImage(deviceId, file.path, {
        maxDim: NATIVE_MAX_DIM
      })
      const bytes = base64ToArrayBuffer(buffer)
      return {
        url: URL.createObjectURL(new Blob([bytes], { type: mime })),
        bytes,
        native: true
      }
    }
    const base64 = await window.fileman.readFile(deviceId, file.path)
    const bytes = base64ToArrayBuffer(base64)
    return {
      url: URL.createObjectURL(new Blob([bytes], { type: getMimeType(ext) })),
      bytes,
      native: false
    }
  }

  async function loadCurrent(): Promise<void> {
    const session = previewStore.imageBrowser
    const file = previewStore.imageBrowserCurrent
    if (!session || !file) return
    const myToken = ++loadToken
    const deviceId = session.deviceId

    view.resetView()
    loading.value = true
    error.value = ''
    exif.value = null
    imageDimensions.value = { width: 0, height: 0 }

    // Size cap — fast-path only. Native-decoded RAW/HEIC are downsampled by
    // sips, so the source-size cap is moot for them.
    if (!needsNativeDecode(file.extension || '') && file.size > IMAGE_PREVIEW_SIZE_LIMIT) {
      const mb = (IMAGE_PREVIEW_SIZE_LIMIT / (1024 * 1024)).toFixed(0)
      error.value = `Image exceeds the ${mb} MB preview limit`
      loading.value = false
      log('size cap hit:', file.name)
      return
    }

    try {
      let entry = cache.get(file.path)
      if (!entry) {
        entry = await fetchIntoCache(file, deviceId)
        cache.set(file.path, entry)
      }
      if (myToken !== loadToken) return // superseded by newer navigation

      blobUrl.value = entry.url
      nativeDecoded.value = entry.native
      void parseExif(entry.bytes)
    } catch (e) {
      if (myToken !== loadToken) return
      error.value = e instanceof Error ? e.message : 'Failed to load image'
      log('load failed:', file.name, e)
    } finally {
      if (myToken === loadToken) loading.value = false
    }

    preloadNeighbors()
  }

  /** Preload next/prev, evict entries that fell out of the window. */
  function preloadNeighbors(): void {
    const session = previewStore.imageBrowser
    if (!session) return
    const { index, images, deviceId } = session

    const keep = new Set<string>([images[index]?.path].filter(Boolean) as string[])
    for (let d = 1; d <= PRELOAD_NEIGHBORS; d++) {
      const nextFile = images[index + d]
      const prevFile = images[index - d]
      if (nextFile) {
        keep.add(nextFile.path)
        warm(nextFile, deviceId)
      }
      if (prevFile) {
        keep.add(prevFile.path)
        warm(prevFile, deviceId)
      }
    }
    evictOutsideWindow(keep)
  }

  /** Best-effort prefetch; drops the result if navigation has moved on. */
  function warm(file: FileInfo, deviceId: string): void {
    if (cache.has(file.path)) return
    // Skip oversized fast-path images.
    if (!needsNativeDecode(file.extension || '') && file.size > IMAGE_PREVIEW_SIZE_LIMIT) return
    if (cache.size >= MAX_CACHE) return

    fetchIntoCache(file, deviceId)
      .then((entry) => {
        const s = previewStore.imageBrowser
        if (!s) {
          URL.revokeObjectURL(entry.url)
          return
        }
        const pos = s.images.findIndex(f => f.path === file.path)
        if (pos === -1 || Math.abs(pos - s.index) > PRELOAD_NEIGHBORS) {
          // No longer a neighbor — drop.
          URL.revokeObjectURL(entry.url)
          return
        }
        cache.set(file.path, entry)
      })
      .catch(() => {
        /* preload is best-effort */
      })
  }

  async function parseExif(bytes: ArrayBuffer): Promise<void> {
    try {
      const data = await exifr.parse(bytes)
      exif.value = data
        ? {
            make: data.Make,
            model: data.Model,
            lensModel: data.LensModel ?? data.LensInfo,
            iso: data.ISO,
            fNumber: data.FNumber,
            exposureTime: data.ExposureTime,
            focalLength: data.FocalLength,
            dateTimeOriginal: data.DateTimeOriginal ?? data.CreateDate,
            gpsLatitude: data.latitude,
            gpsLongitude: data.longitude
          }
        : null
    } catch {
      exif.value = null
    }
  }

  function handleImageLoad(e: Event): void {
    const img = e.target as HTMLImageElement
    imageDimensions.value = { width: img.naturalWidth, height: img.naturalHeight }
  }

  // Reload whenever the current image changes (initial + navigation).
  watch(
    () => previewStore.imageBrowserCurrent,
    (file) => {
      if (file) void loadCurrent()
    },
    { immediate: true }
  )

  onUnmounted(() => {
    loadToken++ // invalidate any in-flight load
    for (const key of Array.from(cache.keys())) revokeEntry(key)
    cache.clear()
    blobUrl.value = ''
  })

  return {
    // state
    blobUrl,
    loading,
    error,
    exif,
    imageDimensions,
    nativeDecoded,
    currentFile,
    canPrev,
    canNext,
    indexLabel,
    // view transforms (passthrough from useImagePreview)
    ...view,
    // image lifecycle
    handleImageLoad,
    // navigation delegates
    goNext: () => previewStore.nextImage(),
    goPrev: () => previewStore.prevImage(),
    close: () => previewStore.closeImageBrowser()
  }
}
