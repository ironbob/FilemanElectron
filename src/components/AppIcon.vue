<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="decorative || undefined"
    :aria-label="decorative ? undefined : label"
    v-html="markup"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GLYPHS } from './icons/glyphs'

/**
 * 全应用统一图标渲染器（内联 SVG，currentColor 上色）。
 * 取代 <img> 渲染：不再需要 invert(1) 反色 hack，图标随父级 color 着色，
 * 亮/暗主题与选中态天然一致。name 走统一字形库 GLYPHS。
 *
 * 尺寸由使用方 class 控制（w-5 h-5 / finder-icon / iconfont-preview-icon 等）；
 * 描边默认 1.75（配合 .app-icon * 的 non-scaling-stroke，各尺寸光学粗细一致）。
 */
const props = withDefaults(defineProps<{
  name: string
  label?: string
  decorative?: boolean
  stroke?: number
}>(), {
  label: '',
  decorative: true,
  stroke: 1.75
})

const markup = computed(() => {
  const source = GLYPHS[props.name]
  if (!source) {
    console.warn('[AppIcon] unknown icon requested', { name: props.name })
    return GLYPHS.folder
  }
  return source
})
</script>