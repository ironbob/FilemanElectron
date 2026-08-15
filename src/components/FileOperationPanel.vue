<template>
  <div
    v-if="visible"
    class="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-border shadow-lg z-50 transition-transform duration-300"
    :class="{ 'translate-y-full': !visible, 'translate-y-0': visible }"
  >
    <!-- Resize Handle -->
    <div
      class="absolute top-0 left-0 right-0 h-1 bg-transparent hover:bg-accent-blue cursor-row-resize z-10"
      @mousedown="startResize"
    ></div>

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <div class="flex items-center gap-4">
        <!-- Tab Switcher -->
        <div class="flex items-center bg-bg-secondary rounded-lg p-0.5">
          <button
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            :class="activeTab === 'active' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary'"
            @click="activeTab = 'active'"
          >
            Active
            <span
              v-if="activeTaskCount > 0"
              class="ml-1 px-1.5 py-0.5 text-xs rounded-full"
              :class="activeTab === 'active' ? 'bg-white/20' : 'bg-accent-blue/20 text-accent-blue'"
            >
              {{ activeTaskCount }}
            </span>
          </button>
          <button
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            :class="activeTab === 'history' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:text-text-primary'"
            @click="activeTab = 'history'"
          >
            History
            <span
              v-if="historyCount > 0"
              class="ml-1 px-1.5 py-0.5 text-xs rounded-full"
              :class="activeTab === 'history' ? 'bg-white/20' : 'bg-bg-hover text-text-secondary'"
            >
              {{ historyCount }}
            </span>
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="activeTab === 'history' && historyCount > 0"
          class="px-3 py-1.5 text-xs text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          @click="clearHistory"
        >
          Clear All
        </button>
        <button
          class="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          @click="$emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div
      ref="contentRef"
      class="overflow-y-auto p-4 space-y-2"
      :style="{ height: panelHeight + 'px' }"
    >
      <!-- Active Tasks -->
      <template v-if="activeTab === 'active'">
        <div v-if="tasks.length === 0" class="flex flex-col items-center justify-center py-12 text-text-tertiary">
          <svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span class="text-sm">No active tasks</span>
        </div>
        <TaskItem
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @cancel="handleCancel"
          @locate="handleLocate"
        />
      </template>

      <!-- History Tasks -->
      <template v-else>
        <div v-if="history.length === 0" class="flex flex-col items-center justify-center py-12 text-text-tertiary">
          <svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm">No history yet</span>
        </div>
        <TaskItem
          v-for="task in history"
          :key="task.id"
          :task="task"
          @retry="handleRetry"
          @locate="handleLocate"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFileOperationsStore } from '@/stores/fileOperations'
import TaskItem from './TaskItem.vue'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'locate', endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }): void
}>()

const fileOpsStore = useFileOperationsStore()

const activeTab = ref<'active' | 'history'>('active')
const panelHeight = ref(300)
const contentRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)

const tasks = computed(() => fileOpsStore.tasks)
const history = computed(() => fileOpsStore.history)
const activeTaskCount = computed(() => fileOpsStore.activeTaskCount)
const historyCount = computed(() => fileOpsStore.history.length)

function startResize(event: MouseEvent) {
  isResizing.value = true
  event.preventDefault()

  const startY = event.clientY
  const startHeight = panelHeight.value

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return
    const diff = startY - e.clientY
    const newHeight = Math.max(200, Math.min(600, startHeight + diff))
    panelHeight.value = newHeight
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function handleCancel(taskId: string) {
  fileOpsStore.cancelTask(taskId)
}

async function handleRetry(taskId: string) {
  await fileOpsStore.retryTask(taskId)
}

function handleLocate(endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }) {
  emit('locate', endpoint)
}

function clearHistory() {
  fileOpsStore.clearHistory()
}
</script>
