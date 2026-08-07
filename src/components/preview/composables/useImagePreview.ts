import { ref, computed, onUnmounted, type Ref } from 'vue'
import type { ImageFitMode } from '@/types/preview'

export interface UseImagePreviewOptions {
  minScale?: number
  maxScale?: number
  zoomStep?: number
}

export interface UseImagePreviewReturn {
  // State
  scale: Ref<number>
  rotation: Ref<number>
  translateX: Ref<number>
  translateY: Ref<number>
  fitMode: Ref<ImageFitMode>
  flipH: Ref<boolean>
  flipV: Ref<boolean>
  isDragging: Ref<boolean>
  imageLoaded: Ref<boolean>

  // Computed
  displayScale: Readonly<Ref<string>>
  transformStyle: Readonly<Ref<Record<string, string>>>

  // Methods
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  rotateLeft: () => void
  rotateRight: () => void
  flipHorizontal: () => void
  flipVertical: () => void
  setFitMode: (mode: ImageFitMode) => void
  handleWheel: (e: WheelEvent) => void
  startDrag: (e: MouseEvent) => void
  handleDrag: (e: MouseEvent) => void
  endDrag: () => void
  handleImageLoad: () => void
}

const DEFAULT_OPTIONS: Required<UseImagePreviewOptions> = {
  minScale: 0.1,
  maxScale: 10,
  zoomStep: 0.25
}

export function useImagePreview(options: UseImagePreviewOptions = {}): UseImagePreviewReturn {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // State
  const scale = ref(1)
  const rotation = ref(0)
  const translateX = ref(0)
  const translateY = ref(0)
  const fitMode = ref<ImageFitMode>('contain')
  const flipH = ref(false)
  const flipV = ref(false)
  const isDragging = ref(false)
  const imageLoaded = ref(false)

  // Drag state
  let dragStartX = 0
  let dragStartY = 0
  let lastTranslateX = 0
  let lastTranslateY = 0

  // Computed display scale
  const displayScale = computed(() => {
    return Math.round(scale.value * 100) + '%'
  })

  // Computed transform style.
  // Order translate → scale → rotate so pan stays in screen space (translate
  // is applied last to the point) regardless of zoom. Flip is folded into the
  // scale terms (sx/sy carry the sign); `scale` itself stays a positive
  // magnitude so the wheel-zoom cursor-anchoring math in handleWheel is
  // unaffected by flipping.
  const transformStyle = computed((): Record<string, string> => {
    const s = scale.value
    const sx = flipH.value ? -s : s
    const sy = flipV.value ? -s : s
    const r = rotation.value
    const tx = translateX.value
    const ty = translateY.value

    const parts: string[] = []
    if (tx !== 0 || ty !== 0) parts.push(`translate(${tx}px, ${ty}px)`)
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`)
    if (r !== 0) parts.push(`rotate(${r}deg)`)

    if (parts.length === 0) return {}
    return { transform: parts.join(' ') }
  })

  // Zoom in
  function zoomIn(): void {
    if (scale.value < opts.maxScale) {
      scale.value = Math.min(scale.value + opts.zoomStep, opts.maxScale)
    }
  }

  // Zoom out
  function zoomOut(): void {
    if (scale.value > opts.minScale) {
      scale.value = Math.max(scale.value - opts.zoomStep, opts.minScale)
    }
  }

  // Reset view to original
  function resetView(): void {
    scale.value = 1
    rotation.value = 0
    translateX.value = 0
    translateY.value = 0
    fitMode.value = 'contain'
    flipH.value = false
    flipV.value = false
  }

  // Rotate left (counter-clockwise)
  function rotateLeft(): void {
    rotation.value = (rotation.value - 90 + 360) % 360
  }

  // Rotate right (clockwise)
  function rotateRight(): void {
    rotation.value = (rotation.value + 90) % 360
  }

  // Flip horizontally (mirror left/right)
  function flipHorizontal(): void {
    flipH.value = !flipH.value
  }

  // Flip vertically (mirror up/down)
  function flipVertical(): void {
    flipV.value = !flipV.value
  }

  // Set fit mode
  function setFitMode(mode: ImageFitMode): void {
    fitMode.value = mode
    if (mode === 'contain' || mode === 'cover') {
      scale.value = 1
      translateX.value = 0
      translateY.value = 0
    } else if (mode === 'actual') {
      scale.value = 1
      translateX.value = 0
      translateY.value = 0
    }
  }

  // Handle mouse wheel zoom
  function handleWheel(e: WheelEvent): void {
    e.preventDefault()

    const delta = e.deltaY > 0 ? -opts.zoomStep : opts.zoomStep

    // Zoom towards mouse position
    const newScale = Math.max(opts.minScale, Math.min(scale.value + delta, opts.maxScale))

    if (newScale !== scale.value) {
      // Calculate zoom center adjustment
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const centerX = e.clientX - rect.left - rect.width / 2
      const centerY = e.clientY - rect.top - rect.height / 2

      // Adjust translate to zoom towards cursor
      const scaleFactor = newScale / scale.value
      translateX.value = centerX - (centerX - translateX.value) * scaleFactor
      translateY.value = centerY - (centerY - translateY.value) * scaleFactor

      scale.value = newScale
    }
  }

  // Start drag
  function startDrag(e: MouseEvent): void {
    if (scale.value > 1) {
      isDragging.value = true
      dragStartX = e.clientX
      dragStartY = e.clientY
      lastTranslateX = translateX.value
      lastTranslateY = translateY.value
      const target = e.currentTarget as HTMLElement | null
      if (target) {
        target.style.cursor = 'grabbing'
      }
    }
  }

  // Handle drag
  function handleDrag(e: MouseEvent): void {
    if (!isDragging.value) return

    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY

    translateX.value = lastTranslateX + dx
    translateY.value = lastTranslateY + dy
  }

  // End drag
  function endDrag(): void {
    isDragging.value = false
  }

  // Handle image load
  function handleImageLoad(): void {
    imageLoaded.value = true
  }

  // Cleanup
  onUnmounted(() => {
    isDragging.value = false
  })

  return {
    scale,
    rotation,
    translateX,
    translateY,
    fitMode,
    flipH,
    flipV,
    isDragging,
    imageLoaded,
    displayScale,
    transformStyle,
    zoomIn,
    zoomOut,
    resetView,
    rotateLeft,
    rotateRight,
    flipHorizontal,
    flipVertical,
    setFitMode,
    handleWheel,
    startDrag,
    handleDrag,
    endDrag,
    handleImageLoad
  }
}
