import type { FileInfo } from '@shared/types'
import type { IFileSystemAdapter } from '../../adapters/types'

const log = console

/** 设备访问窄接口：与 DeviceManager 解耦，含按需自动重连。 */
export interface DeviceAdapterProvider {
  getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter>
}

export interface WalkCallbacks {
  /** 每个文件条目（已过 fileFilter）。 */
  onFile?: (file: FileInfo, relPath: string) => void | Promise<void>
  /** 每个目录条目（含根目录本身之外的子目录，进入前回调）。 */
  onDirectory?: (dir: FileInfo, relPath: string) => void | Promise<void>
  /** 返回 false 则不递归该目录（默认 true）。符号链接目录一律不递归（防环）。 */
  shouldDescend?: (dir: FileInfo, relPath: string) => boolean
  /** 返回 false 则跳过该文件（不进入 onFile、不计入 totalBytes）。 */
  fileFilter?: (file: FileInfo, relPath: string) => boolean
}

export interface WalkResult {
  fileCount: number
  directoryCount: number
  totalBytes: number
}

/** 连续 list/stat 失败达到该次数即判定设备掉线（移植自 DirectoryStatsService）。 */
const MAX_CONSECUTIVE_ERRORS = 20

/**
 * 顺序 BFS 目录遍历（DirectoryWalker）
 *
 * 从 DirectoryStatsService 的 BFS 循环抽出：同一时刻只有一个 adapter 请求
 * 在途（对 SMB/SSH/移动设备友好）、每项协作取消检查、连续失败上限。
 * 供 grep 流式回退引擎、重复文件查找、空间分析共用。
 *
 * 设计依据：
 *  - SRP —— 只负责「按序遍历 + 取消 + 容错」，条目语义（哈希/匹配/聚合）
 *    由调用方经回调注入。
 *  - 模板方法变体 —— 遍历骨架固定，shouldDescend/fileFilter 提供变体点。
 *
 * 注意：遍历不跟随符号链接目录（防环）；根路径本身不触发回调。
 */
export class DirectoryWalker {
  constructor(private readonly devices: DeviceAdapterProvider) {}

  async walk(deviceId: string, rootPath: string, isCancelled: () => boolean, cb: WalkCallbacks): Promise<WalkResult> {
    const adapter = await this.devices.getReadyAdapter(deviceId)
    const result: WalkResult = { fileCount: 0, directoryCount: 0, totalBytes: 0 }

    const queue: Array<{ path: string; relPath: string }> = [{ path: rootPath, relPath: '' }]
    let consecutiveErrors = 0

    while (queue.length > 0) {
      if (isCancelled()) return result
      const { path: dirPath, relPath } = queue.shift()!
      let children: FileInfo[]
      try {
        children = await adapter.list(dirPath)
      } catch (error) {
        consecutiveErrors++
        log.warn('[DirectoryWalker] directory skipped', { path: dirPath, message: error instanceof Error ? error.message : String(error) })
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`连续 ${consecutiveErrors} 个目录访问失败，设备可能已断开`)
        }
        continue
      }
      consecutiveErrors = 0

      for (const child of children) {
        if (isCancelled()) return result
        const childRel = relPath ? `${relPath}/${child.name}` : child.name
        if (child.isDirectory) {
          result.directoryCount++
          await cb.onDirectory?.(child, childRel)
          // 符号链接目录一律不递归（防环）；shouldDescend 提供额外过滤
          const isSymlinkDir = (child as FileInfo & { isSymlink?: boolean }).isSymlink === true
          if (!isSymlinkDir && cb.shouldDescend?.(child, childRel) !== false) {
            queue.push({ path: child.path, relPath: childRel })
          }
        } else {
          if (cb.fileFilter && !cb.fileFilter(child, childRel)) continue
          result.fileCount++
          result.totalBytes += child.size
          await cb.onFile?.(child, childRel)
        }
      }
    }
    return result
  }
}

/** POSIX 路径拼接（与各 Adapter 内局部实现一致）。 */
export function joinPosixPath(dir: string, name: string): string {
  if (dir === '' || dir === '/') return '/' + name
  return dir.endsWith('/') ? dir + name : dir + '/' + name
}
