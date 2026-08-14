import { ConfigService } from './ConfigService'
import { CredentialService, type Credentials } from './CredentialService'
import { LocalAdapter } from '../adapters/LocalAdapter'
import { AndroidAdapter } from '../adapters/AndroidAdapter'
import { SMBAdapter } from '../adapters/SMBAdapter'
import { SSHAdapter } from '../adapters/SSHAdapter'
import { WebDAVAdapter } from '../adapters/WebDAVAdapter'
import { iOSAdapter, pairIosDevice } from '../adapters/iOSAdapter'
import type { IFileSystemAdapter, FileInfo, FileStats, SearchQuery } from '../adapters/types'
import type { DeviceCapabilities } from '../adapters/capabilities'
import { LOCAL_CAPABILITIES, DEFAULT_REMOTE_CAPABILITIES } from '../adapters/capabilities'
import { MobileDeviceScanner, type DetectedDevice } from './MobileDeviceScanner'

const log = console

export type { DetectedDevice }
export type { Credentials } from './CredentialService'
// 域类型正典在 @shared/types（跨进程单一事实源），re-export 兼容既有引用。
export type { DeviceConfig, Device } from '@shared/types'
import type { DeviceConfig, Device } from '@shared/types'

export type DeviceEventHandler = (devices: Device[]) => void

export class DeviceManager {
  private devices: Map<string, Device> = new Map()
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private handlers: DeviceEventHandler[] = []
  private configService: ConfigService
  private credentialService: CredentialService
  private mobileDeviceScanner: MobileDeviceScanner
  private autoConnectDevices: Set<string> = new Set()
  private connectionAttempts: Map<string, Promise<void>> = new Map()

  constructor(configService: ConfigService, credentialService: CredentialService) {
    this.configService = configService
    this.credentialService = credentialService

    // Initialize mobile device scanner
    const config = this.configService.getConfig()
    const autoConnectList = (config?.settings?.autoConnectDevices as string[]) || []

    this.autoConnectDevices = new Set(autoConnectList || [])
    this.mobileDeviceScanner = new MobileDeviceScanner({
      scanInterval: 3000,
      autoConnectDevices: autoConnectList
    })

    // Handle device discovery events
    this.mobileDeviceScanner.onDeviceChange(this.handleMobileDeviceDiscovered.bind(this))

    // Register local device (always available)
    this.registerDevice({
      id: 'local',
      type: 'local',
      name: require('os').hostname(),
      status: 'connected',
      rootPath: '/'
    })

    // Create local adapter immediately
    this.adapters.set('local', new LocalAdapter())

    // Load saved devices from config
    this.loadSavedDevices()

    // Note: mobile device scanning is NOT auto-started here. The composition
    // root (electron/main.ts, app.whenReady) starts it explicitly, alongside
    // VolumeScanner — keeping lifecycle side effects out of constructors.
  }

  /**
   * Handle mobile device discovery events
   */
  private handleMobileDeviceDiscovered(devices: DetectedDevice[], added: DetectedDevice[], removed: string[]): void {
    console.log('[DeviceManager] handleMobileDeviceDiscovered called', {
      totalDevices: devices.length,
      addedCount: added.length,
      removedCount: removed.length,
      added: added.map(d => ({ id: d.id, name: d.name, type: d.type })),
      removed
    })

    // 先同步仍在线的设备元数据。iOS 的 pairingStatus 可在同一 USB 会话中
    // 由 unpaired 变为 paired（或被撤销），不能只在首次发现时写入。
    let metadataChanged = false
    for (const detected of devices) {
      const existing = this.devices.get(detected.id)
      if (existing) {
        metadataChanged = metadataChanged ||
          existing.name !== detected.name ||
          existing.model !== detected.model ||
          existing.pairingStatus !== detected.pairingStatus
        existing.name = detected.name
        existing.model = detected.model
        existing.pairingStatus = detected.pairingStatus
      }
    }

    // Process new devices
    for (const device of added) {
      console.log('[DeviceManager] Processing new device:', device.id, device.name)

      // Check if we should auto-connect
      const shouldAutoConnect = this.autoConnectDevices.has(device.id)

      // Register as temporary mobile device (not saved to config)
      this.registerDevice({
        id: device.id,
        type: device.type,
        name: device.name,
        status: shouldAutoConnect ? 'connecting' : 'disconnected',
        rootPath: '/',
        pairingStatus: device.pairingStatus,
        model: device.model,
        config: {
          id: device.id,
          type: device.type,
          name: device.name,
          rootPath: '/'
        } as DeviceConfig
      })

      // Auto-connect if enabled
      if (shouldAutoConnect) {
        console.log('[DeviceManager] Auto-connecting device:', device.id)
        this.connectMobileDevice(device.id)
      }
    }

    // Notify handlers if any devices were added
    if (added.length > 0 || metadataChanged) {
      console.log('[DeviceManager] Notifying handlers of mobile device updates')
      this.notifyHandlers()
    }

    // Process removed devices
    for (const deviceId of removed) {
      console.log('[DeviceManager] Processing removed device:', deviceId)
      const existingDevice = this.devices.get(deviceId)
      if (existingDevice) {
        // Disconnect and remove
        this.disconnectDevice(deviceId).catch(() => {
          // Ignore errors during disconnect
        })
        this.devices.delete(deviceId)
        this.notifyHandlers()
      }
    }
  }

  /**
   * Connect a mobile device
   */
  private async connectMobileDevice(deviceId: string): Promise<void> {
    try {
      await this.connectDevice(deviceId)
    } catch (error) {
      console.error(`Failed to auto-connect device ${deviceId}:`, error)
    }
  }

  /**
   * Load devices from config file
   */
  private loadSavedDevices(): void {
    const config = this.configService.getConfig()
    if (config?.devices) {
      for (const deviceConfig of config.devices as DeviceConfig[]) {
        if (deviceConfig.type !== 'local') {
          this.registerDevice({
            id: deviceConfig.id,
            type: deviceConfig.type,
            name: deviceConfig.name,
            status: 'disconnected',
            rootPath: deviceConfig.rootPath || '/',
            config: deviceConfig
          })
        }
      }
    }
  }

  /**
   * Register a device
   */
  registerDevice(device: Device): void {
    this.devices.set(device.id, device)
    this.notifyHandlers()
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(deviceId: string): Promise<void> {
    // Disconnect first
    if (this.adapters.has(deviceId)) {
      await this.disconnectDevice(deviceId)
    }

    // Remove from devices map
    this.devices.delete(deviceId)

    // Remove credentials
    await this.credentialService.delete(deviceId)

    // Remove from config
    const config = this.configService.getConfig()
    if (config?.devices) {
      config.devices = (config.devices as DeviceConfig[]).filter(d => d.id !== deviceId)
      this.configService.saveConfig(config)
    }

    this.notifyHandlers()
  }

  /**
   * Get a device by ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId)
  }

  /**
   * Get all devices
   */
  getDevices(): Device[] {
    return Array.from(this.devices.values())
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): Device[] {
    return this.getDevices().filter(d => d.status === 'connected')
  }

  /**
   * Add a new device with credentials
   */
  async addDevice(config: DeviceConfig, credentials?: Credentials): Promise<Device> {
    // Check if device already exists
    if (this.devices.has(config.id)) {
      throw new Error(`Device already exists: ${config.id}`)
    }

    // Save to config
    const appConfig = this.configService.getConfig() || { devices: [], favorites: [], settings: {} }
    if (!appConfig.devices) {
      appConfig.devices = []
    }
    (appConfig.devices as DeviceConfig[]).push(config)
    this.configService.saveConfig(appConfig)

    // Save credentials if provided
    if (credentials) {
      await this.credentialService.save(config.id, credentials)
    }

    // Create device entry
    const device: Device = {
      id: config.id,
      type: config.type,
      name: config.name,
      status: 'disconnected',
      rootPath: config.rootPath || '/',
      config
    }

    this.registerDevice(device)
    return device
  }

  /**
   * Update device configuration
   */
  async updateDevice(deviceId: string, config: Partial<DeviceConfig>, credentials?: Credentials): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    // Update config file
    const appConfig = this.configService.getConfig()
    if (appConfig?.devices) {
      const devices = appConfig.devices as DeviceConfig[]
      const index = devices.findIndex(d => d.id === deviceId)
      if (index !== -1) {
        devices[index] = { ...devices[index], ...config }
        this.configService.saveConfig(appConfig)
      }
    }

    // Update credentials if provided
    if (credentials !== undefined) {
      if (Object.keys(credentials).length === 0) {
        await this.credentialService.delete(deviceId)
      } else {
        await this.credentialService.save(deviceId, credentials)
      }
    }

    // Update device object
    device.config = { ...device.config, ...config } as DeviceConfig
    device.name = config.name || device.name
    device.rootPath = config.rootPath || device.rootPath

    this.notifyHandlers()
  }

  /**
   * Connect to a device
   */
  async connectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    if (device.status === 'connected' && this.adapters.has(deviceId)) {
      return
    }

    const pending = this.connectionAttempts.get(deviceId)
    if (pending) return pending

    const attempt = (async () => {
      this.updateDeviceStatus(deviceId, 'connecting')

      try {
        // Get credentials
        const credentials = await this.credentialService.get(deviceId)

        // Create adapter
        const adapter = await this.createAdapter(device, credentials)
        this.adapters.set(deviceId, adapter)

        // Connect
        await adapter.connect()

        device.status = 'connected'
        this.notifyHandlers()
      } catch (error) {
        const adapter = this.adapters.get(deviceId)
        try { await adapter?.disconnect() } catch { /* 连接失败时仅清理本次会话 */ }
        device.status = 'disconnected'
        this.adapters.delete(deviceId)
        log.error(`[DeviceManager] 设备连接失败 (${deviceId}):`, error)
        this.notifyHandlers()
        throw error
      } finally {
        this.connectionAttempts.delete(deviceId)
      }
    })()

    this.connectionAttempts.set(deviceId, attempt)
    return attempt
  }

  /**
   * Disconnect from a device
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) return

    const adapter = this.adapters.get(deviceId)
    if (adapter) {
      await adapter.disconnect()
      this.adapters.delete(deviceId)
    }

    device.status = 'disconnected'
    this.notifyHandlers()
  }

  /**
   * Get adapter for a device
   */
  getAdapter(deviceId: string): IFileSystemAdapter {
    const adapter = this.adapters.get(deviceId)
    if (!adapter) {
      throw new Error(`No adapter for device: ${deviceId}. Device may not be connected.`)
    }
    return adapter
  }

  /**
   * Update device status
   */
  updateDeviceStatus(deviceId: string, status: Device['status']): void {
    const device = this.devices.get(deviceId)
    if (device) {
      device.status = status
      this.notifyHandlers()
    }
  }

  /**
   * 发起配对(仅 iOS;完整生命周期:发起 → 设备端信任 → 校验)。
   * 非 iOS 设备不支持配对。
   */
  async pairDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }
    if (device.type !== 'ios') {
      return { success: false, error: '该设备类型无需/不支持配对' }
    }
    return pairIosDevice(deviceId)
  }

  /**
   * Register a device change handler
   */
  onDeviceChange(handler: DeviceEventHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index > -1) {
        this.handlers.splice(index, 1)
      }
    }
  }

  /**
   * Create an adapter for a device type
   */
  private async createAdapter(device: Device, credentials?: Credentials | null): Promise<IFileSystemAdapter> {
    const config = device.config || {} as DeviceConfig

    switch (device.type) {
      case 'local':
        return new LocalAdapter()

      case 'android':
        return new AndroidAdapter(device.id, device.name, {
          deviceId: config.id
        })

      case 'smb':
        return new SMBAdapter(device.id, device.name, {
          host: config.host || '',
          port: config.port || 445,
          share: config.share || '',
          username: credentials?.username,
          password: credentials?.password,
          domain: credentials?.domain || config.domain
        })

      case 'ssh':
        return new SSHAdapter(device.id, device.name, {
          host: config.host || '',
          port: config.port || 22,
          username: credentials?.username || config.username || '',
          password: credentials?.password,
          privateKey: credentials?.privateKey
        })

      case 'webdav':
        return new WebDAVAdapter(device.id, device.name, {
          url: config.url || config.host || '',
          username: credentials?.username || config.username,
          password: credentials?.password,
          rootPath: config.rootPath || '/'
        })

      case 'ios':
        return new iOSAdapter(device.id, device.name, {
          deviceId: config.id
        })

      default:
        throw new Error(`Unknown device type: ${device.type}`)
    }
  }

  /**
   * Notify all handlers of device changes
   */
  private notifyHandlers(): void {
    const devices = this.getDevices()
    console.log('[DeviceManager] notifyHandlers called, devices count:', devices.length,
      'handlers count:', this.handlers.length,
      'device ids:', devices.map(d => d.id))
    this.handlers.forEach(handler => handler(devices))
  }

  // ============ File System Operations (proxied to adapters) ============

  /**
   * 文件请求的最后一道边界：已持久化的标签、IPC 或侧栏事件可能在适配器
   * 尚未注册时访问设备。此处按需连接，避免直接向调用方泄露“无 adapter”。
   */
  private async getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter> {
    const adapter = this.adapters.get(deviceId)
    if (adapter?.isConnected()) return adapter

    await this.connectDevice(deviceId)
    const connectedAdapter = this.adapters.get(deviceId)
    if (!connectedAdapter?.isConnected()) {
      throw new Error(`设备连接后仍不可用: ${deviceId}`)
    }
    return connectedAdapter
  }

  async listFiles(deviceId: string, path: string): Promise<FileInfo[]> {
    return (await this.getReadyAdapter(deviceId)).list(path)
  }

  async getStats(deviceId: string, path: string): Promise<FileStats> {
    return (await this.getReadyAdapter(deviceId)).stat(path)
  }

  async exists(deviceId: string, path: string): Promise<boolean> {
    return (await this.getReadyAdapter(deviceId)).exists(path)
  }

  async mkdir(deviceId: string, path: string): Promise<void> {
    return (await this.getReadyAdapter(deviceId)).mkdir(path)
  }

  async delete(deviceId: string, path: string): Promise<void> {
    return (await this.getReadyAdapter(deviceId)).delete(path)
  }

  async rename(deviceId: string, oldPath: string, newPath: string): Promise<void> {
    return (await this.getReadyAdapter(deviceId)).rename(oldPath, newPath)
  }

  async readFile(deviceId: string, path: string): Promise<Buffer> {
    return (await this.getReadyAdapter(deviceId)).readFile(path)
  }

  async writeFile(deviceId: string, path: string, data: Buffer): Promise<void> {
    return (await this.getReadyAdapter(deviceId)).writeFile(path, data)
  }

  async copy(deviceId: string, srcPath: string, dstPath: string): Promise<void> {
    return (await this.getReadyAdapter(deviceId)).copy(srcPath, dstPath)
  }

  async search(deviceId: string, path: string, query: SearchQuery): Promise<FileInfo[]> {
    return (await this.getReadyAdapter(deviceId)).search(path, query)
  }

  /**
   * Get capabilities for a device
   */
  getCapabilities(deviceId: string): DeviceCapabilities {
    // For disconnected devices, return capabilities based on type
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    // If adapter exists, get capabilities from it
    const adapter = this.adapters.get(deviceId)
    if (adapter) {
      return adapter.getCapabilities()
    }

    // Otherwise, return default capabilities based on device type
    // This allows UI to show capabilities before connection
    switch (device.type) {
      case 'local':
        return LOCAL_CAPABILITIES
      default:
        // For remote devices not yet connected, assume basic capabilities
        // Actual capabilities will be verified on connection
        return DEFAULT_REMOTE_CAPABILITIES(device.type)
    }
  }

  /**
   * Check if operation is possible between two devices
   */
  canTransferBetween(sourceDeviceId: string, targetDeviceId: string, operation: 'copy' | 'move'): boolean {
    const sourceCaps = this.getCapabilities(sourceDeviceId)
    const targetCaps = this.getCapabilities(targetDeviceId)

    if (operation === 'copy') {
      return sourceCaps.canCopyFrom && targetCaps.canCopyTo
    } else {
      return sourceCaps.canMoveFrom && targetCaps.canMoveTo
    }
  }

  // ============ Mobile Device Operations ============

  /**
   * Start mobile device scanning
   */
  startMobileDeviceScan(): void {
    this.mobileDeviceScanner.start()
  }

  /**
   * Stop mobile device scanning
   */
  stopMobileDeviceScan(): void {
    this.mobileDeviceScanner.stop()
  }

  /**
   * Perform immediate mobile device scan
   */
  async scanMobileDevicesNow(): Promise<DetectedDevice[]> {
    return this.mobileDeviceScanner.scan()
  }

  /**
   * Remember a mobile device for auto-connect
   */
  async rememberMobileDevice(deviceId: string): Promise<void> {
    this.autoConnectDevices.add(deviceId)
    await this.saveAutoConnectDevices()
  }

  /**
   * Forget a mobile device (remove from auto-connect)
   */
  async forgetMobileDevice(deviceId: string): Promise<void> {
    this.autoConnectDevices.delete(deviceId)
    await this.saveAutoConnectDevices()
  }

  /**
   * Get list of auto-connect device IDs
   */
  getAutoConnectDevices(): string[] {
    return Array.from(this.autoConnectDevices)
  }

  /**
   * Check if libimobiledevice is installed
   */
  async isLibimobiledeviceInstalled(): Promise<boolean> {
    return this.mobileDeviceScanner.checkLibimobiledeviceInstalled()
  }

  /**
   * Get all detected mobile devices
   */
  getDetectedMobileDevices(): DetectedDevice[] {
    return this.mobileDeviceScanner.getDevices()
  }

  /**
   * Get a specific detected mobile device
   */
  getDetectedMobileDevice(deviceId: string): DetectedDevice | undefined {
    return this.mobileDeviceScanner.getDevice(deviceId)
  }

  /**
   * Save auto-connect devices to config
   */
  private async saveAutoConnectDevices(): Promise<void> {
    const config = this.configService.getConfig() || { devices: [], favorites: [], settings: {} }
    config.settings = config.settings || {}
    config.settings.autoConnectDevices = this.getAutoConnectDevices()
    this.configService.saveConfig(config)
  }
}
