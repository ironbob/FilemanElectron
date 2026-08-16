import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import sharp from 'sharp'
import type {
  EditApplyResult,
  EditCompressParams,
  EditEstimateResult,
  EditOps,
  EditSaveSpec,
  ImageEditBatchProgress,
  ImageEditBatchRequest,
  ImageEditItemResult
} from '@shared/types'
import { SessionTaskRegistry, type TaskHandle } from './support/SessionTaskRegistry'
import { resolveOutputPath } from './support/imageEditNaming'
import { SIPS_IMAGE_EXTS, SHARP_IMAGE_EXTS, isEditableImageExt } from '@shared/fileKinds'
import type { DecodedImage, ImageDecodeService } from './ImageDecodeService'

const log = console

/** 进度推送节流间隔（与 ChecksumService/DirectoryStatsService 一致）。 */
const PROGRESS_EMIT_INTERVAL_MS = 100

/** 编辑链路的 sips 解码上限（ImageDecodeService clamp [64,8192]）。 */
const EDIT_DECODE_MAX_DIM = 8192

interface BatchTaskState {
  cancelled: boolean
}

/**
 * ImageEditService —— 图片编辑管道（裁剪/压缩，单图与批量）。
 *
 * 设计依据：
 *  - 信息隐藏 —— sharp/sips 选型、格式能力表、原子写策略全部收敛于此；
 *    换库/加格式只改本文件（OCP）。
 *  - data_safety —— 覆盖 = 同目录临时文件 + fs.move 原子替换，任何失败路径
 *    原文件字节不变；另存副本由 imageEditNaming 保证唯一路径，写入用 'wx'
 *    兜底竞态。
 *  - 批量走 SessionTaskRegistry（ChecksumService 模式）：同会话重复 start
 *    取消旧任务；取消边界 = 当前项完成即停，已完成项保留。
 */
export class ImageEditService {
  private readonly registry = new SessionTaskRegistry()

  constructor(private readonly decoder: Pick<ImageDecodeService, 'decodeToRaster'>) {}

  /** 试编码预估（不落盘）。 */
  async estimate(filePath: string, params: EditCompressParams): Promise<EditEstimateResult> {
    const t0 = Date.now()
    log.info('[ImageEdit] estimate start', { filePath, quality: params.quality, maxEdge: params.maxEdge, format: params.format })
    const { pipeline, format } = await this.buildPipeline(filePath, { compress: params })
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
    const result: EditEstimateResult = {
      estimatedBytes: data.byteLength,
      format: info.format as EditEstimateResult['format'],
      width: info.width,
      height: info.height
    }
    log.info('[ImageEdit] estimate done', { filePath, ms: Date.now() - t0, ...result })
    return result
  }

  /** 单图编辑落盘（原子）。 */
  async apply(filePath: string, ops: EditOps, save: EditSaveSpec): Promise<EditApplyResult> {
    const t0 = Date.now()
    log.info('[ImageEdit] apply start', { filePath, crop: !!ops.crop, compress: !!ops.compress, mode: save.mode })
    if (!ops.crop && !ops.compress) throw new Error('编辑操作为空')

    const { pipeline, format: inputFormat } = await this.buildPipeline(filePath, ops)
    const outFormat = this.resolveOutFormat(save, ops, inputFormat)
    const encoded = await this.encode(pipeline, outFormat, ops.compress?.quality)
    const target = resolveOutputPath({
      sourcePath: filePath,
      mode: save.mode,
      format: outFormat,
      suffix: save.suffix,
      exists: p => fs.existsSync(p)
    })

    await this.writeAtomic(target, encoded, save.mode)
    log.info('[ImageEdit] apply done', { filePath, target, bytes: encoded.byteLength, mode: save.mode, ms: Date.now() - t0 })
    return { writtenPath: target, bytes: encoded.byteLength }
  }

  /** 批量顺序执行；进度节流 100ms，终态必发；单项失败记录后继续。 */
  start(request: ImageEditBatchRequest, emit: (event: ImageEditBatchProgress) => void): { taskId: string } {
    const task = this.registry.create<BatchTaskState>(`image-edit:${Date.now()}:${crypto.randomUUID()}`, { cancelled: false })
    log.info('[ImageEdit] batch start', { taskId: task.taskId, items: request.items.length, mode: request.save.mode })
    void this.runBatch(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    return this.registry.cancel(taskId)
  }

  private async runBatch(
    task: TaskHandle<BatchTaskState>,
    request: ImageEditBatchRequest,
    emit: (event: ImageEditBatchProgress) => void
  ) {
    const itemResults: ImageEditItemResult[] = []
    let lastEmit = 0
    const emitProgress = (index: number, status: ImageEditBatchProgress['status'], force = false) => {
      const now = Date.now()
      if (!force && now - lastEmit < PROGRESS_EMIT_INTERVAL_MS) return
      lastEmit = now
      emit({
        taskId: task.taskId,
        status,
        index,
        total: request.items.length,
        currentFile: path.basename(request.items[index] ?? ''),
        itemResults: [...itemResults]
      })
    }

    try {
      for (let i = 0; i < request.items.length; i++) {
        if (task.cancelled || task.state.cancelled) break
        const sourcePath = request.items[i]
        emitProgress(i, 'running')
        try {
          const result = await this.apply(sourcePath, request.ops, request.save)
          itemResults.push({ sourcePath, targetPath: result.writtenPath, status: 'success' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          log.warn('[ImageEdit] batch item failed', { taskId: task.taskId, sourcePath, message })
          itemResults.push({ sourcePath, status: 'failed', error: message })
        }
      }

      const status: ImageEditBatchProgress['status'] = task.cancelled ? 'cancelled' : 'completed'
      const index = Math.min(itemResults.length, request.items.length - 1)
      emitProgress(Math.max(0, index), status, true)
      log.info('[ImageEdit] batch done', {
        taskId: task.taskId,
        status,
        success: itemResults.filter(r => r.status === 'success').length,
        failed: itemResults.filter(r => r.status === 'failed').length
      })
    } catch (error) {
      log.error('[ImageEdit] batch crashed', { taskId: task.taskId, error: error instanceof Error ? error.message : String(error) })
      emitProgress(Math.max(0, itemResults.length - 1), 'failed', true)
    } finally {
      task.runCancelHooks()
    }
  }

  // ── 管道 ────────────────────────────────────────────────────────────────────

  /** 读取源图（SIPS 格式先解码）并按 ops 构建 sharp 管道；返回输入格式。 */
  private async buildPipeline(filePath: string, ops: EditOps): Promise<{ pipeline: sharp.Sharp; format: string }> {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    if (!isEditableImageExt(ext)) {
      throw new Error(`不支持的图片格式：.${ext}`)
    }

    let input: Buffer
    let format = ext
    if (SIPS_INPUT_EXTS.has(ext)) {
      const decoded: DecodedImage = await this.decoder.decodeToRaster('local', filePath, { maxDim: EDIT_DECODE_MAX_DIM })
      input = Buffer.from(decoded.buffer, 'base64')
      format = 'jpeg' // sips 输出 JPEG 光栅
      log.info('[ImageEdit] sips decode', { filePath, bytes: input.byteLength })
    } else {
      input = await fs.readFile(filePath)
    }

    let pipeline = sharp(input, { limitInputPixels: 263409300 }) // 约 16k x 16k 上限
    const meta = await pipeline.metadata()

    if (ops.crop && meta.width) {
      const crop = ops.crop
      const ratio = meta.width / crop.referenceWidth
      const srcW = meta.width
      const srcH = meta.height ?? 1
      // 服务端二次 clamp（契约前置条件的防线）：矩形始终在解码后的图像内且 ≥1px
      const left = clampInt(Math.round(crop.x * ratio), 0, srcW - 1)
      const top = clampInt(Math.round(crop.y * ratio), 0, srcH - 1)
      const width = clampInt(Math.round(crop.width * ratio), 1, srcW - left)
      const height = clampInt(Math.round(crop.height * ratio), 1, srcH - top)
      pipeline = pipeline.extract({ left, top, width, height })
    }
    if (ops.compress?.maxEdge && ops.compress.maxEdge > 0) {
      pipeline = pipeline.resize({ width: ops.compress.maxEdge, height: ops.compress.maxEdge, fit: 'inside', withoutEnlargement: true })
    }
    return { pipeline, format }
  }

  private resolveOutFormat(save: EditSaveSpec, ops: EditOps, inputFormat: string): 'jpeg' | 'webp' | 'png' {
    if (save.format) return save.format
    if (ops.compress?.format && ops.compress.format !== 'keep') return ops.compress.format
    if (inputFormat === 'png') return 'png'
    if (inputFormat === 'webp') return 'webp'
    return 'jpeg' // jpg/tiff/gif/avif/bmp 与 SIPS 光栅统一映射 jpeg
  }

  private encode(pipeline: sharp.Sharp, format: 'jpeg' | 'webp' | 'png', quality?: number): Promise<Buffer> {
    const q = Math.min(100, Math.max(1, quality ?? 85))
    if (format === 'webp') return pipeline.webp({ quality: q }).toBuffer()
    if (format === 'png') return pipeline.png().toBuffer()
    return pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer()
  }

  /** 覆盖 = 临时文件 + fs.move 原子替换；副本 = 'wx' 独占创建（TOCTOU 兜底）。 */
  private async writeAtomic(target: string, data: Buffer, mode: EditSaveSpec['mode']): Promise<void> {
    if (mode === 'overwrite') {
      const temp = path.join(path.dirname(target), `.${path.basename(target)}.imgedit-${crypto.randomUUID()}.tmp`)
      try {
        await fs.writeFile(temp, data, { flag: 'wx' })
        await fs.move(temp, target, { overwrite: true })
      } catch (error) {
        await fs.remove(temp).catch(() => undefined)
        throw error
      }
      return
    }
    try {
      await fs.writeFile(target, data, { flag: 'wx' })
    } catch (error) {
      // 竞态下目标已被创建：换唯一后缀重试一次（TOCTOU 兜底）
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const ext = path.extname(target)
        const retry = target.slice(0, target.length - ext.length) + `-${crypto.randomUUID().slice(0, 6)}${ext}`
        await fs.writeFile(retry, data, { flag: 'wx' })
        return
      }
      throw error
    }
  }
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
