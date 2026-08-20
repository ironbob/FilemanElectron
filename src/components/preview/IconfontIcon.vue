<template>
  <!-- close \u8d70\u5185\u8054 SVG xmark\uff1a\u5b57\u4f53 \ue60c\u300cguanbi\u300d\u5b57\u5f62\u5b9e\u4e3a\u5f2f\u5f27\uff08\u7528\u6237\u5b9e\u6d4b\u5448\u773c\u775b\u72b6\uff09\uff0c
       \u96c6\u5408\u5b57\u4f53\uff08project 115436\uff09\u547d\u540d\u4e0e\u5b57\u5f62\u4e0d\u53ef\u4fe1\uff0c\u53c9\u5f62\u4e0d\u518d\u8d4c\u7801\u4f4d\u3002 -->
  <svg
    v-if="name === 'close'"
    class="iconfont-preview-icon"
    :class="sizeClass"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    :aria-hidden="decorative || undefined"
    :aria-label="decorative ? undefined : label"
  >
    <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />
  </svg>
  <span
    v-else
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
 *
 * 2026-08-20 \u5ba1\u8ba1\uff08fontTools cmap + \u6e32\u67d3\u6bd4\u5bf9\uff09\uff1a
 *  - close \u5df2\u6539\u5185\u8054 SVG\uff08\u89c1\u6a21\u677f\u6ce8\u91ca\uff09\uff1bactualSize(\ue91a) \u5b57\u5f62\u662f\u300c\u773c\u775b\u300d\u4e14\u65e0\u4f7f\u7528\u65b9\uff0c\u5220\u9664\u3002
 *  - rotateLeft/rotateRight \u89c6\u89c9\u590d\u6838\u65b9\u5411\u6b63\u786e\uff08cmap \u547d\u540d zuoxuan/zuoxuan2 \u8bef\u5bfc\uff0c\u52ff\u636e\u540d\u6539\u7801\u4f4d\uff09\u3002
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
  expand: '\ue7e8',
  collapse: '\ue7e7',
  previous: '\ue621',
  next: '\ue620',
  up: '\ue622',
  down: '\ue605',
  jump: '\ue833',
  top: '\ue619',
  search: '\ue645',
  close: '\ue60c', // \u5df2\u4e0d\u4f7f\u7528\uff1a\u6a21\u677f\u5bf9 close \u7279\u5224\u5185\u8054 SVG\u3002\u4fdd\u7559\u7801\u4f4d\u4ec5\u4f5c\u5360\u4f4d\uff0c\u9632\u5916\u90e8\u6309\u540d\u53d6 glyph\u3002
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
