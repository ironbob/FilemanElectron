import * as path from 'path'
import { Readable, Writable, PassThrough } from 'stream'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { ANDROID_CAPABILITIES, type DeviceCapabilities } from './capabilities'
import { ToolPathResolver } from '../services/ToolPathResolver'

// L02 · AndroidAdapter (driven adapter, hexagonal)
//
// 把 Android 文件操作翻译为 adbkit 调用。关键设计:
//  - 列表/属性走 adbkit **sync 协议**(readdir/stat),不再解析 `ls -la` 文本 ——
//    根除跨厂商/版本输出解析脆弱问题(对应 R6:返回真实元数据)。
//  - mkdir/rename/delete/copy/search 走 shell(+ exit marker),因 adbkit 无对应 sync 操作;
//    输出用 util.readAll 聚合,并按 exit code 判定成败。
//  - 大文件读写走 pull/push 流(canStream=true),供 StreamTransfer 管道使用。
//
// adbkit 经 adb server 工作;adb 二进制路径由 ToolPathResolver 解析(打包内或 $PATH)。
//
// Externalized dep —— vite config 把 @devicefarmer/adbkit 列为 external,运行时从 node_modules 加载。
import adbkit from '@devicefarmer/adbkit'
import type { Client, DeviceClient } from '@devicefarmer/adbkit'

interface AndroidConfig {
  deviceId?: string // adb serial
}

// 退出码标记:附加到 shell 命令末尾以可靠判定成败(adb shell 不直接返回 exit code)。
const EXIT_MARKER = '__FMLEXIT__'

export class AndroidAdapter implements IFileSystemAdapter {
  readonly type = 'android'
  readonly deviceId: string
  readonly name: string
  private config: AndroidConfig
  private client: Client | null = null
  private device: DeviceClient | null = null
  private connected = false

  constructor(deviceId: string, name: string, config: AndroidConfig = {}) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return ANDROID_CAPABILITIES
  }

  async connect(): Promise<void> {
    try {
      const adbPath = ToolPathResolver.getAdbPath() // undefined → adbkit 用 $PATH 上的 adb
      this.client = adbkit.createClient(adbPath ? { bin: adbPath } : {})

      const devices = await this.client.listDevices()
      if (devices.length === 0) {
        throw new Error('未检测到 Android 设备。请连接设备并开启 USB 调试。')
      }

      const serial = this.config.deviceId ?? devices[0].id
      const target = devices.find(d => d.id === serial) ?? devices[0]

      // 运行时状态校验:offline / unauthorized 给明确引导。
      if (target.type !== 'device') {
        if (target.type === 'unauthorized') {
          throw new Error('设备未授权 USB 调试。请在手机上点击"允许 USB 调试"后重试。')
        }
        if (target.type === 'offline') {
          throw new Error('设备离线。请重新插拔数据线后重试。')
        }
        throw new Error(`设备当前不可用(状态:${target.type})。`)
      }

      this.device = this.client.getDevice(target.id)
      this.connected = true
      console.log(`[AndroidAdapter] connected: serial=${target.id}`)
    } catch (error) {
      this.connected = false
      this.device = null
      this.client = null
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.device = null
    this.client = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private dev(): DeviceClient {
    if (!this.connected || !this.device) {
      throw new Error('Android 设备未连接')
    }
    return this.device
  }

  // ============ 文件系统操作 ============

  async list(dirPath: string): Promise<FileInfo[]> {
    const dev = this.dev()
    const entries = await dev.readdir(dirPath)
    const files: FileInfo[] = entries
      .filter(e => e.name !== '.' && e.name !== '..')
      .map(e => this.entryToFileInfo(dirPath, e))
    return sortFiles(files)
  }

  async stat(targetPath: string): Promise<FileStats> {
    const dev = this.dev()
    const s = await dev.stat(targetPath)
    const mtime = s.mtimeMs || 0
    return {
      size: Number(s.size) || 0,
      isDirectory: s.isDirectory(),
      isFile: !s.isDirectory(),
      modifiedTime: new Date(mtime).toISOString(),
      createdTime: new Date(mtime).toISOString(),
      mode: Number(s.mode) || 0,
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.runShell(`mkdir -p ${shellQuote(dirPath)}`)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    const cmd = recursive ? `rm -rf ${shellQuote(dirPath)}` : `rmdir ${shellQuote(dirPath)}`
    await this.runShell(cmd)
  }

  async delete(targetPath: string): Promise<void> {
    await this.runShell(`rm -rf ${shellQuote(targetPath)}`)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.runShell(`mv ${shellQuote(oldPath)} ${shellQuote(newPath)}`)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    await this.runShell(`cp -r ${shellQuote(srcPath)} ${shellQuote(dstPath)}`)
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await this.stat(targetPath)
      return true
    } catch {
      return false
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    const dev = this.dev()
    const transfer = await dev.pull(filePath)
    const chunks: Buffer[] = []
    for await (const chunk of transfer as AsyncIterable<Buffer>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const dev = this.dev()
    // 确保父目录存在(adb push 不会自动建目录)。
    const parent = posixDirname(filePath)
    if (parent && parent !== filePath) {
      try {
        await this.runShell(`mkdir -p ${shellQuote(parent)}`)
      } catch {
        /* 父目录可能已存在,忽略 */
      }
    }
    await dev.push(Readable.from([data]), filePath)
  }

  async search(dirPath: string, query: SearchQuery): Promise<FileInfo[]> {
    const dev = this.dev()
    const pattern = (query.pattern || '').trim()
    if (!pattern) return []
    // find 输出每行一个路径;仅取文件名匹配(Android find 不支持复杂过滤,这里按名匹配)。
    const raw = await this.runShell(
      `find ${shellQuote(dirPath)} -type f -iname ${shellQuote('*' + pattern + '*')} 2>/dev/null`
    )
    const results: FileInfo[] = []
    for (const line of raw.split('\n')) {
      const p = line.trim()
      if (!p) continue
      const name = posixBaseName(p)
      let isDirectory = false
      let size = 0
      let mtime = 0
      try {
        const s = await dev.stat(p)
        isDirectory = s.isDirectory()
        size = Number(s.size) || 0
        mtime = s.mtimeMs || 0
      } catch {
        /* 取不到属性时仍返回条目(只缺元数据) */
      }
      results.push({
        name,
        path: p,
        isDirectory,
        isFile: !isDirectory,
        size,
        modifiedTime: new Date(mtime).toISOString(),
        extension: !isDirectory ? path.extname(name).toLowerCase() : undefined,
      })
    }
    return results
  }

  // ============ 流式访问(canStream=true) ============

  async openReadStream(filePath: string): Promise<Readable> {
    const dev = this.dev()
    // pull 返回 PullTransfer(Readable),直接作为管道源。
    return dev.pull(filePath) as unknown as Readable
  }

  async openWriteStream(filePath: string): Promise<Writable> {
    const dev = this.dev()
    const parent = posixDirname(filePath)
    if (parent && parent !== filePath) {
      try {
        await this.runShell(`mkdir -p ${shellQuote(parent)}`)
      } catch {
        /* 父目录可能已存在 */
      }
    }
    // adbkit push 从一个 Readable 读取,返回 PushTransfer —— 该 Promise 在 sync 建立时即
    // resolve(并非传输完成),传输完成时 PushTransfer 发 'end'。我们暴露一个 Writable:
    // write 喂 PassThrough(带背压),final() 先挂 'end'/'error' 监听再 end PassThrough,
    // 保证 pipeline 完成 ⟺ 设备写入真正完成(避免 move 在写入完成前误删源)。
    const pass = new PassThrough()
    const transfer = await dev.push(pass, filePath)
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        if (pass.write(chunk)) {
          callback()
        } else {
          pass.once('drain', () => callback())
        }
      },
      final(callback) {
        transfer.once('end', () => callback())
        transfer.once('error', (err: Error) => callback(err))
        pass.end()
      }
    })
    // push 过程出错 → 提前销毁 writable,让管道感知。
    transfer.on('error', (err: Error) => writable.destroy(err))
    return writable
  }

  // ============ 内部工具 ============

  private entryToFileInfo(dirPath: string, entry: { name: string; isDirectory(): boolean; size: number; mtimeMs?: number }): FileInfo {
    const isDirectory = entry.isDirectory()
    const name = entry.name
    const mtime = entry.mtimeMs || 0
    return {
      name,
      path: joinPosix(dirPath, name),
      isDirectory,
      isFile: !isDirectory,
      size: Number(entry.size) || 0,
      modifiedTime: new Date(mtime).toISOString(),
      extension: !isDirectory ? path.extname(name).toLowerCase() : undefined,
    }
  }

  /**
   * 执行 shell 命令并按 exit code 判定成败。
   * 末尾附加 EXIT_MARKER+code;adb shell 不直接返回 exit code,故用标记解析。
   */
  private async runShell(command: string): Promise<string> {
    const dev = this.dev()
    const wrapped = `${command}; printf '\\n${EXIT_MARKER}%d' "$?"`
    const stream = await dev.shell(wrapped)
    const buf = await adbkit.util.readAll(stream)
    const out = buf.toString('utf-8')

    const markerIdx = out.lastIndexOf(EXIT_MARKER)
    if (markerIdx === -1) {
      // 无标记(命令可能被信号杀死等):返回原始输出,调用方按需处理。
      return out
    }
    const codeStr = out.slice(markerIdx + EXIT_MARKER.length).trim()
    const stdout = out.slice(0, markerIdx)
    const code = parseInt(codeStr, 10)
    if (!Number.isNaN(code) && code !== 0) {
      throw new Error(`命令失败(code=${code}): ${command}\n${stdout.trim()}`)
    }
    return stdout
  }
}

// ============ POSIX 路径工具(Android 用 /) ============

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

function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

function sortFiles(files: FileInfo[]): FileInfo[] {
  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
