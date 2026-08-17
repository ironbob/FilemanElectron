import { execFile } from 'child_process'
import { shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { OpenWithApp } from '@shared/types'

/**
 * HostShellService
 *
 * 平台相关的「宿主集成」执行：用系统终端打开一个本地目录、用指定应用
 * 打开文件/目录、按目标文件查询 LaunchServices 适用应用（「打开方式」菜单数据源）。
 * 唯一封装『如何在本平台与宿主 shell/应用交互』；上层 IPC controller
 * 只依赖此抽象，不感知 osascript / open / 平台命令细节。
 *
 * 当前实现：macOS（osascript 激活 Terminal.app 并在新窗口 cd；open -a 启动应用）。
 * 扩展到 Windows/Linux：在各方法内按 process.platform 分支，
 * controller / renderer 无需改动（OCP 已为此封口，见架构文档「已知缺口」）。
 *
 * 设计依据：SRP（只做宿主集成）、OCP（平台策略可扩展）、
 * separation_of_concerns（OS 细节隔离在 main，不漏到 controller/renderer）。
 */

/**
 * JXA 查询脚本：问 LaunchServices「哪些应用能打开这个文件」。
 * 数据源与 Finder「打开方式」菜单一致（NSWorkspace → LaunchServices），
 * 天然完成 UTI/conformance 判定，无需手工解析各 app 的 Info.plist。
 * 目标路径经 argv 传入（NSProcessInfo 取末参），彻底绕开字符串转义。
 * 返回 JSON：{ apps: string[]（bundle 绝对路径，LS 排序）, default: string | null }。
 * 任何异常都捕获为 { error }，Node 侧据此走「仅默认应用」降级。
 */
const LS_QUERY_SCRIPT = `
function runSafe() {
  try {
    ObjC.import('AppKit')
    const argv = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments)
    const target = argv[argv.length - 1]
    const url = $.NSURL.fileURLWithPath(target)
    const ws = $.NSWorkspace.sharedWorkspace
    const nsArr = ws.URLsForApplicationsToOpenURL(url)
    const out = []
    const n = Number(nsArr.count)
    for (let i = 0; i < n; i++) out.push(nsArr.objectAtIndex(i).path.js)
    const def = ws.URLForApplicationToOpenURL(url)
    const defPath = (def && !def.isNil() && def.path) ? def.path.js : null
    return JSON.stringify({ apps: out, default: defPath })
  } catch (e) { return JSON.stringify({ error: String(e) }) }
}
runSafe()
`

/**
 * LaunchServices 结果里的「非用户软件」路径（包管理器缓存、编辑器插件目录等
 * 塞进去的 .app，如 puppeteer 的 Chromium、TRAE 虚拟机里的 LibreOffice）。
 * 命中即过滤——这些不是用户认知里的已安装软件。
 */
const JUNK_APP_PATH_PATTERNS: RegExp[] = [
  /\/node_modules\//i,
  /\/\.cache\//i,
  /\/Library\/Application Support\//i,
  /\/Library\/Caches\//i,
  /\/private\/var\//i
]

/** 绝对路径 osascript：GUI 启动的打包应用拿不到用户 $PATH（见 CLAUDE.md 打包注意事项）。 */
const OSASCRIPT_BIN = '/usr/bin/osascript'

export class HostShellService {
  /** 「打开方式」查询缓存：目录 → '<dir>'，文件 → 小写扩展名；无扩展名不缓存（内容嗅探结果可能逐文件不同）。 */
  private openWithCache = new Map<string, OpenWithApp[]>()

  /**
   * 在系统终端中打开目录（macOS：新开 Terminal 窗口并 cd 进 dirPath）。
   *
   * 路径需双层转义：
   *   1. shell 层 —— 用单引号包裹并把路径中的 `'` 转成 `'\''`（标准 POSIX 做法）；
   *   2. AppleScript 层 —— 把上面的 shell 命令串里的 `\` 与 `"` 转义，
   *      因为它是 osascript `-e` 的 do script 字符串内容。
   * 用 execFile（不经 shell）传参，避免再叠加一层 shell 引号地狱。
   *
   * @param dirPath 要打开的本地目录绝对路径
   * @throws 平台不支持或 osascript 调用失败时 reject（controller 转为 IPC 错误）
   */
  openInTerminal(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (process.platform !== 'darwin') {
        reject(new Error(
          `HostShellService.openInTerminal: platform "${process.platform}" not supported (macOS only for now)`
        ))
        return
      }

      const normalized = path.resolve(dirPath)
      console.log(`[HostShellService] Open in Terminal requested: "${normalized}"`)

      // 1) shell 转义：单引号包裹，内部 ' -> '\''
      const shellWord = `'${normalized.replace(/'/g, `'\\''`)}'`
      const shellCmd = `cd ${shellWord}`
      // 2) AppleScript 字符串转义：\ -> \\，" -> \"
      const appleString = shellCmd.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`)
      const script =
        `tell application "Terminal"\nactivate\ndo script "${appleString}"\nend tell`

      execFile('osascript', ['-e', script], (err, _stdout, stderr) => {
        if (err) {
          console.error(`[HostShellService] Failed to open Terminal at "${normalized}":`, err.message)
          reject(new Error(`Failed to open Terminal at "${normalized}": ${err.message}`))
          return
        }
        if (stderr && stderr.trim()) {
          // osascript 偶把警告打到 stderr 但命令仍成功；记录不视为失败
          console.warn(`[HostShellService] osascript stderr for "${normalized}": ${stderr.trim()}`)
        }
        console.log(`[HostShellService] Opened Terminal at "${normalized}"`)
        resolve()
      })
    })
  }

  /**
   * 在 Finder 中显示指定文件/目录（选中其所在层级并高亮）。
   * 走主进程 shell.showItemInFolder——sandboxed preload 的 electron 模块
   * 不含 shell，此前 preload 直调会静默抛错（详见 疑难问题解决记录）。
   * 目标不存在时不抛错（与 Electron 语义一致，仅无操作）。
   */
  showInFolder(targetPath: string): void {
    const normalized = path.resolve(targetPath)
    shell.showItemInFolder(normalized)
    console.log(`[HostShellService] Revealed in Finder: "${normalized}"`)
  }

  /**
   * 用指定应用打开本地文件/目录（macOS：`open -a <app> <target>`）。
   * execFile 传参数组，不经 shell——沿用本服务的「无引号地狱」原则。
   */
  openWith(appPath: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const normalized = path.resolve(targetPath)
      execFile('open', ['-a', path.resolve(appPath), normalized], (err, _stdout, stderr) => {
        if (err) {
          console.error('[HostShellService] openWith failed:', err.message)
          reject(new Error(`Failed to open "${normalized}" with "${appPath}": ${err.message}`))
          return
        }
        if (stderr && stderr.trim()) {
          console.warn('[HostShellService] open stderr:', stderr.trim())
        }
        console.log(`[HostShellService] Opened "${normalized}" with ${appPath}`)
        resolve()
      })
    })
  }

  /**
   * 用系统默认应用打开本地文件/目录（macOS：`open <target>`）。
   * 与 openWith 同构：execFile 参数组，不经 shell。
   */
  openDefault(targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const normalized = path.resolve(targetPath)
      execFile('open', [normalized], (err, _stdout, stderr) => {
        if (err) {
          console.error(`[HostShellService] openDefault failed for "${normalized}":`, err.message)
          reject(new Error(`Failed to open "${normalized}" with default app: ${err.message}`))
          return
        }
        if (stderr && stderr.trim()) {
          console.warn(`[HostShellService] open stderr for "${normalized}":`, stderr.trim())
        }
        console.log(`[HostShellService] Opened "${normalized}" with default app`)
        resolve()
      })
    })
  }

  /**
   * 查询「能用哪个已安装应用打开 targetPath」（macOS：LaunchServices，与
   * Finder「打开方式」同源）。 suitability 判定完全交给系统：UTI 声明、
   * 扩展名、conformance 都由 LS 解析，本方法只做展示层加工——
   * 过滤垃圾路径 → 按包名去重（保留 LS 排序靠前者）→ 默认应用置顶、
   * 其余按名称排序。
   * 结果按（目录/小写扩展名）memoize：osascript 冷启约百毫秒，而右键高频。
   * 非 darwin 平台 / 查询失败 → []（渲染端保底只显示「默认应用」入口）。
   */
  async getOpenWithApps(targetPath: string): Promise<OpenWithApp[]> {
    if (process.platform !== 'darwin') return []

    const normalized = path.resolve(targetPath)
    let isDir = false
    try {
      isDir = fs.statSync(normalized, { throwIfNoEntry: false })?.isDirectory() ?? false
    } catch {
      // stat 失败（权限等）按文件处理，查询本身仍可尝试
    }
    const ext = path.extname(normalized).toLowerCase()
    const cacheKey = isDir ? '<dir>' : (ext || null)
    if (cacheKey && this.openWithCache.has(cacheKey)) {
      return this.openWithCache.get(cacheKey)!
    }

    const raw = await this.queryLaunchServices(normalized)
    if (!raw) return []

    // 垃圾路径过滤 + 按包名去重（LS 已按匹配度排序，保留首个）
    const seenBundles = new Set<string>()
    const apps: OpenWithApp[] = []
    for (const bundlePath of raw.apps) {
      if (JUNK_APP_PATH_PATTERNS.some(re => re.test(bundlePath))) continue
      const base = path.basename(bundlePath)
      const dedupeKey = base.toLowerCase()
      if (seenBundles.has(dedupeKey)) continue
      seenBundles.add(dedupeKey)
      apps.push({
        id: bundlePath,
        name: base.replace(/\.app$/i, ''),
        bundlePath,
        isDefault: bundlePath === raw.default
      })
    }

    // 默认应用置顶，其余按名称排序（Finder 呈现习惯）
    apps.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

    if (cacheKey) this.openWithCache.set(cacheKey, apps)
    console.log(`[HostShellService] open-with for "${normalized}": ${apps.length} app(s)${apps[0]?.isDefault ? `, default=${apps[0].name}` : ''}`)
    return apps
  }

  /**
   * 执行 JXA 查询并解析 JSON 结果。
   * 返回 null 表示不可用（脚本失败 / JSON 异常 / error 字段），
   * 让调用方走空列表降级而非抛错——「打开方式」是增强入口，不该炸菜单。
   */
  private queryLaunchServices(normalizedPath: string): Promise<{ apps: string[]; default: string | null } | null> {
    return new Promise(resolve => {
      execFile(
        OSASCRIPT_BIN,
        ['-l', 'JavaScript', '-e', LS_QUERY_SCRIPT, '--', normalizedPath],
        { timeout: 10_000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[HostShellService] LS query failed:', err.message, stderr?.trim())
            resolve(null)
            return
          }
          try {
            const parsed = JSON.parse(stdout.trim())
            if (typeof parsed.error === 'string') {
              console.error('[HostShellService] LS query script error:', parsed.error)
              resolve(null)
              return
            }
            if (!Array.isArray(parsed.apps)) {
              console.error('[HostShellService] LS query unexpected payload:', stdout.trim().slice(0, 200))
              resolve(null)
              return
            }
            resolve({
              apps: parsed.apps.filter((p: unknown): p is string => typeof p === 'string'),
              default: typeof parsed.default === 'string' ? parsed.default : null
            })
          } catch (e) {
            console.error('[HostShellService] LS query JSON parse failed:', (e as Error).message)
            resolve(null)
          }
        }
      )
    })
  }
}
