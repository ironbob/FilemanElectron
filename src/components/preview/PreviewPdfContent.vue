<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">Loading PDF...</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">Failed to load PDF</p>
      <p class="text-xs">{{ errorMessage }}</p>
    </div>

    <!-- PDF Viewer -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Controls -->
      <div class="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border">
        <div class="flex items-center gap-2">
          <!-- Page Navigation -->
          <button
            class="p-1.5 rounded hover:bg-bg-hover disabled:opacity-50"
            :disabled="currentPage <= 1"
            @click="prevPage"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-sm text-text-secondary">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            class="p-1.5 rounded hover:bg-bg-hover disabled:opacity-50"
            :disabled="currentPage >= totalPages"
            @click="nextPage"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <!-- Zoom Controls -->
          <button
            class="p-1.5 rounded hover:bg-bg-hover"
            @click="zoomOut"
            title="Zoom Out"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span class="text-sm text-text-secondary w-12 text-center">{{ Math.round(scale * 100) }}%</span>
          <button
            class="p-1.5 rounded hover:bg-bg-hover"
            @click="zoomIn"
            title="Zoom In"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- PDF Pages Container -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-auto"
        @wheel="handleWheel"
      >
        <div class="flex flex-col items-center gap-4 py-4">
          <canvas
            v-for="pageNum in totalPages"
            :key="pageNum"
            :ref="el => setPageCanvas(pageNum, el as HTMLCanvasElement | null)"
            class="shadow-lg"
          />
        </div>
      </div>

      <!-- File Info -->
      <div class="flex-shrink-0 px-4 py-2 bg-bg-tertiary border-t border-border">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary">{{ file.name }}</span>
            <span class="text-xs text-text-tertiary">{{ formatSize(file.size) }}</span>
          </div>
          <button
            class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors"
            @click="openInFullPreview"
          >
            Open in Full Viewer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onUnmounted, nextTick } from 'vue'
import type { FileInfo } from '@/types'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

const log = (message: string, ...args: any[]) => {
  console.log(`[PreviewPdfContent] ${message}`, ...args)
}

const logError = (message: string, error: unknown, extra?: Record<string, unknown>) => {
  const err = error as { name?: string; message?: string; stack?: string; details?: string }
  console.error(`[PreviewPdfContent] ${message}`, {
    name: err?.name,
    message: err?.message,
    details: err?.details,
    stack: err?.stack,
    ...extra
  })
}

const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const emit = defineEmits<{
  openInFull: []
}>()

// Set worker source via Vite URL transform for better compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
log('pdfjs worker configured', { workerSrc: pdfWorkerUrl, version: pdfjsLib.version })

const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const scrollContainer = ref<HTMLDivElement | null>(null)
// Map from 1-based page number to canvas element
const pageCanvases = new Map<number, HTMLCanvasElement>()

const pdfDoc = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const totalPages = ref(0)
const scale = ref(1.5)
const usedDisableWorker = ref(false)
let renderVersion = 0 // incremented on each full re-render to cancel stale renders

function setPageCanvas(pageNum: number, el: HTMLCanvasElement | null) {
  if (el) {
    pageCanvases.set(pageNum, el)
  } else {
    pageCanvases.delete(pageNum)
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

async function loadContent() {
  log('Loading PDF:', props.file.name, 'size:', props.file.size)

  loading.value = true
  hasError.value = false
  errorMessage.value = ''

  try {
    log('Reading file from device:', props.deviceId, 'path:', props.file.path)
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    log('File read successfully, base64 length:', base64.length)

    const buffer = base64ToArrayBuffer(base64)
    log('Buffer size:', buffer.byteLength)

    const sourceData = new Uint8Array(buffer)
    log('Prepared Uint8Array for pdfjs', {
      length: sourceData.length,
      firstBytes: Array.from(sourceData.slice(0, 8)),
      hasPdfHeader: new TextDecoder('ascii').decode(sourceData.slice(0, 5)) === '%PDF-'
    })

    const loadWithOptions = async (disableWorker: boolean) => {
      // pdf.js may transfer (detach) the input ArrayBuffer internally.
      // Always pass a fresh copy for each attempt/retry.
      const attemptData = sourceData.slice()

      log('Creating PDF loading task', {
        disableWorker,
        workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc,
        attemptDataLength: attemptData.length
      })

      const documentOptions = {
        data: attemptData,
        cMapPacked: true,
        useSystemFonts: true,
        disableWorker
      }

      const loadingTask = pdfjsLib.getDocument(documentOptions as any)

      loadingTask.onProgress = (progressData: { loaded: number; total?: number }) => {
        log('PDF loading progress', { ...progressData, disableWorker })
      }

      log('PDF loading task created', { disableWorker })
      return loadingTask.promise
    }

    try {
      usedDisableWorker.value = false
      pdfDoc.value = await loadWithOptions(false)
      log('PDF loaded with worker')
    } catch (workerError) {
      logError('PDF load with worker failed, retrying without worker', workerError, {
        workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc,
        fileName: props.file.name,
        filePath: props.file.path
      })

      usedDisableWorker.value = true
      pdfDoc.value = await loadWithOptions(true)
      log('PDF loaded with disableWorker fallback')
    }

    totalPages.value = pdfDoc.value.numPages
    currentPage.value = 1

    log('PDF loaded, total pages:', totalPages.value)

    // Must clear loading before rendering so canvas elements exist in the DOM.
    loading.value = false
    await nextTick()

    // Render all pages
    await renderAllPages()
  } catch (e) {
    logError('Error loading PDF', e, {
      fileName: props.file.name,
      filePath: props.file.path,
      fileSize: props.file.size,
      currentPage: currentPage.value,
      scale: scale.value,
      workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc,
      usedDisableWorker: usedDisableWorker.value
    })
    hasError.value = true
    errorMessage.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
    log('loadContent finished', {
      loading: loading.value,
      hasError: hasError.value,
      totalPages: totalPages.value,
      currentPage: currentPage.value,
      usedDisableWorker: usedDisableWorker.value
    })
  }
}

async function renderAllPages() {
  if (!pdfDoc.value) return
  const version = ++renderVersion
  const doc = pdfDoc.value
  const s = scale.value

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (version !== renderVersion) break // scale changed, abort
    await renderSinglePage(doc, pageNum, s, version)
  }
}

async function renderSinglePage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  s: number,
  version: number
) {
  const canvas = pageCanvases.get(pageNum)
  if (!canvas) {
    log(`Canvas for page ${pageNum} not ready yet`)
    return
  }

  try {
    const page = await doc.getPage(pageNum)
    if (version !== renderVersion) return
    const viewport = page.getViewport({ scale: s })
    const context = canvas.getContext('2d')
    if (!context) return

    canvas.height = viewport.height
    canvas.width = viewport.width

    await page.render({ canvasContext: context, viewport } as any).promise
  } catch (e) {
    if (version === renderVersion) {
      logError('Error rendering page', e, { pageNum, scale: s })
    }
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    scrollToPage(currentPage.value)
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    scrollToPage(currentPage.value)
  }
}

function scrollToPage(pageNum: number) {
  const canvas = pageCanvases.get(pageNum)
  canvas?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function zoomIn() {
  if (scale.value < 4) {
    scale.value = Math.round((scale.value + 0.25) * 100) / 100
    await renderAllPages()
  }
}

async function zoomOut() {
  if (scale.value > 0.25) {
    scale.value = Math.round((scale.value - 0.25) * 100) / 100
    await renderAllPages()
  }
}

function handleWheel(event: WheelEvent) {
  if (!event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const next = Math.round((scale.value + delta) * 100) / 100
  if (next < 0.25 || next > 4) return
  scale.value = next
  renderAllPages()
}

function openInFullPreview() {
  emit('openInFull')
}

watch(() => props.file, (newFile, oldFile) => {
  log('file watcher triggered', {
    newPath: newFile?.path,
    oldPath: oldFile?.path,
    newSize: newFile?.size,
    shouldReload: !!newFile && newFile.path !== oldFile?.path
  })

  if (newFile && newFile.path !== oldFile?.path) {
    loadContent()
  }
}, { immediate: true })

onUnmounted(() => {
  log('Component unmounting, cleaning up')
  if (pdfDoc.value) {
    pdfDoc.value.destroy()
    pdfDoc.value = null
  }
})
</script>
