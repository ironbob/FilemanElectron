import { execFile } from 'child_process'
import path from 'path'

/**
 * HostShellService
 *
 * 平台相关的「宿主集成」执行：用系统终端打开一个本地目录。
 * 唯一封装『如何在本平台启动终端并 cd 到目录』；上层 IPC controller
 * 只依赖此抽象，不感知 osascript / 平台命令细节。
 *
 * 当前实现：macOS（osascript 激活 Terminal.app 并在新窗口 cd）。
 * 扩展到 Windows/Linux：在 openInTerminal 内按 process.platform 分支，
 * controller / renderer 无需改动（OCP 已为此封口，见架构文档「已知缺口」）。
 *
 * 设计依据：SRP（只做平台终端启动）、OCP（平台策略可扩展）、
 * separation_of_concerns（OS 细节隔离在 main，不漏到 controller/renderer）。
 */
export class HostShellService {
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
}
