<script setup lang="ts">
/**
 * 标签右键菜单：复用 FinderContextMenu（NSMenu §11 规范实现）。
 * 本组件只负责把 Tab 语义组装成菜单项（快捷键 / 禁用门控 / 条件项）并转发
 * action；材质、28px 行、三列对齐、蓝底白字高亮、键盘 ↑↓/Enter/Esc、
 * 视口钳制全部由 FinderContextMenu 提供。
 * 外点关闭（pointerdown 捕获）仍由本组件负责（FinderContextMenu 无此机制）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Tab } from '@/types'
import FinderContextMenu, { type FinderMenuItem } from '@/components/menu/FinderContextMenu.vue'
import { useI18n } from 'vue-i18n'

export type TabContextMenuAction =
  | 'close' | 'closeOthers' | 'closeRight' | 'togglePin' | 'copyPath' | 'resetAlias'

const props = defineProps<{
  tab: Tab
  /** 是否存在可关的其他标签（父级按 pinned/索引算好传入）。 */
  hasOthers: boolean
  /** 右侧是否还有可关的标签。 */
  hasRight: boolean
  /** 右键坐标（client 坐标系）。 */
  x: number
  y: number
}>()

const emit = defineEmits<{
  action: [action: TabContextMenuAction, tabId: string]
  close: []
}>()

const { t } = useI18n()
const menuEl = ref<HTMLElement | null>(null)

const items = computed<FinderMenuItem[]>(() => {
  const list: FinderMenuItem[] = [
    { label: t('tabs.menu.close'), action: 'close', shortcut: '⌘W' },
    { label: t('tabs.menu.closeOthers'), action: 'closeOthers', disabled: !props.hasOthers },
    { label: t('tabs.menu.closeRight'), action: 'closeRight', disabled: !props.hasRight },
    { label: '---', action: '__divider__' },
    { label: props.tab.pinned ? t('tabs.menu.unpin') : t('tabs.menu.pin'), action: 'togglePin' },
    { label: '---', action: '__divider__' },
    { label: t('tabs.menu.copyPath'), action: 'copyPath', shortcut: '⇧⌘C' }
  ]
  if (props.tab.titleAlias) {
    list.push({ label: t('tabs.menu.resetAlias'), action: 'resetAlias' })
  }
  return list
})

function onSelect(action: string) {
  emit('action', action as TabContextMenuAction, props.tab.id)
  emit('close')
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
})

function onOutsidePointerDown(e: PointerEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
  emit('close')
}
</script>

<template>
  <div ref="menuEl">
    <FinderContextMenu :items="items" :x="x" :y="y" @select="onSelect" @close="$emit('close')" />
  </div>
</template>
