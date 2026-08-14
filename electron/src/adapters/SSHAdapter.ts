import * as path from 'path'
import type { Readable, Writable } from 'stream'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { SSH_CAPABILITIES, type DeviceCapabilities } from './capabilities'

// Note: This requires the 'ssh2' package
// npm install ssh2

interface SSHConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
}

export class SSHAdapter implements IFileSystemAdapter {
  readonly type = 'ssh'
  readonly deviceId: string
  readonly name: string
  private config: SSHConfig
  private connected = false
  private client: any = null
  private sftp: any = null

  constructor(deviceId: string, name: string, config: SSHConfig) {
    this.deviceId = deviceId
    this.name = name
    this.config = { port: 22, ...config }
  }

  getCapabilities(): DeviceCapabilities {
    return SSH_CAPABILITIES
  }

  async connect(): Promise<void> {
    try {
      const { Client } = await import('ssh2')

      return new Promise((resolve, reject) => {
        this.client = new Client()

        this.client.on('ready', () => {
          this.client.sftp((err: Error, sftp: any) => {
            if (err) {
              this.connected = false
              reject(err)
              return
            }
            this.sftp = sftp
            this.connected = true
            resolve()
          })
        })

        this.client.on('error', (err: Error) => {
          this.connected = false
          reject(err)
        })

        const config: any = {
          host: this.config.host,
          port: this.config.port,
          username: this.config.username
        }

        if (this.config.password) {
          config.password = this.config.password
        } else if (this.config.privateKey) {
          config.privateKey = this.config.privateKey
        }

        this.client.connect(config)
      })
    } catch (error) {
      this.connected = false
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end()
      this.client = null
      this.sftp = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private ensureConnected(): void {
    if (!this.connected || !this.sftp) {
      throw new Error('SSH device not connected')
    }
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      this.sftp.readdir(dirPath, (err: Error, entries: any[]) => {
        if (err) {
          reject(err)
          return
        }

        const files: FileInfo[] = entries.map(entry => ({
          name: entry.filename,
          path: path.posix.join(dirPath, entry.filename),
          isDirectory: entry.longname.startsWith('d'),
          isFile: !entry.longname.startsWith('d'),
          size: entry.attrs.size,
          modifiedTime: new Date(entry.attrs.mtime * 1000).toISOString(),
          createdTime: new Date(entry.attrs.atime * 1000).toISOString(),
          extension: !entry.longname.startsWith('d')
            ? path.posix.extname(entry.filename).toLowerCase()
            : undefined
        }))

        resolve(files.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        }))
      })
    })
  }

  async mkdir(dirPath: string): Promise<void> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.mkdir(dirPath, (err: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    this.ensureConnected()

    if (recursive) {
      const files = await this.list(dirPath)
      for (const file of files) {
        if (file.isDirectory) {
          await this.rmdir(file.path, true)
        } else {
          await this.delete(file.path)
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.sftp.rmdir(dirPath, (err: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async readFile(filePath: string): Promise<Buffer> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.readFile(filePath, (err: Error, data: Buffer) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.writeFile(filePath, data, (err: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async delete(targetPath: string): Promise<void> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.unlink(targetPath, (err: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.rename(oldPath, newPath, (err: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    const content = await this.readFile(srcPath)
    await this.writeFile(dstPath, content)
  }

  async openReadStream(filePath: string): Promise<Readable> {
    this.ensureConnected()
    return this.sftp.createReadStream(filePath)
  }

  async openWriteStream(filePath: string): Promise<Writable> {
    this.ensureConnected()
    return this.sftp.createWriteStream(filePath)
  }

  async stat(targetPath: string): Promise<FileStats> {
    this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.sftp.stat(targetPath, (err: Error, stats: any) => {
        if (err) {
          reject(err)
          return
        }
        resolve({
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          modifiedTime: new Date(stats.mtime * 1000).toISOString(),
          createdTime: new Date(stats.atime * 1000).toISOString(),
          mode: stats.mode
        })
      })
    })
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

    async function searchRecursive(adapter: SSHAdapter, currentPath: string): Promise<void> {
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
