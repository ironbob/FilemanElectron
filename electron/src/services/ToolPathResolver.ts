import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * L03 · ToolPathResolver (infrastructure)
 *
 * Single source of truth for the location of bundled CLI tools (adb).
 *
 * 设计依据:
 *  - SRP / 关注点分离 —— "工具在哪里" 与 "工具怎么用" 分开,Scanner/Adapter 不各自猜路径。
 *  - DRY —— 全仓唯一的 adb 路径解析点。
 *
 * 打包态(electron-builder extraResources):adb 位于 process.resourcesPath 下。
 * 开发态:不打包,回退到 $PATH(undefined 表示 "用 PATH 上的 adb")。
 */
export class ToolPathResolver {
  private static cachedAdb: string | undefined | null = undefined // undefined=未探测, null=无(用 PATH)

  /** 候选的打包内 adb 相对路径(extraResources 落地点)。 */
  private static readonly BUNDLED_ADB_CANDIDATES = ['adb', 'tools/adb']

  /**
   * 解析 adb 可执行文件路径。
   * @returns 打包且存在 → 绝对路径;否则 undefined(调用方走 $PATH)。
   */
  static getAdbPath(): string | undefined {
    if (this.cachedAdb !== undefined) {
      return this.cachedAdb ?? undefined
    }

    // 仅在打包态查包内二进制;开发态 process.resourcesPath 指向 Electron 自带资源,无 adb。
    if (app?.isPackaged) {
      for (const rel of this.BUNDLED_ADB_CANDIDATES) {
        const candidate = path.join(process.resourcesPath, rel)
        try {
          if (fs.existsSync(candidate)) {
            this.cachedAdb = candidate
            console.log(`[ToolPathResolver] adb resolved (bundled): ${candidate}`)
            return candidate
          }
        } catch {
          // 忽略探测异常,继续尝试下一个候选或回退 PATH
        }
      }
    }

    this.cachedAdb = null
    console.log('[ToolPathResolver] adb not bundled; using $PATH')
    return undefined
  }

  /** 供 child_process spawn 使用的 adb 命令(打包内绝对路径或 'adb')。 */
  static getAdbExecutable(): string {
    return this.getAdbPath() ?? 'adb'
  }

  /** 重置缓存(安装/重打包后重探测用)。 */
  static resetCache(): void {
    this.cachedAdb = undefined
  }
}
