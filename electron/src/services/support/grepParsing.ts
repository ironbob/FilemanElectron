import type { GrepMatch } from '@shared/types'

/** 命中行文本截断上限（IPC 载荷与 UI 双向友好）。 */
export const LINE_TEXT_MAX_CHARS = 400

/**
 * grep/rg 输出解析与命令构造（纯函数，可单测）。
 *
 * 输出格式约定（--no-heading --color never -n）：
 *  - rg（--column）：`path:line:col:text`
 *  - grep -rn：`path:line:text`
 * 冒号在 path 中出现的歧义：从左解析 path 到第一个「:数字:」边界。
 */

/** 解析单行输出为 GrepMatch；不匹配的行返回 null。 */
export function parseGrepLine(line: string, rootPath: string): GrepMatch | null {
  if (!line) return null
  // 定位第一个「:数字[:数字]:」边界（rg 带 column，grep 只带 line）
  const match = line.match(/^(.*?):(\d+)(?::(\d+))?:/)
  if (!match) return null
  const [, path, lineStr, colStr] = match
  if (!path) return null
  const lineTextRaw = line.slice(match[0].length)
  return {
    path: normalizeResultPath(path, rootPath),
    line: parseInt(lineStr, 10),
    column: colStr ? parseInt(colStr, 10) : undefined,
    lineText: truncateLine(lineTextRaw)
  }
}

/** rg/grep 输出的是相对/绝对路径取决于入参形态；统一归一为绝对。 */
function normalizeResultPath(path: string, rootPath: string): string {
  if (path.startsWith('/')) return path
  const rel = path.startsWith('./') ? path.slice(2) : path
  const base = rootPath.endsWith('/') ? rootPath : rootPath + '/'
  return base + rel
}

export function truncateLine(text: string): string {
  return text.length > LINE_TEXT_MAX_CHARS ? text.slice(0, LINE_TEXT_MAX_CHARS) + '…' : text
}

/**
 * glob（如 "*.ts"、"src/**"）→ rg 的 -g 参数形态。
 * rg 原生支持 glob；这里只做去空白与拆分（空格分隔多个）。
 */
export function globsToRgArgs(includeGlob?: string, excludeGlob?: string): string[] {
  const args: string[] = []
  for (const glob of splitGlobs(includeGlob)) args.push('-g', glob)
  for (const glob of splitGlobs(excludeGlob)) args.push('-g', `!${glob}`)
  return args
}

function splitGlobs(globs?: string): string[] {
  if (!globs) return []
  return globs.split(/[\s,]+/).filter(Boolean)
}

/**
 * glob → GNU/BSD grep 的 --include/--exclude 参数（远程 exec 引擎）。
 * BSD grep（macOS）不支持 --exclude，远端为 Linux 的场景占绝大多数；
 * 不支持时由调用方降级（忽略 exclude）。
 */
export function globsToGrepArgs(includeGlob?: string, excludeGlob?: string): { include: string[]; exclude: string[] } {
  const include: string[] = []
  for (const glob of splitGlobs(includeGlob)) include.push(`--include=${glob}`)
  const exclude: string[] = []
  for (const glob of splitGlobs(excludeGlob)) exclude.push(`--exclude=${glob}`)
  return { include, exclude }
}

/** 大小写/正则开关 → rg flags。 */
export function rgFlags(isRegex?: boolean, caseSensitive?: boolean): string[] {
  const flags: string[] = ['-n', '--no-heading', '--color', 'never', '--column']
  if (!isRegex) flags.push('-F')
  if (!caseSensitive) flags.push('-i')
  return flags
}

/** 大小写/正则开关 → grep flags（POSIX grep 无 -F 与 -i 的正则互斥问题：固定串用 -F）。 */
export function grepFlags(isRegex?: boolean, caseSensitive?: boolean): string[] {
  const flags: string[] = ['-n', '--color=never']
  if (!isRegex) flags.push('-F')
  if (!caseSensitive) flags.push('-i')
  return flags
}

/** 二进制嗅探：首块含 NUL 即视为二进制，跳过（流式回退引擎用）。 */
export function looksBinary(chunk: Buffer): boolean {
  return chunk.includes(0)
}

/** 流式扫描的单行匹配（固定串/正则，大小写开关）。预编译正则提升热路径性能。 */
export function createLineMatcher(pattern: string, isRegex?: boolean, caseSensitive?: boolean): (line: string) => number {
  if (isRegex) {
    const regex = new RegExp(pattern, caseSensitive ? '' : 'i')
    return line => {
      const m = regex.exec(line)
      return m ? m.index : -1
    }
  }
  const needle = caseSensitive ? pattern : pattern.toLowerCase()
  return line => {
    const hay = caseSensitive ? line : line.toLowerCase()
    return hay.indexOf(needle)
  }
}

/** 极简 glob：`*.ts` / `src/**` / 精确名（流式引擎的过滤够用；rg/grep 引擎走各自原生 glob）。 */
export function matchGlob(name: string, glob: string): boolean {
  const regex = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, ' ') // ** → 任意层级
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/ /g, '.*')
  return new RegExp(`^${regex}$`).test(name)
}
