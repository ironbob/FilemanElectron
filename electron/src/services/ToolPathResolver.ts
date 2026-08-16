import { app } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

/**
 * L03 · ToolPathResolver (infrastructure)
 *
 * Single source of truth for the location of bundled CLI tools (adb / rg).
 *
 * 设计依据:
 *  - SRP / 关注点分离 —— "工具在哪里" 与 "工具怎么用" 分开,Scanner/Adapter/Service 不各自猜路径。
 *  - DRY / OCP —— 全仓唯一的捆绑工具路径解析点;新工具只需在 TOOLS 表加一行
 *    (候选相对路径),不修改解析逻辑。
 *
 * 打包态(electron-builder extraResources):工具位于 process.resourcesPath 下。
 * 开发态:不打包,回退到 $PATH(undefined 表示 "用 PATH 上的命令")。
 */
interface BundledTool {
  /** extraResources 落地点的候选相对路径。 */
  candidates: string[]
  /** 是否额外探测 $PATH(rg 常经 brew 安装,值得探测;adb 走既定捆绑语义不探测)。 */
  probePath?: boolean
}

export class ToolPathResolver {
  private static readonly TOOLS: Record<string, BundledTool> = {
    adb: { candidates: ['adb', 'tools/adb'] },
    // rg 捆绑布局是 build/tools/rg/rg（目录含单二进制）→ 打包后 Resources/rg/rg；
    // 兼容直接平铺（Resources/rg）与 tools 子目录两种历史形态
    rg: { candidates: ['rg/rg', 'rg', 'tools/rg'], probePath: true },
    // hdc（HarmonyOS Device Connector）常经 DevEco Studio 安装在 $PATH，
    // 开发态值得探测；打包态同样支持捆绑（布局同 adb）
    hdc: { candidates: ['hdc', 'tools/hdc'], probePath: true },
  }

  /** undefined=未探测, null=无捆绑(回退 $PATH)。按工具名缓存。 */
  private static bundledCache = new Map<string, string | null>()
  /** $PATH 探测结果缓存(按工具名)。 */
  private static pathCache = new Map<string, boolean>()

  /**
   * 解析打包内工具的绝对路径。
   * @returns 打包且存在 → 绝对路径;否则 undefined(调用方走 $PATH)。
   */
  static getBundledPath(name: string): string | undefined {
    if (!this.TOOLS[name]) throw new Error(`ToolPathResolver: unknown tool "${name}"`)
    if (this.bundledCache.has(name)) {
      return this.bundledCache.get(name) ?? undefined
    }

    // 仅在打包态查包内二进制;开发态 process.resourcesPath 指向 Electron 自带资源,无工具。
    if (app?.isPackaged) {
      for (const rel of this.TOOLS[name].candidates) {
        const candidate = path.join(process.resourcesPath, rel)
        try {
          // 必须是文件:extraResources 目录布局下 Resources/rg 是目录而非可执行,
          // 直接 spawn 目录只会得到模糊的 EACCES/EISDIR —— 存在性检查不够
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            this.bundledCache.set(name, candidate)
            console.log(`[ToolPathResolver] ${name} resolved (bundled): ${candidate}`)
            return candidate
          }
        } catch {
          // 忽略探测异常,继续尝试下一个候选或回退 PATH
        }
      }
    }

    this.bundledCache.set(name, null)
    console.log(`[ToolPathResolver] ${name} not bundled; falling back to $PATH`)
    return undefined
  }

  /** 供 child_process spawn 使用的命令(打包内绝对路径或裸命令名)。 */
  static getExecutable(name: string): string {
    return this.getBundledPath(name) ?? name
  }

  // ============ 兼容既有 adb 调用面 ============

  /** 解析 adb 可执行文件路径(打包且存在 → 绝对路径;否则 undefined 走 $PATH)。 */
  static getAdbPath(): string | undefined {
    return this.getBundledPath('adb')
  }

  /** 供 child_process spawn 使用的 adb 命令。 */
  static getAdbExecutable(): string {
    return this.getExecutable('adb')
  }

  // ============ hdc(HarmonyOS 设备连接器) ============

  /** 解析 hdc 可执行文件路径(打包且存在 → 绝对路径;否则 undefined 走 $PATH)。 */
  static getHdcPath(): string | undefined {
    return this.getBundledPath('hdc')
  }

  /** 供 child_process spawn 使用的 hdc 命令。 */
  static getHdcExecutable(): string {
    return this.getExecutable('hdc')
  }

  /** hdc 是否可用(捆绑存在或 $PATH 上有)。 */
  static hasHdc(): boolean {
    if (this.getBundledPath('hdc')) return true
    if (this.pathCache.has('hdc')) return this.pathCache.get('hdc')!
    let found = false
    try {
      execFileSync('which', ['hdc'], { stdio: 'ignore' })
      found = true
    } catch {
      found = false
    }
    this.pathCache.set('hdc', found)
    if (found) console.log('[ToolPathResolver] hdc resolved via $PATH')
    return found
  }

  // ============ ripgrep(grep 内容搜索引擎) ============

  /** rg 命令(捆绑绝对路径或 $PATH 上的 'rg')。 */
  static getRipgrepExecutable(): string {
    return this.getExecutable('rg')
  }

  /** rg 是否可用(捆绑存在或 $PATH 上有)。无 rg 时 GrepService 回退流式扫描引擎。 */
  static hasRipgrep(): boolean {
    if (this.getBundledPath('rg')) return true
    if (this.pathCache.has('rg')) return this.pathCache.get('rg')!
    let found = false
    try {
      execFileSync('which', ['rg'], { stdio: 'ignore' })
      found = true
    } catch {
      found = false
    }
    this.pathCache.set('rg', found)
    if (found) console.log('[ToolPathResolver] rg resolved via $PATH')
    return found
  }

  /** 重置缓存(安装/重打包后重探测用)。 */
  static resetCache(): void {
    this.bundledCache.clear()
    this.pathCache.clear()
  }
}
