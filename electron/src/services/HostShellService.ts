import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { OpenWithApp } from '@shared/types'

/**
 * HostShellService
 *
 * 平台相关的「宿主集成」执行：用系统终端打开一个本地目录、用指定应用
 * 打开文件/目录、探测已安装的开发者应用。
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

/** 已知开发者应用探测表（bundle 目录名 → 展示名）。 */
const DEV_APP_CANDIDATES: Array<{ bundle: string; name: string }> = [
  { bundle: 'Visual Studio Code.app', name: 'VS Code' },
  { bundle: 'VSCodium.app', name: 'VSCodium' },
  { bundle: 'Cursor.app', name: 'Cursor' },
  { bundle: 'Sublime Text.app', name: 'Sublime Text' },
  { bundle: 'iTerm.app', name: 'iTerm2' },
  { bundle: 'Zed.app', name: 'Zed' },
  { bundle: 'JetBrains Toolbox.app', name: 'JetBrains Toolbox' },
  { bundle: 'Xcode.app', name: 'Xcode' }
]

export class HostShellService {
  private detectedAppsCache: OpenWithApp[] | null = null

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
   * 探测本机已安装的开发者应用（/Applications 与 ~/Applications）。
   * 结果 memoize（应用安装是罕见事件；重探经重启或后续显式刷新）。
   */
  detectDevApps(): OpenWithApp[] {
    if (this.detectedAppsCache) return this.detectedAppsCache
    const roots = ['/Applications', path.join(os.homedir(), 'Applications')]
    const found: OpenWithApp[] = []
    for (const candidate of DEV_APP_CANDIDATES) {
      for (const root of roots) {
        const bundlePath = path.join(root, candidate.bundle)
        try {
          if (fs.existsSync(bundlePath)) {
            found.push({ id: candidate.bundle, name: candidate.name, bundlePath })
            break
          }
        } catch {
          // 探测异常按未安装处理
        }
      }
    }
    this.detectedAppsCache = found
    console.log(`[HostShellService] detected dev apps: ${found.map(app => app.name).join(', ') || '(none)'}`)
    return found
  }
}
