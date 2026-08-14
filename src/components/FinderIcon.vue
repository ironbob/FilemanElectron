<template>
  <img
    class="finder-icon"
    :src="iconSource"
    :alt="decorative ? '' : label"
    :aria-hidden="decorative || undefined"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import appWindow from '../assets/finder-icons/app-window.svg'
import arrowLeft from '../assets/finder-icons/arrow-left.svg'
import arrowRight from '../assets/finder-icons/arrow-right.svg'
import arrowUpDown from '../assets/finder-icons/arrow-up-down.svg'
import circle from '../assets/finder-icons/circle.svg'
import clock3 from '../assets/finder-icons/clock-3.svg'
import fileText from '../assets/finder-icons/file-text.svg'
import folder from '../assets/finder-icons/folder.svg'
import hardDrive from '../assets/finder-icons/hard-drive.svg'
import layoutGrid from '../assets/finder-icons/layout-grid.svg'
import maximize2 from '../assets/finder-icons/maximize-2.svg'
import minus from '../assets/finder-icons/minus.svg'
import monitor from '../assets/finder-icons/monitor.svg'
import radioTower from '../assets/finder-icons/radio-tower.svg'
import search from '../assets/finder-icons/search.svg'
import share from '../assets/finder-icons/share.svg'
import tags from '../assets/finder-icons/tags.svg'
import x from '../assets/finder-icons/x.svg'

const FINDER_ICONS = {
  appWindow,
  arrowLeft,
  arrowRight,
  arrowUpDown,
  circle,
  clock3,
  fileText,
  folder,
  hardDrive,
  layoutGrid,
  maximize2,
  minus,
  monitor,
  radioTower,
  search,
  share,
  tags,
  x
} as const

type FinderIconName = keyof typeof FINDER_ICONS

const log = console
const props = withDefaults(defineProps<{
  name: FinderIconName
  label?: string
  decorative?: boolean
}>(), {
  label: '',
  decorative: true
})

const iconSource = computed(() => {
  const source = FINDER_ICONS[props.name]
  if (!source) {
    log.warn('[FinderIconRegistry] unknown icon requested', { name: props.name })
    return folder
  }
  return source
})
</script>
