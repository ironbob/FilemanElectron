import * as path from 'path'
import SMB2 from '@marsaud/smb2'
import type { Readable, Writable } from 'stream'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { SMB_CAPABILITIES, type DeviceCapabilities } from './capabilities'

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
  private readonly config: SMBConfig
  private connected = false
  private client: SMB2 | null = null

  constructor(deviceId: string, name: string, config: SMBConfig) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return SMB_CAPABILITIES
  }

  async connect(): Promise<void> {
    if (!this.config.host || !this.config.share) {
      throw new Error('SMB 连接需要主机地址和共享名称')
    }
    const client = new SMB2({
      share: `\\\\${this.config.host}\\${this.config.share}`,
      domain: this.config.domain || '',
      username: this.config.username || '',
      password: this.config.password || '',
      port: this.config.port || 445
    })
    try {
      // Authenticate and validate access to the share before marking connected.
      await client.readdir('')
      this.client = client
      this.connected = true
    } catch (error) {
      client.disconnect()
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.client?.disconnect()
    this.client = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    const client = this.getClient()
    const parent = this.remotePath(dirPath)
    const entries = await client.readdir(parent, { stats: true })
    return entries.map(entry => {
      const isDirectory = entry.isDirectory()
      return {
        name: entry.name,
        path: path.posix.join(this.displayPath(dirPath), entry.name),
        isDirectory,
        isFile: !isDirectory,
        size: Number((entry as unknown as { size?: number }).size || 0),
        modifiedTime: entry.mtime?.toISOString() || new Date(0).toISOString(),
        createdTime: entry.birthtime?.toISOString() || entry.ctime?.toISOString(),
        extension: isDirectory ? undefined : path.posix.extname(entry.name).toLowerCase()
      }
    }).sort(sortDirectoriesFirst)
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.getClient().mkdir(this.remotePath(dirPath))
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    if (recursive) {
      for (const file of await this.list(dirPath)) {
        if (file.isDirectory) await this.rmdir(file.path, true)
        else await this.delete(file.path)
      }
    }
    await this.getClient().rmdir(this.remotePath(dirPath))
  }

  async readFile(filePath: string): Promise<Buffer> {
    return this.getClient().readFile(this.remotePath(filePath))
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await this.getClient().writeFile(this.remotePath(filePath), data)
  }

  async delete(targetPath: string): Promise<void> {
    await this.getClient().unlink(this.remotePath(targetPath))
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.getClient().rename(this.remotePath(oldPath), this.remotePath(newPath), { replace: true })
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    await this.writeFile(dstPath, await this.readFile(srcPath))
  }

  async openReadStream(filePath: string): Promise<Readable> {
    return this.getClient().createReadStream(this.remotePath(filePath))
  }

  async openWriteStream(filePath: string): Promise<Writable> {
    return this.getClient().createWriteStream(this.remotePath(filePath))
  }

  async stat(targetPath: string): Promise<FileStats> {
    const stats = await this.getClient().stat(this.remotePath(targetPath))
    const raw = stats as unknown as { size?: number; mode?: number }
    return {
      size: Number(raw.size || 0),
      isDirectory: stats.isDirectory(),
      isFile: !stats.isDirectory(),
      modifiedTime: stats.mtime?.toISOString() || new Date(0).toISOString(),
      createdTime: stats.birthtime?.toISOString() || stats.ctime?.toISOString() || new Date(0).toISOString(),
      mode: raw.mode || 0
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.getClient().exists(this.remotePath(targetPath))
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const pattern = query.pattern.toLocaleLowerCase()
    const visit = async (currentPath: string): Promise<void> => {
      let files: FileInfo[]
      try {
        files = await this.list(currentPath)
      } catch {
        return
      }
      for (const file of files) {
        if (file.name.toLocaleLowerCase().includes(pattern)) results.push(file)
        if (file.isDirectory) await visit(file.path)
      }
    }
    await visit(dirPath)
    return results
  }

  private getClient(): SMB2 {
    if (!this.connected || !this.client) throw new Error('SMB 设备尚未连接')
    return this.client
  }

  private remotePath(value: string): string {
    const normalized = value.replace(/\//g, '\\').replace(/^\\+/, '')
    return normalized
  }

  private displayPath(value: string): string {
    const normalized = path.posix.normalize(value || '/')
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }
}

function sortDirectoriesFirst(a: FileInfo, b: FileInfo): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name)
}
