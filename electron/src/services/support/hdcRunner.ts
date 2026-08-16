import { spawn } from 'child_process'
import { ToolPathResolver } from '../ToolPathResolver'
import { t } from '../../i18n'

/**
 * hdc(HarmonyOS Device Connector) 进程封装。
 *
 * hdc 每次调用都是独立进程（无守护会话），`-t <connectKey>` 选择目标设备。
 * `hdc shell` 是否透传退出码随版本不稳定，因此统一走 EXIT_MARKER 协议
 * （与 AndroidAdapter.runShell 同源做法）：命令尾部追加 printf 标记，
 * 从输出 lastIndexOf 解析真实退出码。
 */

/** 远端 shell 退出码标记；printf 格式注入，输出形如 `__FM_OHOS_EXIT__0`。 */
export const OHOS_EXIT_MARKER = '__FM_OHOS_EXIT__'

export interface HdcRunResult {
  stdout: Buffer
  stderr: string
  code: number
}

export interface HdcRunOptions {
  /** 超时毫秒数；超时 kill 进程并 reject。默认 30s（file recv 等长操作可调大）。 */
  timeoutMs?: number
}

/** `-t <connectKey>` 前缀参数。 */
export function hdcTargetArgs(connectKey: string): string[] {
  return ['-t', connectKey]
}

/** 运行一条 hdc 命令，聚合 stdout/stderr；非零退出码 reject（带 stderr 摘要）。 */
export function runHdc(args: string[], options: HdcRunOptions = {}): Promise<HdcRunResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  return new Promise((resolve, reject) => {
    const child = spawn(ToolPathResolver.getHdcExecutable(), args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(t('errors.main.hdcTimeout', { timeout: timeoutMs, command: args.join(' ') })))
    }, timeoutMs)

    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
    child.once('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(t('errors.main.hdcSpawnFailed', { message: error.message })))
    })
    child.once('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stdout = Buffer.concat(chunks)
      const stderr = Buffer.concat(errors).toString('utf8').trim()
      if (code !== 0) {
        reject(new Error(t('errors.main.hdcCommandFailed', {
          code: String(code),
          command: `hdc ${args.join(' ')}${stderr ? `: ${stderr}` : ''}`
        })))
        return
      }
      resolve({ stdout, stderr, code })
    })
  })
}

/**
 * 在目标设备上执行 shell 命令并返回 stdout（EXIT_MARKER 协议恢复退出码）。
 * 命令作为单个参数传给 `hdc shell`，由设备端 shell 解释 —— 路径必须 shellQuote。
 */
export async function runHdcShell(connectKey: string, command: string, options: HdcRunOptions = {}): Promise<string> {
  const wrapped = `${command}; printf '\\n${OHOS_EXIT_MARKER}%d' "$?"`
  const shellResult = await runHdc([...hdcTargetArgs(connectKey), 'shell', wrapped], options)
  const text = shellResult.stdout.toString('utf8')
  const markerIndex = text.lastIndexOf(OHOS_EXIT_MARKER)
  if (markerIndex === -1) {
    // 标记缺失：无法确认退出码，按失败处理避免吞错
    throw new Error(t('errors.main.hdcShellNoExitMarker', { command }))
  }
  const exitCode = parseInt(text.slice(markerIndex + OHOS_EXIT_MARKER.length).trim(), 10)
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    const output = text.slice(0, markerIndex).trim()
    throw new Error(t('errors.main.hdcShellFailed', {
      code: Number.isFinite(exitCode) ? exitCode : '?',
      command: `${command}${output ? `: ${output}` : ''}`
    }))
  }
  return text.slice(0, markerIndex)
}
