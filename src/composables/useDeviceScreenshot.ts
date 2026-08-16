import { ref } from 'vue'
import { t } from '@/i18n'

/**
 * 移动设备截图(Android/OHOS/iOS)——侧边栏工具栏的「先展示、后保存」流程。
 *
 * 模块级单例状态:AppSidebar 的截图按钮与 App.vue 挂载的 ScreenshotOverlay
 * 共享同一份 capturing/shot 状态(数组/对象重赋值保响应式,同 pairingDeviceIds 模式)。
 */

export interface CapturedShot {
  deviceId: string
  deviceName: string
  base64: string
  mime: 'image/png' | 'image/jpeg'
  capturedAt: number
}

const capturingDeviceIds = ref<string[]>([])
const shot = ref<CapturedShot | null>(null)
const saving = ref(false)

const log = console

function isCapturing(deviceId: string): boolean {
  return capturingDeviceIds.value.includes(deviceId)
}

/** 对目标设备截屏;成功后弹出展示层(不落盘)。 */
async function capture(device: { id: string; name: string }): Promise<void> {
  if (isCapturing(device.id)) return
  capturingDeviceIds.value = [...capturingDeviceIds.value, device.id]
  try {
    const result = await window.fileman.captureMobileScreen(device.id)
    shot.value = {
      deviceId: device.id,
      deviceName: device.name,
      base64: result.base64,
      mime: result.mime,
      capturedAt: Date.now()
    }
  } catch (error) {
    log.error('[useDeviceScreenshot] capture failed', { deviceId: device.id, error })
    alert(t('preview.common.screenshotFailed', { message: error instanceof Error ? error.message : String(error) }))
  } finally {
    capturingDeviceIds.value = capturingDeviceIds.value.filter(id => id !== device.id)
  }
}

function close(): void {
  if (saving.value) return // 保存进行中不允许误关
  shot.value = null
}

/** 重新截取:记住当前设备,关闭弹层后再截一次。 */
async function retake(): Promise<void> {
  const current = shot.value
  if (!current) return
  shot.value = null
  await capture({ id: current.deviceId, name: current.deviceName })
}

/** 保存文件名:Screenshot-YYYY-MM-DD-HH-mm-SS.(png|jpg),与主进程 captureToDirectory 命名同形。 */
function screenshotFileName(shotToSave: CapturedShot): string {
  const ext = shotToSave.mime === 'image/png' ? 'png' : 'jpg'
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date(shotToSave.capturedAt)
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  return `Screenshot-${stamp}.${ext}`
}

/** 原生「另存为」→ 写入 local 设备;取消则留在弹层。 */
async function save(): Promise<void> {
  const current = shot.value
  if (!current || saving.value) return
  saving.value = true
  try {
    const ext = current.mime === 'image/png' ? 'png' : 'jpg'
    let defaultPath: string | undefined
    try {
      const home = await window.fileman.getHomeDir()
      defaultPath = `${home}/Desktop/${screenshotFileName(current)}`
    } catch {
      defaultPath = screenshotFileName(current)
    }
    const target = await window.fileman.showSaveFileDialog({
      defaultPath,
      filters: [{ name: ext.toUpperCase() + ' Image', extensions: [ext] }]
    })
    if (!target) return // 用户取消,留在弹层
    await window.fileman.writeFile('local', target, current.base64)
    log.info('[useDeviceScreenshot] saved', { deviceId: current.deviceId, target })
    shot.value = null
  } catch (error) {
    log.error('[useDeviceScreenshot] save failed', { deviceId: current.deviceId, error })
    alert(t('preview.common.screenshotSaveFailed', { message: error instanceof Error ? error.message : String(error) }))
  } finally {
    saving.value = false
  }
}

export function useDeviceScreenshot() {
  return { capturingDeviceIds, shot, saving, isCapturing, capture, close, retake, save }
}
