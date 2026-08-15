<template>
  <div class="bg-bg-secondary rounded-lg border border-border p-3">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <!-- Operation Type Icon -->
        <span
          class="w-5 h-5 p-1 rounded flex-shrink-0"
          :class="{
            'bg-blue-500/20 text-blue-400': task.type === 'copy',
            'bg-orange-500/20 text-orange-400': task.type === 'move',
            'bg-red-500/20 text-red-400': task.type === 'delete',
            'bg-purple-500/20 text-purple-400': task.type === 'rename',
            'bg-green-500/20 text-green-400': task.type === 'mkdir' || task.type === 'touch'
          }"
        >
          <component :is="getTypeIcon(task.type)" class="w-3 h-3" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-text-primary truncate">
            {{ getTypeLabel(task.type) }}
          </div>
          <div class="text-xs text-text-tertiary truncate">
            {{ task.sourcePaths.length }} item(s)
          </div>
        </div>
        <!-- Status Badge -->
        <span
          class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0"
          :class="{
            'bg-bg-active text-text-secondary': task.status === 'pending',
            'bg-blue-500 text-white': task.status === 'running',
            'bg-green-500 text-white': task.status === 'completed',
            'bg-red-500 text-white': task.status === 'failed',
            'bg-yellow-500 text-white': task.status === 'cancelled'
          }"
        >
          {{ task.status }}
        </span>
      </div>
    </div>

    <!-- Progress (for running tasks) -->
    <div v-if="task.status === 'running'" class="mb-2">
      <div class="flex items-center justify-between text-xs text-text-secondary mb-1">
        <span class="truncate">{{ task.progress.currentFile || 'Preparing...' }}</span>
        <span>{{ task.progress.currentFileIndex }} / {{ task.progress.totalFiles }}</span>
      </div>
      <div class="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          class="h-full bg-accent-blue transition-all duration-300"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
      <div class="flex items-center justify-between text-xs text-text-tertiary mt-1">
        <span>{{ formatSpeed(task.progress.speed) }}</span>
        <span>{{ formatBytes(task.progress.bytesTransferred) }} / {{ formatBytes(task.progress.totalBytes) }}</span>
      </div>
    </div>

    <!-- Error Section (for failed tasks or tasks with failures) -->
    <div v-if="hasErrors" class="mb-2">
      <!-- Task-level error -->
      <div v-if="task.error" class="p-2 bg-red-500/10 rounded-t border border-red-500/20 border-b-0">
        <div class="flex items-start gap-2">
          <svg class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="text-xs text-red-400 flex-1">
            <div class="font-medium mb-1">Task Error</div>
            <div class="text-red-300 break-all">{{ task.error }}</div>
          </div>
        </div>
      </div>

      <!-- Item-level errors -->
      <div v-if="failedItems.length > 0" :class="task.error ? 'rounded-b' : 'rounded'" class="border border-red-500/20 overflow-hidden">
        <!-- Toggle button -->
        <button
          class="w-full px-2 py-1.5 flex items-center justify-between text-xs bg-red-500/5 hover:bg-red-500/10 transition-colors"
          @click="showErrorDetails = !showErrorDetails"
        >
          <span class="text-red-400 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {{ failedItems.length }} item(s) failed
          </span>
          <svg
            class="w-4 h-4 text-red-400 transition-transform"
            :class="{ 'rotate-180': showErrorDetails }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Error details -->
        <div v-show="showErrorDetails" class="max-h-40 overflow-y-auto">
          <div
            v-for="(item, index) in failedItems"
            :key="index"
            class="px-2 py-1.5 border-t border-red-500/10 text-xs"
          >
            <div class="flex items-start gap-2">
              <span class="text-red-400 flex-shrink-0">{{ index + 1 }}.</span>
              <div class="flex-1 min-w-0">
                <div class="text-text-primary truncate" :title="item.sourcePath">
                  {{ getFileName(item.sourcePath) }}
                </div>
                <div v-if="item.error" class="text-red-300 mt-0.5 break-all">
                  {{ item.error }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Results Summary (for completed tasks) -->
    <div v-if="task.status === 'completed'" class="mb-2 text-xs">
      <span class="text-green-400">
        {{ task.progress.itemResults.filter(r => r.status === 'success').length }} succeeded
      </span>
      <span v-if="task.progress.itemResults.filter(r => r.status === 'skipped').length > 0" class="text-yellow-400 ml-2">
        {{ task.progress.itemResults.filter(r => r.status === 'skipped').length }} skipped
      </span>
      <span v-if="task.progress.itemResults.filter(r => r.status === 'failed').length > 0" class="text-red-400 ml-2">
        {{ task.progress.itemResults.filter(r => r.status === 'failed').length }} failed
      </span>
    </div>

    <!-- Time Info (for completed tasks) -->
    <div v-if="task.completedAt" class="text-xs text-text-tertiary mb-2">
      Completed in {{ formatDuration(task.startedAt, task.completedAt) }}
    </div>

    <!-- Source / destination: retain endpoint context while the task is running and in history. -->
    <div v-if="primarySourcePath || destinationPath" class="mb-2 space-y-1.5 text-xs">
      <div v-if="primarySourcePath" class="flex items-center gap-2 min-w-0">
        <span class="w-16 shrink-0 text-text-tertiary">Source</span>
        <span class="min-w-0 flex-1 truncate text-text-secondary" :title="primarySourcePath">
          {{ endpointLabel(sourceDeviceId, primarySourcePath) }}
        </span>
        <button
          class="shrink-0 text-accent-blue hover:underline"
          :title="`Locate source: ${primarySourcePath}`"
          @click="locateEndpoint('source', sourceDeviceId, primarySourcePath)"
        >
          Locate
        </button>
      </div>
      <div v-if="destinationPath" class="flex items-center gap-2 min-w-0">
        <span class="w-16 shrink-0 text-text-tertiary">Destination</span>
        <span class="min-w-0 flex-1 truncate text-text-secondary" :title="destinationPath">
          {{ endpointLabel(destinationDeviceId, destinationPath) }}
        </span>
        <button
          class="shrink-0 text-accent-blue hover:underline"
          :title="`Locate destination: ${destinationPath}`"
          @click="locateEndpoint('destination', destinationDeviceId, destinationPath)"
        >
          Locate
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-2 border-t border-border">
      <button
        v-if="task.status === 'running' || task.status === 'pending'"
        class="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded transition-colors"
        @click="$emit('cancel', task.id)"
      >
        Cancel
      </button>
      <button
        v-if="task.status === 'failed'"
        class="px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
        @click="$emit('retry', task.id)"
      >
        Retry
      </button>
      <button
        v-if="task.status === 'completed' && firstResultPath"
        class="px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover rounded transition-colors"
        @click="showInFolder(firstResultPath)"
      >
        Open copied item in Finder
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, type Component } from 'vue'
import type { FileOperationTask, FileOperationType } from '@/types/fileOperation'

const props = defineProps<{
  task: FileOperationTask
}>()

const emit = defineEmits<{
  (e: 'cancel', taskId: string): void
  (e: 'retry', taskId: string): void
  (e: 'locate', endpoint: { kind: 'source' | 'destination'; deviceId: string; path: string }): void
}>()

const showErrorDetails = ref(false)

const progressPercent = computed(() => {
  if (props.task.progress.totalBytes === 0) return 0
  return Math.round((props.task.progress.bytesTransferred / props.task.progress.totalBytes) * 100)
})

const primarySourcePath = computed(() => props.task.sourcePaths[0] || '')
const sourceDeviceId = computed(() => props.task.sourceDeviceId)
const destinationPath = computed(() => props.task.targetPath || '')
const destinationDeviceId = computed(() => props.task.targetDeviceId || props.task.sourceDeviceId)
const firstResultPath = computed(() => {
  const success = props.task.progress.itemResults.find(result => result.status === 'success')
  return success?.targetPath
})

const failedItems = computed(() => {
  return props.task.progress.itemResults.filter(r => r.status === 'failed')
})

const hasErrors = computed(() => {
  return (props.task.status === 'failed' && props.task.error) || failedItems.value.length > 0
})

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

function getTypeIcon(type: FileOperationType): Component {
  const icons: Record<FileOperationType, Component> = {
    copy: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' })
        ])
      }
    },
    move: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' })
        ])
      }
    },
    delete: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
        ])
      }
    },
    rename: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' })
        ])
      }
    },
    mkdir: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 13h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' })
        ])
      }
    },
    touch: {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
        ])
      }
    },
    'batch-rename': {
      render() {
        return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 7h10M4 12h16M4 17h10m3-13l3 3-3 3m0 4l3 3-3 3' })
        ])
      }
    },
    recycle: {
      render() { return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3' })]) }
    },
    restore: {
      render() { return h('svg', { class: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 12a8 8 0 101.9-5.2M4 4v4h4' })]) }
    }
  }
  return icons[type] || icons.copy
}

function getTypeLabel(type: FileOperationType): string {
  const labels: Record<FileOperationType, string> = {
    copy: 'Copying',
    move: 'Moving',
    delete: 'Deleting',
    rename: 'Renaming',
    mkdir: 'Creating Folder',
    touch: 'Creating File',
    'batch-rename': 'Batch Renaming',
    recycle: 'Moving to Trash',
    restore: 'Restoring'
  }
  return labels[type] || 'Unknown'
}

 function formatBytes(bytes: number): string {
  if (bytes === 0) return '1 byte'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

 function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s'
}

 function formatDuration(startMs: number | undefined, endMs: number | undefined): string {
  if (!startMs || !endMs) return ''
  const seconds = Math.round((endMs - startMs) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function endpointLabel(deviceId: string, path: string): string {
  return `${deviceId === 'local' ? 'Local' : deviceId} · ${path}`
}

function locateEndpoint(kind: 'source' | 'destination', deviceId: string, path: string): void {
  if (deviceId === 'local') {
    window.fileman.showInFolder(path)
    return
  }
  emit('locate', { kind, deviceId, path })
}

function showInFolder(path: string): void {
  window.fileman.showInFolder(path)
}
</script>
