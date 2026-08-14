import { defineStore } from 'pinia'
import type {
  FileOperationTask
} from '@/types/fileOperation'

export interface FileOperationState {
  tasks: FileOperationTask[]
  history: FileOperationTask[]
  isPanelVisible: boolean
  activeTaskCount: number
}

export const useFileOperationsStore = defineStore('fileOperations', {
  state: (): FileOperationState => ({
    tasks: [],
    history: [],
    isPanelVisible: false,
    activeTaskCount: 0
  }),
  actions: {
    // Initialize store and set up event listeners
    initialize() {
      // Get initial state
      window.fileman.getFileOperationQueue().then((tasks: FileOperationTask[]) => {
        this.tasks = tasks
        this.updateActiveTaskCount()
      })

      window.fileman.getFileOperationHistory().then((history) => {
        this.history = history
      })

      // Listen for task updates
      window.fileman.onFileOperationAdded((task) => {
        this.tasks.push(task)
        this.updateActiveTaskCount()
      })

      window.fileman.onFileOperationUpdated((task) => {
        const index = this.tasks.findIndex(t => t.id === task.id)
        if (index > -1) {
          this.tasks[index] = task
          // If task is completed, move to history
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            this.tasks.splice(index, 1)
            this.history.unshift(task)
            // Keep history limited
            if (this.history.length > 100) {
              this.history = this.history.slice(0, 100)
            }
          }
        }
        this.updateActiveTaskCount()
      })
    },

    async createCopyTask(
      sourceDeviceId: string,
      sourcePaths: string[],
      targetDeviceId: string,
      targetPath: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'copy',
        sourceDeviceId,
        sourcePaths: [...sourcePaths],
        targetDeviceId,
        targetPath
      })
    },

    async createMoveTask(
      sourceDeviceId: string,
      sourcePaths: string[],
      targetDeviceId: string,
      targetPath: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'move',
        sourceDeviceId,
        sourcePaths: [...sourcePaths],
        targetDeviceId,
        targetPath
      })
    },

    /** Queue files dropped from Finder into any writable app destination. */
    async importExternalFiles(
      files: File[],
      targetDeviceId: string,
      targetPath: string
    ): Promise<FileOperationTask> {
      return window.fileman.importExternalFiles(files, targetDeviceId, targetPath)
    },

    async createDeleteTask(
      deviceId: string,
      paths: string[]
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'delete',
        sourceDeviceId: deviceId,
        sourcePaths: [...paths]
      })
    },

    async createRenameTask(
      deviceId: string,
      oldPath: string,
      newName: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'rename',
        sourceDeviceId: deviceId,
        sourcePaths: [oldPath],
        newName
      })
    },

    async createMkdirTask(
      deviceId: string,
      path: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'mkdir',
        sourceDeviceId: deviceId,
        sourcePaths: [],
        targetPath: path
      })
    },

    async createTouchTask(
      deviceId: string,
      path: string
    ): Promise<FileOperationTask> {
      return window.fileman.createFileOperation({
        type: 'touch',
        sourceDeviceId: deviceId,
        sourcePaths: [],
        targetPath: path
      })
    },

    cancelTask(taskId: string): void {
      window.fileman.cancelFileOperation(taskId)
      const index = this.tasks.findIndex(t => t.id === taskId)
      if (index > -1) {
        this.tasks.splice(index, 1)
      }
      this.updateActiveTaskCount()
    },

    async retryTask(taskId: string): Promise<FileOperationTask | null> {
      const task = await window.fileman.retryFileOperation(taskId)
      if (task) {
        // Remove from history
        this.history = this.history.filter(t => t.id !== taskId)
        // Add new task
        this.tasks.push(task)
        this.updateActiveTaskCount()
      }
      return task
    },

    togglePanel(): void {
      this.isPanelVisible = !this.isPanelVisible
    },

    showPanel(): void {
      this.isPanelVisible = true
    },

    hidePanel(): void {
      this.isPanelVisible = false
    },

    clearHistory(): void {
      this.history = []
      window.fileman.clearFileOperationHistory()
    },

    updateActiveTaskCount(): void {
      this.activeTaskCount = this.tasks.filter(
        t => t.status === 'pending' || t.status === 'running'
      ).length
    }
  }
})
