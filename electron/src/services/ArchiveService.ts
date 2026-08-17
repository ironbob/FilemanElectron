import { strToU8, unzipSync, zipSync } from 'fflate'
import type { IFileSystemAdapter } from '../adapters/types'
import { CancelledError } from './StreamTransfer'
import { t } from '../i18n'
const log = console

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, '') || '/'}/${name}`.replace(/\/\/+/g, '/')
}

function basename(filePath: string): string {
  return filePath.replace(/\/+$/, '').split('/').pop() || 'archive'
}

/** runCreateZip 的进度/取消回调（由 FileOperationManager 提供，驱动任务面板）。 */
export interface ArchiveRunHooks {
  /** 每读入一个源文件回调（name = 显示名，bytes = 该文件字节数）。 */
  onFileRead: (name: string, bytes: number) => void
  /** 读取完成、开始打包写盘前回调一次。 */
  onCompressing: () => void
  /** 取消轮询：true 时抛 CancelledError（此时尚未写任何目标文件）。 */
  shouldCancel: () => boolean
}

/** Buffer-based ZIP creation/extraction for files selected from any adapter. */
export class ArchiveService {
  constructor(private readonly deviceManager: DeviceManagerLike) {}

  /**
   * 任务化打包：递归收集源文件 → zipSync → 一次性写 zipPath。
   * 只在最后写盘，中途取消/失败不留半成品。
   * 注：整包在内存中构建（与既有行为一致），超大目录会吃内存——
   * 流式 zip 为后续优化项。
   */
  async runCreateZip(
    adapter: IFileSystemAdapter,
    sourcePaths: string[],
    zipPath: string,
    hooks: ArchiveRunHooks
  ): Promise<void> {
    const entries: Record<string, Uint8Array> = {}
    for (const sourcePath of sourcePaths) {
      await this.collect(adapter, sourcePath, basename(sourcePath), entries, hooks)
    }
    hooks.onCompressing()
    if (hooks.shouldCancel()) throw new CancelledError()
    await adapter.writeFile(zipPath, Buffer.from(zipSync(entries, { level: 6 })))
    log.info('[ArchiveService] archive created', { zipPath, entryCount: Object.keys(entries).length })
  }

  async extractZip(deviceId: string, archivePath: string, targetDirectory: string): Promise<{ count: number }> {
    const entries = unzipSync(await this.deviceManager.readFile(deviceId, archivePath))
    let count = 0
    for (const [entryPath, data] of Object.entries(entries)) {
      if (entryPath.includes('..') || entryPath.startsWith('/')) throw new Error(t('errors.main.archiveUnsafeEntry', { path: entryPath }))
      const outputPath = joinPath(targetDirectory, entryPath)
      await this.ensureParentDirectories(deviceId, outputPath)
      await this.deviceManager.writeFile(deviceId, outputPath, Buffer.from(data))
      count++
    }
    log.info('[ArchiveService] archive extracted', { deviceId, archivePath, targetDirectory, count })
    return { count }
  }

  private async collect(
    adapter: IFileSystemAdapter,
    sourcePath: string,
    relativePath: string,
    entries: Record<string, Uint8Array>,
    hooks: ArchiveRunHooks
  ): Promise<void> {
    if (hooks.shouldCancel()) throw new CancelledError()
    const stat = await adapter.stat(sourcePath)
    if (stat.isFile) {
      const data = await adapter.readFile(sourcePath)
      entries[relativePath] = data
      hooks.onFileRead(basename(sourcePath), stat.size)
      return
    }
    const children = await adapter.list(sourcePath)
    for (const child of children) await this.collect(adapter, child.path, `${relativePath}/${child.name}`, entries, hooks)
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

/** extractZip 仍走 DeviceManager 代理；仅声明用到的子集。 */
export interface DeviceManagerLike {
  readFile(deviceId: string, path: string): Promise<Buffer>
  writeFile(deviceId: string, path: string, data: Buffer): Promise<void>
  exists(deviceId: string, path: string): Promise<boolean>
  mkdir(deviceId: string, path: string): Promise<void>
}
