import { spawn } from 'child_process'
import { ToolPathResolver } from './ToolPathResolver'
import { DeviceManager } from './DeviceManager'
const log = console

function posixJoin(directory: string, name: string): string {
  return `${directory.replace(/\/+$/, '') || '/'}/${name}`.replace(/\/\/+/g, '/')
}

function screenshotName(): string {
  return `Screenshot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`
}

/** Captures Android pixels through ADB then writes them through the target adapter. */
export class MobileScreenshotService {
  constructor(private readonly deviceManager: DeviceManager) {}

  async captureToDirectory(deviceId: string, targetDirectory: string): Promise<{ path: string }> {
    const device = this.deviceManager.getDevice(deviceId)
    if (!device || device.type !== 'android') {
      throw new Error('只有已连接的 Android 设备支持截屏。')
    }
    const serial = deviceId.replace(/^android:/, '')
    log.info('[MobileScreenshotService] capture started', { deviceId, targetDirectory })
    const png = await this.capture(serial)
    const targetPath = posixJoin(targetDirectory, screenshotName())
    await this.deviceManager.writeFile(deviceId, targetPath, png)
    log.info('[MobileScreenshotService] capture saved', { deviceId, targetPath, bytes: png.length })
    return { path: targetPath }
  }

  private capture(serial: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(ToolPathResolver.getAdbExecutable(), ['-s', serial, 'exec-out', 'screencap', '-p'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const chunks: Buffer[] = []
      const errors: Buffer[] = []
      child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
      child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
      child.once('error', error => reject(new Error(`无法启动 adb 截屏: ${error.message}`)))
      child.once('close', code => {
        if (code !== 0) {
          reject(new Error(`Android 截屏失败(code=${code}): ${Buffer.concat(errors).toString('utf8').trim()}`))
          return
        }
        const png = Buffer.concat(chunks)
        if (png.length < 8 || png.subarray(1, 4).toString('ascii') !== 'PNG') {
          reject(new Error('Android 截屏没有返回有效 PNG 数据。'))
          return
        }
        resolve(png)
      })
    })
  }
}
