import * as path from 'path'
import { createClient, type FileStat, type WebDAVClient } from 'webdav'
import type { Readable, Writable } from 'stream'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { WEBDAV_CAPABILITIES, type DeviceCapabilities } from './capabilities'
import { t } from '../i18n'

interface WebDAVConfig {
  /** WebDAV collection endpoint, including http:// or https://. */
  url: string
  username?: string
  password?: string
  rootPath?: string
}

/**
 * HTTP/HTTPS file servers are exposed through WebDAV. A plain static HTTP
 * server has no portable directory or write API, whereas WebDAV provides the
 * filesystem operations required by the adapter contract.
 */
export class WebDAVAdapter implements IFileSystemAdapter {
  readonly type = 'webdav'
  readonly deviceId: string
  readonly name: string
  private readonly config: WebDAVConfig
  private client: WebDAVClient | null = null
  private connected = false

  constructor(deviceId: string, name: string, config: WebDAVConfig) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return WEBDAV_CAPABILITIES
  }

  async connect(): Promise<void> {
    let endpoint: URL
    try {
      endpoint = new URL(this.config.url)
    } catch {
      throw new Error(t('errors.main.webdavInvalidUrl'))
    }
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error(t('errors.main.webdavProtocolUnsupported'))
    }

    const client = createClient(endpoint.toString(), {
      username: this.config.username,
      password: this.config.password
    })

    // A directory listing validates endpoint, credentials and DAV support
    // before we expose the device to the renderer.
    await client.getDirectoryContents(this.rootPath())
    this.client = client
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.client = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    const entries = await this.getClient().getDirectoryContents(this.remotePath(dirPath))
    return entries.map(entry => this.toFileInfo(entry)).sort(sortDirectoriesFirst)
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.getClient().createDirectory(this.remotePath(dirPath), { recursive: true })
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    const client = this.getClient()
    const target = this.remotePath(dirPath)
    if (recursive) {
      for (const file of await this.list(dirPath)) {
        if (file.isDirectory) await this.rmdir(file.path, true)
        else await this.delete(file.path)
      }
    }
    await client.deleteFile(target)
  }

  async readFile(filePath: string): Promise<Buffer> {
    const result = await this.getClient().getFileContents(this.remotePath(filePath), { format: 'binary' })
    if (typeof result === 'string') return Buffer.from(result)
    return Buffer.from(result)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await this.getClient().putFileContents(this.remotePath(filePath), data, { overwrite: true })
  }

  async delete(targetPath: string): Promise<void> {
    await this.getClient().deleteFile(this.remotePath(targetPath))
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.getClient().moveFile(this.remotePath(oldPath), this.remotePath(newPath), { overwrite: true })
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    await this.getClient().copyFile(this.remotePath(srcPath), this.remotePath(dstPath), { overwrite: true })
  }

  async openReadStream(filePath: string): Promise<Readable> {
    return this.getClient().createReadStream(this.remotePath(filePath))
  }

  async openWriteStream(filePath: string): Promise<Writable> {
    return this.getClient().createWriteStream(this.remotePath(filePath))
  }

  async stat(targetPath: string): Promise<FileStats> {
    const entry = await this.getClient().stat(this.remotePath(targetPath)) as FileStat
    return this.toFileStats(entry)
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.getClient().exists(this.remotePath(targetPath))
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    const matches: FileInfo[] = []
    const pattern = query.pattern.toLocaleLowerCase()
    const visit = async (currentPath: string): Promise<void> => {
      let files: FileInfo[]
      try {
        files = await this.list(currentPath)
      } catch {
        return
      }
      for (const file of files) {
        if (file.name.toLocaleLowerCase().includes(pattern)) matches.push(file)
        if (file.isDirectory) await visit(file.path)
      }
    }
    await visit(dirPath)
    return matches
  }

  private getClient(): WebDAVClient {
    if (!this.connected || !this.client) throw new Error(t('errors.main.webdavNotConnected'))
    return this.client
  }

  private rootPath(): string {
    return this.remotePath(this.config.rootPath || '/')
  }

  private remotePath(targetPath: string): string {
    const normalized = path.posix.normalize(targetPath || '/')
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private toFileInfo(entry: FileStat): FileInfo {
    const stats = this.toFileStats(entry)
    return {
      name: entry.basename,
      path: this.remotePath(entry.filename),
      isDirectory: stats.isDirectory,
      isFile: stats.isFile,
      size: stats.size,
      modifiedTime: stats.modifiedTime,
      createdTime: stats.createdTime,
      extension: stats.isFile ? path.posix.extname(entry.basename).toLowerCase() : undefined
    }
  }

  private toFileStats(entry: FileStat): FileStats {
    const directory = entry.type === 'directory'
    const modified = entry.lastmod ? new Date(entry.lastmod).toISOString() : new Date(0).toISOString()
    return {
      size: Number(entry.size || 0),
      isDirectory: directory,
      isFile: !directory,
      modifiedTime: modified,
      createdTime: modified,
      mode: 0
    }
  }
}

function sortDirectoriesFirst(a: FileInfo, b: FileInfo): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name)
}
