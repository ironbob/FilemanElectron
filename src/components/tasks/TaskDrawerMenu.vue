<template>
  <!-- 抽屉头部 ⋯ 菜单：暂停/恢复队列（按 queuePaused 翻转）+ 取消全部（危险，
       经 ConfirmDialog 二次确认）。定位/外点关闭/Esc 照 TabOverviewMenu 模式。 -->
  <div
    ref="menuEl"
    class="task-menu"
    :style="{ right: `${pos.right}px`, top: `${pos.top}px` }"
    data-testid="task-drawer-menu"
    @contextmenu.prevent.stop
  >
    <button class="task-menu-item" data-testid="task-menu-pause" @click="emit('toggle-pause')">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path v-if="!queuePaused" stroke-linecap="round" d="M9 5v14M15 5v14" />
        <path v-else stroke-linecap="round" stroke-linejoin="round" d="M7 4l12 8-12 8V4z" />
      </svg>
      {{ queuePaused ? t('tasks.drawer.resumeQueue') : t('tasks.drawer.pauseQueue') }}
    </button>
    <div class="task-menu-sep"></div>
    <button class="task-menu-item is-danger" data-testid="task-menu-cancel-all" @click="emit('cancel-all')">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 8l8 8M16 8l-8 8" />
      </svg>
      {{ t('tasks.drawer.cancelAll') }}
    </button>
    <div v-if="queuePaused" class="task-menu-hint">{{ t('tasks.drawer.queuePausedHint') }}</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import { t } from '@/i18n'

const props = defineProps<{
  queuePaused: boolean
  /** 锚点（⋯ 按钮 rect，client 坐标系），菜单右对齐其下沿展开。 */
  anchor: DOMRect
}>()

const emit = defineEmits<{
  'toggle-pause': []
  'cancel-all': []
  close: []
}>()

// 存续期间放行标题栏拖拽区（v-if 挂载即打开），否则点标题栏的外点关闭收不到事件
useAppDragSuspend()

const menuEl = ref<HTMLElement | null>(null)
const pos = reactive({ right: 0, top: 0 })

onMounted(() => {
  const MARGIN = 8
  pos.right = Math.max(MARGIN, window.innerWidth - props.anchor.right)
  pos.top = props.anchor.bottom + 6
  if (menuEl.value) {
    const h = menuEl.value.getBoundingClientRect().height
    if (pos.top + h > window.innerHeight - MARGIN) {
      pos.top = Math.max(MARGIN, props.anchor.top - h - 6)
    }
  }
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('keydown', onKeydownCapture, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('keydown', onKeydownCapture, true)
})

function onOutsidePointerDown(e: PointerEvent): void {
  if (menuEl.value?.contains(e.target as Node)) return
  emit('close')
}

function onKeydownCapture(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('close')
}
</script>

<style scoped>
.task-menu {
  position: fixed;
  width: 220px;
  z-index: var(--z-dropdown);
  background: var(--finder-chrome);
  border: 1px solid var(--finder-divider);
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  padding: 4px;
}

.task-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--finder-label);
  text-align: left;
}

.task-menu-item:hover {
  background: var(--finder-row-hover);
}

.task-menu-item.is-danger {
  color: var(--accent-red);
}

.task-menu-item.is-danger:hover {
  background: rgba(255, 69, 58, 0.12);
}

.task-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--finder-divider);
}

.task-menu-hint {
  padding: 6px 8px 4px;
  font-size: 11px;
  color: var(--finder-secondary-label);
}
</style>
