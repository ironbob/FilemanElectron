import { execFile } from 'child_process'
import path from 'path'

/**
 * SystemClipboardService
 *
 * 系统剪贴板的「文件引用」读写桥：应用内复制本地文件后可在 Finder ⌘V，
 * Finder 复制的文件也能在应用内 ⌘V。与 HostShellService 同样只封装
 * 『如何在本平台与宿主交互』，上层 IPC controller 不感知 osascript 细节。
 *
 * 为什么不用 Electron clipboard API（实证结论，Electron 29）：
 * - 写：clipboard.writeBuffer('public.file-url', ...) 每次调用先清后写，
 *   重复调用互相覆盖，只能落一个文件；也无法像原生那样逐 item 写多份。
 * - 读：clipboard.readBuffer('public.file-url') 只返回首个 item 的数据，
 *   多文件必须退回解析 Chromium 合成的 NSFilenamesPboardType XML plist。
 * 因此读写都走 osascript JXA 直操 NSPasteboard。
 *
 * 写入必须走 legacy 饿式 API 而非 writeObjects（实证踩坑，macOS 26/Darwin 25，
 * 2026-08-18）：writeObjects(NSURL/NSPasteboardItem) 的数据经写入进程惰性
 * vend，osascript 退出后未物化的 item 全部蒸发（跨进程只剩 0-1 项，是否
 * 存活取决于退出前有无读者触发物化——纯非确定性）；declareTypes +
 * setPropertyList 立即物化到粘贴板服务器，且系统自动把 NSFilenamesPboardType
 * 的路径数组规整为逐文件一个 public.file-url item（与 Finder 自身结构一致）。
 *
 * JXA 已知坑（勿"优化"）：
 * - 零参 ObjC 方法按属性访问触发（`pb.clearContents;` 不能写成带括号的调用）；
 * - NSURL 等原生对象放进 JS 数组字面量再桥接会降级成 NSDictionary，
 *   多对象数组必须用 NSMutableArray.addObject 逐个塞。
 *
 * 路径经 argv 传入（NSProcessInfo 取 '--' 之后的参数），绕开字符串转义。
 */

/**
 * JXA 写脚本：legacy 饿式写入（clearContents → declareTypes →
 * setPropertyList 路径数组），系统负责规整出逐文件 file-url item。
 * 返回 JSON：{ ok: boolean, itemCount: number }，异常捕获为 { ok: false, error }。
 */
const WRITE_SCRIPT = `
function runSafe() {
  try {
    ObjC.import('AppKit')
    const argv = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments)
    const mark = argv.indexOf('--')
    const paths = mark >= 0 ? argv.slice(mark + 1) : []
    const pb = $.NSPasteboard.generalPasteboard
    pb.clearContents
    const types = $.NSMutableArray.alloc.init
    types.addObject('NSFilenamesPboardType')
    pb.declareTypesOwner(types, null)
    const plist = $.NSMutableArray.alloc.init
    for (const p of paths) plist.addObject(p)
    const ok = pb.setPropertyListForType(plist, 'NSFilenamesPboardType')
    return JSON.stringify({ ok: !!ok, itemCount: '' + pb.pasteboardItems.count })
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }) }
}
runSafe()
`

/**
 * JXA 读脚本：遍历 pasteboardItems，取每个 item 的 public.file-url，
 * 经 NSURL 还原成解码后的本地路径。Finder / 原生应用写入的多文件结构
 * 恰好就是「每文件一个 item」，逐项收集即得多文件全量。
 * 返回 JSON：{ paths: string[] }，异常捕获为 { paths: [], error }。
 */
const READ_SCRIPT = `
function runSafe() {
  try {
    ObjC.import('AppKit')
    const pb = $.NSPasteboard.generalPasteboard
    const items = pb.pasteboardItems
    const paths = []
    for (let i = 0; i < items.count; i++) {
      const it = items.objectAtIndex(i)
      const s = it.stringForType('public.file-url')
      if (s && !s.isNil()) {
        const u = $.NSURL.URLWithString(s)
        if (u && !u.isNil() && u.path) paths.push('' + u.path.js)
      }
    }
    return JSON.stringify({ paths })
  } catch (e) { return JSON.stringify({ paths: [], error: String(e) }) }
}
runSafe()
`

/** JXA 清板脚本：clearContents 置空系统剪贴板（cut 粘贴消费后防悬空文件引用）。 */
const CLEAR_SCRIPT = `
function runSafe() {
  try {
    ObjC.import('AppKit')
    $.NSPasteboard.generalPasteboard.clearContents
    return JSON.stringify({ ok: true })
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }) }
}
runSafe()
`

/** 绝对路径 osascript：GUI 启动的打包应用拿不到用户 $PATH（见 CLAUDE.md 打包注意事项）。 */
const OSASCRIPT_BIN = '/usr/bin/osascript'

export class SystemClipboardService {
  /**
   * 把一组本地绝对路径写入系统剪贴板（file URL items，Finder 可 ⌘V）。
   * 非绝对路径直接过滤；全部被过滤或非 darwin 平台返回 false（调用方静默降级）。
   */
  writeLocalFiles(paths: string[]): Promise<boolean> {
    if (process.platform !== 'darwin') return Promise.resolve(false)
    const absolute = paths.filter(p => typeof p === 'string' && path.isAbsolute(p) && !p.includes('\0'))
    if (absolute.length === 0) return Promise.resolve(false)

    return new Promise(resolve => {
      execFile(
        OSASCRIPT_BIN,
        ['-l', 'JavaScript', '-e', WRITE_SCRIPT, '--', ...absolute],
        { timeout: 5_000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[SystemClipboardService] write osascript failed:', err.message, stderr?.trim())
            resolve(false)
            return
          }
          try {
            const parsed = JSON.parse(stdout.trim())
            if (parsed.error) {
              console.error('[SystemClipboardService] write script error:', parsed.error)
              resolve(false)
              return
            }
            resolve(parsed.ok === true)
          } catch (e) {
            console.error('[SystemClipboardService] write JSON parse failed:', (e as Error).message)
            resolve(false)
          }
        }
      )
    })
  }

  /**
   * 清空系统剪贴板（应用内 cut 粘贴消费后调用：源文件已移走，残留引用再粘会悬空；
   * Finder 自身 cut 粘贴后同样清板）。失败静默（返回 false），调用方不重试。
   */
  clearFileClipboard(): Promise<boolean> {
    if (process.platform !== 'darwin') return Promise.resolve(false)

    return new Promise(resolve => {
      execFile(
        OSASCRIPT_BIN,
        ['-l', 'JavaScript', '-e', CLEAR_SCRIPT],
        { timeout: 5_000 },
        (err, _stdout, stderr) => {
          if (err) {
            console.error('[SystemClipboardService] clear osascript failed:', err.message, stderr?.trim())
            resolve(false)
            return
          }
          resolve(true)
        }
      )
    })
  }

  /**
   * 读取系统剪贴板中当前的全部文件引用（本地绝对路径；Finder 复制的文件在此列）。
   * 无文件 / 非 darwin / 任何失败 → []（调用方按空处理，退回应用内剪贴板）。
   */
  readLocalFiles(): Promise<string[]> {
    if (process.platform !== 'darwin') return Promise.resolve([])

    return new Promise(resolve => {
      execFile(
        OSASCRIPT_BIN,
        ['-l', 'JavaScript', '-e', READ_SCRIPT],
        { timeout: 5_000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[SystemClipboardService] read osascript failed:', err.message, stderr?.trim())
            resolve([])
            return
          }
          try {
            const parsed = JSON.parse(stdout.trim())
            if (parsed.error) {
              console.error('[SystemClipboardService] read script error:', parsed.error)
              resolve([])
              return
            }
            resolve(Array.isArray(parsed.paths) ? parsed.paths.filter((p: unknown): p is string => typeof p === 'string') : [])
          } catch (e) {
            console.error('[SystemClipboardService] read JSON parse failed:', (e as Error).message)
            resolve([])
          }
        }
      )
    })
  }
}
