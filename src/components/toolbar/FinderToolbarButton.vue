<template>
  <button
    class="finder-toolbar-btn"
    :class="[variantClass, { active, 'is-open': open }]"
    :disabled="disabled"
    :title="label"
    :aria-label="label"
    :aria-pressed="active ? 'true' : undefined"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Finder 工具栏按钮（从 FilePane.vue 工具栏抽取的共享组件，2026-08-17）。
 *
 * variant:
 * - round  —— `toolbar-btn-enhanced`：30×30 圆形、1px 浅描边、半透明底，
 *             FilePane 导航/动作组同款（hover=finder-control，active=系统蓝实底白图标）
 * - segment —— 视图切换分段钮：28×28、圆角 6、无独立描边，配合 bordered 分组托盘使用
 *
 * 单蓝规则：active 为唯一长蓝态（阅读开关/视图选中）；菜单打开态用 open
 * （1px 内嵌蓝描边），永不长蓝。宽度类（flex-shrink-0 等）经 attrs 透传合并。
 */
const props = withDefaults(defineProps<{
  variant?: 'round' | 'segment'
  /** 开启/选中态：系统蓝实底 + 白图标（唯一长蓝） */
  active?: boolean
  /** 菜单打开态：内嵌 1px 蓝描边（不占用 active 蓝语义） */
  open?: boolean
  disabled?: boolean
  /** Tooltip 与无障碍名（含快捷键文案） */
  label?: string
}>(), {
  variant: 'round',
  active: false,
  open: false,
  disabled: false,
  label: ''
})

const variantClass = computed(() => (props.variant === 'segment' ? 'finder-segment-btn' : 'toolbar-btn-enhanced'))
</script>
