<template>
  <!-- 尺寸/颜色由消费方用 class 指定（如 w-[15px] h-[15px] text-text-secondary），
       与 App 内其它内联 stroke 图标同一用法。 -->
  <svg
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  >
    <path
      v-for="(d, i) in paths"
      :key="i"
      :d="d"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TAB_ICON_PATHS, type TabIconName } from './tabIcons'

const props = withDefaults(defineProps<{
  name: TabIconName
  strokeWidth?: number
}>(), {
  strokeWidth: 2
})

const paths = computed(() => TAB_ICON_PATHS[props.name] ?? TAB_ICON_PATHS.folder)
</script>
