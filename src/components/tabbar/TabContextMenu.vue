<template>
  <!-- 标签右键菜单：复用全局 .context-menu 系列类（style.css），
       fixed 定位 + 视口钳制（FileList clampContextMenuToViewport 模式）。
       外点关闭走 capture 阶段 pointerdown。 -->
  <div
    ref="menuEl"
    class="context-menu fixed animate-fade-in"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    @contextmenu.prevent.stop
  >
    <button class="context-menu-item" @click="run('close')">
      <span>{{ $t('tabs.menu.close') }}</span>
      <span class="ctx-shortcut">⌘W</span>
    </button>
    <button class="context-menu-item" :disabled="!hasOthers" @click="run('closeOthers')">
      {{ $t('tabs.menu.closeOthers') }}
    </button>
    <button class="context-menu-item" :disabled="!hasRight" @click="run('closeRight')">
      {{ $t('tabs.menu.closeRight') }}
    </button>
    <hr class="context-menu-separator" />
    <button class="context-menu-item" @click="run('togglePin')">
      {{ tab.pinned ? $t('tabs.menu.unpin') : $t('tabs.menu.pin') }}
    </button>
    <hr class="context-menu-separator" />
    <button class="context-menu-item" :disabled="!path" @click="run('copyPath')">
      <span>{{ $t('tabs.menu.copyPath') }}</span>
      <span class="ctx-shortcut">⇧⌘C</span>
    </button>
    <button v-if="tab.titleAlias" class="context-menu-item" @click="run('resetAlias')">
      {{ $t('tabs.menu.resetAlias') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { Tab } from '@/types'
import { tabFullPath } from '@/utils/tabTitles'

export type TabContextMenuAction =
  | 'close' | 'closeOthers' | 'closeRight' | 'togglePin' | 'copyPath' | 'resetAlias'

const props = defineProps<{
  tab: Tab
  /** 是否存在可关的其他标签（父级按 pinned/索引算好传入）。 */
  hasOthers: boolean
  /** 右侧是否还有可关标签。 */
  hasRight: boolean
  /** 右键坐标（client 坐标系）。 */
  x: number
  y: number
}>()

const emit = defineEmits<{
  action: [action: TabContextMenuAction, tabId: string]
  close: []
}>()

const menuEl = ref<HTMLElement | null>(null)
const pos = reactive({ x: props.x, y: props.y })

const path = computed(() => tabFullPath(props.tab))

// ── 视口钳制（量取实际尺寸后翻转/内缩） ──────────────────────────────────────
onMounted(async () => {
  await nextTick()
  const el = menuEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const MARGIN = 8
  if (props.x + rect.width > window.innerWidth - MARGIN) {
    pos.x = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN)
  }
  if (props.y + rect.height > window.innerHeight - MARGIN) {
    pos.y = Math.max(MARGIN, props.y - rect.height)
  }
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('keydown', onKeydown, true)
})

function onOutsidePointerDown(e: PointerEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

function run(action: TabContextMenuAction) {
  emit('action', action, props.tab.id)
  emit('close')
}
</script>

<style scoped>
.ctx-shortcut {
  margin-left: auto;
  padding-left: 24px;
  opacity: 0.5;
  font-size: 11px;
}
</style>
