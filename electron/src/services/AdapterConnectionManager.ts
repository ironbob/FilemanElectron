import { CredentialService, type Credentials } from './CredentialService'
import type { IFileSystemAdapter } from '../adapters/types'
import type { Device } from '@shared/types'

const log = console

/**
 * AdapterConnectionManager —— 设备适配器连接生命周期（从 DeviceManager 拆出）
 *
 * 隐藏秘密：adapters 注册表（deviceId → IFileSystemAdapter）、并发连接去重
 * （connectionAttempts）与「凭据获取 → 工厂建适配器 → connect → 状态回报」的
 * 连接协议。适配器如何按设备类型构造（factory switch）由 DeviceManager 注入。
 *
 * 拆分依据：
 *  - SRP —— 「设备清单/配置持久化」与「连接生命周期/适配器注册表」是两类
 *    独立变化（新增第 7 种设备类型只改工厂；调整连接策略只改这里）。
 *  - DIP —— 连接器依赖注入的 AdapterFactory 抽象，不依赖具体适配器构造。
 *
 * 状态语义（与拆出前 DeviceManager.connectDevice 逐行为一致）：
 *  - 已连接且已注册 → no-op；在途 attempt → 复用同一 Promise；
 *  - 失败 → 断开并清理本次适配器、置 disconnected、抛原始错误。
 */
export type AdapterFactory = (device: Device, credentials?: Credentials | null) => Promise<IFileSystemAdapter>

export interface AdapterConnectionHooks {
  /** 设备状态变化回调（connecting/connected/disconnected），由 DeviceManager 负责通知渲染层 */
  onStatus: (deviceId: string, status: Device['status']) => void
}

export class AdapterConnectionManager {
  private adapters: Map<string, IFileSystemAdapter> = new Map()
  private connectionAttempts: Map<string, Promise<void>> = new Map()

  constructor(
    private readonly credentialService: CredentialService,
    private readonly factory: AdapterFactory,
    private readonly hooks: AdapterConnectionHooks
  ) {}

  /** 适配器是否已注册（连接中/已连接均算） */
  hasAdapter(deviceId: string): boolean {
    return this.adapters.has(deviceId)
  }

  /** 取已注册适配器（无则抛错；需要安全探测用 tryGetAdapter） */
  getAdapter(deviceId: string): IFileSystemAdapter {
    const adapter = this.adapters.get(deviceId)
    if (!adapter) {
      throw new Error(`No adapter for device: ${deviceId}. Device may not be connected.`)
    }
    return adapter
  }

  /** 取已注册适配器（无则 undefined），不抛错 */
  tryGetAdapter(deviceId: string): IFileSystemAdapter | undefined {
    return this.adapters.get(deviceId)
  }

  /** 直接注册适配器（local 常驻适配器等无需 connect 流程的场景） */
  setAdapter(deviceId: string, adapter: IFileSystemAdapter): void {
    this.adapters.set(deviceId, adapter)
  }

  /**
   * 连接设备：凭据 → 工厂建适配器 → adapter.connect()。
   * 状态经 hooks.onStatus 回报（connecting → connected / disconnected）。
   */
  async connect(device: Device): Promise<void> {
    const deviceId = device.id

    if (device.status === 'connected' && this.adapters.has(deviceId)) {
      return
    }

    const pending = this.connectionAttempts.get(deviceId)
    if (pending) return pending

    const attempt = (async () => {
      this.hooks.onStatus(deviceId, 'connecting')

      try {
        // Get credentials
        const credentials = await this.credentialService.get(deviceId)

        // Create adapter
        const adapter = await this.factory(device, credentials)
        this.adapters.set(deviceId, adapter)

        // Connect
        await adapter.connect()

        this.hooks.onStatus(deviceId, 'connected')
      } catch (error) {
        const adapter = this.adapters.get(deviceId)
        try { await adapter?.disconnect() } catch { /* 连接失败时仅清理本次会话 */ }
        this.adapters.delete(deviceId)
        log.error(`[AdapterConnection] 设备连接失败 (${deviceId}):`, error)
        this.hooks.onStatus(deviceId, 'disconnected')
        throw error
      } finally {
        this.connectionAttempts.delete(deviceId)
      }
    })()

    this.connectionAttempts.set(deviceId, attempt)
    return attempt
  }

  /**
   * 断开设备：断开并注销适配器，状态回报 disconnected。
   * 设备对象必须存在（由 DeviceManager 查好传入）。
   */
  async disconnect(device: Device): Promise<void> {
    const deviceId = device.id

    const adapter = this.adapters.get(deviceId)
    if (adapter) {
      await adapter.disconnect()
      this.adapters.delete(deviceId)
    }

    this.hooks.onStatus(deviceId, 'disconnected')
  }
}
