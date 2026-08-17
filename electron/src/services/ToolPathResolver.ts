import { app } from 'electron'
import { execFileSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * L03 · ToolPathResolver (infrastructure)
 *
 * Single source of truth for the location of bundled CLI tools
 * (adb / rg / hdc / libimobiledevice CLI)。
 *
 * 设计依据:
 *  - SRP / 关注点分离 —— "工具在哪里" 与 "工具怎么用" 分开,Scanner/Adapter/Service 不各自猜路径。
 *  - DRY / OCP —— 全仓唯一的捆绑工具路径解析点;新工具只需在 TOOLS 表加一行
 *    (候选相对路径),不修改解析逻辑。
 *
 * 解析顺序(逐级回退):
 *  1. 打包态 extraResources(process.resourcesPath 下,按 candidates 探测);
 *  2. $PATH(which)—— 开发态主路径;
 *  3. 常见安装前缀(/opt/homebrew/bin 等)与工具专属 SDK 目录(extraPaths)——
 *     macOS GUI 应用(Finder/Dock 启动)的 $PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin,
 *     which 探测不到 brew/SDK 安装的工具,必须直接试已知位置
 *     (2026-08-17:打包后手机连接失效的根因之一;hdc 随 DevEco 装在
 *     ~/Library/OpenHarmony/Sdk 等 SDK 目录,既不在 $PATH 也不在 brew 前缀)。
 */
interface BundledTool {
  /** extraResources 落地点的候选相对路径。 */
  candidates: string[]
  /** 是否额外探测 $PATH / 常见前缀(纯捆绑语义的工具填 false)。 */
  probePath?: boolean
  /** 工具专属安装位置的绝对路径模式($PATH/brew 前缀之外的兜底探测)。
   *  支持 `~` 开头与单段 `*` 通配(版本目录,多命中取版本大者),
   *  如 ~/Library/OpenHarmony/Sdk/<ver>/toolchains/hdc。 */
  extraPaths?: string[]
  /** 与工具同目录、运行必需的伴随文件(如 hdc 的 libusb_shared.dylib)。
   *  命中捆绑路径时一并 best-effort 清除 quarantine(dylib 加载同样被
   *  Gatekeeper 拦截)。 */
  siblings?: string[]
}

export class ToolPathResolver {
  private static readonly TOOLS: Record<string, BundledTool> = {
    // 平铺布局:Resources/adb;兼容 tools/ 子目录历史形态。
    // 打包态必捆绑(build-dmg.sh 自动投放);dev 态 SDK 的 adb 在 $PATH 上。
    adb: { candidates: ['adb', 'tools/adb'], probePath: true },
    // rg 捆绑布局是 build/tools/rg/rg（目录含单二进制）→ 打包后 Resources/rg/rg；
    // 兼容直接平铺（Resources/rg）与 tools 子目录两种历史形态
    rg: { candidates: ['rg/rg', 'rg', 'tools/rg'], probePath: true },
    // hdc（HarmonyOS Device Connector）—— 打包态由 build-dmg.sh 经 fetch-hdc.sh
    // 捆绑(目录布局 Resources/hdc/{hdc,libusb_shared.dylib},同 rg);未捆绑时
    // 经 $PATH / DevEco·OpenHarmony SDK 目录使用本机安装(hdc 常随 DevEco 装在
    // SDK toolchains 下,不在 brew 前缀,需要 extraPaths 兜底)。
    hdc: {
      candidates: ['hdc/hdc', 'hdc', 'tools/hdc'],
      probePath: true,
      extraPaths: [
        '~/Library/OpenHarmony/Sdk/*/toolchains/hdc',
        '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc',
        '/Applications/DevEco-Studio.app/Contents/sdk/*/openharmony/toolchains/hdc'
      ],
      // hdc 依赖同目录 @rpath/libusb_shared.dylib(rpath=@loader_path/.)
      siblings: ['libusb_shared.dylib']
    },
    // libimobiledevice CLI（iOS 设备发现/配对校验/截图）。bundle-ios-dylibs.sh 会把
    // brew 的 CLI 及其 dylib 链收进 Resources/ios-native（与 iosafc.node 同目录）；
    // 未捆绑时 dev 态经 $PATH / brew 前缀使用本机安装。
    idevice_id: { candidates: ['ios-native/idevice_id'], probePath: true },
    ideviceinfo: { candidates: ['ios-native/ideviceinfo'], probePath: true },
    idevicepair: { candidates: ['ios-native/idevicepair'], probePath: true },
    idevicescreenshot: { candidates: ['ios-native/idevicescreenshot'], probePath: true },
  }

  /**
   * macOS GUI 应用经 Finder/Dock 启动时不继承用户 shell 的 $PATH
   * （仅 /usr/bin:/bin:/usr/sbin:/sbin）,brew 安装的工具需直接探测已知前缀。
   * Apple Silicon 与 Intel 的 Homebrew 前缀各一个。
   */
  private static readonly COMMON_PREFIXES = ['/opt/homebrew/bin', '/usr/local/bin']

  /** undefined=未探测, null=无捆绑(回退 $PATH)。按工具名缓存。 */
  private static bundledCache = new Map<string, string | null>()
  /** $PATH / 常见前缀探测结果缓存(按工具名)。undefined=未探测, null=未找到。 */
  private static pathCache = new Map<string, string | null>()
  /** 已 best-effort 清除过 quarantine 的捆绑路径(每次启动最多一次)。 */
  private static dequarantined = new Set<string>()

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
            this.stripQuarantine(candidate)
            // 伴随 dylib 同样会被 Gatekeeper 拦截加载,一并清一次
            for (const sibling of this.TOOLS[name].siblings ?? []) {
              this.stripQuarantine(path.join(path.dirname(candidate), sibling))
            }
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
    return undefined
  }

  /** 供 child_process spawn 使用的命令(打包内绝对路径,或 $PATH/前缀上的绝对路径,或裸命令名)。 */
  static getExecutable(name: string): string {
    return this.getBundledPath(name) ?? this.pathLookup(name) ?? name
  }

  /** 工具是否可用(捆绑 / $PATH / 常见前缀任一命中)。 */
  static has(name: string): boolean {
    if (!this.TOOLS[name]) throw new Error(`ToolPathResolver: unknown tool "${name}"`)
    return !!this.getBundledPath(name) || !!this.pathLookup(name)
  }

  /**
   * $PATH(which)→ 常见安装前缀 → 工具专属 SDK 目录(extraPaths),
   * 返回可用的绝对路径;未启用探测或未找到 → undefined。
   * 结果按工具名缓存。macOS 无 which 内建,execFileSync 走 /usr/bin/which。
   */
  private static pathLookup(name: string): string | undefined {
    const tool = this.TOOLS[name]
    if (!tool?.probePath) return undefined
    if (this.pathCache.has(name)) {
      return this.pathCache.get(name) ?? undefined
    }
    let found: string | undefined
    try {
      const out = execFileSync('which', [name], { encoding: 'utf-8' }).trim()
      if (out) found = out.split('\n')[0]!
    } catch {
      // $PATH 上没有 —— GUI 应用常态,继续试常见前缀
    }
    if (!found) {
      for (const prefix of this.COMMON_PREFIXES) {
        const candidate = path.join(prefix, name)
        try {
          if (fs.statSync(candidate).isFile()) {
            found = candidate
            break
          }
        } catch {
          // 前缀不存在,继续
        }
      }
    }
    if (!found) {
      // 工具专属 SDK 目录(如 DevEco 的 OpenHarmony SDK toolchains)
      for (const pattern of tool.extraPaths ?? []) {
        found = this.probePattern(pattern)
        if (found) break
      }
    }
    this.pathCache.set(name, found ?? null)
    if (found) console.log(`[ToolPathResolver] ${name} resolved via $PATH/known locations: ${found}`)
    return found
  }

  /**
   * 探测带单段通配符(*)的绝对路径模式,如 ~/Library/OpenHarmony/Sdk/<ver>/toolchains/hdc:
   * * 只匹配一个版本目录段(数字/点组成),多个命中取版本大者;无 * 直接 stat。
   * 找不到 → undefined。路径不存在等探测异常一律静默(与其他探测级同语义)。
   */
  private static probePattern(pattern: string): string | undefined {
    const expanded = pattern.startsWith('~/')
      ? path.join(os.homedir(), pattern.slice(2))
      : pattern
    const star = expanded.indexOf('*')
    if (star === -1) {
      try {
        return fs.statSync(expanded).isFile() ? expanded : undefined
      } catch {
        return undefined
      }
    }
    // * 必须夹在两个 '/' 之间:dir=通配段所在目录,suffix=其后的固定路径(以 / 开头)
    const dirEnd = expanded.lastIndexOf('/', star) + 1
    const suffixStart = expanded.indexOf('/', star)
    if (dirEnd === 0 || suffixStart === -1) return undefined
    const dir = expanded.slice(0, dirEnd)
    const suffix = expanded.slice(suffixStart)
    try {
      const versions = fs.readdirSync(dir)
        .filter(entry => /^\d+(\.\d+)*$/.test(entry))
        .sort(compareVersionsDesc)
      for (const version of versions) {
        const candidate = dir + version + suffix
        try {
          if (fs.statSync(candidate).isFile()) return candidate
        } catch {
          // 该版本目录下没有,继续
        }
      }
    } catch {
      // 目录不存在,静默
    }
    return undefined
  }

  /**
   * 捆绑二进制可能随 DMG 下载继承 com.apple.quarantine(整个 .app 递归标记),
   * 未清除时内核会拦截 execve(killed: 9 / "cannot be opened")。
   * 这里 best-effort 自清一次:app 被拖入 /Applications 后 bundle 对当前用户可写,
   * xattr -d 即可生效;只读 / App Translocation 态下静默失败,由用户按 DMG 提示
   * 对整个 .app 执行 xattr -dr 兜底。
   */
  private static stripQuarantine(p: string): void {
    if (this.dequarantined.has(p)) return
    this.dequarantined.add(p)
    try {
      spawnSync('xattr', ['-d', 'com.apple.quarantine', p], { stdio: 'ignore', timeout: 5000 })
    } catch {
      // best-effort:清不掉也不阻塞解析
    }
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
    return this.has('hdc')
  }

  // ============ ripgrep(grep 内容搜索引擎) ============

  /** rg 命令(捆绑绝对路径或 $PATH 上的 'rg')。 */
  static getRipgrepExecutable(): string {
    return this.getExecutable('rg')
  }

  /** rg 是否可用(捆绑存在或 $PATH 上有)。无 rg 时 GrepService 回退流式扫描引擎。 */
  static hasRipgrep(): boolean {
    return this.has('rg')
  }

  /** 重置缓存(安装/重打包后重探测用)。 */
  static resetCache(): void {
    this.bundledCache.clear()
    this.pathCache.clear()
  }
}

/** 版本目录降序比较('15' > '5.1' > '5.0.3';按点分段数值比较)。 */
function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
