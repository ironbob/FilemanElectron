import * as path from 'path'
import { app } from 'electron'
import type { FileInfo, FileStats, IFileSystemAdapter, SearchQuery } from './types'
import { IOS_CAPABILITIES, type DeviceCapabilities } from './capabilities'
import { t } from '../i18n'
import type { AfcEntry, AfcStat } from '../../../native/iosafc'

// L02(ios) · iOSAdapter (driven adapter, hexagonal)
//
// 通过本地 N-API addon(native/iosafc)调用 libimobiledevice 的 AFC + lockdown C API,
// 浏览/读写 iOS AFC 沙盒。替代旧实现里那个并不存在的 `idevicefs` CLI。
//
// 设计:
//  - 不走 CLI、不依赖 macFUSE:addon 直接 link libimobiledevice,可随 app 打包(.node + dylib)。
//  - 缓冲读写(IOS_CAPABILITIES.canStream=false);AFC 无通用搜索 → search 抛"不支持"。
//  - 配对校验在 connect 完成(未配对/未信任 → 明确错误);发起配对经 pair() 暴露,供后续 IPC/渲染层调用。
//
// ⚠ 未真机验证(需构建 addon + 真机回归,见 native/iosafc/README.md)。

type IosAfcAddon = typeof import('../../../native/iosafc')

let addonCache: IosAfcAddon | null = null

/**
 * 动态加载原生 addon。用计算路径 require,避免被 rollup 静态打包。
 * 候选:打包态 app 资源目录、开发态源码树若干相对深度。
 */
function loadAddon(): IosAfcAddon {
  if (addonCache) return addonCache
  const candidates: string[] = []
  // 开发态:源码树 native/iosafc(index.js → build/Release/iosafc.node)。
  try { candidates.push(path.join(app.getAppPath(), 'native', 'iosafc')) } catch { /* 主进程外无 app */ }
  for (const up of ['..', '..', '..', '..', '../../../']) {
    candidates.push(path.join(__dirname, up, 'native', 'iosafc'))
  }
  // 打包态:Resources/ios-native/iosafc.node(经 bundle-ios-dylibs.sh 落地 + extraResources 打包)。
  try { candidates.push(path.join(process.resourcesPath, 'ios-native', 'iosafc.node')) } catch { /* dev 无 resourcesPath 目标 */ }
  try { candidates.push(path.join(app.getAppPath(), 'native', 'iosafc', 'build', 'Release', 'iosafc.node')) } catch { /* */ }
  for (const c of candidates) {
    try {
      // 动态字符串 require —— 不让 bundler 解析。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      addonCache = require(c) as IosAfcAddon
      return addonCache
    } catch {
      /* 继续尝试下一个候选 */
    }
  }
  throw new Error(t('errors.main.iosAddonMissing'))
}

export class iOSAdapter implements IFileSystemAdapter {
  readonly type = 'ios'
  readonly deviceId: string
  readonly name: string
  private config: { deviceId?: string }
  private handle: number | null = null
  private connected = false

  constructor(deviceId: string, name: string, config: { deviceId?: string } = {}) {
    this.deviceId = deviceId
    this.name = name
    this.config = config
  }

  getCapabilities(): DeviceCapabilities {
    return IOS_CAPABILITIES
  }

  /** 设备 id 形如 "ios:<udid>";libimobiledevice 需要裸 udid。 */
  private udid(): string {
    const raw = this.config.deviceId ?? this.deviceId
    return raw.startsWith('ios:') ? raw.slice(4) : raw
  }

  async connect(): Promise<void> {
    try {
      const afc = loadAddon()
      // 仅校验配对;未配对/未信任 → 抛明确错误(渲染层显示"待配对",发起配对走 pair())。
      const handle = afc.connect(this.udid(), false)
      this.handle = handle
      this.connected = true
      console.log(`[iOSAdapter] connected: udid=${this.udid()}`)
    } catch (error) {
      this.connected = false
      this.handle = null
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.handle !== null) {
      try { loadAddon().disconnect(this.handle) } catch { /* 忽略 */ }
    }
    this.handle = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  /** 发起配对(触发设备端"信任此电脑");供后续 IPC 调用,完成后重试 connect。 */
  async pair(): Promise<boolean> {
    return loadAddon().pair(this.udid())
  }

  private h(): number {
    if (!this.connected || this.handle === null) throw new Error(t('errors.main.iosNotConnected'))
    // 配对可能在长连接期间被用户撤回。每个 AFC 操作前重新校验，避免让旧 handle
    // 静默失败或继续被误认为可用。
    if (!loadAddon().isPaired(this.udid())) {
      try { loadAddon().disconnect(this.handle) } catch { /* 会话可能已被设备关闭 */ }
      this.handle = null
      this.connected = false
      throw new Error(t('errors.main.iosPairingExpired'))
    }
    return this.handle
  }

  // ============ 文件系统操作 ============

  async list(dirPath: string): Promise<FileInfo[]> {
    const entries = loadAddon().list(this.h(), dirPath)
    const files: FileInfo[] = entries.map(e => this.toFileInfo(dirPath, e))
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async stat(targetPath: string): Promise<FileStats> {
    const s = loadAddon().stat(this.h(), targetPath)
    return {
      size: s.size,
      isDirectory: s.isDirectory,
      isFile: !s.isDirectory,
      modifiedTime: new Date(s.mtime).toISOString(),
      createdTime: new Date(s.mtime).toISOString(),
      mode: 0,
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    loadAddon().mkdir(this.h(), dirPath)
  }

  async rmdir(dirPath: string, recursive?: boolean): Promise<void> {
    if (recursive) {
      // AFC remove_path 行为依实现而异;递归删除先清空子项再删本目录,稳妥。
      let entries: AfcEntry[] = []
      try { entries = loadAddon().list(this.h(), dirPath) } catch { /* 空目录或不存在 */ }
      for (const e of entries) {
        const child = joinPosix(dirPath, e.name)
        if (e.isDirectory) await this.rmdir(child, true)
        else loadAddon().remove(this.h(), child)
      }
    }
    loadAddon().remove(this.h(), dirPath)
  }

  async delete(targetPath: string): Promise<void> {
    loadAddon().remove(this.h(), targetPath)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    loadAddon().rename(this.h(), oldPath, newPath)
  }

  async copy(srcPath: string, dstPath: string): Promise<void> {
    // AFC 无原生 copy;读源写目标(缓冲)。
    const content = await this.readFile(srcPath)
    await this.writeFile(dstPath, content)
  }

  async readFile(filePath: string): Promise<Buffer> {
    return loadAddon().readFile(this.h(), filePath)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const maxFileSize = this.getCapabilities().maxFileSize
    if (maxFileSize !== undefined && data.length > maxFileSize) {
      throw new Error(t('errors.main.iosAfcFileTooLarge', { size: maxFileSize, path: filePath }))
    }
    try {
      loadAddon().writeFile(this.h(), filePath, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(t('errors.main.iosAfcWriteFailed', { path: filePath, message }))
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    try { await this.stat(targetPath); return true } catch { return false }
  }

  async search(_dirPath: string, _query: SearchQuery): Promise<FileInfo[]> {
    // AFC 无通用搜索能力(IOS_CAPABILITIES.canSearch=false)。
    throw new Error(t('errors.main.iosSearchUnsupported'))
  }

  // ============ 内部工具 ============

  private toFileInfo(dirPath: string, e: AfcEntry): FileInfo {
    return {
      name: e.name,
      path: joinPosix(dirPath, e.name),
      isDirectory: e.isDirectory,
      isFile: !e.isDirectory,
      size: e.size,
      modifiedTime: new Date(e.mtime).toISOString(),
      extension: !e.isDirectory ? path.extname(e.name).toLowerCase() : undefined,
    }
  }
}

function joinPosix(dir: string, name: string): string {
  if (dir.endsWith('/')) return dir + name
  return dir === '' ? `/${name}` : `${dir}/${name}`
}

function udidFromId(id: string): string {
  return id.startsWith('ios:') ? id.slice(4) : id
}

/**
 * 完整配对流程(供 IPC `device:pair` 调用,设备未连接也可用):
 *  1. addon.pair(udid) —— 发起配对,设备端弹"信任此电脑"(立即返回,不等用户操作)。
 *  2. 轮询 addon.isPaired(udid)(每 1.5s)—— 用户在设备上点信任+输密码后变 true,或超时。
 *
 * 这是"完整配对生命周期"的发起侧;扫描器(MobileDeviceScanner)的周期轮询会在
 * 配对成功后把设备 pairingStatus 更新为 paired,渲染层据此自动转可浏览。
 */
export async function pairIosDevice(
  deviceId: string,
  timeoutMs = 60000
): Promise<{ success: boolean; error?: string }> {
  const udid = udidFromId(deviceId)

  let addon: IosAfcAddon
  try {
    addon = loadAddon()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const initiated = addon.pair(udid) // 触发设备端信任弹窗(立即返回)
    if (!initiated) {
      return { success: false, error: t('errors.main.iosPairInitiateFailed') }
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    try {
      if (addon.isPaired(udid)) return { success: true }
    } catch {
      /* validate 偶发失败,继续轮询 */
    }
  }
  return { success: false, error: t('errors.main.iosPairTimeout') }
}
