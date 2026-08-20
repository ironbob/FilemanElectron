import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'
import { EXTENSION_KINDS } from '@shared/fileKinds'

const LOG_PREFIX = '[ThumbnailService]'

function log(message: string, ...args: unknown[]) {
  console.log(`${LOG_PREFIX} ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`${LOG_PREFIX} ${message}`, ...args)
}

function logWarn(message: string, ...args: unknown[]) {
  console.warn(`${LOG_PREFIX} ${message}`, ...args)
}

// 目标尺寸按 Retina(2x) 预算：small 档最大消费点是 grid medium（w-14 = 56css
// → 112 物理px），128 覆盖；large 档最大是 xlarge（w-28 = 112css → 224 物理px），
// 256 覆盖。1x 屏多生成一倍像素，换取 HiDPI 下不清糊。
const THUMBNAIL_SIZES = {
  small: { width: 128, height: 128 },
  large: { width: 256, height: 256 },
}

// 远程图片缩略图源文件守卫：readFile 是全量进内存，RAW/百兆大图会把网络
// 和内存一起打爆（本地无网络成本，不受此限）。
const REMOTE_IMAGE_MAX_BYTES = 64 * 1024 * 1024

// 远程视频抽帧预取量：只拉文件头，moov 在头部的容器（faststart mp4/mkv 等）
// 够 ffmpeg 定位 1s 处的帧；moov 在尾部的手机原生录像定位不到 → 失败回退
// 占位图标。再加大头部长度对尾部 moov 也无济于事（缺的是文件尾）。
const REMOTE_VIDEO_HEAD_BYTES = 8 * 1024 * 1024

// 图片/视频格式从 shared/fileKinds.ts 注册表派生（与双击路由同一事实源；
// @shared 别名对主进程可用，不再手抄清单）。注意：
//  - 图片集合含 sharp 解不了的 sips 系格式（heic/RAW 等）——生成失败返回
//    null 走占位图标，与旧行为一致；psd 为 sharp 可解的净增收益。
//  - 视频集合由 ffmpeg 抽帧，容器兼容性远宽于 Chromium 播放。
//  - `.ts`/`.mts` 注册为 TypeScript，不再误跑视频抽帧。
const SUPPORTED_IMAGE_FORMATS = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'image').map(([ext]) => ext)
)

const SUPPORTED_VIDEO_FORMATS = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'video').map(([ext]) => ext)
)

interface ThumbnailResult {
  cacheKey: string
  thumbnailBase64: string
}

export class ThumbnailService {
  private cacheDir: string
  private maxDiskCacheSize = 500 * 1024 * 1024

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'thumbnails')
    log('Initializing ThumbnailService')
    log('Cache directory:', this.cacheDir)
    this.ensureCacheDir()
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir)
      log('Cache directory ensured:', this.cacheDir)
    } catch (e) {
      logError('Failed to create cache directory:', e)
    }
  }

  generateCacheKey(
    deviceId: string,
    filePath: string,
    size: number,
    mtime: string,
    dimensions: { width: number; height: number }
  ): string {
    // 目标尺寸必须参与键（2026-08-20 修复）：此前只拼 deviceId:filePath:字节
    // 数:mtime，不含档位——同一文件先请求 small 再请求 large 时磁盘缓存命中
    // 64px 位图当 large 返回，被 CSS 拉伸 2.5~3.5 倍，即「缩略图非常模糊」
    // 的主因。尺寸即档位（64/128 vs 256），顺带让档位尺寸调整后旧缓存自动失效。
    const raw = `${deviceId}:${filePath}:${size}:${mtime}:${dimensions.width}x${dimensions.height}`
    const hash = crypto.createHash('md5').update(raw).digest('hex').slice(0, 16)
    log('Generated cache key:', hash, 'for file:', filePath)
    return hash
  }

  async getThumbnail(
    deviceId: string,
    filePath: string,
    size: number,
    mtime: string,
    thumbnailSize: 'small' | 'large',
    readFile: (deviceId: string, path: string) => Promise<Buffer>,
    // 流式预取远程文件前 maxBytes 字节（视频缩略图用）。无流式能力的设备
    // （iOS/OHOS）注入 null，视频分支据此降级为不支持。
    readHead: ((deviceId: string, path: string, maxBytes: number) => Promise<Buffer | null>) | null
  ): Promise<ThumbnailResult | null> {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    log('getThumbnail called:', { 
      deviceId, 
      filePath, 
      size, 
      mtime, 
      thumbnailSize,
      ext 
    })
    
    const dimensions = THUMBNAIL_SIZES[thumbnailSize]
    log('Target dimensions:', dimensions)
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime, dimensions)

    log('Checking disk cache for key:', cacheKey)
    const cachedThumbnail = await this.getFromDiskCache(cacheKey)
    if (cachedThumbnail) {
      log('Cache HIT for:', filePath, 'key:', cacheKey)
      return { cacheKey, thumbnailBase64: cachedThumbnail }
    }
    
    log('Cache MISS for:', filePath, 'key:', cacheKey)

    if (!SUPPORTED_IMAGE_FORMATS.has(ext) && !SUPPORTED_VIDEO_FORMATS.has(ext)) {
      logWarn('Unsupported format for thumbnail:', ext, 'file:', filePath)
      return null
    }

    // Virtual ZIP paths: images are read via the injected callback and work
    // as-is, but video frames require a temp file on disk, which a '::' path
    // cannot provide — bail out before reaching ffmpeg.
    if (SUPPORTED_VIDEO_FORMATS.has(ext) && filePath.includes('::')) {
      logWarn('Video thumbnails are not supported inside ZIP:', filePath)
      return null
    }

    let thumbnailBuffer: Buffer | null = null
    const startTime = Date.now()

    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      // 远程大图守卫：超出阈值不再生成（占位图标兜底），磁盘缓存命中不受影响
      if (deviceId !== 'local' && size > REMOTE_IMAGE_MAX_BYTES) {
        logWarn('Remote image exceeds thumbnail source guard, skip:', filePath, 'size:', size)
        return null
      }
      log('Generating image thumbnail for:', filePath)
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions)
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      log('Generating video thumbnail for:', filePath)
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, dimensions, readHead)
    }

    const elapsed = Date.now() - startTime

    if (!thumbnailBuffer) {
      logError('Failed to generate thumbnail for:', filePath, 'elapsed:', elapsed, 'ms')
      return null
    }

    log('Thumbnail generated successfully for:', filePath, 
        'size:', thumbnailBuffer.length, 'bytes', 
        'elapsed:', elapsed, 'ms')

    await this.saveToDiskCache(cacheKey, thumbnailBuffer)

    return {
      cacheKey,
      thumbnailBase64: thumbnailBuffer.toString('base64')
    }
  }

  private async getFromDiskCache(cacheKey: string): Promise<string | null> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.webp`)
    try {
      if (await fs.pathExists(cachePath)) {
        const buffer = await fs.readFile(cachePath)
        log('Disk cache hit, key:', cacheKey, 'size:', buffer.length, 'bytes')
        return buffer.toString('base64')
      } else {
        log('Disk cache miss, key:', cacheKey, 'path:', cachePath)
      }
    } catch (e) {
      logError('Error reading disk cache:', cacheKey, e)
    }
    return null
  }

  private async saveToDiskCache(cacheKey: string, thumbnailBuffer: Buffer): Promise<void> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.webp`)
    try {
      await fs.writeFile(cachePath, thumbnailBuffer)
      log('Saved to disk cache, key:', cacheKey, 'size:', thumbnailBuffer.length, 'bytes')
    } catch (e) {
      logError('Failed to save to disk cache:', cacheKey, e)
    }
  }

  private async generateImageThumbnail(
    filePath: string,
    deviceId: string,
    readFile: (deviceId: string, path: string) => Promise<Buffer>,
    dimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    try {
      log('Reading image file:', filePath, 'deviceId:', deviceId)
      const readStartTime = Date.now()
      const fileBuffer = await readFile(deviceId, filePath)
      log('Image file read complete, size:', fileBuffer.length, 'bytes, elapsed:', Date.now() - readStartTime, 'ms')
      
      log('Processing image with sharp, target dimensions:', dimensions)
      const processStartTime = Date.now()
      const result = await sharp(fileBuffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .webp({ quality: 92 })
        .toBuffer()
      log('Sharp processing complete, output size:', result.length, 'bytes, elapsed:', Date.now() - processStartTime, 'ms')
      
      return result
    } catch (e) {
      logError('Failed to generate image thumbnail:', filePath, e)
      return null
    }
  }

  private async generateVideoThumbnail(
    filePath: string,
    deviceId: string,
    dimensions: { width: number; height: number },
    readHead: ((deviceId: string, path: string, maxBytes: number) => Promise<Buffer | null>) | null
  ): Promise<Buffer | null> {
    if (!ffmpeg) {
      logError('ffmpeg not available, cannot generate video thumbnail')
      return null
    }

    log('ffmpeg path:', ffmpeg)

    try {
      if (deviceId === 'local') {
        log('Extracting video frame from local file:', filePath)
        return await this.extractVideoFrameLocal(filePath, dimensions)
      }

      // 远程视频：canStream 设备（SMB/SSH/Android/WebDAV）由注入的 readHead
      // 流式预取文件头写入临时文件，复用本地抽帧链路。截断输入的物理上限：
      // moov 在尾部的手机原生录像 ffmpeg 定位不到帧 → extractVideoFrameLocal
      // 两次尝试失败 → null → 占位图标，静默降级。无 readHead（iOS/OHOS 无
      // 流式）或预取为空同样返回 null。
      if (!readHead) {
        logWarn('Video thumbnail for remote device without stream, skip. deviceId:', deviceId)
        return null
      }
      const head = await readHead(deviceId, filePath, REMOTE_VIDEO_HEAD_BYTES)
      if (!head || head.length === 0) {
        logWarn('Remote video head prefetch empty:', filePath)
        return null
      }

      const ext = path.extname(filePath).toLowerCase() || '.mp4'
      // 并发缩略图请求（渲染层信号量 6）可能同毫秒落同名临时文件，加随机后缀
      const headPath = path.join(
        app.getPath('temp'),
        `remote_thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
      )
      try {
        await fs.writeFile(headPath, head)
        log('Extracting video frame from prefetched head:', filePath,
            'head bytes:', head.length)
        return await this.extractVideoFrameLocal(headPath, dimensions)
      } finally {
        await fs.unlink(headPath).catch(() => {})
      }
    } catch (e) {
      logError('Failed to generate video thumbnail:', filePath, e)
      return null
    }
  }

  private async extractVideoFrameLocal(
    filePath: string,
    dimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    const { execFile } = require('child_process')
    const util = require('util')
    const execFileAsync = util.promisify(execFile)

    const tempDir = app.getPath('temp')
    const outputPath = path.join(tempDir, `thumb_${Date.now()}.webp`)

    log('extractVideoFrameLocal - input:', filePath)
    log('extractVideoFrameLocal - output:', outputPath)
    log('extractVideoFrameLocal - dimensions:', dimensions)

    try {
      log('Attempting ffmpeg extraction at 1 second offset')
      const startTime = Date.now()
      
      await execFileAsync(ffmpeg, [
        '-i', filePath,
        '-ss', '00:00:01',
        '-vframes', '1',
        '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
        '-y',
        outputPath
      ], { timeout: 10000 })

      log('ffmpeg extraction at 1s complete, elapsed:', Date.now() - startTime, 'ms')

      const buffer = await fs.readFile(outputPath)
      log('Read thumbnail file, size:', buffer.length, 'bytes')
      await fs.unlink(outputPath).catch(() => {})
      log('Cleaned up temp file:', outputPath)
      
      return buffer
    } catch (firstError) {
      logWarn('ffmpeg extraction at 1s failed, trying at 0s:', firstError)
      
      try {
        log('Attempting ffmpeg extraction at 0 second offset')
        const startTime = Date.now()
        
        await execFileAsync(ffmpeg, [
          '-i', filePath,
          '-ss', '00:00:00',
          '-vframes', '1',
          '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
          '-y',
          outputPath
        ], { timeout: 10000 })

        log('ffmpeg extraction at 0s complete, elapsed:', Date.now() - startTime, 'ms')

        const buffer = await fs.readFile(outputPath)
        log('Read thumbnail file, size:', buffer.length, 'bytes')
        await fs.unlink(outputPath).catch(() => {})
        log('Cleaned up temp file:', outputPath)
        return buffer
      } catch (secondError) {
        logError('ffmpeg extraction at 0s also failed:', filePath, secondError)
        return null
      }
    }
  }

  async clearCache(): Promise<void> {
    log('Clearing disk cache at:', this.cacheDir)
    try {
      await fs.emptyDir(this.cacheDir)
      log('Disk cache cleared successfully')
    } catch (e) {
      logError('Failed to clear disk cache:', e)
    }
  }

  async getCacheSize(): Promise<number> {
    let totalSize = 0
    try {
      const files = await fs.readdir(this.cacheDir)
      log('Calculating cache size, files count:', files.length)
      for (const file of files) {
        const stat = await fs.stat(path.join(this.cacheDir, file))
        totalSize += stat.size
      }
      log('Total cache size:', totalSize, 'bytes (', (totalSize / 1024 / 1024).toFixed(2), 'MB)')
    } catch (e) {
      logError('Failed to calculate cache size:', e)
    }
    return totalSize
  }
}
