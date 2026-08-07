import { contextBridge, ipcRenderer, shell } from 'electron'

// Types for IPC communication
export interface DeviceConfig {
  id: string
  type: 'local' | 'android' | 'smb' | 'ssh' | 'ios'
  name: string
  host?: string
  port?: number
  username?: string
  rootPath?: string
  share?: string
  domain?: string
}

export interface Credentials {
  username?: string
  password?: string
  privateKey?: string
  domain?: string
  share?: string
}

export interface Device {
  id: string
  type: DeviceConfig['type']
  name: string
  status: 'connected' | 'disconnected' | 'connecting'
  rootPath: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
  model?: string
}

export interface DeviceCapabilities {
  readonly canRead: boolean
  readonly canWrite: boolean
  readonly canDelete: boolean
  readonly canRename: boolean
  readonly canMkdir: boolean
  readonly canList: boolean
  readonly canStat: boolean
  readonly canCopy: boolean
  readonly canMove: boolean
  readonly canSearch: boolean
  readonly canCopyFrom: boolean
  readonly canCopyTo: boolean
  readonly canMoveFrom: boolean
  readonly canMoveTo: boolean
  readonly maxFileSize?: number
  readonly readonlyPaths?: string[]
  readonly hiddenPaths?: string[]
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  modifiedTime: string
  createdTime?: string
  extension?: string
}

export interface SearchQuery {
  pattern: string
  fileTypes?: string[]
  minSize?: number
  maxSize?: number
  modifiedAfter?: string
  modifiedBefore?: string
}

// File Operation Types
export type FileOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'mkdir' | 'touch'
export type FileOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface FileOperationItemResult {
  sourcePath: string
  targetPath?: string
  status: 'success' | 'skipped' | 'failed'
  error?: string
  bytesProcessed?: number
}

export interface FileOperationProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  speed: number
  itemResults: FileOperationItemResult[]
}

export interface FileOperationTask {
  id: string
  type: FileOperationType
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
  status: FileOperationStatus
  progress: FileOperationProgress
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface CreateTaskParams {
  type: FileOperationType
  sourceDeviceId: string
  sourcePaths: string[]
  targetDeviceId?: string
  targetPath?: string
  newName?: string
}

// Mobile Device Types
export interface DetectedMobileDevice {
  id: string
  type: 'android' | 'ios'
  name: string
  model?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
}

const filemanAPI = {
  // ============ System ============
  getHomeDir: () => ipcRenderer.invoke('system:getHomeDir'),

  // ============ Config ============
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),

  // ============ Device Management ============
  getDevices: () => ipcRenderer.invoke('device:list'),
  addDevice: (config: DeviceConfig, credentials?: Credentials) =>
    ipcRenderer.invoke('device:add', config, credentials),
  updateDevice: (deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials) =>
    ipcRenderer.invoke('device:update', deviceId, config, credentials),
  removeDevice: (deviceId: string) => ipcRenderer.invoke('device:remove', deviceId),
  connectDevice: (deviceId: string) => ipcRenderer.invoke('device:connect', deviceId),
  disconnectDevice: (deviceId: string) => ipcRenderer.invoke('device:disconnect', deviceId),
  hasCredentials: (deviceId: string) => ipcRenderer.invoke('device:hasCredentials', deviceId),
  getDeviceCapabilities: (deviceId: string): Promise<DeviceCapabilities> =>
    ipcRenderer.invoke('device:getCapabilities', deviceId),
  canTransferBetween: (sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move'): Promise<boolean> =>
    ipcRenderer.invoke('device:canTransferBetween', sourceDeviceId, targetDeviceId, operation),

  // ============ File System Operations (all require deviceId) ============
  listFiles: (deviceId: string, path: string) => ipcRenderer.invoke('fs:list', deviceId, path),
  getStats: (deviceId: string, path: string) => ipcRenderer.invoke('fs:stat', deviceId, path),
  exists: (deviceId: string, path: string) => ipcRenderer.invoke('fs:exists', deviceId, path),
  mkdir: (deviceId: string, path: string) => ipcRenderer.invoke('fs:mkdir', deviceId, path),
  delete: (deviceId: string, path: string) => ipcRenderer.invoke('fs:delete', deviceId, path),
  rename: (deviceId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', deviceId, oldPath, newPath),
  readFile: (deviceId: string, path: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', deviceId, path),
  writeFile: (deviceId: string, path: string, data: string) =>
    ipcRenderer.invoke('fs:writeFile', deviceId, path, data),
  copy: (deviceId: string, srcPath: string, dstPath: string) =>
    ipcRenderer.invoke('fs:copy', deviceId, srcPath, dstPath),
  search: (deviceId: string, path: string, query: SearchQuery) =>
    ipcRenderer.invoke('fs:search', deviceId, path, query),

  // ============ Cross-Device Operations ============
  copyBetweenDevices: (
    srcDeviceId: string,
    srcPaths: string[],
    dstDeviceId: string,
    dstPath: string
  ) => ipcRenderer.invoke('fs:copyBetween', srcDeviceId, srcPaths, dstDeviceId, dstPath),
  moveBetweenDevices: (
    srcDeviceId: string,
    srcPaths: string[],
    dstDeviceId: string,
    dstPath: string
  ) => ipcRenderer.invoke('fs:moveBetween', srcDeviceId, srcPaths, dstDeviceId, dstPath),

  // ============ Events ============
  onDeviceChange: (callback: (devices: Device[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, devices: Device[]) => callback(devices)
    ipcRenderer.on('device:changed', handler)
    return () => ipcRenderer.removeListener('device:changed', handler)
  },
  onTransferProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress)
    ipcRenderer.on('transfer:progress', handler)
    return () => ipcRenderer.removeListener('transfer:progress', handler)
  },

  // ============ Shell Operations ============
  showInFolder: (path: string) => {
    shell.showItemInFolder(path)
  },

  // ============ File Operations ============
  createFileOperation: (params: CreateTaskParams) =>
    ipcRenderer.invoke('file-operation:create', params),
  cancelFileOperation: (taskId: string) =>
    ipcRenderer.invoke('file-operation:cancel', taskId),
  retryFileOperation: (taskId: string) =>
    ipcRenderer.invoke('file-operation:retry', taskId),
  getFileOperationQueue: () =>
    ipcRenderer.invoke('file-operation:getQueue'),
  getFileOperationHistory: () =>
    ipcRenderer.invoke('file-operation:getHistory'),
  clearFileOperationHistory: () =>
    ipcRenderer.invoke('file-operation:clearHistory'),

  // ============ File Operation Events ============
  onFileOperationAdded: (callback: (task: FileOperationTask) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: FileOperationTask) => callback(task)
    ipcRenderer.on('file-operation:added', handler)
    return () => ipcRenderer.removeListener('file-operation:added', handler)
  },
  onFileOperationUpdated: (callback: (task: FileOperationTask) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: FileOperationTask) => callback(task)
    ipcRenderer.on('file-operation:updated', handler)
    return () => ipcRenderer.removeListener('file-operation:updated', handler)
  },

  // ============ Mobile Device Operations ============
  startMobileScan: () => ipcRenderer.invoke('mobile:startScan'),
  stopMobileScan: () => ipcRenderer.invoke('mobile:stopScan'),
  scanMobileDevicesNow: (): Promise<DetectedMobileDevice[]> =>
    ipcRenderer.invoke('mobile:scanNow'),
  rememberDevice: (deviceId: string) =>
    ipcRenderer.invoke('mobile:rememberDevice', deviceId),
  forgetDevice: (deviceId: string) =>
    ipcRenderer.invoke('mobile:forgetDevice', deviceId),
  checkLibimobiledevice: (): Promise<boolean> =>
    ipcRenderer.invoke('mobile:checkLibimobiledevice'),

  // ============ Mobile Device Events ============
  onMobileDevicesChanged: (callback: (devices: DetectedMobileDevice[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, devices: DetectedMobileDevice[]) => {
      console.log('[Preload] mobile:devicesChanged event received:', devices.length, devices)
      callback(devices)
    }
    ipcRenderer.on('mobile:devicesChanged', handler)
    console.log('[Preload] Registered listener for mobile:devicesChanged')
    return () => ipcRenderer.removeListener('mobile:devicesChanged', handler)
  },

  // ============ Thumbnail Operations ============
  thumbnail: {
    get: (deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') => 
      ipcRenderer.invoke('thumbnail:get', deviceId, filePath, size, mtime, thumbnailSize),
    clearCache: () => ipcRenderer.invoke('thumbnail:clearCache'),
    getCacheSize: () => ipcRenderer.invoke('thumbnail:getCacheSize'),
  },

  // ============ ZIP browsing (lazy – no full extraction) ============
  zip: {
    /**
     * List immediate children of `internalPath` inside the ZIP file at `zipFilePath`.
     * Pass internalPath='' for the ZIP root.
     * Returns metadata only – no decompression.
     */
    listDirectory: (zipFilePath: string, internalPath: string) =>
      ipcRenderer.invoke('zip:list', zipFilePath, internalPath),
    /**
     * Read and decompress a single entry from a ZIP file.
     * Returns the file content as a base64 string.
     */
    readEntry: (zipFilePath: string, entryPath: string): Promise<string> =>
      ipcRenderer.invoke('zip:readEntry', zipFilePath, entryPath),
  },
}

contextBridge.exposeInMainWorld('fileman', filemanAPI)
