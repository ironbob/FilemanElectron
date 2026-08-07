import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { LOCAL_CAPABILITIES, type DeviceCapabilities } from './capabilities'

export class LocalAdapter implements IFileSystemAdapter {
  readonly type = 'local'
  readonly deviceId = 'local'
  readonly name: string

  constructor() {
    this.name = os.hostname()
  }

  getCapabilities(): DeviceCapabilities {
    return LOCAL_CAPABILITIES
  }

  async connect(): Promise<void> {
    // Local filesystem is always connected
  }

  async disconnect(): Promise<void> {
    // No-op for local filesystem
  }

  isConnected(): boolean {
    return true
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const files: FileInfo[] = []

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      let stats: fs.Stats

      try {
        stats = await fs.stat(fullPath)
      } catch {
        continue // Skip files we can't access
      }

      files.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stats.size,
        modifiedTime: stats.mtime.toISOString(),
        createdTime: stats.birthtime.toISOString(),
        extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : undefined
      })
    }

    // Sort: directories first, then by name
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath)
  }

  async rmdir(dirPath: string, recursive = false): Promise<void> {
    if (recursive) {
      await fs.remove(dirPath)
    } else {
      await fs.rmdir(dirPath)
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, data)
  }

  async delete(targetPath: string): Promise<void> {
    await fs.remove(targetPath)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.move(oldPath, newPath)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    await fs.ensureDir(path.dirname(dstPath))
    await fs.copy(srcPath, dstPath)
  }

  async stat(targetPath: string): Promise<FileStats> {
    const stats = await fs.stat(targetPath)
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modifiedTime: stats.mtime.toISOString(),
      createdTime: stats.birthtime.toISOString(),
      mode: stats.mode
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    return fs.pathExists(targetPath)
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const pattern = query.pattern.toLowerCase()
    const fileTypes = query.fileTypes || []

    async function searchRecursive(currentPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)

          // Check if name matches pattern
          const nameMatches = entry.name.toLowerCase().includes(pattern) ||
                             this.matchWildcard(entry.name, pattern)

          // Check file type
          const ext = path.extname(entry.name).toLowerCase()
          const typeMatches = fileTypes.length === 0 || fileTypes.includes(ext)

          if (nameMatches && typeMatches) {
            try {
              const stats = await fs.stat(fullPath)
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isFile: entry.isFile(),
                size: stats.size,
                modifiedTime: stats.mtime.toISOString(),
                createdTime: stats.birthtime.toISOString(),
                extension: entry.isFile() ? ext : undefined
              })
            } catch {
              // Skip files we can't access
            }
          }

          // Recurse into directories
          if (entry.isDirectory()) {
            await searchRecursive(fullPath)
          }
        }
      } catch {
        // Skip directories we can't access
      }
    }

    await searchRecursive.call(this, dirPath)
    return results
  }

  private matchWildcard(name: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') + '$',
      'i'
    )
    return regex.test(name)
  }
}
