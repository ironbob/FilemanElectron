import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { OHOS_CAPABILITIES, type DeviceCapabilities } from './capabilities'
import { shellQuote } from './shellQuote'
import { ToolPathResolver } from '../services/ToolPathResolver'
import { hdcTargetArgs, runHdc, runHdcShell } from '../services/support/hdcRunner'
import { parseHdcListTargets, parseStatLines, type OhosStatEntry } from '../services/support/ohosParsing'
import { t } from '../i18n'

const log = console

// L02 · OhosAdapter (driven adapter, hexagonal)
//
// 把 HarmonyOS(OHOS) 文件操作翻译为 hdc CLI 调用。关键设计:
//  - hdc 没有 adbkit 等价的 Node SDK,全部能力走 spawn CLI;
//    退出码经 EXIT_MARKER 协议恢复(hdcRunner.runHdcShell,同 AndroidAdapter 思路)。
//  - 列表 = `ls -A`(仅名字) + 分批 `stat -c '%n|%F|%s|%Y|%a'`(每行自报文件名,
//    个别条目 stat 失败只是缺行,无错位风险;纯解析在 support/ohosParsing.ts 可单测)。
//  - 读写 = `hdc file recv/send` + 本地临时文件(用后即删)。
//  - canStream=false:iOS 同姿态,StreamTransfer/fsReadChunk 自动回退缓冲循环。
interface OhosConfig {
  deviceId?: string // hdc connect key(设备 id 形如 "ohos:<key>")
}

/** 批量 stat 每批路径数:兼顾命令行长度与往返次数(每次 spawn ~50-200ms)。 */
const STAT_BATCH_SIZE = 64

/** file recv/send 的超时:大文件经 USB 传输明显慢于 shell,放宽到 5 分钟。 */
const TRANSFER_TIMEOUT_MS = 300_000

export class OhosAdapter implements IFileSystemAdapter {
  readonly type = 'ohos'
  readonly deviceId: string
  readonly name: string
  private config: OhosConfig
  private connected = false
  /** 本地临时文件去重序号(同毫秒并发时避免撞名)。 */
  private static tempSeq = 0

  constructor(deviceId: string, name: string, config: OhosConfig = {}) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return OHOS_CAPABILITIES
  }

  /** 设备 id 形如 "ohos:<connectKey>";hdc -t 需要裸 key(照 iOSAdapter.udid 剥前缀)。 */
  private connectKey(): string {
    const raw = this.config.deviceId ?? this.deviceId
    return raw.startsWith('ohos:') ? raw.slice(4) : raw
  }

  private requireConnected(): string {
    if (!this.connected) {
      throw new Error(t('errors.main.ohosNotConnected'))
    }
    return this.connectKey()
  }

  async connect(): Promise<void> {
    try {
      if (!ToolPathResolver.hasHdc()) {
        throw new Error(t('errors.main.ohosHdcMissing'))
      }
      const key = this.connectKey()
      const result = await runHdc(['list', 'targets'])
      const keys = parseHdcListTargets(result.stdout.toString('utf8'))
      if (!keys.includes(key)) {
        throw new Error(t('errors.main.ohosDeviceOffline', { key }))
      }
      this.connected = true
      log.info(`[OhosAdapter] connected: connectKey=${key}`)
    } catch (error) {
      this.connected = false
      log.error(`[OhosAdapter] 连接失败 (connectKey=${this.connectKey()}):`, error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    // hdc 每次调用都是独立进程,无守护会话可断开,只清状态。
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  // ============ 文件系统操作 ============

  async list(dirPath: string): Promise<FileInfo[]> {
    const key = this.requireConnected()
    // ls -A 只取名字(每行一个,空格安全);元数据走批量 stat,避免解析 ls -l 列对齐。
    // 名字不做 trim(仅去 \r)—— 首尾带空格的文件名是合法的,trim 会与 stat 自报名错位。
    const namesRaw = await runHdcShell(key, `ls -A ${shellQuote(dirPath)}`)
    const names = namesRaw.split('\n')
      .map(l => l.replace(/\r$/, ''))
      .filter(l => l.length > 0 && l !== '.' && l !== '..')
    if (names.length === 0) return []

    const statByPath = new Map<string, OhosStatEntry>()
    for (let i = 0; i < names.length; i += STAT_BATCH_SIZE) {
      const batch = names.slice(i, i + STAT_BATCH_SIZE).map(name => shellQuote(joinPosix(dirPath, name)))
      // 个别路径 stat 失败 → 该行缺失(输出行自带 %n 文件名),不影响其余条目;
      // 整批失败(如 stat 不支持 -c)由 runHdcShell 如实上抛 —— 不做 ls -l 解析兜底。
      const statRaw = await runHdcShell(key, `stat -c '%n|%F|%s|%Y|%a' ${batch.join(' ')}`)
      for (const entry of parseStatLines(statRaw)) {
        if (entry) statByPath.set(entry.name, entry)
      }
    }

    const files: FileInfo[] = []
    for (const name of names) {
      const fullPath = joinPosix(dirPath, name)
      const entry = statByPath.get(fullPath)
      const isDirectory = entry?.kind === 'directory'
      const isSymlink = entry?.kind === 'symlink'
      files.push({
        name,
        path: fullPath,
        isDirectory,
        isFile: !isDirectory,
        size: entry?.size ?? 0,
        modifiedTime: new Date(entry?.mtimeMs ?? 0).toISOString(),
        mode: entry?.mode,
        isSymlink,
        extension: !isDirectory ? path.extname(name).toLowerCase() : undefined,
      })
    }
    return sortFiles(files)
  }

  async stat(targetPath: string): Promise<FileStats> {
    const key = this.requireConnected()
    const raw = await runHdcShell(key, `stat -c '%n|%F|%s|%Y|%a' ${shellQuote(targetPath)}`)
    const entry = parseStatLines(raw).find(e => e !== null)
    if (!entry) {
      throw new Error(t('errors.main.ohosStatFailed', { path: targetPath }))
    }
    return {
      size: entry.size,
      isDirectory: entry.kind === 'directory',
      isFile: entry.kind !== 'directory',
      modifiedTime: new Date(entry.mtimeMs).toISOString(),
      createdTime: new Date(entry.mtimeMs).toISOString(),
      mode: entry.mode,
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const key = this.requireConnected()
    await runHdcShell(key, `mkdir -p ${shellQuote(dirPath)}`)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    const key = this.requireConnected()
    const cmd = recursive ? `rm -rf ${shellQuote(dirPath)}` : `rmdir ${shellQuote(dirPath)}`
    await runHdcShell(key, cmd)
  }

  async delete(targetPath: string): Promise<void> {
    const key = this.requireConnected()
    await runHdcShell(key, `rm -rf ${shellQuote(targetPath)}`)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const key = this.requireConnected()
    await runHdcShell(key, `mv ${shellQuote(oldPath)} ${shellQuote(newPath)}`)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    const key = this.requireConnected()
    await runHdcShell(key, `cp -r ${shellQuote(srcPath)} ${shellQuote(dstPath)}`)
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await this.stat(targetPath)
      return true
    } catch {
      return false
    }
  }

  async chmod(targetPath: string, mode: number): Promise<void> {
    const key = this.requireConnected()
    // 八进制字符串形式（mode 0o755 → '755'），与 AndroidAdapter 一致
    await runHdcShell(key, `chmod ${mode.toString(8).padStart(3, '0')} ${shellQuote(targetPath)}`)
  }

  async readFile(filePath: string): Promise<Buffer> {
    const key = this.requireConnected()
    const localPath = this.localTempPath()
    try {
      await runHdc([...hdcTargetArgs(key), 'file', 'recv', filePath, localPath], { timeoutMs: TRANSFER_TIMEOUT_MS })
      return await fs.promises.readFile(localPath)
    } finally {
      void fs.promises.rm(localPath, { force: true }).catch(() => { /* 临时文件清理失败无害 */ })
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const key = this.requireConnected()
    // 确保父目录存在(hdc file send 不会自动建目录)。
    const parent = posixDirname(filePath)
    if (parent && parent !== filePath) {
      try {
        await runHdcShell(key, `mkdir -p ${shellQuote(parent)}`)
      } catch {
        /* 父目录可能已存在 */
      }
    }
    const localPath = this.localTempPath()
    try {
      await fs.promises.writeFile(localPath, data)
      await runHdc([...hdcTargetArgs(key), 'file', 'send', localPath, filePath], { timeoutMs: TRANSFER_TIMEOUT_MS })
    } finally {
      void fs.promises.rm(localPath, { force: true }).catch(() => { /* 临时文件清理失败无害 */ })
    }
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    const key = this.requireConnected()
    const pattern = (query.pattern || '').trim()
    if (!pattern) return []
    // 保守用 -name(OHOS toybox 的 -iname 支持不确定);find 可能较慢,放宽到 60s。
    const raw = await runHdcShell(
      key,
      `find ${shellQuote(dirPath)} -type f -name ${shellQuote('*' + pattern + '*')} 2>/dev/null`,
      { timeoutMs: 60_000 }
    )
    const results: FileInfo[] = []
    for (const line of raw.split('\n')) {
      const p = line.replace(/\r$/, '')
      if (!p) continue
      results.push({
        name: posixBaseName(p),
        path: p,
        isDirectory: false,
        isFile: true,
        size: 0,
        modifiedTime: new Date(0).toISOString(),
        extension: path.extname(posixBaseName(p)).toLowerCase(),
      })
    }
    return results
  }

  /**
   * 远端命令执行（GrepService 的远端 grep 引擎）。复用 runHdcShell 的
   * EXIT_MARKER 机制拿 stdout 与退出码（grep 无匹配 exit 1 不是错误，
   * 由抛错语义转换为 code 字段返回）。
   */
  async exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const key = this.requireConnected()
    try {
      const stdout = await runHdcShell(key, command)
      return { stdout, stderr: '', code: 0 }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const codeMatch = message.match(/code=(\d+)/)
      if (codeMatch) {
        return { stdout: message.split('\n').slice(1).join('\n'), stderr: '', code: parseInt(codeMatch[1], 10) }
      }
      throw error
    }
  }

  // ============ 内部工具 ============

  /** os.tmpdir 下的唯一临时文件路径(file recv/send 中转)。 */
  private localTempPath(): string {
    const seq = ++OhosAdapter.tempSeq
    return path.join(os.tmpdir(), `fileman-ohos-${process.pid}-${Date.now()}-${seq}`)
  }
}

// ============ POSIX 路径工具(OHOS 用 /;与 AndroidAdapter 同实现,保持模块自洽) ============

function joinPosix(dir: string, name: string): string {
  if (dir.endsWith('/')) return dir + name
  return dir === '' ? `/${name}` : `${dir}/${name}`
}

function posixBaseName(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

function posixDirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx === -1) return ''
  if (idx === 0) return '/'
  return trimmed.slice(0, idx)
}

function sortFiles(files: FileInfo[]): FileInfo[] {
  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
