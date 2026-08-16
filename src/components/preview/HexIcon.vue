<template>
  <!-- SF Symbols 风格单色线性图标（stroke 随 currentColor；v-html 为模块内常量，无注入面） -->
  <svg
    class="hex-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name]"
  />
</template>

<script setup lang="ts">
/**
 * Hex 编辑器工具栏图标（内联 SVG，SF Symbols 语义对齐）。
 * 与 iconfont 体系并存：hex 工具栏需要 macOS 语义单色线性图标，
 * iconfont 面向彩色大图标场景，二者不复用以避免视觉漂移。
 */
const ICONS = {
  // magnifyingglass
  search: '<circle cx="6.75" cy="6.75" r="4.25"/><path d="M10 10l3.5 3.5"/>',
  // arrow.right.to.line
  jump: '<path d="M2.75 8h7M7 4.75 10.25 8 7 11.25"/><path d="M13.25 3.5v9"/>',
  // chevron.up / chevron.down
  chevronUp: '<path d="M4.5 9.75 8 6.25l3.5 3.5"/>',
  chevronDown: '<path d="M4.5 6.25 8 9.75l3.5-3.5"/>',
  // arrow.uturn.backward / forward
  undo: '<path d="M4.25 6.75h6a2.75 2.75 0 0 1 0 5.5H8"/><path d="M6.5 4.5 4.25 6.75 6.5 9"/>',
  redo: '<path d="M11.75 6.75h-6a2.75 2.75 0 0 0 0 5.5H8"/><path d="M9.5 4.5 11.75 6.75 9.5 9"/>',
  // slider.horizontal.3
  sliders:
    '<path d="M2.5 4h13.5M2.5 8h13.5M2.5 12h13.5"/>' +
    '<circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  // sidebar.right
  sidebar: '<rect x="2.25" y="3" width="11.5" height="10" rx="1.5"/><path d="M10.25 3v10"/>',
  // square.and.arrow.down
  save: '<path d="M3.5 9.75V11A1.5 1.5 0 0 0 5 12.5h6a1.5 1.5 0 0 0 1.5-1.5V9.75"/><path d="M8 2.75v6M5.9 6.65 8 8.75l2.1-2.1"/>',
  // lock
  lock: '<rect x="3.75" y="7" width="8.5" height="5.75" rx="1.25"/><path d="M5.75 7V5.5a2.25 2.25 0 0 1 4.5 0V7"/>',
  // xmark
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  // checkmark.circle
  check: '<circle cx="8" cy="8" r="5.75"/><path d="M5.5 8.25 7.2 9.95l3.4-3.75"/>',
  // square.dashed（Inspector 空态）
  dashed: '<rect x="3" y="3" width="10" height="10" rx="1.5" stroke-dasharray="2.4 1.8"/>',
  // doc（空文件态）
  doc: '<path d="M4.25 2.5h4.5l3 3v8a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8.75 2.5v3h3"/>'
} as const

export type HexIconName = keyof typeof ICONS

withDefaults(defineProps<{
  name: HexIconName
  /** 视觉边长（px）；图标按钮内 17，内嵌字段 13。 */
  size?: number
}>(), {
  size: 17
})
</script>
