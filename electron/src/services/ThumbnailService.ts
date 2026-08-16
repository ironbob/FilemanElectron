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

const THUMBNAIL_SIZES = {
  small: { width: 64, height: 64 },
  large: { width: 256, height: 256 },
}

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
    mtime: string
  ): string {
    const raw = `${deviceId}:${filePath}:${size}:${mtime}`
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
    readFile: (deviceId: string, path: string) => Promise<Buffer>
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
    
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime)
    
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

    const dimensions = THUMBNAIL_SIZES[thumbnailSize]
    log('Target dimensions:', dimensions)
    
    let thumbnailBuffer: Buffer | null = null
    const startTime = Date.now()

    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      log('Generating image thumbnail for:', filePath)
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions)
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      log('Generating video thumbnail for:', filePath)
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions)
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
    readFile: (deviceId: string, path: string) => Promise<Buffer>,
    dimensions: { width: number; height: number }
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
      
      logWarn('Video thumbnail for remote files not yet supported, deviceId:', deviceId)
      return null
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
