<template>
  <AppIcon
    :class="['iconfont-preview-icon', sizeClass]"
    :name="name"
    :label="label"
    :decorative="decorative"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'

/**
 * 预览控件图标。统一走 AppIcon 内联 SVG 字形库（取代 iconfont 字体），
 * 保留 name 语义、size 规格与 .iconfont-preview-icon 类（e2e 与尺寸沿用）。
 * 字形与命名不再漂移：close 即标准 X，旋转/缩放等均为统一 24 网格线性图标。
 */
const ICON_NAMES = [
  'image', 'video', 'document', 'code', 'binary', 'archive',
  'zoomIn', 'zoomOut', 'reset', 'rotateLeft', 'rotateRight', 'fit',
  'expand', 'collapse', 'previous', 'next', 'up', 'down', 'jump', 'top',
  'search', 'close', 'pip', 'play', 'copy', 'more'
] as const

export type IconfontIconName = typeof ICON_NAMES[number]

const props = withDefaults(defineProps<{
  name: IconfontIconName
  label?: string
  decorative?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  label: '',
  decorative: true,
  size: 'md'
})

const sizeClass = computed(() => `iconfont-preview-icon--${props.size}`)
</script>