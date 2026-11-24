import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import ffmpeg from 'ffmpeg-static'
import type { VideoConvertSpec } from '@shared/types'
import { resolveOutputPath } from './support/imageEditNaming'
import {
  buildVideoConvertArgs,
  isProgressEnd,
  parseMediaDuration,
  parseProgressOutTimeUs,
  progressFraction,
  splitProgressLines
} from './support/videoConvert'
import { t } from '../i18n'

const log = console

/** 取消后 SIGTERM 让 ffmpeg 自行收尾，宽限期后强杀保证进程及时退出。 */
const KILL_GRACE_MS = 2000

/** stderr 只用于取 Duration 与失败摘要，封顶防止异常刷屏吃内存。 */
const STDERR_CAP = 64 * 1024

export class VideoConvertCancelledError extends Error {
  constructor() {
    super('video-convert cancelled')
    this.name = 'VideoConvertCancelledError'
  }
}

export interface VideoConvertHooks {
  /** 单文件进度 0..1（时长未知时恒 0，仅文件完成时跳变）。 */
  onProgress?: (fraction: number) => void
  /** 中止：kill ffmpeg + 清理临时文件；进行中的 convert 以 VideoConvertCancelledError 拒绝。 */
  signal?: AbortSignal
}

export interface VideoConvertResult {
  writtenPath: string
  bytes: number
}

/**
 * VideoConvertService —— ffmpeg-static 转码执行器（video-convert 任务的引擎，
 * 组合根注入 FileOperationManager；与 ImageEditService 同构）。
 *
 *  - 参数数组 spawn 不经 shell；输出恒为 H.264 + AAC + faststart。
 *  - 原子写：临时文件写在目标目录内（同卷才能 rename），成功后 rename 到
 *    resolveOutputPath 给定的唯一路径；失败 / 取消 unlink 临时文件，原文件永不触碰。
 *  - 进度：`-progress pipe:1` 的 out_time_us / `ffmpeg -i` stderr 的 Duration。
 */
export class VideoConvertService {
  private readonly children = new Set<ChildProcess>()

  async convert(sourcePath: string, spec: VideoConvertSpec, hooks: VideoConvertHooks = {}): Promise<VideoConvertResult> {
    const t0 = Date.now()
    if (hooks.signal?.aborted) throw new VideoConvertCancelledError()
    if (spec.dir) {
      const stat = await fs.promises.stat(spec.dir).catch(() => null)
      if (!stat?.isDirectory()) throw new Error(t('errors.main.imageEditTargetDirMissing', { dir: spec.dir }))
    }

    const naming = {
      sourcePath,
      mode: 'copy' as const,
      format: 'mp4' as const,
      suffix: spec.suffix ?? '',
      dir: spec.dir,
      exists: (p: string) => fs.existsSync(p)
    }
    const target = resolveOutputPath(naming)
    const tmp = path.join(path.dirname(target), `.${path.basename(target, path.extname(target))}.${crypto.randomUUID().slice(0, 8)}.mp4.tmp`)
    log.info('[VideoConvert] start', { sourcePath, target, quality: spec.quality, resolution: spec.resolution })

    return new Promise<VideoConvertResult>((resolve, reject) => {
      if (!ffmpeg) {
        reject(new Error(t('errors.main.videoConvertUnavailable')))
        return
      }
      const child: ChildProcess = spawn(ffmpeg, buildVideoConvertArgs(sourcePath, tmp, spec), { stdio: ['ignore', 'pipe', 'pipe'] })
      this.children.add(child)
      let stderr = ''
      let stdoutBuf = ''
      let durationUs: number | null = null
      let outTimeUs: number | null = null
      let ended = false
      let cancelled = false
      let settled = false

      // progress=end 后视为完成（末个 out_time 略短于容器 Duration，否则停在 99%）
      // 取消后 ffmpeg 收尾仍会输出 progress=end，不能当成转码完成
      const emitProgress = () => {
        if (cancelled) return
        hooks.onProgress?.(ended ? 1 : progressFraction(outTimeUs, durationUs))
      }

      const onAbort = () => {
        cancelled = true
        child.kill('SIGTERM')
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        }, KILL_GRACE_MS).unref()
      }
      // 已 aborted 的 signal 不再派发 abort 事件（取消可能落在上方 await stat 期间）
      hooks.signal?.addEventListener('abort', onAbort, { once: true })
      if (hooks.signal?.aborted) onAbort()

      const cleanup = () => {
        hooks.signal?.removeEventListener('abort', onAbort)
        this.children.delete(child)
      }
      const removeTmp = () => { try { fs.rmSync(tmp, { force: true }) } catch { /* 尽力清理 */ } }

      child.stdout!.setEncoding('utf8')
      child.stdout!.on('data', (chunk: string) => {
        stdoutBuf += chunk
        const { lines, rest } = splitProgressLines(stdoutBuf)
        stdoutBuf = rest
        for (const line of lines) {
          const us = parseProgressOutTimeUs(line)
          if (us !== null) outTimeUs = us
          if (isProgressEnd(line)) ended = true
        }
        emitProgress()
      })
      child.stderr!.setEncoding('utf8')
      child.stderr!.on('data', (chunk: string) => {
        if (stderr.length < STDERR_CAP) stderr += chunk
        if (durationUs === null) durationUs = parseMediaDuration(stderr)
      })
      child.on('error', error => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      })
      child.on('close', (code, signal) => {
        if (settled) return
        settled = true
        cleanup()
        if (cancelled) {
          removeTmp()
          reject(new VideoConvertCancelledError())
          return
        }
        if (code !== 0) {
          removeTmp()
          reject(new Error(t('errors.main.videoConvertFailed', { code: code ?? signal ?? '?', detail: summarizeFfmpegError(stderr) })))
          return
        }
        if (ended) emitProgress()
        try {
          // 转码耗时可达数分钟，解析路径到 rename 之间目标可能被占用：重新取唯一名兜底
          const finalTarget = fs.existsSync(target) ? resolveOutputPath(naming) : target
          fs.renameSync(tmp, finalTarget)
          const bytes = fs.statSync(finalTarget).size
          log.info('[VideoConvert] done', { sourcePath, target: finalTarget, bytes, durationUs, ms: Date.now() - t0 })
          resolve({ writtenPath: finalTarget, bytes })
        } catch (error) {
          removeTmp()
          reject(error)
        }
      })
    })
  }

  /** 应用退出：终止全部在跑的 ffmpeg（临时文件残留按 PRD 可接受）。 */
  dispose(): void {
    this.children.forEach(child => child.kill('SIGKILL'))
    this.children.clear()
  }
}

/** ffmpeg 失败摘要：去掉输入 / 输出信息行，取最后一条错误行，封顶 300 字符。 */
function summarizeFfmpegError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l && !/^\s*(Input|Output) #|^\s{2}(Stream|Duration|Metadata|encoder|creation_time|major_brand|minor_version|compatible_brands)/.test(l))
  const last = lines[lines.length - 1] ?? ''
  return last.length > 300 ? `${last.slice(0, 297)}…` : last
}
