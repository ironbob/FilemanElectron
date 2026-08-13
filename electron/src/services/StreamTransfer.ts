import { Readable, Writable, Transform, pipeline } from 'stream'
import type { IFileSystemAdapter } from '../adapters/types'

/**
 * L06 · StreamTransfer (service / strategy)
 *
 * 在两个文件系统适配器之间搬运**单个文件**,优先流式,不支持则回退整文件缓冲。
 *
 * 设计依据:
 *  - SRP / 关注点分离 —— 只管"字节管道 + 进度 + 取消 + 半成品清理",
 *    队列/任务生命周期交给 FileOperationManager。
 *  - OCP / 策略 —— 按 capability(canStream)选流式或缓冲策略,不改适配器。
 *  - DIP —— 依赖 IFileSystemAdapter 端口,不依赖具体适配器。
 *
 * 不变量(R4/R5):
 *  - 取消或失败 → 删除目标端半成品,不残留。
 *  - 失败绝不删源(源由调用方在成功后处理)。
 */
export class CancelledError extends Error {
  constructor(message = '传输已取消') {
    super(message)
    this.name = 'CancelledError'
  }
}

export interface TransferOptions {
  /** 每次有字节流过时回调(累计字节数)。 */
  onProgress?: (bytesTransferred: number) => void
  /** 周期性轮询;返回 true 则中断传输。 */
  shouldCancel?: () => boolean
}

export class StreamTransfer {
  /**
   * 拷贝单个文件:srcPath(源适配器) → dstPath(目标适配器)。
   * @returns 实际传输字节数。
   */
  static async transferFile(
    source: IFileSystemAdapter,
    srcPath: string,
    target: IFileSystemAdapter,
    dstPath: string,
    options: TransferOptions = {}
  ): Promise<number> {
    const canStream =
      !!source.getCapabilities().canStream &&
      !!target.getCapabilities().canStream &&
      typeof source.openReadStream === 'function' &&
      typeof target.openWriteStream === 'function'

    if (canStream) {
      return this.streamingCopy(source, srcPath, target, dstPath, options)
    }
    return this.bufferCopy(source, srcPath, target, dstPath, options)
  }

  /** 流式拷贝:管道 source→meter→target,逐块计字节、可取消、异常删半成品。 */
  private static async streamingCopy(
    source: IFileSystemAdapter,
    srcPath: string,
    target: IFileSystemAdapter,
    dstPath: string,
    options: TransferOptions
  ): Promise<number> {
    if (options.shouldCancel?.()) throw new CancelledError()

    let bytesTransferred = 0

    // 字节计量 Transform(同时是管道一环,自然具备背压)。
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesTransferred += chunk.length
        options.onProgress?.(bytesTransferred)
        callback(null, chunk)
      }
    })

    // 取消轮询:命中则销毁 meter,管道会 reject。
    const cancelTimer = setInterval(() => {
      if (options.shouldCancel?.()) {
        meter.destroy(new CancelledError())
      }
    }, 200)

    let src: Readable | null = null
    let dst: Writable | null = null
    try {
      src = await source.openReadStream!(srcPath)
      dst = await target.openWriteStream!(dstPath)
      await new Promise<void>((resolve, reject) => {
        pipeline(src!, meter, dst!, (err) => (err ? reject(err) : resolve()))
      })
      await this.verifyTargetSize(target, dstPath, bytesTransferred)
      return bytesTransferred
    } catch (error) {
      // R4:取消/失败 → 删除目标端半成品,不残留。
      await this.safeDeletePartial(target, dstPath)
      throw error
    } finally {
      clearInterval(cancelTimer)
      // 确保流被销毁(取消场景)。
      src?.destroy()
      dst?.destroy()
    }
  }

  /** 缓冲回退:整文件读 → 写。用于不支持流式的适配器(SMB/iOS)。 */
  private static async bufferCopy(
    source: IFileSystemAdapter,
    srcPath: string,
    target: IFileSystemAdapter,
    dstPath: string,
    options: TransferOptions
  ): Promise<number> {
    if (options.shouldCancel?.()) throw new CancelledError()

    const content = await source.readFile(srcPath)

    if (options.shouldCancel?.()) throw new CancelledError()

    try {
      await target.writeFile(dstPath, content)
      await this.verifyTargetSize(target, dstPath, content.length)
    } catch (error) {
      // R4:写入失败 → 清理半成品。
      await this.safeDeletePartial(target, dstPath)
      throw error
    }
    options.onProgress?.(content.length)
    return content.length
  }

  /** 尽力删除半成品目标;失败仅记录,不掩盖原异常。 */
  private static async safeDeletePartial(target: IFileSystemAdapter, dstPath: string): Promise<void> {
    try {
      const exists = await target.exists(dstPath)
      if (exists) {
        await target.delete(dstPath)
        console.warn(`[StreamTransfer] cleaned partial target: ${dstPath}`)
      }
    } catch (cleanupError) {
      console.error(`[StreamTransfer] failed to clean partial target ${dstPath}:`, cleanupError)
    }
  }

  /**
   * 复制成功的最小验证：目标必须是同等字节数的文件。移动操作依赖此不变量，
   * 因而只有该检查通过后 FileOperationManager 才会删除源文件。
   */
  private static async verifyTargetSize(
    target: IFileSystemAdapter,
    dstPath: string,
    expectedBytes: number
  ): Promise<void> {
    const stat = await target.stat(dstPath)
    if (!stat.isFile || stat.size !== expectedBytes) {
      throw new Error(
        `目标文件写入校验失败: ${dstPath}，期望 ${expectedBytes} 字节，实际 ${stat.size} 字节`
      )
    }
  }
}
