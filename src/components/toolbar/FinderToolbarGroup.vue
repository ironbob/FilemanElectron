<template>
  <div
    class="finder-toolbar-group flex items-center gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5"
    :class="{ 'border border-border/50': bordered }"
    role="group"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * Finder 工具栏分组托盘（从 FilePane.vue 工具栏抽取的共享组件，2026-08-17）。
 *
 * - 默认（nav/actions 组）：半透明浅底托盘 + 2px 内边距，内放 round 圆钮
 * - bordered（视图切换组）：外加 1px 发丝描边，内放 segment 分段钮
 *
 * 额外类（flex-shrink-0 等）经 attrs 透传合并到根元素。
 */
withDefaults(defineProps<{
  bordered?: boolean
}>(), {
  bordered: false
})
</script>
