<template>
  <div
    class="finder-search-control relative flex items-center transition-all"
    :class="[rootClass, invalid ? 'is-invalid' : '']"
  >
    <span v-if="slots.leading" class="pl-3 pr-1 flex items-center flex-shrink-0 text-text-tertiary">
      <slot name="leading" />
    </span>
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      class="flex-1 min-w-0 h-full bg-transparent text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
      :class="slots.trailing ? 'pl-1.5 pr-1' : 'px-3'"
      :placeholder="placeholder"
      :spellcheck="spellcheck"
      v-bind="inputAttrs"
      @input="onInput"
      @keydown.enter="emit('enter', $event)"
      @keydown.esc="emit('escape', $event)"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
    <span v-if="slots.trailing" class="pr-1.5 pl-0.5 flex items-center gap-0.5 flex-shrink-0">
      <slot name="trailing" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'

/**
 * Finder 搜索框（从 FilePane.vue 工具栏搜索框抽取的共享组件，2026-08-17）。
 *
 * 两种形态：
 * - 默认（文本预览工具栏）：h-8、bg-bg-secondary/50、border-border/50、rounded-lg；
 *   聚焦 border-accent-blue/50 + 实底。宽度由调用方类控制（文本预览：w-[280px] 固定）。
 * - capsule（FilePane 工具栏右侧大型搜索胶囊，2026-08-19）：36px 高、18px 圆角、
 *   半透明系统材质 + blur（.finder-search-capsule，见 finder-ui.css）；
 *   聚焦为克制的系统蓝 3px 焦点环。宽度由调用方 clamp() 控制。
 *
 * 插槽：leading（放大镜等前导）/ trailing（清除、计数等尾随，随内容在流内排列）。
 * 事件：enter/escape/focus/blur 原样透传键盘与焦点行为；input 走 v-model。
 */
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  spellcheck?: boolean
  invalid?: boolean
  /** 大型浮动胶囊形态（FilePane 工具栏搜索） */
  capsule?: boolean
  /** 需要落到 <input> 上的额外属性（如 maxlength） */
  inputAttrs?: Record<string, unknown>
}>(), {
  placeholder: '',
  spellcheck: false,
  invalid: false,
  capsule: false,
  inputAttrs: () => ({})
})
void props // props 经模板使用；此行仅消除 noUnusedLocals 误报（inputAttrs 走 v-bind）

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: [value: string]
  enter: [event: KeyboardEvent]
  escape: [event: KeyboardEvent]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const slots = useSlots()
const inputRef = ref<HTMLInputElement | null>(null)

const rootClass = computed(() => (props.capsule
  ? 'finder-search-capsule'
  : 'h-8 bg-bg-secondary/50 border rounded-lg focus-within:bg-bg-secondary border-border/50 focus-within:border-accent-blue/50'))

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  emit('input', value)
}

function focus(): void {
  inputRef.value?.focus()
}

/** 聚焦并全选（⌘F 语义） */
function selectAll(): void {
  inputRef.value?.focus()
  inputRef.value?.select()
}

defineExpose({ focus, selectAll, inputRef })
</script>
