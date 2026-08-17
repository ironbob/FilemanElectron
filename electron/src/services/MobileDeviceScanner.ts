import { exec } from 'child_process'
import { promisify } from 'util'
import { ToolPathResolver } from './ToolPathResolver'
import { parseHdcListTargets } from './support/ohosParsing'

const execAsync = promisify(exec)

// 日志工具函数
const log = {
  info: (message: string, ...args: unknown[]) => console.log(`[MobileDeviceScanner] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[MobileDeviceScanner] ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[MobileDeviceScanner] DEBUG: ${message}`, ...args)
}

export interface DetectedDevice {
  id: string              // android:serial / ohos:connectKey / ios:udid
  type: 'android' | 'ohos' | 'ios'
  name: string
  model?: string
  pairingStatus?: 'unpaired' | 'pairing' | 'paired'
}

export interface MobileDeviceScannerOptions {
  scanInterval: number         // milliseconds
  autoConnectDevices: string[] // device IDs to auto-connect
}

export type DeviceChangeHandler = (devices: DetectedDevice[], added: DetectedDevice[], removed: string[]) => void

export class MobileDeviceScanner {
  private scannerInterval: NodeJS.Timeout | null = null
  private options: MobileDeviceScannerOptions
  private currentDevices: Map<string, DetectedDevice> = new Map()
  private handlers: DeviceChangeHandler[] = []
  private libimobiledeviceInstalled: boolean | null = null
  private adbAvailable: boolean | null = null
  private hdcAvailable: boolean | null = null

  constructor(options: Partial<MobileDeviceScannerOptions> = {}) {
    this.options = {
      scanInterval: 3000,
      autoConnectDevices: [],
      ...options
    }
  }

  /**
   * Start periodic scanning
   */
  start(): void {
    if (this.scannerInterval) {
      this.stop()
    }

    log.info('Starting mobile device scanner', { interval: this.options.scanInterval })

    // Perform initial scan
    this.scan()

    // Set up periodic scanning
    this.scannerInterval = setInterval(() => {
      this.scan()
    }, this.options.scanInterval)
  }

  /**
   * Stop scanning
   */
  stop(): void {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval)
      this.scannerInterval = null
      log.info('Mobile device scanner stopped')
    }
  }

  /**
   * Perform a single scan
   */
  async scan(): Promise<DetectedDevice[]> {
    // log.debug('Starting device scan...')
    const devices: DetectedDevice[] = []
    const added: DetectedDevice[] = []
    const removed: string[] = []

    try {
      // Check tool availability on first scan
      if (this.adbAvailable === null) {
        this.adbAvailable = await this.checkAdbInstalled()
        // log.info('ADB availability check result:', this.adbAvailable)
      }
      if (this.libimobiledeviceInstalled === null) {
        this.libimobiledeviceInstalled = await this.checkLibimobiledeviceInstalled()
        // log.info('libimobiledevice availability check result:', this.libimobiledeviceInstalled)
      }
      if (this.hdcAvailable === null) {
        this.hdcAvailable = await this.checkHdcInstalled()
      }

      // Scan Android devices
      // log.debug('ADB available:', this.adbAvailable)
      if (this.adbAvailable) {
        // log.debug('Scanning Android devices...')
        const androidDevices = await this.scanAndroid()
        // log.debug('Android devices found:', androidDevices.length, androidDevices)
        devices.push(...androidDevices)
      } else {
        log.info('ADB not available, skipping Android scan')
      }

      // Scan iOS devices
      // log.debug('libimobiledevice available:', this.libimobiledeviceInstalled)
      if (this.libimobiledeviceInstalled) {
        // log.debug('Scanning iOS devices...')
        const iosDevices = await this.scanIOS()
        // log.debug('iOS devices found:', iosDevices.length, iosDevices)
        devices.push(...iosDevices)
      } else {
        log.debug('libimobiledevice not available, skipping iOS scan')
      }

      // Scan HarmonyOS(OHOS) devices
      if (this.hdcAvailable) {
        const ohosDevices = await this.scanOHOS()
        devices.push(...ohosDevices)
      } else {
        log.debug('hdc not available, skipping OHOS scan')
      }
    } catch (error) {
      log.error('Mobile device scan error:', error)
    }

    // Calculate added and removed devices
    const newIds = new Set(devices.map(d => d.id))
    const oldIds = new Set(this.currentDevices.keys())

    for (const device of devices) {
      if (!oldIds.has(device.id)) {
        added.push(device)
      }
    }

    for (const oldId of Array.from(oldIds)) {
      if (!newIds.has(oldId)) {
        removed.push(oldId)
      }
    }

    // log.debug('Device changes - added:', added.length, 'removed:', removed.length)
    if (added.length > 0) {
      log.info('Devices added:', added.map(d => ({ id: d.id, name: d.name, type: d.type })))
    }
    if (removed.length > 0) {
      log.info('Devices removed:', removed)
    }

    // 配对状态、设备名称等会在同一 USB 会话中变化。它们没有 added/removed
    // 事件，但仍必须推送给 DeviceManager/renderer。
    const changed = devices.some(device => {
      const previous = this.currentDevices.get(device.id)
      return !!previous && !sameDetectedDevice(previous, device)
    })

    // Update current devices after comparing with the previous snapshot.
    this.currentDevices.clear()
    for (const device of devices) {
      this.currentDevices.set(device.id, device)
    }

    // Notify handlers
    if (added.length > 0 || removed.length > 0 || changed) {
      // log.debug('Notifying handlers of device changes')
      this.notifyHandlers(devices, added, removed)
    }

    // log.debug('Scan complete, total devices:', devices.length)
    return devices
  }

  /**
   * Register a device change handler
   */
  onDeviceChange(handler: DeviceChangeHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index > -1) {
        this.handlers.splice(index, 1)
      }
    }
  }

  /**
   * Get current detected devices
   */
  getDevices(): DetectedDevice[] {
    return Array.from(this.currentDevices.values())
  }

  /**
   * Get a specific device by ID
   */
  getDevice(id: string): DetectedDevice | undefined {
    return this.currentDevices.get(id)
  }

  /**
   * Check if libimobiledevice is available
   * (打包内 CLI → $PATH → brew 常见前缀,统一走 ToolPathResolver)
   */
  async checkLibimobiledeviceInstalled(): Promise<boolean> {
    const available = ToolPathResolver.has('idevice_id')
    if (!available) {
      log.debug('idevice_id not found (bundled/$PATH/common prefixes)')
    }
    return available
  }

  /**
   * Check if ADB is installed
   * (打包内 adb → $PATH → 常见前缀,统一走 ToolPathResolver)
   */
  async checkAdbInstalled(): Promise<boolean> {
    const available = ToolPathResolver.has('adb')
    if (!available) {
      log.debug('adb not found (bundled/$PATH/common prefixes)')
    }
    return available
  }

  /**
   * Check if hdc (HarmonyOS Device Connector) is installed
   * (打包内 hdc → $PATH → 常见前缀,统一走 ToolPathResolver)
   */
  async checkHdcInstalled(): Promise<boolean> {
    const available = ToolPathResolver.hasHdc()
    if (!available) {
      log.debug('hdc not found (bundled/$PATH/common prefixes)')
    }
    return available
  }

  /**
   * Scan for Android devices using ADB
   */
  private async scanAndroid(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = []

    try {
      // log.debug('Executing: adb devices -l')
      const { stdout, stderr } = await execAsync(`${ToolPathResolver.getAdbExecutable()} devices -l`)

      // log.debug('ADB command stdout:', JSON.stringify(stdout))
      if (stderr) {
        log.debug('ADB command stderr:', stderr)
      }

      const lines = stdout.trim().split('\n')
      // log.debug('ADB output lines:', lines.length, lines)

      for (const line of lines) {
        // log.debug('Parsing line:', JSON.stringify(line))

        if (!line.trim() || line.includes('List of devices')) {
          // log.debug('Skipping header or empty line')
          continue
        }

        // Parse: serial  device  product:xxx model:xxx device:xxx
        // Example: "12345678    device    product:aosp_model model:AOSP device:model transport_id:1"
        const match = line.match(/^(\S+)\s+(.+)$/)
        if (match) {
          const serial = match[1]
          const deviceInfo = match[2].trim()

          // log.debug('Matched device - serial:', serial, 'info:', deviceInfo)

          // Check device state (device, offline, unauthorized, etc.)
          const stateMatch = deviceInfo.match(/^(\S+)/)
          const state = stateMatch ? stateMatch[1] : 'unknown'
          // log.debug('Device state:', state)

          // Skip offline or unauthorized devices but log them
          if (state === 'offline') {
            log.info('Device offline, skipping:', serial)
            continue
          }
          if (state === 'unauthorized') {
            log.info('Device unauthorized (needs USB debugging authorization):', serial)
            // Still add it but mark it
            devices.push({
              id: `android:${serial}`,
              type: 'android',
              name: 'Unauthorized Device',
              model: deviceInfo
            })
            continue
          }

          // Extract model name from device info (e.g., "model:Pixel_6")
          let model = 'Android Device'
          const modelMatch = deviceInfo.match(/model:([^\s]+)/)
          if (modelMatch) {
            model = modelMatch[1].replace(/_/g, ' ')
            log.debug('Extracted model name:', model)
          }

          // Extract product name
          let product = ''
          const productMatch = deviceInfo.match(/product:([^\s]+)/)
          if (productMatch) {
            product = productMatch[1]
          }

          // log.info('Found Android device:', { serial, model, product, state })

          devices.push({
            id: `android:${serial}`,
            type: 'android',
            name: model,
            model: deviceInfo
          })
        } else {
          log.debug('Line did not match device pattern:', line)
        }
      }

      // log.debug('Android scan complete, devices found:', devices.length)
    } catch (error) {
      log.error('Android scan error:', error)
      // Log more details about the error
      if (error instanceof Error) {
        log.error('Error message:', error.message)
        log.error('Error stack:', error.stack)
      }
    }

    return devices
  }

  /**
   * Scan for iOS devices using libimobiledevice
   */
  private async scanIOS(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = []

    try {
      // log.debug('Executing: idevice_id -l')
      // Get list of connected iOS devices
      // (经 ToolPathResolver:打包内 Resources/ios-native/idevice_id 优先)
      const { stdout, stderr } = await execAsync(
        `${ToolPathResolver.getExecutable('idevice_id')} -l 2>/dev/null || echo ""`
      )

      // log.debug('idevice_id stdout:', JSON.stringify(stdout))
      if (stderr) {
        log.debug('idevice_id stderr:', stderr)
      }

      const udidList = stdout.trim().split('\n').filter(line => line.trim())
      // log.debug('iOS UDIDs found:', udidList.length, udidList)

      for (const udid of udidList) {
        if (!udid.trim()) continue

        log.debug('Processing iOS device:', udid)

        try {
          // Get device name
          let deviceName = 'iOS Device'
          try {
            log.debug(`Getting device name for ${udid}...`)
            const { stdout: nameOutput, stderr: nameStderr } = await execAsync(
              `${ToolPathResolver.getExecutable('ideviceinfo')} -u ${udid} -k DeviceName 2>/dev/null || echo ""`
            )
            log.debug(`ideviceinfo name output:`, nameOutput, nameStderr)
            if (nameOutput.trim()) {
              deviceName = nameOutput.trim()
            }
          } catch (nameError) {
            log.debug('Failed to get device name:', nameError)
          }

          // Check pairing status
          let pairingStatus: 'unpaired' | 'pairing' | 'paired' = 'unpaired'
          try {
            log.debug(`Checking pairing status for ${udid}...`)
            const { stdout: pairOutput, stderr: pairStderr } = await execAsync(
              `${ToolPathResolver.getExecutable('idevicepair')} validate -u ${udid} 2>/dev/null || echo ""`
            )
            log.debug(`idevicepair output:`, pairOutput, pairStderr)
            if (pairOutput.includes('SUCCESS')) {
              pairingStatus = 'paired'
            } else if (pairOutput.includes('PAIRING_DIALOG') || pairOutput.includes('USER_DENIED')) {
              pairingStatus = 'unpaired'
              log.info(`iOS device ${udid} needs pairing`)
            }
          } catch (pairError) {
            log.debug('Failed to check pairing status:', pairError)
            // If idevicepair fails, device might need pairing
            pairingStatus = 'unpaired'
          }

          log.info('Found iOS device:', { udid, name: deviceName, pairingStatus })

          devices.push({
            id: `ios:${udid}`,
            type: 'ios',
            name: deviceName,
            pairingStatus
          })
        } catch (error) {
          log.error(`iOS device ${udid} scan error:`, error)
        }
      }

      // log.debug('iOS scan complete, devices found:', devices.length)
    } catch (error) {
      log.error('iOS scan error:', error)
      if (error instanceof Error) {
        log.error('Error message:', error.message)
      }
    }

    return devices
  }

  /**
   * Scan for HarmonyOS(OHOS) devices using hdc
   */
  private async scanOHOS(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = []

    try {
      const { stdout, stderr } = await execAsync(`${ToolPathResolver.getHdcExecutable()} list targets`)
      if (stderr) {
        log.debug('hdc list targets stderr:', stderr)
      }

      const connectKeys = parseHdcListTargets(stdout)
      for (const key of connectKeys) {
        // 设备名取产品型号(如 "HUAWEI Mate 60 Pro");取不到时回退通用名。
        let name = 'HarmonyOS Device'
        try {
          const { stdout: nameOutput } = await execAsync(
            `${ToolPathResolver.getHdcExecutable()} -t ${key} shell param get const.product.name 2>/dev/null || echo ""`
          )
          if (nameOutput.trim()) {
            name = nameOutput.trim()
          }
        } catch (nameError) {
          log.debug('Failed to get OHOS device name:', nameError)
        }

        log.info('Found OHOS device:', { connectKey: key, name })
        devices.push({
          id: `ohos:${key}`,
          type: 'ohos',
          name
        })
      }
    } catch (error) {
      log.error('OHOS scan error:', error)
    }

    return devices
  }

  /**
   * Check if a device should auto-connect
   */
  shouldAutoConnect(deviceId: string): boolean {
    return this.options.autoConnectDevices.includes(deviceId)
  }

  /**
   * Notify all handlers of device changes
   */
  private notifyHandlers(devices: DetectedDevice[], added: DetectedDevice[], removed: string[]): void {
    log.debug(`Notifying ${this.handlers.length} handlers`)
    for (const handler of this.handlers) {
      try {
        handler(devices, added, removed)
      } catch (error) {
        log.error('Device change handler error:', error)
      }
    }
  }

  /**
   * Check if libimobiledevice is available
   */
  isLibimobiledeviceAvailable(): boolean | null {
    return this.libimobiledeviceInstalled
  }

  /**
   * Check if ADB is available
   */
  isAdbAvailable(): boolean | null {
    return this.adbAvailable
  }

  /**
   * Check if hdc is available
   */
  isHdcAvailable(): boolean | null {
    return this.hdcAvailable
  }
}

function sameDetectedDevice(a: DetectedDevice, b: DetectedDevice): boolean {
  return a.id === b.id &&
    a.type === b.type &&
    a.name === b.name &&
    a.model === b.model &&
    a.pairingStatus === b.pairingStatus
}
