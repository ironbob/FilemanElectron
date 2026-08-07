import * as path from 'path'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { ANDROID_CAPABILITIES, type DeviceCapabilities } from './capabilities'

// Note: This requires adbkit or similar ADB package
// npm install adbkit

interface AndroidConfig {
  deviceId?: string
}

export class AndroidAdapter implements IFileSystemAdapter {
  readonly type = 'android'
  readonly deviceId: string
  readonly name: string
  private config: AndroidConfig
  private connected = false
  private adb: any = null
  private device: any = null

  constructor(deviceId: string, name: string, config: AndroidConfig = {}) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return ANDROID_CAPABILITIES
  }

  async connect(): Promise<void> {
    try {
      const AdbKit = await import('adbkit').catch(() => null)

      if (!AdbKit) {
        throw new Error('ADB package not installed. Run: npm install adbkit')
      }

      this.adb = AdbKit.default.createClient()

      // Get device
      const devices = await this.adb.listDevices()
      if (devices.length === 0) {
        throw new Error('No Android device found. Please connect your device and enable USB debugging.')
      }

      // Use specified device or first available
      const targetDevice = this.config.deviceId
        ? devices.find((d: any) => d.id === this.config.deviceId)
        : devices[0]

      if (!targetDevice) {
        throw new Error(`Device not found: ${this.config.deviceId}`)
      }

      this.device = this.adb.getDevice(targetDevice.id)
      this.connected = true
    } catch (error) {
      this.connected = false
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.device = null
    this.adb = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private ensureConnected(): void {
    if (!this.connected || !this.device) {
      throw new Error('Android device not connected')
    }
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    this.ensureConnected()

    const files: FileInfo[] = []

    try {
      // Use 'ls' command via shell
      const output = await this.device.shell(`ls -la "${dirPath}" 2>/dev/null`)
      const lines = output.toString().split('\n').slice(1) // Skip total line

      for (const line of lines) {
        if (!line.trim()) continue

        const parts = line.trim().split(/\s+/)
        if (parts.length < 8) continue

        const isDirectory = line.startsWith('d')
        const name = parts.slice(7).join(' ')

        if (name === '.' || name === '..') continue

        const fullPath = path.join(dirPath, name)
        const size = parseInt(parts[4], 10) || 0

        files.push({
          name,
          path: fullPath,
          isDirectory,
          isFile: !isDirectory,
          size,
          modifiedTime: new Date().toISOString(), // Parse from parts[5], parts[6]
          extension: !isDirectory ? path.extname(name).toLowerCase() : undefined
        })
      }
    } catch (error) {
      console.error('Android list error:', error)
    }

    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  async mkdir(dirPath: string): Promise<void> {
    this.ensureConnected()
    await this.device.shell(`mkdir -p "${dirPath}"`)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    this.ensureConnected()
    const cmd = recursive ? `rm -rf "${dirPath}"` : `rmdir "${dirPath}"`
    await this.device.shell(cmd)
  }

  async readFile(filePath: string): Promise<Buffer> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      this.device.pull(filePath)
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject)
    })
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    this.ensureConnected()

    // Create temp file and push
    const fs = await import('fs-extra')
    const os = await import('os')
    const tempPath = path.join(os.tmpdir(), `fileman_${Date.now()}`)

    await fs.writeFile(tempPath, data)

    try {
      await this.device.push(tempPath, filePath)
    } finally {
      await fs.remove(tempPath)
    }
  }

  async delete(targetPath: string): Promise<void> {
    this.ensureConnected()
    await this.device.shell(`rm -rf "${targetPath}"`)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected()
    await this.device.shell(`mv "${oldPath}" "${newPath}"`)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    this.ensureConnected()
    await this.device.shell(`cp -r "${srcPath}" "${dstPath}"`)
  }

  async stat(targetPath: string): Promise<FileStats> {
    this.ensureConnected()

    const output = await this.device.shell(`stat "${targetPath}"`)
    // Parse stat output
    return {
      size: 0,
      isDirectory: false,
      isFile: true,
      modifiedTime: new Date().toISOString(),
      createdTime: new Date().toISOString(),
      mode: 0
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    this.ensureConnected()
    try {
      await this.device.shell(`test -e "${targetPath}"`)
      return true
    } catch {
      return false
    }
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    this.ensureConnected()

    const results: FileInfo[] = []
    const pattern = query.pattern.toLowerCase()

    try {
      const output = await this.device.shell(
        `find "${dirPath}" -iname "*${pattern}*" 2>/dev/null`
      )
      const lines = output.toString().split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        const name = path.basename(line)
        results.push({
          name,
          path: line,
          isDirectory: false,
          isFile: true,
          size: 0,
          modifiedTime: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('Android search error:', error)
    }

    return results
  }
}
