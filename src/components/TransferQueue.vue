<template>
  <div class="fixed bottom-8 left-1/2 -translate-x-1/2 bg-bg-secondary rounded-xl shadow-lg w-[480px] max-h-80 z-50 border border-border animate-slide-in">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <span class="font-semibold text-text-primary">Transfers</span>
      <button
        class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
        @click="$emit('close')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Transfer List -->
    <div class="overflow-auto max-h-64">
      <div v-if="transfersStore.tasks.length === 0" class="p-8 text-center text-text-tertiary">
        <svg class="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span class="text-sm">No active transfers</span>
      </div>

      <div
        v-for="task in transfersStore.tasks"
        :key="task.id"
        class="px-4 py-3 border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors duration-100"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <!-- Copy icon -->
            <svg v-if="task.operation === 'copy'" class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <!-- Cut/Move icon -->
            <svg v-else class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
            <span class="text-sm font-medium text-text-primary truncate max-w-[280px]">
              {{ task.sourcePaths.length > 1 ? `${task.sourcePaths.length} items` : task.sourcePaths[0]?.split('/').pop() }}
            </span>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="getStatusClass(task.status)"
          >
            {{ task.status }}
          </span>
        </div>

        <!-- Progress Bar -->
        <div v-if="task.status === 'running'" class="mb-2">
          <div class="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              class="h-full bg-accent-blue transition-all duration-300 rounded-full"
              :style="{ width: getProgressPercent(task) + '%' }"
            />
          </div>
          <div class="flex justify-between text-xs text-text-tertiary mt-1.5">
            <span class="truncate max-w-[200px]">{{ task.progress.currentFile }}</span>
            <span class="shrink-0">{{ formatSpeed(task.progress.speed) }}</span>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="task.error" class="text-xs text-[#ff5f57] mt-1 flex items-center gap-1">
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="truncate">{{ task.error }}</span>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 mt-2">
          <button
            v-if="task.status === 'running' || task.status === 'pending'"
            class="text-xs text-text-tertiary hover:text-[#ff5f57] transition-colors cursor-pointer"
            @click="transfersStore.cancelTask(task.id)"
          >
            Cancel
          </button>
          <button
            v-if="task.status === 'failed'"
            class="text-xs text-accent-blue hover:text-accent-hover transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="transfersStore.completedTasks.length > 0" class="px-4 py-2 border-t border-border flex justify-between items-center">
      <span class="text-xs text-text-tertiary">
        {{ transfersStore.completedTasks.length }} completed
      </span>
      <button
        class="text-xs text-accent-blue hover:text-accent-hover transition-colors cursor-pointer"
        @click="transfersStore.clearCompleted"
      >
        Clear All
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTransfersStore } from '@/stores/transfers'

defineEmits<{
  close: []
}>()

const transfersStore = useTransfersStore()

function getStatusClass(status: string): string {
  switch (status) {
    case 'pending': return 'bg-[#ffbd2e]/20 text-[#ffbd2e]'
    case 'running': return 'bg-accent-blue/20 text-accent-blue'
    case 'completed': return 'bg-[#28c840]/20 text-[#28c840]'
    case 'failed': return 'bg-[#ff5f57]/20 text-[#ff5f57]'
    case 'cancelled': return 'bg-bg-tertiary text-text-tertiary'
    default: return ''
  }
}

function getProgressPercent(task: { progress: { bytesTransferred: number; totalBytes: number } }): number {
  if (task.progress.totalBytes === 0) return 0
  return Math.round((task.progress.bytesTransferred / task.progress.totalBytes) * 100)
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return bytesPerSecond + ' B/s'
  if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s'
  return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s'
}
</script>
