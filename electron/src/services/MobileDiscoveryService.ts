import { ConfigService } from './ConfigService'
import { MobileDeviceScanner, type DetectedDevice } from './MobileDeviceScanner'

const log = console

export type { DetectedDevice }

/**
 * MobileDiscoveryService —— 移动设备发现与自动连接偏好（从 DeviceManager 拆出）
 *
 * 隐藏秘密：MobileDeviceScanner 的扫描生命周期与 autoConnectDevices 偏好的
 * 读取/持久化（settings.autoConnectDevices）。
 *
 * 拆分依据：
 *  - SRP —— 设备注册/连接（DeviceManager）与「如何发现移动设备、哪些设备
 *    该自动连接」是两类独立变化（新增发现机制如网络发现只改这里）。
 *  - information_hiding —— DeviceManager 只消费 onDeviceChange/hasAutoConnect
 *    等语义接口，不感知扫描器与配置键细节。
 *
 * 生命周期约定：构造无副作用（不启动扫描），由组合根（main.ts app.whenReady）
 * 经 DeviceManager.startMobileDeviceScan() 显式启动。
 */
export class MobileDiscoveryService {
  private scanner: MobileDeviceScanner
  private autoConnectDevices: Set<string> = new Set()

  constructor(private readonly configService: ConfigService) {
    // Initialize mobile device scanner
    const config = this.configService.getConfig()
    const autoConnectList = (config?.settings?.autoConnectDevices as string[]) || []

    this.autoConnectDevices = new Set(autoConnectList || [])
    this.scanner = new MobileDeviceScanner({
      scanInterval: 3000,
      autoConnectDevices: autoConnectList
    })
  }

  /**
   * 订阅发现事件（total/added/removed 三段语义与 MobileDeviceScanner 一致），
   * 返回取消订阅函数。发现结果的设备注册/自动连接编排归 DeviceManager。
   */
  onDeviceChange(handler: (devices: DetectedDevice[], added: DetectedDevice[], removed: string[]) => void): () => void {
    return this.scanner.onDeviceChange(handler)
  }

  /** Start mobile device scanning */
  start(): void {
    this.scanner.start()
  }

  /** Stop mobile device scanning */
  stop(): void {
    this.scanner.stop()
  }

  /** Perform an immediate scan */
  async scan(): Promise<DetectedDevice[]> {
    return this.scanner.scan()
  }

  /** 指定设备是否配置了自动连接 */
  hasAutoConnect(deviceId: string): boolean {
    return this.autoConnectDevices.has(deviceId)
  }

  /** Remember a mobile device for auto-connect */
  async rememberDevice(deviceId: string): Promise<void> {
    this.autoConnectDevices.add(deviceId)
    await this.saveAutoConnectDevices()
    log.log(`[MobileDiscovery] remembered auto-connect device: ${deviceId}`)
  }

  /** Forget a mobile device (remove from auto-connect) */
  async forgetDevice(deviceId: string): Promise<void> {
    this.autoConnectDevices.delete(deviceId)
    await this.saveAutoConnectDevices()
    log.log(`[MobileDiscovery] forgot auto-connect device: ${deviceId}`)
  }

  /** Get list of auto-connect device IDs */
  getAutoConnectDevices(): string[] {
    return Array.from(this.autoConnectDevices)
  }

  /** Check if libimobiledevice is installed */
  async isLibimobiledeviceInstalled(): Promise<boolean> {
    return this.scanner.checkLibimobiledeviceInstalled()
  }

  /** Get all detected mobile devices */
  getDevices(): DetectedDevice[] {
    return this.scanner.getDevices()
  }

  /** Get a specific detected mobile device */
  getDevice(deviceId: string): DetectedDevice | undefined {
    return this.scanner.getDevice(deviceId)
  }

  /** Save auto-connect devices to config */
  private async saveAutoConnectDevices(): Promise<void> {
    const config = this.configService.getConfig() || { devices: [], favorites: [], settings: {} }
    config.settings = config.settings || {}
    config.settings.autoConnectDevices = this.getAutoConnectDevices()
    this.configService.saveConfig(config)
  }
}
