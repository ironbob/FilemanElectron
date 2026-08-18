<template>
  <div class="h-full flex flex-col bg-bg-primary text-text-primary">
    <!-- Toolbar -->
    <div class="h-10 bg-bg-toolbar flex items-center px-2 gap-1 border-b border-border flex-shrink-0">
      <!-- Close -->
      <button class="toolbar-btn-enhanced" :title="$t('compare.diff.closeTip')" @click="closeTab">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div class="w-px h-5 bg-border mx-1 flex-shrink-0" />

      <!-- Left path -->
      <div class="flex items-center gap-1 min-w-0 flex-1">
        <span class="text-accent-teal flex-shrink-0 text-[11px] font-medium px-1 py-0.5 bg-accent-teal/10 rounded">{{ $t('compare.diff.leftSide') }}</span>
        <span class="text-text-secondary text-xs truncate">{{ session.left?.path ?? $t('compare.missingSide') }}</span>
      </div>

      <!-- Status badge -->
      <div class="flex-shrink-0 mx-2 px-2 py-0.5 rounded-full text-[11px] font-medium" :class="statusBadgeClass">
        {{ statusLabel }}
      </div>

      <!-- Right path -->
      <div class="flex items-center gap-1 min-w-0 flex-1 justify-end">
        <span class="text-text-secondary text-xs truncate text-right">{{ session.right?.path ?? $t('compare.missingSide') }}</span>
        <span class="text-accent-blue flex-shrink-0 text-[11px] font-medium px-1 py-0.5 bg-accent-blue/10 rounded">{{ $t('compare.diff.rightSide') }}</span>
      </div>

      <!-- Diff nav + layout toggle (text only, after content loaded) -->
      <template v-if="isTextFile && !isLoading && !errorMsg && !tooLarge">
        <div class="w-px h-5 bg-border mx-1 flex-shrink-0" />
        <div class="flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5">
          <button class="toolbar-btn-enhanced" :title="$t('compare.diff.prevDiffTip')" @click="prevDiff">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button class="toolbar-btn-enhanced" :title="$t('compare.diff.nextDiffTip')" @click="nextDiff">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <button
          class="toolbar-btn-enhanced"
          :class="{ active: renderSideBySide }"
          :title="$t('compare.diff.toggleLayout')"
          @click="toggleLayout"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4m6-18h4a2 2 0 012 2v14a2 2 0 01-2 2h-4m-6 0V3" />
          </svg>
        </button>
      </template>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-text-tertiary">
        <div class="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        <span class="text-sm">{{ $t('compare.diff.loading') }}</span>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="flex-1 flex items-center justify-center">
      <p class="text-sm text-accent-red">{{ errorMsg }}</p>
    </div>

    <!-- Image comparison (interactive modes) -->
    <div v-else-if="isImageFile && !tooLarge" class="flex-1 flex flex-col overflow-hidden">
      <!-- Viewport -->
      <div
        ref="imgViewportRef"
        class="flex-1 relative overflow-hidden select-none img-checkerboard"
        @wheel.prevent="handleImgWheel"
      >
        <!-- ── Side-by-side ── -->
        <div v-if="imgMode === 'side-by-side'" class="absolute inset-0 flex">
          <div class="flex-1 relative flex items-center justify-center overflow-hidden">
            <img v-if="leftDataUrl" :src="leftDataUrl" draggable="false"
              class="max-w-full max-h-full object-contain pointer-events-none"
              :style="{ transform: `scale(${imgScale})`, transformOrigin: 'center' }" />
            <div v-else class="text-text-tertiary text-sm italic">{{ $t('compare.diff.noFile') }}</div>
            <span class="img-label img-label-left">{{ $t('compare.diff.imgLeftLabel') }}</span>
          </div>
          <div class="w-px bg-border flex-shrink-0" />
          <div class="flex-1 relative flex items-center justify-center overflow-hidden">
            <img v-if="rightDataUrl" :src="rightDataUrl" draggable="false"
              class="max-w-full max-h-full object-contain pointer-events-none"
              :style="{ transform: `scale(${imgScale})`, transformOrigin: 'center' }" />
            <div v-else class="text-text-tertiary text-sm italic">{{ $t('compare.diff.noFile') }}</div>
            <span class="img-label img-label-right">{{ $t('compare.diff.imgRightLabel') }}</span>
          </div>
        </div>

        <!-- ── Slide (before/after) ── -->
        <div v-else-if="imgMode === 'slide'" class="absolute inset-0">
          <!-- Right image: base layer -->
          <img v-if="rightDataUrl" :src="rightDataUrl" draggable="false"
            class="absolute inset-0 w-full h-full object-contain pointer-events-none"
            :style="{ transform: `scale(${imgScale})`, transformOrigin: 'center' }" />
          <!-- Left image: clipped to left portion -->
          <img v-if="leftDataUrl" :src="leftDataUrl" draggable="false"
            class="absolute inset-0 w-full h-full object-contain pointer-events-none"
            :style="{
              transform: `scale(${imgScale})`,
              transformOrigin: 'center',
              clipPath: `inset(0 ${100 - sliderPos}% 0 0)`
            }" />
          <!-- Divider + handle -->
          <div
            class="slide-divider"
            :style="{ left: `calc(${sliderPos}% - 1px)` }"
            @mousedown.prevent="startSliderDrag"
          >
            <div class="slide-handle-knob">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" style="transform: translateX(6px)" />
              </svg>
            </div>
          </div>
          <span class="img-label img-label-left">{{ $t('compare.diff.imgLeftLabel') }}</span>
          <span class="img-label img-label-right">{{ $t('compare.diff.imgRightLabel') }}</span>
        </div>

        <!-- ── Blend / Onion skin ── -->
        <div v-else-if="imgMode === 'blend'" class="absolute inset-0">
          <img v-if="leftDataUrl" :src="leftDataUrl" draggable="false"
            class="absolute inset-0 w-full h-full object-contain pointer-events-none"
            :style="{ transform: `scale(${imgScale})`, transformOrigin: 'center' }" />
          <img v-if="rightDataUrl" :src="rightDataUrl" draggable="false"
            class="absolute inset-0 w-full h-full object-contain pointer-events-none"
            :style="{
              transform: `scale(${imgScale})`,
              transformOrigin: 'center',
              opacity: blendPercent / 100
            }" />
          <span class="img-label img-label-left">{{ $t('compare.diff.imgLeftLabel') }}</span>
          <span class="img-label img-label-right">{{ $t('compare.diff.imgRightLabel') }}</span>
        </div>

        <!-- ── Pixel diff ── -->
        <div v-else-if="imgMode === 'diff'" class="absolute inset-0 flex items-center justify-center">
          <div v-if="isDiffComputing" class="flex flex-col items-center gap-2 text-text-tertiary">
            <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            <span class="text-xs">{{ $t('compare.diff.computingDiff') }}</span>
          </div>
          <canvas
            ref="diffCanvasRef"
            v-show="!isDiffComputing"
            class="max-w-full max-h-full pointer-events-none"
            :style="{ transform: `scale(${imgScale})`, transformOrigin: 'center' }"
          />
        </div>
      </div>

      <!-- Bottom info bar -->
      <div class="h-8 bg-bg-secondary/40 border-t border-border flex items-center px-3 gap-2 flex-shrink-0 text-xs">
        <!-- Mode buttons -->
        <div class="flex items-center gap-0.5 bg-bg-secondary/60 rounded-md p-0.5">
          <button
            v-for="m in imgModeOptions" :key="m.value"
            class="img-mode-btn"
            :class="{ 'img-mode-btn-active': imgMode === m.value }"
            @click="setImgMode(m.value)"
          >{{ m.label }}</button>
        </div>
        <!-- Blend slider -->
        <template v-if="imgMode === 'blend'">
          <div class="w-px h-4 bg-border flex-shrink-0" />
          <span class="text-text-tertiary">{{ $t('compare.diff.blendRightLabel') }}</span>
          <input type="range" min="0" max="100" v-model.number="blendPercent"
            class="w-20" style="accent-color: var(--accent-blue)" />
          <span class="text-text-secondary w-7">{{ blendPercent }}%</span>
        </template>
        <!-- Image dimensions -->
        <div class="flex-1" />
        <span v-if="leftImgSize" class="text-text-tertiary">
          <span class="text-accent-teal font-bold">{{ $t('compare.diff.leftSide') }}</span> {{ leftImgSize.w }}×{{ leftImgSize.h }}
        </span>
        <span v-if="rightImgSize" class="text-text-tertiary">
          <span class="text-accent-blue font-bold">{{ $t('compare.diff.rightSide') }}</span> {{ rightImgSize.w }}×{{ rightImgSize.h }}
        </span>
        <div class="w-px h-4 bg-border flex-shrink-0" />
        <!-- Diff stats -->
        <span v-if="imgMode === 'diff' && diffStats" class="text-accent-red">
          {{ $t('compare.diff.diffPercent', { percent: diffStats.percentage.toFixed(1) }) }}
        </span>
        <!-- Zoom reset -->
        <button
          class="text-text-secondary hover:text-text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-bg-hover"
          :title="$t('compare.diff.resetZoomTip')"
          @click="imgScale = 1"
        >{{ Math.round(imgScale * 100) }}%</button>
        <span class="text-text-tertiary opacity-50 text-[10px]">{{ $t('compare.diff.zoomHint') }}</span>
      </div>
    </div>

    <!-- Non-text / too large: metadata panel -->
    <div v-else-if="tooLarge || !isTextFile" class="flex-1 flex items-center justify-center p-8">
      <div class="w-full max-w-2xl">
        <div class="grid grid-cols-[1fr_auto_1fr] gap-6 items-start">
          <!-- Left meta -->
          <div class="text-sm space-y-3">
            <p class="text-xs text-accent-teal font-medium mb-4">{{ $t('compare.diff.leftFile') }}</p>
            <template v-if="session.left">
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.fileName') }}</p>
                <p class="text-text-primary truncate">{{ session.left.name }}</p>
              </div>
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.size') }}</p>
                <p class="text-text-primary">{{ formatSize(session.left.size) }}</p>
              </div>
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.modifiedTime') }}</p>
                <p class="text-text-primary">{{ session.left.modifiedTime }}</p>
              </div>
            </template>
            <p v-else class="text-text-tertiary italic">{{ $t('compare.diff.noSuchFile') }}</p>
          </div>

          <!-- Center status -->
          <div class="flex flex-col items-center pt-6 gap-2">
            <div class="px-3 py-1.5 rounded-full text-sm font-medium" :class="statusBadgeClass">
              {{ statusLabel }}
            </div>
            <p v-if="tooLarge" class="text-xs text-text-tertiary mt-2">{{ $t('compare.diff.tooLarge') }}</p>
          </div>

          <!-- Right meta -->
          <div class="text-sm space-y-3 text-right">
            <p class="text-xs text-accent-blue font-medium mb-4">{{ $t('compare.diff.rightFile') }}</p>
            <template v-if="session.right">
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.fileName') }}</p>
                <p class="text-text-primary truncate">{{ session.right.name }}</p>
              </div>
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.size') }}</p>
                <p class="text-text-primary">{{ formatSize(session.right.size) }}</p>
              </div>
              <div>
                <p class="text-text-tertiary text-xs">{{ $t('compare.diff.modifiedTime') }}</p>
                <p class="text-text-primary">{{ session.right.modifiedTime }}</p>
              </div>
            </template>
            <p v-else class="text-text-tertiary italic">{{ $t('compare.diff.noSuchFile') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Monaco DiffEditor (text files, within size limit) -->
    <div v-else ref="editorContainer" class="flex-1 min-h-0" />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { FileDiffSession } from '@/types'
import { getFileCategory } from '@/utils/fileTypes'
import { getLanguageForFile } from '@shared/fileKinds'
import { useTabsStore } from '@/stores/tabs'
import { t } from '@/i18n'

// ── Electron freeze prevention: MonacoEnvironment BEFORE any monaco import ───
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker() { return new EditorWorker() }
}
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

const MAX_TEXT_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20 MB

const props = defineProps<{ session: FileDiffSession }>()

const tabsStore = useTabsStore()

// ── File type detection ───────────────────────────────────────────────────────
const fileExt = computed(() => {
  const name = props.session.fileName
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.substring(dot + 1).toLowerCase()
})

const fileCategory = computed(() => getFileCategory(fileExt.value))
const isTextFile  = computed(() => fileCategory.value === 'text' || fileCategory.value === 'document' && fileExt.value !== 'pdf')
const isImageFile = computed(() => fileCategory.value === 'image')

// For image files we only cap at MAX_IMAGE_SIZE; text at MAX_TEXT_SIZE
const tooLarge = computed(() => {
  if (isImageFile.value) {
    const ls = props.session.left?.size ?? 0
    const rs = props.session.right?.size ?? 0
    return ls > MAX_IMAGE_SIZE || rs > MAX_IMAGE_SIZE
  }
  if (isTextFile.value) {
    const ls = props.session.left?.size ?? 0
    const rs = props.session.right?.size ?? 0
    return ls > MAX_TEXT_SIZE || rs > MAX_TEXT_SIZE
  }
  return false
})

// ── Status badge ──────────────────────────────────────────────────────────────
const statusLabel = computed(() => {
  switch (props.session.status) {
    case 'metadata-equal': return t('compare.diffStatus.metadataEqual')
    case 'content-equal': return t('compare.diffStatus.contentEqual')
    case 'different':   return t('compare.diffStatus.different')
    case 'left-newer':  return t('compare.diffStatus.leftNewer')
    case 'right-newer': return t('compare.diffStatus.rightNewer')
    case 'left-only':   return t('compare.diffStatus.leftOnly')
    case 'right-only':  return t('compare.diffStatus.rightOnly')
    case 'type-mismatch': return t('compare.diffStatus.typeMismatch')
    case 'verifying': return t('compare.diffStatus.verifying')
    case 'verification-failed': return t('compare.diffStatus.verificationFailed')
    case 'uncomparable': return t('compare.diffStatus.uncomparable')
  }
})

const statusBadgeClass = computed(() => {
  switch (props.session.status) {
    case 'metadata-equal': return 'bg-bg-active text-text-secondary'
    case 'content-equal': return 'bg-accent-green/15 text-accent-green'
    case 'different':   return 'bg-red-500/20 text-accent-red'
    case 'left-newer':
    case 'right-newer': return 'bg-accent-blue/15 text-accent-blue'
    case 'left-only':
    case 'right-only':  return 'bg-accent-orange/20 text-accent-orange'
    case 'verifying': return 'bg-accent-blue/15 text-accent-blue'
    case 'verification-failed':
    case 'uncomparable': return 'bg-accent-orange/20 text-accent-orange'
    case 'type-mismatch': return 'bg-red-500/20 text-accent-red'
  }
})

// ── Layout state ──────────────────────────────────────────────────────────────
const renderSideBySide = ref(true)

function toggleLayout() {
  renderSideBySide.value = !renderSideBySide.value
  diffEditorInstance.value?.updateOptions({ renderSideBySide: renderSideBySide.value })
}

// ── Loading / error state ─────────────────────────────────────────────────────
const isLoading  = ref(true)
const errorMsg   = ref('')

// ── Image data URLs ───────────────────────────────────────────────────────────
const leftDataUrl  = ref<string | null>(null)
const rightDataUrl = ref<string | null>(null)

// ── Image comparison state ────────────────────────────────────────────────────
type ImgMode = 'side-by-side' | 'slide' | 'blend' | 'diff'
// 标签经 computed 取词：随语言切换响应（禁止模块级常量直接存 t() 结果）。
const imgModeOptions = computed<{ value: ImgMode; label: string }[]>(() => [
  { value: 'side-by-side', label: t('compare.diff.imgModeSideBySide') },
  { value: 'slide',        label: t('compare.diff.imgModeSlide') },
  { value: 'blend',        label: t('compare.diff.imgModeBlend') },
  { value: 'diff',         label: t('compare.diff.imgModeDiff') },
])
const imgMode         = ref<ImgMode>('side-by-side')
const imgScale        = ref(1)
const sliderPos       = ref(50)   // 0–100%
const blendPercent    = ref(50)
const imgViewportRef  = ref<HTMLElement | null>(null)
const diffCanvasRef   = ref<HTMLCanvasElement | null>(null)
const isDiffComputing = ref(false)
const diffStats       = ref<{ changedPixels: number; percentage: number } | null>(null)
const leftImgSize     = ref<{ w: number; h: number } | null>(null)
const rightImgSize    = ref<{ w: number; h: number } | null>(null)
let _leftImg:  HTMLImageElement | null = null
let _rightImg: HTMLImageElement | null = null

// ── Monaco DiffEditor ─────────────────────────────────────────────────────────
const editorContainer = ref<HTMLElement | null>(null)
const diffEditorInstance = shallowRef<monaco.editor.IStandaloneDiffEditor | null>(null)

// ── Language detection（单一事实源：shared/fileKinds.ts 注册表） ──────────────
function detectLanguage(name: string, ext: string): string {
  return getLanguageForFile(name, ext)
}

// ── Base64 helpers ────────────────────────────────────────────────────────────
function b64ToText(b64: string): string {
  const binary = atob(b64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function b64ToImageUrl(b64: string, ext: string): string {
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
    heic: 'image/heic', heif: 'image/heif',
  }
  const mime = mimeMap[ext] || 'image/octet-stream'
  return `data:${mime};base64,${b64}`
}

// ── Content loading ───────────────────────────────────────────────────────────
async function readSide(deviceId: string, path: string | undefined): Promise<string> {
  if (!path) return ''
  return window.fileman.readFile(deviceId, path)
}

async function loadContent() {
  isLoading.value  = true
  errorMsg.value   = ''
  leftDataUrl.value  = null
  rightDataUrl.value = null

  try {
    if (tooLarge.value) {
      // Nothing to load; the metadata panel uses session props directly
      return
    }

    if (isImageFile.value) {
      imgMode.value   = 'side-by-side'
      imgScale.value  = 1
      sliderPos.value = 50
      diffStats.value = null
      const [lb, rb] = await Promise.all([
        readSide(props.session.leftDeviceId,  props.session.left?.path),
        readSide(props.session.rightDeviceId, props.session.right?.path),
      ])
      if (lb) leftDataUrl.value  = b64ToImageUrl(lb, fileExt.value)
      if (rb) rightDataUrl.value = b64ToImageUrl(rb, fileExt.value)
      await onImagesReady()
      return
    }

    if (isTextFile.value) {
      const [lb, rb] = await Promise.all([
        readSide(props.session.leftDeviceId,  props.session.left?.path),
        readSide(props.session.rightDeviceId, props.session.right?.path),
      ])
      const leftText  = lb ? b64ToText(lb)  : ''
      const rightText = rb ? b64ToText(rb) : ''
      const lang = detectLanguage(props.session.fileName, fileExt.value)
      await nextTick()
      createDiffEditor(leftText, rightText, lang)
    }
    // For binary/other: no content loading needed; metadata panel shows session data
  } catch (e) {
    errorMsg.value = t('compare.diff.loadFailed', { message: (e as Error).message })
  } finally {
    isLoading.value = false
  }
}

// ── Image comparison functions ──────────────────────────────────────────────
function loadImgEl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src     = dataUrl
  })
}

async function onImagesReady() {
  _leftImg = null; _rightImg = null
  leftImgSize.value = null; rightImgSize.value = null
  const tasks: Promise<void>[] = []
  if (leftDataUrl.value)  tasks.push(loadImgEl(leftDataUrl.value).then(img  => { _leftImg  = img; leftImgSize.value  = { w: img.naturalWidth, h: img.naturalHeight } }))
  if (rightDataUrl.value) tasks.push(loadImgEl(rightDataUrl.value).then(img => { _rightImg = img; rightImgSize.value = { w: img.naturalWidth, h: img.naturalHeight } }))
  await Promise.all(tasks)
}

function handleImgWheel(event: WheelEvent) {
  if (!event.metaKey && !event.ctrlKey) return
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  imgScale.value = Math.max(0.1, Math.min(10, imgScale.value * factor))
}

function startSliderDrag(_e: MouseEvent) {
  let dragging = true
  const onMove = (e: MouseEvent) => {
    if (!dragging || !imgViewportRef.value) return
    const rect = imgViewportRef.value.getBoundingClientRect()
    sliderPos.value = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
  }
  const onUp = () => {
    dragging = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup',   onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup',   onUp)
}

async function computeDiff() {
  if (!_leftImg && !_rightImg) return
  isDiffComputing.value = true
  diffStats.value = null
  await nextTick()
  try {
    const lw = _leftImg?.naturalWidth   ?? _rightImg?.naturalWidth  ?? 1
    const lh = _leftImg?.naturalHeight  ?? _rightImg?.naturalHeight ?? 1
    const rw = _rightImg?.naturalWidth  ?? lw
    const rh = _rightImg?.naturalHeight ?? lh
    const w  = Math.max(lw, rw)
    const h  = Math.max(lh, rh)

    const offL = new OffscreenCanvas(w, h)
    const offR = new OffscreenCanvas(w, h)
    const ctxL = offL.getContext('2d')!
    const ctxR = offR.getContext('2d')!
    if (_leftImg)  ctxL.drawImage(_leftImg,  (w - lw) / 2, (h - lh) / 2, lw, lh)
    if (_rightImg) ctxR.drawImage(_rightImg, (w - rw) / 2, (h - rh) / 2, rw, rh)

    const dL = ctxL.getImageData(0, 0, w, h).data
    const dR = ctxR.getImageData(0, 0, w, h).data
    const out = new Uint8ClampedArray(dL.length)
    let changedPixels = 0
    const THRESHOLD = 15

    for (let i = 0; i < dL.length; i += 4) {
      const maxDiff = Math.max(
        Math.abs(dL[i]   - dR[i]),
        Math.abs(dL[i+1] - dR[i+1]),
        Math.abs(dL[i+2] - dR[i+2])
      )
      if (maxDiff > THRESHOLD) {
        changedPixels++
        const t = Math.min(1, maxDiff / 128)
        out[i]   = 255
        out[i+1] = Math.round(30  * (1 - t))
        out[i+2] = Math.round(80  * (1 - t))
        out[i+3] = 255
      } else {
        // desaturate unchanged pixels
        const gray = Math.round(0.299 * dL[i] + 0.587 * dL[i+1] + 0.114 * dL[i+2])
        const v = Math.round(gray * 0.4)
        out[i] = v; out[i+1] = v; out[i+2] = v; out[i+3] = dL[i+3]
      }
    }

    diffStats.value = { changedPixels, percentage: (changedPixels / (w * h)) * 100 }
    if (diffCanvasRef.value) {
      diffCanvasRef.value.width  = w
      diffCanvasRef.value.height = h
      diffCanvasRef.value.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0)
    }
  } finally {
    isDiffComputing.value = false
  }
}

function setImgMode(mode: ImgMode) {
  imgMode.value = mode
  if (mode === 'diff' && !diffStats.value) computeDiff()
}

// ── Monaco editor lifecycle ───────────────────────────────────────────────────
function isDarkTheme(): boolean {
  return (localStorage.getItem('theme') ?? 'dark') !== 'light'
}

function createDiffEditor(leftContent: string, rightContent: string, language: string) {
  if (!editorContainer.value) return

  diffEditorInstance.value = monaco.editor.createDiffEditor(editorContainer.value, {
    theme: isDarkTheme() ? 'vs-dark' : 'vs',
    readOnly: true,
    renderSideBySide: renderSideBySide.value,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    fontSize: 13,
    fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
    minimap: { enabled: false },
    scrollbar: { useShadows: false },
    ignoreTrimWhitespace: false,
  })

  const original = monaco.editor.createModel(leftContent,  language)
  const modified = monaco.editor.createModel(rightContent, language)
  diffEditorInstance.value.setModel({ original, modified })
}

function destroyDiffEditor() {
  if (diffEditorInstance.value) {
    const model = diffEditorInstance.value.getModel()
    model?.original.dispose()
    model?.modified.dispose()
    diffEditorInstance.value.dispose()
    diffEditorInstance.value = null
  }
}

// ── Diff navigation ───────────────────────────────────────────────────────────
function nextDiff() {
  diffEditorInstance.value?.getModifiedEditor()
    .trigger('', 'editor.action.diffReview.next', null)
}

function prevDiff() {
  diffEditorInstance.value?.getModifiedEditor()
    .trigger('', 'editor.action.diffReview.prev', null)
}

// ── Close tab ─────────────────────────────────────────────────────────────────
function closeTab() {
  const tab = tabsStore.tabs.find(t => t.fileDiffSession?.id === props.session.id)
  if (tab) tabsStore.closeTab(tab.id)
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  loadContent()
})

onUnmounted(() => {
  destroyDiffEditor()
})
</script>

<style scoped>
/* Monaco diff editor fill */
:deep(.monaco-diff-editor) { height: 100%; }

/* Checkerboard background for transparent image areas（随主题切换） */
.img-checkerboard {
  background-color: #1a1a1e;
  background-image:
    linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
:global([data-theme='light']) .img-checkerboard {
  background-color: #e8e8ed;
  background-image:
    linear-gradient(45deg, rgba(0,0,0,0.045) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0,0,0,0.045) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.045) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.045) 75%);
}

/* Side labels */
.img-label {
  position: absolute;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  pointer-events: none;
  user-select: none;
  z-index: 5;
  top: 12px;
}
.img-label-left  { left: 12px;  background: color-mix(in srgb, var(--accent-teal) 20%, transparent); color: var(--accent-teal); }
.img-label-right { right: 12px; background: color-mix(in srgb, var(--accent-blue) 20%, transparent); color: var(--accent-blue); }

/* Mode buttons in the info bar */
.img-mode-btn {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  color: var(--text-secondary);
  user-select: none;
  border: none;
  background: transparent;
  transition: all 0.12s;
}
.img-mode-btn:hover     { color: var(--text-primary); background: var(--bg-hover); }
.img-mode-btn-active    { background: var(--accent-blue); color: var(--finder-selection-text, #fff) !important; }

/* Slide divider / 手柄：覆于图像内容之上的媒体层控件，白系配色与主题无关 */
.slide-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.9);
  cursor: col-resize;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 0 10px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.1s;
}
.slide-divider:hover { background: #fff; }

.slide-handle-knob {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.5);
  color: #333;
  flex-shrink: 0;
  border: 1px solid rgba(0,0,0,0.15);
}
</style>
