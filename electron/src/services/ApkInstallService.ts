import { createReadStream, promises as fsp } from 'fs'
import { randomBytes } from 'crypto'
import { createRequire } from 'module'
import type { Client, DeviceClient } from '@devicefarmer/adbkit'
import type { AndroidInstallTarget } from '@shared/types'
import { androidSerialOf } from '../adapters/androidTarget'
import { shellQuote } from '../adapters/shellQuote'
import { loadOptional } from '../adapters/optionalDeps'
import { copyOnDeviceCommand, installFailureKey, parsePmInstallOutput, pickInstallTargets, pmInstallCommand, remoteTempPath } from './support/apkInstall'
import { t } from '../i18n'

const log = console

// 与 AndroidAdapter 同一约定：adb shell 不返回退出码，用标记行判定成败
const EXIT_MARKER = '__FMLEXIT__'

// `@devicefarmer/adbkit` is CommonJS. With an externalized ESM Electron main
// bundle, a default import resolves to the CommonJS module namespace instead of
// the Adb class. Load its real default export through Node's CommonJS interop
// boundary instead (same as AndroidAdapter).
type AdbkitModule = typeof import('@devicefarmer/adbkit').default
let adbkitModule: AdbkitModule | null = null

async function getAdbkit(): Promise<AdbkitModule> {
  if (!adbkitModule) {
    adbkitModule = await loadOptional<AdbkitModule>('@devicefarmer/adbkit', () =>
      createRequire(import.meta.url)('@devicefarmer/adbkit').default as AdbkitModule)
  }
  return adbkitModule
}

type PushTransfer = Awaited<ReturnType<DeviceClient['push']>>

export class ApkInstallCancelledError extends Error {
  constructor() {
    super('app-install cancelled')
    this.name = 'ApkInstallCancelledError'
  }
}

/** 设备端 pm install 明确失败（code 为 INSTALL_* 码）；message 已是可读文案。 */
export class ApkInstallFailureError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApkInstallFailureError'
    this.code = code
  }
}

/** 组合根注入：adb 二进制路径与设备注册表名称查询（保持可在 Node 下独立测试）。 */
export interface ApkInstallDeps {
  adbPath: () => string | undefined
  deviceNameOf: (deviceId: string) => string | undefined
}

export interface ApkInstallInput {
  sourceDeviceId: string
  sourcePath: string
  targetDeviceId: string
}

export interface ApkInstallHooks {
  /** 推送阶段进度（手机上的 APK 无推送阶段，不回调）。 */
  onProgress?: (bytes: number, total: number) => void
  /** 中止：推送中立即取消并清理远端临时文件；设备端 pm install 不可中断，返回后结束。 */
  signal?: AbortSignal
}

export interface ApkInstallResult {
  /** 实际推送到设备的字节数（手机上的 APK 为 0）。 */
  bytes: number
}

/**
 * ApkInstallService —— APK 安装执行器（app-install 任务的引擎，组合根注入
 * FileOperationManager）。
 *
 *  - 目标设备由 deviceId 剥 `android:` 前缀得到 serial 并显式定位，不在线即失败，
 *    绝不回退到别的设备（PRD R1）。
 *  - 本机 APK：push 到唯一临时路径（带进度 / 可取消）→ 设备端 `pm install -r -t`
 *    → 无论成败删除临时文件（R4）；手机上的 APK：在同一台设备上直接 pm install。
 *  - 源 APK 只读（R7）。
 */
export class ApkInstallService {
  private client: Client | null = null
  private readonly deps: ApkInstallDeps

  constructor(deps: ApkInstallDeps) {
    this.deps = deps
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      const adbPath = this.deps.adbPath()
      this.client = (await getAdbkit()).createClient(adbPath ? { bin: adbPath } : {})
    }
    return this.client
  }

  /** adb 设备列表中指定 serial 的状态；不在列表返回 undefined。 */
  private async stateOf(serial: string): Promise<string | undefined> {
    const devices = await (await this.getClient()).listDevices()
    return devices.find(d => d.id === serial)?.type
  }

  async listTargets(): Promise<AndroidInstallTarget[]> {
    const devices = await (await this.getClient()).listDevices()
    const targets: AndroidInstallTarget[] = []
    for (const serial of pickInstallTargets(devices)) {
      const authorized = devices.find(d => d.id === serial)?.type === 'device'
      const name = this.deps.deviceNameOf(`android:${serial}`)
        || await this.modelOf(serial)
        || serial
      targets.push({ deviceId: `android:${serial}`, serial, name, authorized })
    }
    return targets
  }

  private async modelOf(serial: string): Promise<string | undefined> {
    try {
      const model = (await (await this.getClient()).getDevice(serial).getProperties())['ro.product.model']
      return model?.trim() || undefined
    } catch {
      return undefined
    }
  }

  async install(input: ApkInstallInput, hooks: ApkInstallHooks = {}): Promise<ApkInstallResult> {
    if (hooks.signal?.aborted) throw new ApkInstallCancelledError()
    const serial = androidSerialOf(input.targetDeviceId)
    if (input.sourceDeviceId !== 'local' && androidSerialOf(input.sourceDeviceId) !== serial) {
      throw new Error(t('errors.main.apkInstallCrossDevice'))
    }
    await this.assertTargetReady(serial)
    const device = (await this.getClient()).getDevice(serial)

    const remote = remoteTempPath(randomBytes(6).toString('hex'))
    if (input.sourceDeviceId !== 'local') {
      // 手机上的 APK（FUSE 存储）system_server 无权直接读取：设备内拷到 /data/local/tmp 再安装
      await this.installViaTemp(device, serial, remote, () => this.copyOnDevice(device, input.sourcePath, remote))
      return { bytes: 0 }
    }

    const size = await fsp.stat(input.sourcePath).then(stat => stat.size, (error: unknown) => {
      log.warn('[ApkInstall] cannot read source', { sourcePath: input.sourcePath, error })
      throw new Error(t('errors.main.apkInstallReadFailed', { path: input.sourcePath }))
    })
    log.info('[ApkInstall] start', { sourcePath: input.sourcePath, target: serial, bytes: size })
    await this.installViaTemp(device, serial, remote, () =>
      this.pushWithProgress(device, input.sourcePath, remote, size, hooks))
    return { bytes: size }
  }

  /** APK 落到远端临时路径（stage）后执行 pm install；无论成败都清理临时文件（R4）。 */
  private async installViaTemp(
    device: DeviceClient,
    serial: string,
    remote: string,
    stage: () => Promise<void>
  ): Promise<void> {
    try {
      try {
        await stage()
      } catch (error) {
        throw await this.unavailableOrRethrow(serial, error)
      }
      try {
        await this.runPmInstall(device, serial, remote)
      } catch (error) {
        throw await this.unavailableOrRethrow(serial, error)
      }
    } finally {
      await this.removeRemote(device, remote)
    }
  }

  /** 设备内 cp；源不可读（文件已被删 / 无权限 / 空间不足）按「读取失败」报错。 */
  private async copyOnDevice(device: DeviceClient, sourcePath: string, remote: string): Promise<void> {
    const adbkit = await getAdbkit()
    const wrapped = `${copyOnDeviceCommand(sourcePath, remote)}; printf '\\n${EXIT_MARKER}%d' "$?"`
    const out = (await adbkit.util.readAll(await device.shell(wrapped))).toString('utf-8')
    const exit = new RegExp(`${EXIT_MARKER}(\\d+)\\s*$`).exec(out)
    if (!exit || exit[1] !== '0') {
      log.warn('[ApkInstall] on-device copy failed', { sourcePath, out: out.slice(0, 300) })
      throw new Error(t('errors.main.apkInstallReadFailed', { path: sourcePath }))
    }
  }

  /** R1：只认指定 serial；离线 / 未授权 / 不在列表都明确报错，不回退到别的设备。 */
  private async assertTargetReady(serial: string): Promise<void> {
    const state = await this.stateOf(serial)
    if (state === 'device') return
    if (state === 'unauthorized') throw new Error(t('errors.main.androidUnauthorized'))
    throw new Error(t('errors.main.apkInstallDeviceUnavailable'))
  }

  /** adb 异常后复查目标：已断开 / 未授权转成可读文案，设备仍在线则原样抛出。 */
  private async unavailableOrRethrow(serial: string, error: unknown): Promise<Error> {
    if (error instanceof ApkInstallCancelledError) return error
    let state: string | undefined
    try {
      state = await this.stateOf(serial)
    } catch {
      state = undefined
    }
    if (state === 'unauthorized') return new Error(t('errors.main.androidUnauthorized'))
    if (state !== 'device') return new Error(t('errors.main.apkInstallDeviceUnavailable'))
    return error instanceof Error ? error : new Error(String(error))
  }

  private pushWithProgress(
    device: DeviceClient,
    localPath: string,
    remote: string,
    total: number,
    hooks: ApkInstallHooks
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 自持文件流：取消时 adbkit 只取消 sync 写入，不关闭它打开的 fd，故不传路径而传流
      const stream = createReadStream(localPath)
      let transfer: PushTransfer | null = null
      let settled = false
      const settle = (error: Error | null) => {
        if (settled) return
        settled = true
        hooks.signal?.removeEventListener('abort', onAbort)
        if (error) {
          stream.destroy()
          transfer?.cancel()
          reject(error)
        } else {
          resolve()
        }
      }
      const onAbort = () => settle(new ApkInstallCancelledError())
      hooks.signal?.addEventListener('abort', onAbort, { once: true })
      if (hooks.signal?.aborted) {
        onAbort()
        return
      }

      device.push(stream, remote).then(
        started => {
          transfer = started
          if (settled) {
            started.cancel()
            return
          }
          started.on('progress', (stats: { bytesTransferred: number }) => hooks.onProgress?.(stats.bytesTransferred, total))
          started.on('error', (error: Error) => settle(error))
          started.on('end', () => {
            // adbkit 的进度事件成批到达，末批可能停在半途：推送结束即满格，
            // 设备端安装阶段（无字节进度）不再卡在半截
            hooks.onProgress?.(total, total)
            settle(null)
          })
        },
        (error: Error) => settle(error)
      )
    })
  }

  /** 设备端 `pm install -r -t`：输出解析失败码 → 可读文案；中途断开按设备不可用报错。 */
  private async runPmInstall(device: DeviceClient, serial: string, pathOnDevice: string): Promise<void> {
    const adbkit = await getAdbkit()
    const startedAt = Date.now()
    const out = (await adbkit.util.readAll(await device.shell(pmInstallCommand(pathOnDevice)))).toString('utf-8')
    const result = parsePmInstallOutput(out)
    log.info('[ApkInstall] pm install', { path: pathOnDevice, ok: result.ok, code: result.ok ? undefined : result.code, ms: Date.now() - startedAt })
    if (result.ok) return
    // 输出不是正规 Failure 时可能是设备中途断开：先按设备状态报错
    await this.assertTargetReady(serial)
    const failure = installFailureKey(result.code)
    // 有专属文案的失败码不需要设备原话；未知码把 detail 一并带上便于排查
    const params = failure.key === 'errors.main.apkInstallFailed'
      ? { code: result.detail ? `${result.code}: ${result.detail}`.slice(0, 200) : result.code }
      : failure.params
    throw new ApkInstallFailureError(result.code, t(failure.key, params))
  }

  private async removeRemote(device: DeviceClient, remote: string): Promise<void> {
    try {
      const adbkit = await getAdbkit()
      await adbkit.util.readAll(await device.shell(`rm -f ${shellQuote(remote)}`))
    } catch (error) {
      log.warn('[ApkInstall] failed to remove temp file', { remote, error })
    }
  }
}
