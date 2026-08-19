<template>
  <div
    class="finder-toolbar-group flex items-center"
    :class="groupClass"
    role="group"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Finder 工具栏分组托盘（从 FilePane.vue 工具栏抽取的共享组件，2026-08-17）。
 *
 * - capsule（FilePane 浮动胶囊，2026-08-19）：半透明系统材质 + blur(20px) 的独立
 *   浮动胶囊（.finder-toolbar-capsule，见 finder-ui.css），内放 pill/segment 钮；
 *   FilePane 工具栏重设计后导航/视图/排序/操作各组均为胶囊
 * - 默认（文本预览工具栏）：半透明浅底托盘 + 2px 内边距，内放 round 圆钮
 * - bordered（默认托盘外加 1px 发丝描边）：文本预览查找导航组在用
 *
 * 额外类（flex-shrink-0 等）经 attrs 透传合并到根元素。
 */
const props = withDefaults(defineProps<{
  bordered?: boolean
  capsule?: boolean
}>(), {
  bordered: false,
  capsule: false
})

const groupClass = computed(() => {
  if (props.capsule) return 'finder-toolbar-capsule'
  return props.bordered ? 'gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5 border border-border/50' : 'gap-0.5 bg-bg-secondary/50 rounded-lg p-0.5'
})
</script>
