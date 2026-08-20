import { execFile } from 'child_process'
import { promisify } from 'util'
import type { XattrEntry } from '@shared/types'
import { t } from '../i18n'

const execFileAsync = promisify(execFile)

/** 绝对路径 xattr：GUI 启动的打包应用拿不到用户 $PATH（与 HostShellService 的 osascript 同理）。 */
const XATTR_BIN = '/usr/bin/xattr'

/** 递归删大目录的 quarantine 可能较慢；10s 上限兼顾两者。 */
const EXEC_OPTS = { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 } as const

/** quarantine 等属性值的展示截断长度。 */
const PREVIEW_MAX = 96

/** 可打印率阈值：低于则按二进制处理（只显示字节数，不给 textPreview）。 */
const PRINTABLE_RATIO = 0.9

/**
 * XattrService —— macOS 扩展属性（xattr）查看/编辑/删除。
 *
 * 设计依据：
 *  - node:fs 无 xattr API、fs-xattr 需原生编译（Electron rebuild 成本高），
 *    而 /usr/bin/xattr 是系统自带 CLI —— 参数数组传参免 shell 注入，
 *    仓库先例：ToolPathResolver.stripQuarantine。
 *  - 列表两步走：裸 `xattr <path>` 拿纯名字列表（每行一个，格式稳定），
 *    逐名 `xattr -px` 拿十六进制 —— 字节数即 sizeBytes，按可打印率决定
 *    textPreview。避开 `xattr -l` 的 "name: value" 脆弱解析（二进制值
 *    会以十六进制行混入 value，名字/值边界不可靠）。
 */
export class XattrService {
  /** 列出路径的全部扩展属性（输出顺序即展示顺序）。 */
  async list(filePath: string): Promise<XattrEntry[]> {
    const names = (await this.exec([filePath])).split('\n').map(line => line.trim()).filter(Boolean)
    const entries: XattrEntry[] = []
    for (const name of names) {
      const hex = await this.exec(['-px', name, filePath])
      const bytes = parseHexDump(hex)
      entries.push({
        name,
        sizeBytes: bytes.length,
        ...previewOf(bytes),
        isQuarantine: name === 'com.apple.quarantine'
      })
    }
    return entries
  }

  /** 删除单个属性；属性本就不存在视为成功（幂等，quarantine 常见）。 */
  async remove(filePath: string, name: string, recursive = false): Promise<void> {
    await this.exec(['-d', ...(recursive ? ['-r'] : []), name, filePath], { tolerateMissing: true })
  }

  /** 写入字符串值属性（二进制值不支持——UI 仅暴露字符串编辑）。 */
  async set(filePath: string, name: string, value: string): Promise<void> {
    await this.exec(['-w', name, value, filePath])
  }

  /** 移除隔离标记（quarantine）；目录默认递归到其内容。 */
  async removeQuarantine(filePath: string, recursive = false): Promise<void> {
    await this.remove(filePath, 'com.apple.quarantine', recursive)
  }

  private async exec(args: string[], opts: { tolerateMissing?: boolean } = {}): Promise<string> {
    try {
      const { stdout } = await execFileAsync(XATTR_BIN, args, EXEC_OPTS)
      return stdout
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      const stderr = (err.stderr ?? '').trim()
      if (opts.tolerateMissing && /No such xattr/i.test(stderr)) return ''
      throw new Error(t('errors.main.xattrFailed', { detail: stderr || err.message || 'xattr failed' }))
    }
  }
}

/** `xattr -px` 的十六进制转储（"30 30 38 31 …"）→ 字节数组。 */
function parseHexDump(hex: string): number[] {
  const bytes: number[] = []
  for (const token of hex.trim().split(/\s+/)) {
    if (!token) continue
    const value = parseInt(token, 16)
    if (Number.isNaN(value)) continue
    bytes.push(value)
  }
  return bytes
}

/** 字节 → 可打印预览（utf-8 试解码 + 可打印率过滤）。 */
function previewOf(bytes: number[]): { textPreview?: string } {
  if (bytes.length === 0) return { textPreview: '' }
  const decoded = Buffer.from(bytes).toString('utf8')
  let printable = 0
  for (const ch of decoded) {
    const code = ch.codePointAt(0) ?? 0
    // 允许常规可见字符与空白；其余（控制字符/替换符）计为不可打印
    if (code >= 0x20 || ch === '\t' || ch === '\n' || ch === '\r') printable++
  }
  if (printable / decoded.length < PRINTABLE_RATIO) return {}
  return { textPreview: decoded.slice(0, PREVIEW_MAX) }
}
