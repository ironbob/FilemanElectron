import { BrowserWindow } from 'electron'
import type { IFileSystemAdapter } from '../adapters/types'
import { CH } from '../ipc/channels'

export interface TransferRequest {
  id: string
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId: string
  targetPath: string
  operation: 'copy' | 'move'
}

export interface TransferProgress {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  speed: number // bytes per second
  error?: string
}

export interface ConflictStrategy {
  action: 'overwrite' | 'skip' | 'rename' | 'ask'
  applyToAll: boolean
}

type ProgressHandler = (progress: TransferProgress) => void

export class TransferManager {
  private queue: TransferRequest[] = []
  private currentTransfer: TransferRequest | null = null
  private isRunning = false
  private cancelled = false
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private progressHandlers: ProgressHandler[] = []
  private mainWindow: BrowserWindow | null = null

  registerAdapter(deviceId: string, adapter: IFileSystemAdapter): void {
    this.adapters.set(deviceId, adapter)
  }

  unregisterAdapter(deviceId: string): void {
    this.adapters.delete(deviceId)
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  onProgress(handler: ProgressHandler): () => void {
    this.progressHandlers.push(handler)
    return () => {
      const index = this.progressHandlers.indexOf(handler)
      if (index > -1) {
        this.progressHandlers.splice(index, 1)
      }
    }
  }

  private notifyProgress(progress: TransferProgress): void {
    this.progressHandlers.forEach(handler => handler(progress))

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CH.push.transferProgress, progress)
    }
  }

  async addToQueue(request: TransferRequest): Promise<string> {
    this.queue.push(request)
    this.processQueue()
    return request.id
  }

  private async processQueue(): Promise<void> {
    if (this.isRunning || this.queue.length === 0) return

    this.isRunning = true
    this.currentTransfer = this.queue.shift()!

    try {
      await this.executeTransfer(this.currentTransfer)
    } catch (error) {
      console.error('Transfer error:', error)
    } finally {
      this.isRunning = false
      this.currentTransfer = null
      this.processQueue()
    }
  }

  private async executeTransfer(request: TransferRequest): Promise<void> {
    const sourceAdapter = this.adapters.get(request.sourceDeviceId)
    const targetAdapter = this.adapters.get(request.targetDeviceId)

    if (!sourceAdapter || !targetAdapter) {
      throw new Error('Adapter not found')
    }

    this.cancelled = false
    const totalFiles = request.sourcePaths.length
    let totalBytes = 0
    let bytesTransferred = 0

    // Calculate total size
    for (const sourcePath of request.sourcePaths) {
      try {
        const stat = await sourceAdapter.stat(sourcePath)
        totalBytes += stat.size
      } catch {
        // Ignore
      }
    }

    for (let i = 0; i < request.sourcePaths.length; i++) {
      if (this.cancelled) {
        this.notifyProgress({
          id: request.id,
          status: 'cancelled',
          currentFile: '',
          currentFileIndex: i,
          totalFiles,
          bytesTransferred,
          totalBytes,
          speed: 0
        })
        return
      }

      const sourcePath = request.sourcePaths[i]
      const fileName = sourcePath.split('/').pop() || ''
      const targetPath = `${request.targetPath}/${fileName}`

      this.notifyProgress({
        id: request.id,
        status: 'running',
        currentFile: fileName,
        currentFileIndex: i,
        totalFiles,
        bytesTransferred,
        totalBytes,
        speed: 0
      })

      try {
        // Check if target exists
        const exists = await targetAdapter.exists(targetPath)
        if (exists) {
          // For now, skip existing files
          // In future, this should trigger conflict resolution
          continue
        }

        // Read from source and write to target
        const startTime = Date.now()
        const content = await sourceAdapter.readFile(sourcePath)
        await targetAdapter.writeFile(targetPath, content)
        const elapsed = Date.now() - startTime

        bytesTransferred += content.length
        const speed = elapsed > 0 ? (content.length / elapsed) * 1000 : 0

        // If move operation, delete source
        if (request.operation === 'move') {
          await sourceAdapter.delete(sourcePath)
        }

        this.notifyProgress({
          id: request.id,
          status: 'running',
          currentFile: fileName,
          currentFileIndex: i + 1,
          totalFiles,
          bytesTransferred,
          totalBytes,
          speed
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.notifyProgress({
          id: request.id,
          status: 'failed',
          currentFile: fileName,
          currentFileIndex: i,
          totalFiles,
          bytesTransferred,
          totalBytes,
          speed: 0,
          error: errorMessage
        })
        throw error
      }
    }

    this.notifyProgress({
      id: request.id,
      status: 'completed',
      currentFile: '',
      currentFileIndex: totalFiles,
      totalFiles,
      bytesTransferred,
      totalBytes,
      speed: 0
    })
  }

  cancelTransfer(transferId: string): void {
    if (this.currentTransfer?.id === transferId) {
      this.cancelled = true
    } else {
      this.queue = this.queue.filter(t => t.id !== transferId)
    }
  }

  getQueue(): TransferRequest[] {
    return this.queue
  }

  getCurrentTransfer(): TransferRequest | null {
    return this.currentTransfer
  }
}

export function generateTransferId(): string {
  return `transfer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
