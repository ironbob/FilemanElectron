<template>
  <AppIcon class="finder-icon" :name="name" :label="label" :decorative="decorative" />
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/**
 * Finder 图标（工具栏/对话框等）。统一走 AppIcon 内联 SVG 字形库，
 * 保留原有 name 语义与 .finder-icon 尺寸类；不再以 <img> 渲染，
 * 因此图标随 currentColor 着色（见 finder-ui.css，已移除 invert 反色）。
 */
const FINDER_ICON_NAMES = [
  'appWindow', 'arrowLeft', 'arrowRight', 'arrowUpDown', 'circle', 'clock3',
  'fileText', 'folder', 'hardDrive', 'layoutGrid', 'maximize2', 'minus',
  'monitor', 'radioTower', 'search', 'share', 'tags', 'x'
] as const

type FinderIconName = typeof FINDER_ICON_NAMES[number]

withDefaults(defineProps<{
  name: FinderIconName
  label?: string
  decorative?: boolean
}>(), {
  label: '',
  decorative: true
})
</script>