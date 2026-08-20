import crypto from 'crypto'
import { finished } from 'stream'
import type { Writable } from 'stream'
import { strToU8, unzipSync, zipSync, Zip, ZipDeflate } from 'fflate'
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

function dirname(filePath: string): string {
  const trimmed = filePath.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx < 0) return '/'
  return trimmed.slice(0, idx) || '/'
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

/**
 * Buffer-based ZIP creation/extraction for files selected from any adapter.
 *
 * 创建侧策略（2026-08-20 流式改造）：
 *  - 适配器支持 openWriteStream（local/SSH/SMB/WebDAV/Android）→ fflate 流式
 *    Zip 逐块写「同目录临时文件 + rename 原子收尾」——峰值内存 = 单个最大源文件
 *    + 输出缓冲，不再整包驻留；取消/失败删除临时文件不留半成品。
 *  - 无流式写入（iOS）→ 原 zipSync 全内存路径（行为不变）。
 */
export class ArchiveService {
  constructor(private readonly deviceManager: DeviceManagerLike) {}

  /**
   * 任务化打包：递归收集源文件 → 流式（或整包）写 zipPath。
   * 只在收尾 rename 后目标才可见，中途取消/失败不留半成品。
   */
  async runCreateZip(
    adapter: IFileSystemAdapter,
    sourcePaths: string[],
    zipPath: string,
    hooks: ArchiveRunHooks
  ): Promise<void> {
    if (adapter.openWriteStream) {
      await this.runCreateZipStreaming(adapter, sourcePaths, zipPath, hooks)
      return
    }
    const entries: Record<string, Uint8Array> = {}
    for (const sourcePath of sourcePaths) {
      await this.collect(adapter, sourcePath, basename(sourcePath), (name, data) => { entries[name] = data }, hooks)
    }
    hooks.onCompressing()
    if (hooks.shouldCancel()) throw new CancelledError()
    await adapter.writeFile(zipPath, Buffer.from(zipSync(entries, { level: 6 })))
    log.info('[ArchiveService] archive created', { zipPath, entryCount: Object.keys(entries).length })
  }

  /** 流式创建：ZipDeflate 逐文件喂入，输出块即写 ws（背压 drain 等待），tmp + rename 原子收尾。 */
  private async runCreateZipStreaming(
    adapter: IFileSystemAdapter,
    sourcePaths: string[],
    zipPath: string,
    hooks: ArchiveRunHooks
  ): Promise<void> {
    // 临时文件放目标同目录：rename 不跨文件系统；隐藏名避免目录浏览闪现
    const tmpPath = joinPath(dirname(zipPath), `.fileman-${crypto.randomUUID()}.tmp`)
    const ws: Writable = await adapter.openWriteStream!(tmpPath)
    let wsError: Error | null = null
    ws.once('error', err => { wsError = wsError ?? err })
    let backpressure: Promise<void>[] = []
    let entryCount = 0

    const zip = new Zip((err, chunk) => {
      if (err) {
        wsError = wsError ?? new Error(`zip stream error: ${err.message}`)
        return
      }
      if (chunk && !ws.write(Buffer.from(chunk))) {
        backpressure.push(new Promise<void>(resolve => ws.once('drain', () => resolve())))
      }
    })
    /** 每文件后等待积压 drain 并检查流错误（同步回调里无法 await）。 */
    const settle = async (): Promise<void> => {
      const pending = backpressure
      backpressure = []
      await Promise.all(pending)
      if (wsError) throw wsError
    }

    try {
      hooks.onCompressing()
      const emit = async (name: string, data: Uint8Array): Promise<void> => {
        const entry = new ZipDeflate(name, { level: 6 })
        zip.add(entry)
        entry.push(data, true)
        entryCount++
        await settle()
      }
      for (const sourcePath of sourcePaths) {
        await this.collect(adapter, sourcePath, basename(sourcePath), emit, hooks)
      }
      if (wsError) throw wsError
      zip.end()
      await settle()
      // end 回调在 flush 完成后触发；期间新错误经 onErr reject（比等待更早暴露）
      await new Promise<void>((resolve, reject) => {
        const onErr = (err: Error): void => reject(err)
        ws.once('error', onErr)
        ws.end(() => { ws.off('error', onErr); resolve() })
      })
      if (wsError) throw wsError
      await adapter.rename(tmpPath, zipPath)
    } catch (error) {
      // 先 destroy 等收尾再删：createWriteStream 的 open 是异步的，立刻删会被
      // 迟到的 open 重新创建出 0 字节残留（取消早于首次写入时必现竞态）。
      // destroy() 无回调参数——收尾等待用 stream.finished（close/error 均收敛）。
      ws.destroy()
      await new Promise<void>(resolve => finished(ws, () => resolve()))
      await adapter.delete(tmpPath).catch(() => undefined)
      throw error
    }
    log.info('[ArchiveService] archive created (streaming)', { zipPath, entryCount })
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
    emit: (name: string, data: Uint8Array) => void | Promise<void>,
    hooks: ArchiveRunHooks
  ): Promise<void> {
    if (hooks.shouldCancel()) throw new CancelledError()
    const stat = await adapter.stat(sourcePath)
    if (stat.isFile) {
      const data = await adapter.readFile(sourcePath)
      await emit(relativePath, data)
      hooks.onFileRead(basename(sourcePath), stat.size)
      return
    }
    const children = await adapter.list(sourcePath)
    for (const child of children) await this.collect(adapter, child.path, `${relativePath}/${child.name}`, emit, hooks)
    if (children.length === 0) emit(`${relativePath}/.keep`, strToU8(''))
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
