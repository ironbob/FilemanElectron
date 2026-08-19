<template>
  <button
    class="finder-toolbar-btn"
    :class="[variantClass, { active: active && !activeQuiet, 'is-quiet-active': activeQuiet, 'is-open': open }]"
    :disabled="disabled"
    :title="label"
    :aria-label="label"
    :aria-pressed="active || activeQuiet ? 'true' : undefined"
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
 *             文本预览工具栏圆钮同款（hover=finder-control，active=系统蓝实底白图标）
 * - segment —— 视图切换分段钮：28×28、无独立描边；2026-08-19 起激活态为克制浅灰
 *             （Finder 式，不再高饱和蓝），胶囊/托盘两种容器通用
 * - pill（2026-08-19）—— FilePane 浮动胶囊内按钮：透明底圆钮、hover 浅灰、
 *             打开/低调开启态浅灰实底，长蓝仅 active 语义保留
 *
 * 单蓝规则：active 为唯一长蓝态（阅读开关等）；菜单打开态用 open
 * （胶囊内为浅灰实底，round 钮为 1px 内嵌蓝描边），永不长蓝。
 * activeQuiet（2026-08-19）保留 aria-pressed 语义但视觉降为浅灰——
 * 默认即开的开关（双面板/自动换行）不得常驻长蓝抢占主操作焦点。
 * 宽度类（flex-shrink-0 等）经 attrs 透传合并。
 */
const props = withDefaults(defineProps<{
  variant?: 'round' | 'segment' | 'pill'
  /** 开启/选中态：系统蓝实底 + 白图标（唯一长蓝） */
  active?: boolean
  /** 低调开启态：aria-pressed 保留，视觉浅灰（非长蓝） */
  activeQuiet?: boolean
  /** 菜单打开态（不占用 active 蓝语义） */
  open?: boolean
  disabled?: boolean
  /** Tooltip 与无障碍名（含快捷键文案） */
  label?: string
}>(), {
  variant: 'round',
  active: false,
  activeQuiet: false,
  open: false,
  disabled: false,
  label: ''
})

const variantClass = computed(() => {
  if (props.variant === 'segment') return 'finder-segment-btn'
  if (props.variant === 'pill') return 'finder-pill-btn'
  return 'toolbar-btn-enhanced'
})
</script>
