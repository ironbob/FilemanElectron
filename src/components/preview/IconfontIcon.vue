<template>
  <span
    class="iconfont-preview-icon"
    :class="sizeClass"
    :aria-hidden="decorative || undefined"
    :aria-label="decorative ? undefined : label"
  >{{ glyph }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Preview controls use the Iconfont public collection (project 115436), kept in
 * one registry so every preview has the same visual language and a glyph cannot
 * silently drift between file types.
 */
const ICONS = {
  image: '\ue74b',
  video: '\ue752',
  document: '\ue61c',
  code: '\ue628',
  binary: '\ue939',
  archive: '\ue874',
  zoomIn: '\ue667',
  zoomOut: '\ue65d',
  reset: '\ue94a',
  rotateLeft: '\ue65a',
  rotateRight: '\ue662',
  fit: '\ue677',
  actualSize: '\ue91a',
  expand: '\ue7e8',
  collapse: '\ue7e7',
  previous: '\ue621',
  next: '\ue620',
  up: '\ue622',
  down: '\ue605',
  jump: '\ue833',
  top: '\ue619',
  search: '\ue645',
  close: '\ue60c',
  pip: '\ue936',
  play: '\ue957',
  copy: '\ue646',
  more: '\ue649'
} as const

export type IconfontIconName = keyof typeof ICONS

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

const glyph = computed(() => ICONS[props.name])
const sizeClass = computed(() => `iconfont-preview-icon--${props.size}`)
</script>
