import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TransferTask {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId: string
  targetPath: string
  operation: 'copy' | 'move'
  progress: {
    currentFile: string
    currentFileIndex: number
    totalFiles: number
    bytesTransferred: number
    totalBytes: number
    speed: number
  }
  error?: string
}

export type NewTransferTask = Omit<TransferTask, 'id' | 'status' | 'progress'>

export const useTransfersStore = defineStore('transfers', () => {
  const tasks = ref<TransferTask[]>([])

  const pendingTasks = computed(() =>
    tasks.value.filter(t => t.status === 'pending')
  )

  const runningTasks = computed(() =>
    tasks.value.filter(t => t.status === 'running')
  )

  const completedTasks = computed(() =>
    tasks.value.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
  )

  function addTask(task: NewTransferTask): string {
    const id = Math.random().toString(36).substring(2, 9)
    const newTask: TransferTask = {
      ...task,
      id,
      status: 'pending',
      progress: {
        currentFile: '',
        currentFileIndex: 0,
        totalFiles: task.sourcePaths.length,
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0
      }
    }
    tasks.value.push(newTask)
    return id
  }

  function updateTaskProgress(
    taskId: string,
    progress: Partial<TransferTask['progress']>,
    status?: TransferTask['status']
  ): void {
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.progress = { ...task.progress, ...progress }
      if (status) {
        task.status = status
      }
    }
  }

  function setTaskError(taskId: string, error: string): void {
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.status = 'failed'
      task.error = error
    }
  }

  function cancelTask(taskId: string): void {
    const task = tasks.value.find(t => t.id === taskId)
    if (task && (task.status === 'pending' || task.status === 'running')) {
      task.status = 'cancelled'
    }
  }

  function clearCompleted(): void {
    tasks.value = tasks.value.filter(
      t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
    )
  }

  return {
    tasks,
    pendingTasks,
    runningTasks,
    completedTasks,
    addTask,
    updateTaskProgress,
    setTaskError,
    cancelTask,
    clearCompleted
  }
})
