import * as path from 'path'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { SMB_CAPABILITIES, type DeviceCapabilities } from './capabilities'

// Note: This is a placeholder implementation
// Full SMB support requires the 'smb2' or '@aozp/smb2' package
// which has native dependencies

interface SMBConfig {
  host: string
  port?: number
  username?: string
  password?: string
  domain?: string
  share: string
}

export class SMBAdapter implements IFileSystemAdapter {
  readonly type = 'smb'
  readonly deviceId: string
  readonly name: string
  private config: SMBConfig
  private connected = false
  private client: any = null

  constructor(deviceId: string, name: string, config: SMBConfig) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return SMB_CAPABILITIES
  }

  private smb2Package: any = null

  async connect(): Promise<void> {
    try {
      // Dynamic import to avoid errors if package not installed
      const SMB2 = await import('@aozp/smb2').catch(() => null)

      if (!SMB2) {
        throw new Error('SMB package not installed. Run: npm install @aozp/smb2')
      }

      this.smb2Package = SMB2

      this.client = new SMB2.default({
        share: `\\\\${this.config.host}\\${this.config.share}`,
        domain: this.config.domain || '',
        username: this.config.username || '',
        password: this.config.password || ''
      })

      this.connected = true
    } catch (error) {
      this.connected = false
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('SMB device not connected')
    }
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    this.ensureConnected()

    const files: FileInfo[] = []

    try {
      const entries = await this.client.readdir(dirPath)

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.filename)
        files.push({
          name: entry.filename,
          path: fullPath,
          isDirectory: entry.isDirectory,
          isFile: !entry.isDirectory,
          size: entry.size || 0,
          modifiedTime: entry.mtime?.toISOString() || new Date().toISOString(),
          extension: !entry.isDirectory ? path.extname(entry.filename).toLowerCase() : undefined
        })
      }
    } catch (error) {
      console.error('SMB list error:', error)
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
    await this.client.mkdir(dirPath)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    this.ensureConnected()
    if (recursive) {
      // Need to recursively delete
      const files = await this.list(dirPath)
      for (const file of files) {
        if (file.isDirectory) {
          await this.rmdir(file.path, true)
        } else {
          await this.delete(file.path)
        }
      }
    }
    await this.client.rmdir(dirPath)
  }

  async readFile(filePath: string): Promise<Buffer> {
    this.ensureConnected()
    return this.client.readFile(filePath)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    this.ensureConnected()
    await this.client.writeFile(filePath, data)
  }

  async delete(targetPath: string): Promise<void> {
    this.ensureConnected()
    await this.client.unlink(targetPath)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected()
    await this.client.rename(oldPath, newPath)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    const content = await this.readFile(srcPath)
    await this.writeFile(dstPath, content)
  }

  async stat(targetPath: string): Promise<FileStats> {
    this.ensureConnected()
    const stats = await this.client.stat(targetPath)
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modifiedTime: stats.mtime?.toISOString() || new Date().toISOString(),
      createdTime: stats.ctime?.toISOString() || new Date().toISOString(),
      mode: stats.mode || 0
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
    const results: FileInfo[] = []
    const pattern = query.pattern.toLowerCase()

    async function searchRecursive(adapter: SMBAdapter, currentPath: string): Promise<void> {
      try {
        const files = await adapter.list(currentPath)
        for (const file of files) {
          if (file.name.toLowerCase().includes(pattern)) {
            results.push(file)
          }
          if (file.isDirectory) {
            await searchRecursive(adapter, file.path)
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    await searchRecursive(this, dirPath)
    return results
  }
}
