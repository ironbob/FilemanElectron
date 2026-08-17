import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ToolPathResolver } from './ToolPathResolver'
import { DeviceManager } from './DeviceManager'
import { hdcTargetArgs, runHdc, runHdcShell } from './support/hdcRunner'
import { t } from '../i18n'

const log = console

export type ScreenshotMime = 'image/png' | 'image/jpeg'

export interface CapturedScreenshot {
  data: Buffer
  mime: ScreenshotMime
}

function posixJoin(directory: string, name: string): string {
  return `${directory.replace(/\/+$/, '') || '/'}/${name}`.replace(/\/\/+/g, '/')
}

function screenshotName(mime: ScreenshotMime): string {
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  return `Screenshot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}`
}

/** 本地临时文件序号(同毫秒并发时避免撞名)。 */
let tempSeq = 0
function localTempPath(suffix: string): string {
  const seq = ++tempSeq
  return path.join(os.tmpdir(), `fileman-shot-${process.pid}-${Date.now()}-${seq}.${suffix}`)
}

/** PNG 魔数校验(0x89 'PNG')。 */
function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG'
}

/** JPEG 魔数校验(FF D8 FF)。 */
function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

/** 校验图片魔数；不合法返回 null，由调用方抛各自平台的本地化错误。 */
function validateImage(buf: Buffer): ScreenshotMime | null {
  if (isPng(buf)) return 'image/png'
  if (isJpeg(buf)) return 'image/jpeg'
  return null
}

/**
 * 移动设备截屏(Android/OHOS/iOS),像素经设备工具链取回,再按目标适配器写出。
 *
 *  - Android: `adb exec-out screencap -p`(PNG)
 *  - OHOS:    `hdc shell snapshot_display -f <远端临时>` + `hdc file recv`(JPEG)
 *  - iOS:     `idevicescreenshot -u <udid>`(libimobiledevice CLI,PNG)
 */
export class MobileScreenshotService {
  constructor(private readonly deviceManager: DeviceManager) {}

  /** 截屏到内存(不落盘)——侧边栏工具栏的「先展示、后保存」流程。 */
  async capture(deviceId: string): Promise<CapturedScreenshot> {
    const device = this.deviceManager.getDevice(deviceId)
    if (!device) {
      throw new Error(t('errors.main.screenshotDeviceMissing'))
    }
    if (device.type === 'android') {
      const serial = deviceId.replace(/^android:/, '')
      log.info('[MobileScreenshotService] android capture started', { deviceId })
      const png = await this.captureAndroid(serial)
      return { data: png, mime: 'image/png' }
    }
    if (device.type === 'ohos') {
      const connectKey = deviceId.replace(/^ohos:/, '')
      log.info('[MobileScreenshotService] ohos capture started', { deviceId })
      const shot = await this.captureOhos(connectKey)
      return shot
    }
    if (device.type === 'ios') {
      const udid = deviceId.replace(/^ios:/, '')
      log.info('[MobileScreenshotService] ios capture started', { deviceId })
      const png = await this.captureIos(udid)
      return { data: png, mime: 'image/png' }
    }
    throw new Error(t('errors.main.screenshotUnsupportedDevice'))
  }

  /** 截屏并直接写入目标目录(FilePane 工具栏旧行为,写回设备自身)。 */
  async captureToDirectory(deviceId: string, targetDirectory: string): Promise<{ path: string }> {
    const { data, mime } = await this.capture(deviceId)
    const targetPath = posixJoin(targetDirectory, screenshotName(mime))
    await this.deviceManager.writeFile(deviceId, targetPath, data)
    log.info('[MobileScreenshotService] capture saved', { deviceId, targetPath, bytes: data.length })
    return { path: targetPath }
  }

  // ============ 各设备取像素 ============

  /** Android: adb exec-out screencap -p,stdout 即 PNG 流。 */
  private captureAndroid(serial: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(ToolPathResolver.getAdbExecutable(), ['-s', serial, 'exec-out', 'screencap', '-p'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const chunks: Buffer[] = []
      const errors: Buffer[] = []
      child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
      child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
      child.once('error', error => reject(new Error(t('errors.main.screenshotAdbSpawnFailed', { message: error.message }))))
      child.once('close', code => {
        if (code !== 0) {
          reject(new Error(t('errors.main.screenshotAndroidFailed', { code: String(code), message: Buffer.concat(errors).toString('utf8').trim() })))
          return
        }
        try {
          const png = Buffer.concat(chunks)
          if (!validateImage(png)) throw new Error(t('errors.main.screenshotInvalidAndroid'))
          resolve(png)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  /** OHOS: snapshot_display 落远端临时文件,file recv 拉回(默认 JPEG)。 */
  private async captureOhos(connectKey: string): Promise<CapturedScreenshot> {
    const remotePath = `/data/local/tmp/fm-shot-${process.pid}-${Date.now()}.jpeg`
    const localPath = localTempPath('jpeg')
    try {
      await runHdcShell(connectKey, `snapshot_display -f ${remotePath}`)
      await runHdc([...hdcTargetArgs(connectKey), 'file', 'recv', remotePath, localPath], { timeoutMs: 120_000 })
      const data = await fs.promises.readFile(localPath)
      const mime = validateImage(data)
      if (!mime) throw new Error(t('errors.main.screenshotInvalidOhos'))
      return { data, mime }
    } finally {
      // 本地临时清理;远端临时尽力删(失败只记日志,不打断结果返回)。
      void fs.promises.rm(localPath, { force: true }).catch(() => { /* 清理失败无害 */ })
      runHdcShell(connectKey, `rm -f ${remotePath}`).catch(error => {
        log.warn('[MobileScreenshotService] ohos remote temp cleanup failed:', error)
      })
    }
  }

  /** iOS: idevicescreenshot 写本地临时文件(PNG)。 */
  private captureIos(udid: string): Promise<Buffer> {
    const localPath = localTempPath('png')
    return new Promise<Buffer>((resolve, reject) => {
      // 经 ToolPathResolver:打包内 Resources/ios-native/idevicescreenshot 优先,
      // 未捆绑回退 $PATH / brew 常见前缀,最后才是裸命令名(ENOENT 语义保留)。
      const child = spawn(ToolPathResolver.getExecutable('idevicescreenshot'), ['-u', udid, localPath], {
        stdio: ['ignore', 'ignore', 'pipe']
      })
      const errors: Buffer[] = []
      child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
      child.once('error', error => {
        const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? t('errors.main.screenshotIdeviceCliMissing')
          : t('errors.main.screenshotIdeviceSpawnFailed', { message: error.message })
        reject(new Error(message))
      })
      child.once('close', code => {
        if (code !== 0) {
          reject(new Error(t('errors.main.screenshotIosFailed', { code: String(code), message: Buffer.concat(errors).toString('utf8').trim() })))
          return
        }
        fs.promises.readFile(localPath)
          .then(data => {
            if (!validateImage(data)) throw new Error(t('errors.main.screenshotInvalidIos'))
            resolve(data)
          })
          .catch(error => reject(error instanceof Error ? error : new Error(String(error))))
          .finally(() => {
            void fs.promises.rm(localPath, { force: true }).catch(() => { /* 清理失败无害 */ })
          })
      })
    })
  }
}
