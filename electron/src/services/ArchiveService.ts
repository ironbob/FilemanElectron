import { strToU8, unzipSync, zipSync } from 'fflate'
import { DeviceManager } from './DeviceManager'
const log = console

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, '') || '/'}/${name}`.replace(/\/\/+/g, '/')
}

function basename(filePath: string): string {
  return filePath.replace(/\/+$/, '').split('/').pop() || 'archive'
}

/** Buffer-based ZIP creation/extraction for files selected from any adapter. */
export class ArchiveService {
  constructor(private readonly deviceManager: DeviceManager) {}

  async createZip(deviceId: string, sourcePaths: string[], targetDirectory: string, archiveName: string): Promise<{ path: string }> {
    const entries: Record<string, Uint8Array> = {}
    for (const sourcePath of sourcePaths) {
      await this.collect(deviceId, sourcePath, basename(sourcePath), entries)
    }
    const safeName = archiveName.toLowerCase().endsWith('.zip') ? archiveName : `${archiveName}.zip`
    const targetPath = joinPath(targetDirectory, safeName)
    await this.deviceManager.writeFile(deviceId, targetPath, Buffer.from(zipSync(entries, { level: 6 })))
    log.info('[ArchiveService] archive created', { deviceId, targetPath, entryCount: Object.keys(entries).length })
    return { path: targetPath }
  }

  async extractZip(deviceId: string, archivePath: string, targetDirectory: string): Promise<{ count: number }> {
    const entries = unzipSync(await this.deviceManager.readFile(deviceId, archivePath))
    let count = 0
    for (const [entryPath, data] of Object.entries(entries)) {
      if (entryPath.includes('..') || entryPath.startsWith('/')) throw new Error(`不安全的 ZIP 条目: ${entryPath}`)
      const outputPath = joinPath(targetDirectory, entryPath)
      await this.ensureParentDirectories(deviceId, outputPath)
      await this.deviceManager.writeFile(deviceId, outputPath, Buffer.from(data))
      count++
    }
    log.info('[ArchiveService] archive extracted', { deviceId, archivePath, targetDirectory, count })
    return { count }
  }

  private async collect(deviceId: string, sourcePath: string, relativePath: string, entries: Record<string, Uint8Array>): Promise<void> {
    const stat = await this.deviceManager.getStats(deviceId, sourcePath)
    if (stat.isFile) {
      entries[relativePath] = await this.deviceManager.readFile(deviceId, sourcePath)
      return
    }
    const children = await this.deviceManager.listFiles(deviceId, sourcePath)
    for (const child of children) await this.collect(deviceId, child.path, `${relativePath}/${child.name}`, entries)
    if (children.length === 0) entries[`${relativePath}/.keep`] = strToU8('')
  }

  private async ensureParentDirectories(deviceId: string, outputPath: string): Promise<void> {
    const parts = outputPath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts.slice(0, -1)) {
      current = joinPath(current || '/', part)
      if (!(await this.deviceManager.exists(deviceId, current))) await this.deviceManager.mkdir(deviceId, current)
    }
  }
}
