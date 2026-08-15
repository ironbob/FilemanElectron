import { open, stat } from 'fs/promises'
import mediaInfoFactory from 'mediainfo.js'
import type { MediaInfo } from 'mediainfo.js'
import type { MediaInfoSummary } from '@shared/types'

/** MediaInfo JSON 中数值字段可能是 number 也可能是数字字符串，统一收敛 */
function num(value: unknown): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * 音视频元数据提取（MediaInfoLib 的 WASM 版）。
 *
 * - WASM 实例懒加载、进程内复用（首次调用 ~几十 ms 初始化）。
 * - analyzeData 以 chunk 方式喂数据：只读容器头部/索引用到的字节，
 *   不把整个文件读进内存（对几 GB 的视频尤其重要）。
 * - 本期仅本地文件（CLI 无关，但远程需 adapter 读 chunk，留待后续）。
 */
export class MediaInfoService {
  private instance: MediaInfo<'object'> | null = null
  private initPromise: Promise<MediaInfo<'object'>> | null = null

  private async getInstance(): Promise<MediaInfo<'object'>> {
    if (this.instance) return this.instance
    if (!this.initPromise) {
      this.initPromise = mediaInfoFactory({ format: 'object' }).then(instance => {
        this.instance = instance
        return instance
      })
    }
    return this.initPromise
  }

  async analyze(deviceId: string, filePath: string): Promise<MediaInfoSummary | null> {
    // 远程设备的 adapter 分块读取留待后续迭代，本次仅本地
    if (deviceId !== 'local') return null

    const fh = await open(filePath, 'r')
    try {
      const { size } = await stat(filePath)
      const mi = await this.getInstance()
      const result = await mi.analyzeData(
        size,
        (chunkSize, offset) => this.readChunk(fh, offset, chunkSize)
      )
      return this.summarize(result)
    } finally {
      await fh.close()
    }
  }

  private async readChunk(fh: Awaited<ReturnType<typeof open>>, offset: number, chunkSize: number): Promise<Uint8Array> {
    const buffer = Buffer.alloc(Math.max(0, chunkSize))
    const { bytesRead } = await fh.read(buffer, 0, buffer.length, offset)
    return new Uint8Array(buffer.subarray(0, bytesRead))
  }

  private summarize(result: unknown): MediaInfoSummary | null {
    const tracks = (result as { media?: { track?: Array<Record<string, unknown>> } })?.media?.track
    if (!tracks || tracks.length === 0) return null

    const general = tracks.find(t => t['@type'] === 'General')
    const video = tracks.find(t => t['@type'] === 'Video')
    const audio = tracks.find(t => t['@type'] === 'Audio')
    if (!general && !video && !audio) return null

    const summary: MediaInfoSummary = {}
    if (general) {
      summary.format = typeof general.Format === 'string' ? general.Format : undefined
      summary.durationSeconds = num(general.Duration)
      summary.overallBitrate = num(general.OverallBitRate)
    }
    if (video) {
      summary.video = {
        codec: typeof video.Format === 'string' ? video.Format : undefined,
        width: num(video.Width),
        height: num(video.Height),
        frameRate: num(video.FrameRate),
        bitrate: num(video.BitRate) ?? num(video.BitRate_Nominal),
        bitDepth: num(video.BitDepth),
      }
    }
    if (audio) {
      summary.audio = {
        codec: typeof audio.Format === 'string' ? audio.Format : undefined,
        sampleRate: num(audio.SamplingRate),
        channels: num(audio.Channels),
        bitrate: num(audio.BitRate) ?? num(audio.BitRate_Nominal),
      }
    }
    return summary
  }
}
