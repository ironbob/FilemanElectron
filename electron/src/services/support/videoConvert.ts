import type { VideoConvertSpec } from '@shared/types'

/**
 * 视频转换 ffmpeg 参数 / 进度解析 / 字节进度换算（纯函数，无 electron、
 * ffmpeg-static 依赖，便于 node 直接测试；进程编排见 VideoConvertService）。
 *
 * 设计依据：
 *  - execFile 参数数组不经 shell（HostShellService「无引号地狱」原则）；
 *    滤镜图里的单引号是 ffmpeg 滤镜层转义（保护逗号/冒号），与 shell 无关。
 *  - 输出恒为 H.264 + AAC + faststart（PRD R7）；时长从 `ffmpeg -i` 的
 *    stderr Duration 行解析（捆绑二进制不含 ffprobe，不新增依赖）。
 */

/** 质量三档 → libx264 CRF（业界常用默认，校准只调数值）。 */
const CRF_BY_QUALITY: Record<VideoConvertSpec['quality'], number> = { high: 20, standard: 23, small: 28 }

/** 分辨率三档 → 长边上限 px（keep 不缩放）。 */
export const MAX_EDGE_BY_RESOLUTION: Record<VideoConvertSpec['resolution'], number | null> = {
  keep: null,
  '1080p': 1920,
  '720p': 1280
}

/**
 * 等比缩放滤镜：盒宽高各取 min(i*, 上限)，竖拍 / 横拍一致以长边受限；
 * force_original_aspect_ratio=decrease 只缩不放；force_divisible_by=2 保证
 * yuv420p + libx264 要求的偶数尺寸。
 */
export function scaleFilterFor(resolution: VideoConvertSpec['resolution']): string | null {
  const maxEdge = MAX_EDGE_BY_RESOLUTION[resolution]
  if (!maxEdge) return null
  return `scale='min(iw,${maxEdge})':'min(ih,${maxEdge})':force_original_aspect_ratio=decrease:force_divisible_by=2`
}

/**
 * 转码 argv（固定顺序：全局/输入 → 滤镜 → 视频 → 音频 → 容器/元数据 → 输出）。
 * -f mp4 必须显式指定：临时文件以 .tmp 结尾，ffmpeg 无法从扩展名推断容器。
 */
export function buildVideoConvertArgs(input: string, outputTmp: string, spec: VideoConvertSpec): string[] {
  const args: string[] = ['-hide_banner', '-nostdin', '-nostats', '-y', '-progress', 'pipe:1', '-i', input]
  const vf = scaleFilterFor(spec.resolution)
  if (vf) args.push('-vf', vf)
  // 显式映射：默认流选择会把字幕流一并带进 mp4（MKV 位图字幕 → mov_text 编码
  // 直接失败）；0:a:0? 表示无音轨时忽略而非报错。
  args.push(
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(CRF_BY_QUALITY[spec.quality] ?? CRF_BY_QUALITY.standard), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-map_metadata', '0',
    '-f', 'mp4',
    outputTmp
  )
  return args
}

const DURATION_RE = /Duration:\s*(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?/i

/** 解析 `ffmpeg -i` stderr 的 `Duration: HH:MM:SS.xx` 为微秒；缺失 / `N/A` 返回 null。 */
export function parseMediaDuration(stderrText: string): number | null {
  const m = DURATION_RE.exec(stderrText)
  if (!m) return null
  const frac = (m[4] ?? '').padEnd(6, '0').slice(0, 6)
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1_000_000 + Number(frac)
}

/**
 * `-progress pipe:1` 单行 out_time（微秒）。只认 out_time_us：ffmpeg 6.0 的
 * out_time_ms 同为微秒（6.1 起才是毫秒），首块的 out_time 还可能是负哨兵
 * / 荒谬值，故数字正则天然过滤掉这些不可用样本。
 */
export function parseProgressOutTimeUs(line: string): number | null {
  const m = /^out_time_us=(\d+)$/i.exec(line.trim())
  return m ? Number(m[1]) : null
}

export function isProgressEnd(line: string): boolean {
  return line.trim() === 'progress=end'
}

/** 把 stdout 增量切成完整行，未完成的尾巴留给下一个 chunk 拼接。 */
export function splitProgressLines(buffer: string): { lines: string[]; rest: string } {
  const idx = buffer.lastIndexOf('\n')
  if (idx === -1) return { lines: [], rest: buffer }
  return { lines: buffer.slice(0, idx).split('\n'), rest: buffer.slice(idx + 1) }
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

/** 输出时间 / 总时长 → 单文件进度比例；时长未知（null/0）恒为 0。 */
export function progressFraction(outTimeUs: number | null, durationUs: number | null): number {
  if (outTimeUs === null || !durationUs || durationUs <= 0) return 0
  return clamp01(outTimeUs / durationUs)
}

/**
 * 任务字节进度：已完成文件的源字节 + 当前文件源字节 × 比例。
 * 以源文件大小计权（输出体积编码前未知），让抽屉进度条随时间连续推进。
 */
export function toTaskBytes(doneBytes: number, currentFileBytes: number, fraction: number): number {
  return doneBytes + Math.round(currentFileBytes * clamp01(fraction))
}
