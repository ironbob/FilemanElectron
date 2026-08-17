<template>
  <!-- 单标签：类型图标 + 前缀/叶子标题 + 关闭/脏点槽位。
       激活态材质/hairline 在 finder-ui.css 全局层；这里只管几何与结构。
       pinned 紧凑形态：仅图标（36px），脏点以角标显示。 -->
  <div
    class="tab-item group"
    :class="[
      active ? 'tab-item-active' : 'tab-item-inactive',
      tab.pinned ? 'is-pinned' : ''
    ]"
    role="tab"
    :aria-selected="active"
    :aria-label="a11yLabel"
    :title="tooltip"
    :tabindex="active ? 0 : -1"
    @click="$emit('select', tab.id)"
    @dblclick="startRename"
    @contextmenu.prevent.stop="$emit('contextmenu', $event)"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <TabIcon
      :name="icon"
      class="tab-icon shrink-0"
      :class="active && icon === 'folder' ? 'text-accent-blue' : 'text-text-secondary'"
    />

    <!-- 目录失效标记（pane.loadError）：常驻显示，hover 不让位（与脏点不同，
         错误需要持续可见）；pinned 紧凑态改走角标 -->
    <svg
      v-if="error && !tab.pinned"
      class="tab-error-icon w-3 h-3 shrink-0 text-accent-red"
      :title="$t('fileList.loadError.missingTitle')"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>

    <template v-if="!tab.pinned">
      <!-- 别名重命名（本地显示名，Enter/失焦保存，Esc 取消；绝不改磁盘文件） -->
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="tab-rename-input"
        :placeholder="$t('tabs.renamePlaceholder')"
        @keydown.stop="onRenameKeydown"
        @blur="commitRename"
        @click.stop
        @pointerdown.stop
      />
      <span v-else class="tab-title-box">
        <!-- 前缀先牺牲（flex-shrink 1000），叶子名最后截断 -->
        <span v-if="label.prefix" class="tab-title-prefix">{{ label.prefix }} › </span>
        <span class="tab-title-leaf">{{ label.leaf }}</span>
      </span>

      <!-- 关闭/脏点槽位：同槽叠放、透明度切换（按钮常驻 DOM 保证 aria 名稳定；
           脏点静默显示，hover 让位给 ✕）；唯一标签不可关但脏点仍显示 -->
      <span v-if="closable || dirty" class="tab-close-slot">
        <span
          v-if="dirty && !hovered"
          class="tab-dirty-dot"
          :title="$t('preview.text.unsavedAria')"
        />
        <button
          v-if="closable"
          class="close-button"
          :class="active || hovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
          :aria-label="$t('tabs.overview.closeRowAria', { name: label.leaf })"
          :title="dirty ? $t('preview.text.unsavedAria') : undefined"
          @click.stop="$emit('close', tab.id)"
          @pointerdown.stop
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
    </template>

    <!-- pinned 紧凑态：脏点角标 + 目录失效角标 -->
    <span v-if="tab.pinned && dirty" class="tab-dirty-dot tab-dirty-badge" />
    <span v-if="tab.pinned && error" class="tab-error-badge" :title="$t('fileList.loadError.missingTitle')">
      <svg class="tab-error-icon w-3 h-3 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Tab } from '@/types'
import TabIcon from './TabIcon.vue'
import { iconForTab } from './tabIcons'

export interface TabLabel {
  /** 同名消歧前缀（如 'Downloads'）；无冲突为 null。 */
  prefix: string | null
  /** 叶子名（工具页 = i18n 后的标题）。 */
  leaf: string
}

const props = defineProps<{
  tab: Tab
  active: boolean
  dirty: boolean
  /** 目录失效（任一 pane.loadError 非空）→ ⚠ 标记。 */
  error: boolean
  /** 唯一标签不可关（never-empty 规则）。 */
  closable: boolean
  label: TabLabel
  tooltip: string
  /** 无障碍名（vue-tsc 不把 aria-* 属性映射到同名 prop，故改名转发）。 */
  a11yLabel: string
}>()

const emit = defineEmits<{
  select: [tabId: string]
  close: [tabId: string]
  contextmenu: [event: MouseEvent]
  rename: [tabId: string, alias: string]
}>()

const icon = computed(() => iconForTab(props.tab))

// ── 别名重命名 ────────────────────────────────────────────────────────────────
const renaming = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename() {
  if (props.tab.pinned) return
  renaming.value = true
  renameValue.value = props.tab.titleAlias ?? props.label.leaf
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    renaming.value = false
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commitRename()
  }
}

function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  const next = renameValue.value.trim()
  if (!next || next === (props.tab.titleAlias ?? props.label.leaf)) return
  emit('rename', props.tab.id, next)
}

const hovered = ref(false)
</script>

<style scoped>
.tab-item {
  @apply flex items-center gap-1.5 rounded-[7px] transition-all duration-150 ease-in-out select-none;
  -webkit-app-region: no-drag; /* 标签栏整体可拖动窗口，tab 本身豁免 */
  height: 28px;
  flex-shrink: 0;
  min-width: 96px;
  max-width: 180px;
  padding: 0 6px 0 11px;
  cursor: default;
}

.tab-icon {
  width: 15px;
  height: 15px;
}

.tab-title-box {
  @apply flex items-baseline min-w-0 overflow-hidden;
  flex: 1 1 auto;
}

.tab-title-prefix {
  @apply text-xs truncate whitespace-nowrap;
  /* 前缀先牺牲：shrink 权重远大于叶子 */
  flex: 1000 1 auto;
  min-width: 0;
}

.tab-title-leaf {
  @apply text-xs truncate whitespace-nowrap;
  flex: 1 1 auto;
  min-width: 0;
}

.tab-item-active .tab-title-leaf,
.tab-item-active .tab-title-prefix {
  font-weight: 600;
}

.tab-close-slot {
  @apply flex items-center justify-center shrink-0;
  position: relative;
  width: 24px;   /* ✕ 16px 视觉 / 24×24 热区 */
  height: 24px;
  margin-left: -2px;
}

.close-button {
  @apply w-6 h-6 flex items-center justify-center rounded-full transition-opacity duration-150;
  @apply text-text-secondary hover:text-text-primary;
  position: absolute;
  inset: 0;
}

.tab-dirty-dot {
  @apply rounded-full;
  /* 纯视觉指示：不拦截指针（点击该区域落到常驻的 ✕ 上，走未保存确认） */
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  background: var(--finder-secondary-label, rgba(127, 127, 127, 0.55));
}

.tab-dirty-badge {
  position: absolute;
  top: 3px;
  right: 3px;
}

.tab-error-badge {
  @apply flex items-center justify-center;
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.tab-rename-input {
  @apply text-xs rounded-[5px] min-w-0 flex-1;
  background: var(--finder-control, rgba(127, 127, 127, 0.12));
  color: var(--finder-label, inherit);
  padding: 1px 6px;
  outline: 1px solid var(--border-focus, rgba(0, 122, 255, 0.5));
}

.is-pinned {
  min-width: 36px;
  max-width: 36px;
  width: 36px;
  padding: 0;
  justify-content: center;
  position: relative;
}
</style>
