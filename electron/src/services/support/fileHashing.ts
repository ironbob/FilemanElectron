import { createHash } from 'crypto'
import type { Readable } from 'stream'
import type { IFileSystemAdapter } from '../../adapters/types'
import { t } from '../../i18n'

/** 无流式读取能力的设备，缓冲回退的上限（与 ContentVerificationService 一致）。 */
export const MAX_BUFFERED_BYTES = 32 * 1024 * 1024

export type HashAlgo = 'md5' | 'sha1' | 'sha256'

export interface HashOptions {
  algo?: HashAlgo
  /** 协作取消检查（每 chunk 一次）；取消时应抛 'cancelled' 语义错误。 */
  isCancelled?: () => boolean
  /** 字节进度回调（checksum 弹窗进度条用，非节流责任在调用方）。 */
  onBytes?: (bytes: number) => void
  /** 流生命周期钩子：登记时调用，返回注销函数（finally 时执行）。 */
  onStream?: (stream: Readable) => () => void
}

/**
 * 适配器文件哈希（流式优先，缓冲回退）
 *
 * 从 ContentVerificationService.hashFile 泛化：算法可选（md5/sha1/sha256）、
 * 字节进度回调、流登记钩子。供内容校验、checksum 弹窗、重复文件查找
 * （全量哈希阶段）共用。取消语义：isCancelled 返回 true 时抛
 * 'cancelled by request'（调用方按任务 cancelled 状态归类，不视为 failed）。
 */
export async function hashAdapterFile(
  adapter: IFileSystemAdapter,
  filePath: string,
  size: number,
  options: HashOptions = {}
): Promise<string> {
  const algo = options.algo ?? 'sha256'
  const capabilities = adapter.getCapabilities()
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(filePath)
    const unregister = options.onStream?.(stream)
    try {
      const hash = createHash(algo)
      for await (const chunk of stream) {
        if (options.isCancelled?.()) throw new Error('cancelled by request')
        hash.update(chunk as Buffer)
        options.onBytes?.((chunk as Buffer).length)
      }
      return hash.digest('hex')
    } finally {
      unregister?.()
    }
  }
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(t('errors.main.hashStreamUnsupported'))
  }
  if (options.isCancelled?.()) throw new Error('cancelled by request')
  const data = await adapter.readFile(filePath)
  options.onBytes?.(data.length)
  return createHash(algo).update(data).digest('hex')
}

/**
 * 文件首块（前 length 字节）哈希 —— 重复文件查找的预分组阶段。
 * 流式设备从 0 读到够 length 字节即返回（循环退出时 finally destroy，
 * 不读完整个文件）；非流式设备 readFile 后 slice（size 上限守卫同上）。
 */
export async function hashAdapterFileRange(
  adapter: IFileSystemAdapter,
  filePath: string,
  size: number,
  length: number,
  options: HashOptions = {}
): Promise<string> {
  const algo = options.algo ?? 'sha256'
  const capabilities = adapter.getCapabilities()
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(filePath)
    const unregister = options.onStream?.(stream)
    try {
      const hash = createHash(algo)
      let remaining = length
      for await (const chunk of stream) {
        if (options.isCancelled?.()) throw new Error('cancelled by request')
        const buf = chunk as Buffer
        if (buf.length >= remaining) {
          if (remaining > 0) hash.update(buf.subarray(0, remaining))
          return hash.digest('hex')
        }
        hash.update(buf)
        remaining -= buf.length
      }
      return hash.digest('hex') // 文件比 length 短：全量即首块
    } finally {
      unregister?.()
      stream.destroy()
    }
  }
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(t('errors.main.hashStreamUnsupported'))
  }
  if (options.isCancelled?.()) throw new Error('cancelled by request')
  const data = await adapter.readFile(filePath)
  return createHash(algo).update(data.subarray(0, length)).digest('hex')
}
