import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { ToolPathResolver } from './ToolPathResolver'
import { CancelledError } from './StreamTransfer'
import { t } from '../i18n'
const log = console

/**
 * 错误 message 前缀标记：「需要密码/密码错误」。instanceof 不能跨 IPC，
 * 渲染层以 String(error.message).includes(ARCHIVE_PASSWORD_MARKER) 识别后
 * 弹密码输入框重试。
 */
export const ARCHIVE_PASSWORD_MARKER = 'FILEMAN_ARCHIVE_PASSWORD'

export interface SevenZipRunResult {
  stdout: string
  stderr: string
  code: number
}

export interface SevenZipRunOptions {
  /** 超时毫秒数；0 = 不限时（压缩大目录可达分钟级）。默认 0。 */
  timeoutMs?: number
  /** stdout 逐行流式回调（-bb1 的 `+ <name>` 行驱动进度）。 */
  onLine?: (line: string) => void
  /** 取消轮询：true 时 kill 进程并抛 CancelledError。 */
  shouldCancel?: () => boolean
}

export interface SevenZipHooks {
  /** 每个文件完成压缩时回调（name = 条目名，bytes = 源字节数）。 */
  onFileRead: (name: string, bytes: number) => void
  shouldCancel: () => boolean
}

/**
 * SevenZipService —— 7zz（7-Zip 官方 CLI）封装：7z 创建、7z/rar/zip 解压。
 *
 * 设计依据：
 *  - 进程封装仿 hdcRunner（绝对路径 spawn + 聚合输出 + 取消 kill）；
 *    压缩是长任务，默认不限时。
 *  - 交互规避：7zz 遇加密档且无 -p 会尝试 stdin 交互（非 tty 下 "Break
 *    signaled"）——一切入口先探测（l），密码问题统一转 ARCHIVE_PASSWORD_MARKER。
 *  - 退出码不可靠（错密码时 l 可能为 0），判密以输出文本为准
 *    （"Wrong password" / "Enter password" / "Cannot open encrypted archive"，
 *    7zz 26.02 实测）。
 *  - 仅本机路径（打包捆绑或 $PATH/brew）；由调用方（main/FOM）保证 local。
 */
export class SevenZipService {
  private available: boolean | null = null

  /** 7zz 是否可用（捆绑存在或 $PATH/brew 可执行；结果缓存）。 */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available
    if (!ToolPathResolver.hasSevenZip()) {
      this.available = false
      return false
    }
    try {
      await this.run(['i'], { timeoutMs: 10_000 })
      this.available = true
    } catch {
      this.available = false
    }
    return this.available
  }

  /**
   * 创建 7z（本地）。cwd = 源公共父目录、源用相对名 —— 条目根 = 源自身名
   * （与既有 zip 创建的 basename 语义一致，多选各自成根目录）。
   * 密码 → `-p<密码>` + `-mhe=on`（连文件名一并加密）。
   */
  async create7z(
    sourcePaths: string[],
    archivePath: string,
    opts: { password?: string },
    hooks: SevenZipHooks
  ): Promise<void> {
    const cwd = commonParentDir(sourcePaths)
    const relativeNames = sourcePaths.map(p => path.relative(cwd, p) || path.basename(p))
    const sizes = await scanSizes(sourcePaths)

    const args = [
      'a', '-t7z', '-bd', '-y', '-bb1',
      ...(opts.password ? [`-p${opts.password}`, '-mhe=on'] : []),
      archivePath,
      ...relativeNames
    ]
    try {
      await this.run(args, {
        cwd,
        onLine: line => {
          // -bb1 完成行：`+ demo/a.txt`（目录行无大小，跳过）
          if (!line.startsWith('+ ')) return
          const name = line.slice(2).trim()
          hooks.onFileRead(path.basename(name) || name, sizes.get(name) ?? 0)
        },
        shouldCancel: hooks.shouldCancel
      })
    } catch (error) {
      if (error instanceof CancelledError) {
        await fs.remove(archivePath).catch(() => undefined)
        throw error
      }
      throw error
    }
    log.info('[SevenZipService] archive created', { archivePath, sources: sourcePaths.length })
  }

  /**
   * 解压（本地）。先 `l -slt` 探测：加密档无/错密码 → ARCHIVE_PASSWORD_MARKER；
   * 再校验条目路径安全（拒绝 `..` 与绝对路径，与 fflate 路径同语义）；
   * 最后 `x` 到 targetDirectory。
   */
  async extract(
    archivePath: string,
    targetDirectory: string,
    opts: { password?: string } = {}
  ): Promise<{ count: number }> {
    const pwArgs = opts.password ? [`-p${opts.password}`] : []
    // -ba（bare）：省略压缩包自身头部——否则首个 `Path = ` 是档案文件路径，会被
    // 安全校验误判为绝对路径条目
    const probeArgs = ['l', '-slt', '-ba', ...pwArgs, archivePath]
    let listOutput: string
    try {
      listOutput = (await this.run(probeArgs, { timeoutMs: 60_000 })).stdout
    } catch (error) {
      throw this.decoratePasswordError(error, archivePath, opts.password)
    }

    const entries = parseListPaths(listOutput)
    let count = 0
    for (const entryPath of entries) {
      if (entryPath.includes('..') || entryPath.startsWith('/')) {
        throw new Error(t('errors.main.archiveUnsafeEntry', { path: entryPath }))
      }
      count++
    }

    try {
      await this.run(['x', '-y', '-bd', ...pwArgs, `-o${targetDirectory}`, archivePath], {
        shouldCancel: () => false
      })
    } catch (error) {
      throw this.decoratePasswordError(error, archivePath, opts.password)
    }
    log.info('[SevenZipService] archive extracted', { archivePath, targetDirectory, count })
    return { count }
  }

  /** 7zz 交互式密码提示在非 tty 下变成 "Break signaled"——探测/解压失败统一转密码标记。 */
  private decoratePasswordError(error: unknown, archivePath: string, password?: string): Error {
    const text = error instanceof Error ? error.message : String(error)
    if (/Wrong password|Enter password|Cannot open encrypted archive/i.test(text)) {
      const reason = password
        ? t('errors.main.archiveWrongPassword')
        : t('errors.main.archivePasswordRequired')
      return new Error(`${ARCHIVE_PASSWORD_MARKER}: ${reason} (${path.basename(archivePath)})`)
    }
    return error instanceof Error ? error : new Error(text)
  }

  /** 运行一条 7zz 命令；非零退出码 reject（带输出摘要）。 */
  private run(args: string[], options: SevenZipRunOptions & { cwd?: string } = {}): Promise<SevenZipRunResult> {
    const timeoutMs = options.timeoutMs ?? 0
    return new Promise((resolve, reject) => {
      const child: ChildProcess = spawn(ToolPathResolver.getSevenZipExecutable(), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd
      })
      const outChunks: Buffer[] = []
      const errChunks: Buffer[] = []
      let outTail = ''
      let settled = false

      const timer = timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return
            settled = true
            child.kill()
            reject(new Error(t('errors.main.sevenZipTimeout', { timeout: timeoutMs, command: args.join(' ') })))
          }, timeoutMs)
        : null
      // 取消轮询（500ms）：kill 进程 → close 事件收敛为 CancelledError
      let cancelTimer: ReturnType<typeof setInterval> | null = null
      if (options.shouldCancel) {
        cancelTimer = setInterval(() => {
          if (options.shouldCancel!()) {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            if (cancelTimer) clearInterval(cancelTimer)
            child.kill()
            reject(new CancelledError())
          }
        }, 500)
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        outChunks.push(Buffer.from(chunk))
        if (options.onLine) {
          outTail += chunk.toString('utf8')
          const lines = outTail.split('\n')
          outTail = lines.pop() ?? ''
          for (const line of lines) options.onLine(line)
        }
      })
      child.stderr?.on('data', chunk => errChunks.push(Buffer.from(chunk)))
      child.once('error', error => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (cancelTimer) clearInterval(cancelTimer)
        reject(new Error(t('errors.main.sevenZipRunFailed', { message: error.message })))
      })
      child.once('close', code => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (cancelTimer) clearInterval(cancelTimer)
        if (options.onLine && outTail) options.onLine(outTail)
        const stdout = Buffer.concat(outChunks).toString('utf8')
        const stderr = Buffer.concat(errChunks).toString('utf8').trim()
        // 7zz 把多数错误打到 stdout；判密优先于退出码（错密码时 l 可能 exit 0）
        if (code !== 0) {
          reject(new Error(t('errors.main.sevenZipCommandFailed', {
            code: String(code),
            command: `7zz ${args.join(' ')}${(stdout + stderr).trim() ? `: ${(stdout + stderr).trim().slice(0, 400)}` : ''}`
          })))
          return
        }
        resolve({ stdout, stderr, code })
      })
    })
  }
}

/** `l -slt` 输出解析条目 Path 列表（含目录行——安全校验对目录同样必要）。 */
function parseListPaths(output: string): string[] {
  const paths: string[] = []
  for (const line of output.split('\n')) {
    const match = line.match(/^Path = (.+)$/)
    if (match) paths.push(match[1].trim())
  }
  return paths
}

/** 递归统计各相对条目的源字节数（进度分母按文件记账；条目名与 -bb1 输出一致）。 */
async function scanSizes(sourcePaths: string[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>()
  const walk = async (abs: string, rel: string): Promise<void> => {
    const stat = await fs.stat(abs).catch(() => null)
    if (!stat) return
    if (stat.isFile()) {
      sizes.set(rel, stat.size)
      return
    }
    const children = await fs.readdir(abs).catch(() => [])
    for (const child of children) await walk(path.join(abs, child), `${rel}/${child}`)
  }
  for (const source of sourcePaths) {
    await walk(source, path.basename(source))
  }
  return sizes
}

/** 公共父目录（多选来自同一目录是常态；跨目录时回退各自 basename 语义由 -bb1 计数兜底）。 */
function commonParentDir(paths: string[]): string {
  if (paths.length === 0) return process.cwd()
  const dirs = paths.map(p => path.dirname(path.resolve(p)))
  let common = dirs[0]
  for (const dir of dirs.slice(1)) {
    while (common !== path.dirname(common) && !dir.startsWith(common + path.sep)) {
      common = path.dirname(common)
    }
  }
  return common
}
