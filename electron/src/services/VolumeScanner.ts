import fs from 'fs-extra'
import path from 'path'

// 日志工具函数（沿用仓库 [ComponentName] 结构化日志习惯）
const log = {
  info: (message: string, ...args: unknown[]) => console.log(`[VolumeScanner] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[VolumeScanner] ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[VolumeScanner] DEBUG: ${message}`, ...args)
}

/**
 * 已挂载的外接卷值对象（ROLE-D01，DDD 值对象）。
 * 以 mountPath 唯一标识；不可变。
 *
 * 注：isRemovable 在「枚举 /Volumes」检测策略下为尽力而为（/Volumes 本就是
 * 外接/可移动介质的挂载点），引入 drivelist 后可精确化。
 */
export interface Volume {
  id: string          // 稳定标识，取 mountPath
  name: string        // 展示名（挂载点目录名）
  mountPath: string   // 完整挂载路径，浏览入口
  isRemovable: boolean
}

export interface VolumeScannerOptions {
  scanInterval: number   // milliseconds
  volumesDir: string     // macOS 默认 /Volumes
}

export type VolumeChangeHandler = (
  volumes: Volume[],
  added: Volume[],
  removed: string[]
) => void

/**
 * VolumeScanner（ROLE-L01，infrastructure 层）。
 * 唯一知道「如何从平台读取已挂载外接卷」的角色：轮询检测 → diff → emit change。
 * 检测策略（detectVolumes）封装在内部，可整体替换（如 drivelist）而不影响调用方。
 */
export class VolumeScanner {
  private scannerInterval: NodeJS.Timeout | null = null
  private options: VolumeScannerOptions
  private currentVolumes: Map<string, Volume> = new Map()
  private handlers: VolumeChangeHandler[] = []

  constructor(options: Partial<VolumeScannerOptions> = {}) {
    this.options = {
      scanInterval: 4000,
      volumesDir: '/Volumes',
      ...options
    }
  }

  /**
   * 启动周期性扫描
   */
  start(): void {
    if (this.scannerInterval) {
      this.stop()
    }

    log.info('Starting volume scanner', { interval: this.options.scanInterval, dir: this.options.volumesDir })

    // 首次扫描
    this.scan()

    // 周期扫描
    this.scannerInterval = setInterval(() => {
      this.scan()
    }, this.options.scanInterval)
  }

  /**
   * 停止扫描
   */
  stop(): void {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval)
      this.scannerInterval = null
      log.info('Volume scanner stopped')
    }
  }

  /**
   * 执行单次扫描
   */
  async scan(): Promise<Volume[]> {
    const volumes: Volume[] = []
    const added: Volume[] = []
    const removed: string[] = []

    try {
      const detected = await this.detectVolumes()
      volumes.push(...detected)
    } catch (error) {
      log.error('Volume scan error:', error)
    }

    // 计算 added / removed
    const newIds = new Set(volumes.map(v => v.id))
    const oldIds = new Set(this.currentVolumes.keys())

    for (const volume of volumes) {
      if (!oldIds.has(volume.id)) {
        added.push(volume)
      }
    }

    for (const oldId of Array.from(oldIds)) {
      if (!newIds.has(oldId)) {
        removed.push(oldId)
      }
    }

    if (added.length > 0) {
      log.info('Volumes added:', added.map(v => ({ id: v.id, name: v.name })))
    }
    if (removed.length > 0) {
      log.info('Volumes removed:', removed)
    }

    // 更新当前状态
    this.currentVolumes.clear()
    for (const volume of volumes) {
      this.currentVolumes.set(volume.id, volume)
    }

    // 有变化才通知
    if (added.length > 0 || removed.length > 0) {
      this.notifyHandlers(volumes, added, removed)
    }

    return volumes
  }

  /**
   * 平台检测策略（可替换点）：枚举 /Volumes 下的可见挂载点。
   * - 跳过隐藏项（以 '.' 开头，如 .timemachine）
   * - 仅保留目录
   */
  private async detectVolumes(): Promise<Volume[]> {
    const volumes: Volume[] = []

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(this.options.volumesDir, { withFileTypes: true })
    } catch (error) {
      // /Volumes 不存在或不可读（非 macOS / 无外接卷）→ 视为空
      log.debug('Cannot read volumes dir, treating as empty:', this.options.volumesDir, error)
      return []
    }

    for (const entry of entries) {
      // 跳过隐藏挂载点
      if (entry.name.startsWith('.')) continue
      if (!entry.isDirectory()) continue

      const mountPath = path.join(this.options.volumesDir, entry.name)
      volumes.push({
        id: mountPath,
        name: entry.name,
        mountPath,
        isRemovable: true
      })
    }

    return volumes
  }

  /**
   * 注册卷变化 handler，返回注销函数
   */
  onVolumeChange(handler: VolumeChangeHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index > -1) {
        this.handlers.splice(index, 1)
      }
    }
  }

  /**
   * 获取当前已检测到的卷（快照）
   */
  getVolumes(): Volume[] {
    return Array.from(this.currentVolumes.values())
  }

  private notifyHandlers(volumes: Volume[], added: Volume[], removed: string[]): void {
    for (const handler of this.handlers) {
      try {
        handler(volumes, added, removed)
      } catch (error) {
        log.error('Volume change handler error:', error)
      }
    }
  }
}
