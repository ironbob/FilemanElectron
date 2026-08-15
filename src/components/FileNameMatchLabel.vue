<template>
  <span :aria-label="name">
    <template v-for="(character, index) in characters" :key="`${character}-${index}`">
      <mark v-if="highlightedIndices.has(index)" :class="selected ? 'rounded finder-mark-selected' : 'rounded bg-amber-300/80 text-text-primary dark:bg-amber-400/50 dark:text-text-primary'">{{ character }}</mark>
      <template v-else>{{ character }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  highlightIndices?: readonly number[]
  selected?: boolean
}>(), {
  highlightIndices: () => [],
  selected: false
})

const characters = computed(() => Array.from(props.name))
const highlightedIndices = computed(() => new Set(props.highlightIndices))
</script>

<style scoped>
/* 选中态高亮字符：浅灰底，文字颜色继承选中文字色（Finder 式） */
.finder-mark-selected {
  background-color: var(--finder-mark-bg);
}
</style>
