import * as path from 'path'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { IOS_CAPABILITIES, type DeviceCapabilities } from './capabilities'

// Note: iOS support requires libimobiledevice or similar
// This is a basic implementation that can be extended with:
// - libimobiledevice (via node-ffi or native addon)
// - idevicepair, ideviceinfo, ifuse command-line tools
// For now, this provides the structure for iOS file operations

interface iOSConfig {
  deviceId?: string
}

export class iOSAdapter implements IFileSystemAdapter {
  readonly type = 'ios'
  readonly deviceId: string
  readonly name: string
  private config: iOSConfig
  private connected = false

  constructor(deviceId: string, name: string, config: iOSConfig = {}) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return IOS_CAPABILITIES
  }

  async connect(): Promise<void> {
    // For real implementation, use libimobiledevice or similar
    // Example using ideviceinfo command:
    // const { exec } = require('child_process')
    // const result = await exec('ideviceinfo')
    // Parse result to verify connection

    // For now, we'll implement a basic version that checks for device
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Check if device is paired
      const { stdout } = await execAsync('ideviceinfo -k DeviceName 2>/dev/null || echo ""')
      const deviceName = stdout.trim()

      if (!deviceName) {
        throw new Error('No iOS device found. Please connect your device and trust this computer.')
      }

      this.connected = true
    } catch (error) {
      this.connected = false
      if (error instanceof Error && error.message.includes('ideviceinfo')) {
        throw new Error(
          'iOS support requires libimobiledevice. Install with:\n' +
          '  macOS: brew install libimobiledevice\n' +
          '  Linux: sudo apt-get install libimobiledevice-dev\n' +
          '  Windows: Download from https://libimobiledevice.org/'
        )
      }
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('iOS device not connected')
    }
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    this.ensureConnected()

    const files: FileInfo[] = []

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      // Use ifuse or idevicefs to list files
      // For AFC (Apple File Conduit) access:
      const { stdout } = await execAsync(
        `idevicefs ls "${dirPath}" 2>/dev/null || echo ""`
      )

      const lines = stdout.trim().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        const parts = line.trim().split(/\s+/)
        if (parts.length < 4) continue

        const isDirectory = line.startsWith('d')
        const name = parts.slice(3).join(' ')

        if (name === '.' || name === '..') continue

        const fullPath = path.join(dirPath, name)

        files.push({
          name,
          path: fullPath,
          isDirectory,
          isFile: !isDirectory,
          size: parseInt(parts[2], 10) || 0,
          modifiedTime: new Date().toISOString(),
          extension: !isDirectory ? path.extname(name).toLowerCase() : undefined
        })
      }
    } catch (error) {
      console.error('iOS list error:', error)
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

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    await execAsync(`idevicefs mkdir "${dirPath}"`)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    this.ensureConnected()

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    if (recursive) {
      await execAsync(`idevicefs rm -r "${dirPath}"`)
    } else {
      await execAsync(`idevicefs rmdir "${dirPath}"`)
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    this.ensureConnected()

    const fs = await import('fs-extra')
    const os = await import('os')
    const tempPath = path.join(os.tmpdir(), `fileman_ios_${Date.now()}`)

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      // Pull file from device to temp location
      await execAsync(`idevicefs pull "${filePath}" "${tempPath}"`)
      const content = await fs.readFile(tempPath)
      return content
    } finally {
      await fs.remove(tempPath)
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    this.ensureConnected()

    const fs = await import('fs-extra')
    const os = await import('os')
    const tempPath = path.join(os.tmpdir(), `fileman_ios_${Date.now()}`)

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      // Write to temp file then push to device
      await fs.writeFile(tempPath, data)
      await execAsync(`idevicefs push "${tempPath}" "${filePath}"`)
    } finally {
      await fs.remove(tempPath)
    }
  }

  async delete(targetPath: string): Promise<void> {
    this.ensureConnected()

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    await execAsync(`idevicefs rm "${targetPath}"`)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected()

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    await execAsync(`idevicefs mv "${oldPath}" "${newPath}"`)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    // iOS AFC doesn't support native copy
    // Read and write instead
    const content = await this.readFile(srcPath)
    await this.writeFile(dstPath, content)
  }

  async stat(targetPath: string): Promise<FileStats> {
    this.ensureConnected()

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      const { stdout } = await execAsync(`idevicefs stat "${targetPath}"`)
      // Parse stat output
      return {
        size: 0,
        isDirectory: false,
        isFile: true,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        mode: 0
      }
    } catch {
      throw new Error(`File not found: ${targetPath}`)
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await this.stat(targetPath)
      return true
    } catch {
      return false
    }
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    // iOS AFC doesn't support search natively
    // Would need to implement recursive listing
    throw new Error('Search is not supported on iOS devices')
  }
}
