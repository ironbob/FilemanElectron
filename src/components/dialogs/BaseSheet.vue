<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useSheetFocus } from '@/composables/useSheetFocus'
import IconfontIcon from '@/components/preview/IconfontIcon.vue'

/**
 * 共享弹窗外壳（Sheet v2）：振动材质遮罩 + 卡片 + 主体色图标芯片标题 + 身/脚插槽。
 * 统一 Esc 取消、遮罩点击关闭（dismissible=false 用于危险确认）、焦点陷阱与归还、
 * aria-modal、入场动效（CSS）。as='form' 时卡片为 form，⏎ 提交经 submit 事件回流。
 * 业务逻辑（IO/任务/校验）全留调用方，本组件只管外壳与交互契约。
 */
const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    /** 内置线性字形键（doc/folder/trash/network/gear/shield/image/video/info/link/archive/edit/copy）。 */
    glyph?: string
    /** 芯片主体色（CSS 颜色，默认系统蓝）。 */
    tone?: string
    width?: number
    maxWidth?: string
    /** 遮罩点击是否关闭；危险确认置 false。 */
    dismissible?: boolean
    showClose?: boolean
    as?: 'div' | 'form'
    z?: number
    sheetClass?: string
    bodyClass?: string
  }>(),
  {
    subtitle: '',
    glyph: '',
    tone: 'var(--accent-blue)',
    width: 440,
    maxWidth: '90vw',
    dismissible: true,
    showClose: false,
    as: 'div',
    z: 70,
    sheetClass: '',
    bodyClass: ''
  }
)

const emit = defineEmits<{ close: []; submit: [] }>()

const rootRef = ref<HTMLElement | null>(null)
useSheetFocus(rootRef)
useKeyInterceptor((e): boolean => {
  if (e.key === 'Escape') {
    emit('close')
    return true
  }
  return false
})

const GLYPHS: Record<string, string> = {
  doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  network: '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M12 7.4v4M12 11.4L6.4 16.8M12 11.4l5.6 5.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 16l-5-5-7 7"/>',
  video: '<path d="M22 8l-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
  link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8"/><path d="M10 12h4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>'
}

const glyphPath = computed(() => GLYPHS[props.glyph] ?? '')
const cardStyle = computed(() => ({ width: `${props.width}px`, maxWidth: props.maxWidth }))
</script>

<template>
  <div
    class="finder-sheet-mask"
    :style="{ zIndex: z }"
    @click.self="dismissible && emit('close')"
  >
    <component
      :is="as"
      ref="rootRef"
      class="finder-sheet flex flex-col"
      :class="sheetClass"
      :style="cardStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      data-testid="base-sheet"
      @submit.prevent="emit('submit')"
    >
      <slot name="header">
        <div class="flex items-start gap-3 px-5 pt-5">
          <span v-if="glyphPath" class="sheet-chip" :style="{ '--sheet-tone': tone }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" v-html="glyphPath" />
          </span>
          <div class="min-w-0 flex-1">
            <h3 class="sheet-title">{{ title }}</h3>
            <p v-if="subtitle" class="sheet-sub">{{ subtitle }}</p>
          </div>
          <button
            v-if="showClose"
            type="button"
            class="finder-icon-button -mr-1 -mt-1"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <IconfontIcon name="close" />
          </button>
        </div>
      </slot>
      <div class="sheet-body px-5 py-4" :class="bodyClass">
        <slot />
      </div>
      <div v-if="$slots.footer" class="sheet-foot px-5 pb-5">
        <slot name="footer" />
      </div>
    </component>
  </div>
</template>