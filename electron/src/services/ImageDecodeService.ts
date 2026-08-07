import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import type { DeviceManager } from './DeviceManager'

const execFileAsync = promisify(execFile)

const LOG_PREFIX = '[ImageDecodeService]'
function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}
function logError(...args: unknown[]): void {
  console.error(LOG_PREFIX, ...args)
}

export interface DecodeOptions {
  /** Cap the longest side of the decoded raster (px). Clamped to [64, 8192]. Default 2560. */
  maxDim?: number
}

export interface DecodedImage {
  /** base64-encoded JPEG bytes (sips always emits JPEG) */
  buffer: string
  mime: 'image/jpeg'
}

const DEFAULT_MAX_DIM = 2560

/**
 * Decodes image formats Chromium cannot render natively (HEIC/HEIF, camera RAW)
 * into a JPEG raster using macOS `sips` (CoreImage / system RAW engine).
 *
 * - Local files are fed to `sips` directly by path (no copy).
 * - Remote files (SMB/SSH/Android/iOS) are fetched via the adapter, staged to a
 *   temp file, decoded, then cleaned up.
 * - macOS-only. On other platforms it throws — never silently falls back to
 *   readFile, or Chromium would render a broken-image icon.
 *
 * `sips` applies EXIF orientation to the output pixels by default, so the
 * returned JPEG is already upright (the renderer must NOT double-apply
 * `image-orientation: from-image` for these).
 */
export class ImageDecodeService {
  constructor(private readonly deviceManager: DeviceManager) {}

  async decodeToRaster(
    deviceId: string,
    filePath: string,
    opts: DecodeOptions = {}
  ): Promise<DecodedImage> {
    if (process.platform !== 'darwin') {
      throw new Error('Native image decode requires macOS (sips)')
    }

    const maxDim = Math.max(64, Math.min(opts.maxDim ?? DEFAULT_MAX_DIM, 8192))
    const outFile = this.tempPath('.jpg')
    const temps: string[] = [outFile]

    try {
      let inputFile: string
      if (deviceId === 'local') {
        // Local path is a real filesystem path — sips reads it directly.
        inputFile = filePath
      } else {
        // Remote: pull bytes through the adapter and stage to a temp file
        // (sips needs a path, not a buffer).
        const buffer = await this.deviceManager.readFile(deviceId, filePath)
        const ext = path.extname(filePath) || '.bin'
        inputFile = this.tempPath(ext)
        temps.push(inputFile)
        await fs.writeFile(inputFile, buffer)
      }

      await this.runSips(inputFile, outFile, maxDim)
      const bytes = await fs.readFile(outFile)
      log(`decoded ${filePath} → ${bytes.length} bytes jpeg (maxDim ${maxDim})`)

      return { buffer: bytes.toString('base64'), mime: 'image/jpeg' }
    } finally {
      // Best-effort temp cleanup.
      for (const t of temps) {
        await fs.remove(t).catch(() => undefined)
      }
    }
  }

  /**
   * -s format jpeg:       emit JPEG
   * -s formatOptions 90:  quality 90
   * -Z <maxDim>:          constrain longest side, preserve aspect, no upscale
   */
  private async runSips(input: string, output: string, maxDim: number): Promise<void> {
    try {
      await execFileAsync('sips', [
        '-s', 'format', 'jpeg',
        '-s', 'formatOptions', '90',
        '-Z', String(maxDim),
        input,
        '--out', output
      ])
    } catch (err) {
      logError('sips failed for', input, err)
      throw new Error(`Failed to decode image via sips: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private tempPath(ext: string): string {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    return path.join(os.tmpdir(), `fileman-decode-${unique}${ext}`)
  }
}
