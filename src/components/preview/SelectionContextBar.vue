<template>
  <!-- 对象上下文工具条（36px，选中对象包围盒上方浮动——不固定在图片底部）：
       迷你色板｜三档线宽｜复制｜删除。宿主按 overlay 暴露的显示包围盒定位并夹紧。 -->
  <div class="selection-context-bar edit-panel flex items-center gap-1 px-1.5 py-1" role="toolbar" :aria-label="$t('preview.editToolbar.railAria')">
    <!-- 当前色点 → 迷你色板 -->
    <div class="relative">
      <button
        class="edit-icon-btn !w-7 !h-7"
        :title="$t('preview.editToolbar.paramColor')"
        :aria-label="$t('preview.editToolbar.paramColor')"
        :aria-expanded="paletteOpen"
        @click="paletteOpen = !paletteOpen"
      >
        <span class="current-dot" :style="{ backgroundColor: color }"></span>
      </button>
      <div v-if="paletteOpen" class="edit-panel mini-palette absolute left-0 bottom-9 z-10 flex gap-1 p-1.5">
        <button
          v-for="c in colors"
          :key="c"
          class="mini-dot-cell"
          :class="{ 'is-selected': color === c }"
          :title="$t('preview.editToolbar.colorTip', { color: c })"
          :aria-label="$t('preview.editToolbar.colorTip', { color: c })"
          @click="pickColor(c)"
        >
          <span class="mini-dot" :class="{ 'is-bordered': c === '#FFFFFF' || c === '#000000' }" :style="{ backgroundColor: c }"></span>
        </button>
      </div>
    </div>

    <span class="edit-sep-v"></span>

    <!-- 三档线宽 -->
    <button
      v-for="w in widths"
      :key="w"
      class="edit-icon-btn !w-7 !h-7"
      :class="{ 'is-active': width === w }"
      :title="$t('preview.editToolbar.strokeWidthTip', { width: w })"
      :aria-label="$t('preview.editToolbar.strokeWidthTip', { width: w })"
      :aria-pressed="width === w"
      @click="emit('update', { width: w })"
    >
      <span class="width-line" :style="{ height: Math.min(w, 10) + 'px', backgroundColor: 'currentColor' }"></span>
    </button>

    <span class="edit-sep-v"></span>

    <button class="edit-icon-btn !w-7 !h-7" :title="$t('preview.editToolbar.duplicateTip')" :aria-label="$t('preview.editToolbar.duplicateTip')" @click="emit('duplicate')">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    </button>
    <button
      class="edit-icon-btn !w-7 !h-7 hover:!text-[color:var(--accent-red)]"
      :title="$t('preview.editToolbar.deleteTip')"
      :aria-label="$t('preview.editToolbar.deleteTip')"
      @click="emit('delete')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { AnnoStylePatch } from '@/composables/useImageEdit'

defineProps<{
  color: string
  width: number
  colors: readonly string[]
  widths: readonly number[]
}>()

const emit = defineEmits<{
  update: [patch: AnnoStylePatch]
  duplicate: []
  delete: []
}>()

const paletteOpen = ref(false)

function pickColor(c: string) {
  paletteOpen.value = false
  emit('update', { color: c })
}

// 面板外点击收起迷你色板
function onWindowPointerDown(e: PointerEvent) {
  if (paletteOpen.value && !(e.target as HTMLElement).closest('.selection-context-bar')) {
    paletteOpen.value = false
  }
}
onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, true))
onUnmounted(() => window.removeEventListener('pointerdown', onWindowPointerDown, true))
</script>

<style scoped>
.selection-context-bar {
  border-radius: 9px;
}

.current-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.5);
}

.mini-palette {
  border-radius: 8px;
}
.mini-dot-cell {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
}
.mini-dot-cell:hover {
  background: var(--finder-control);
}
.mini-dot-cell.is-selected {
  outline: 2px solid var(--finder-selection);
  outline-offset: 1px;
  border-radius: 9999px;
}
.mini-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
.mini-dot.is-bordered {
  box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.5);
}

.width-line {
  width: 14px;
  border-radius: 9999px;
}
</style>
