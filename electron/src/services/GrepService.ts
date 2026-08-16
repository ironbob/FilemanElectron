import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import type { GrepMatch, GrepProgress, GrepRequest } from '@shared/types'
import type { IFileSystemAdapter } from '../adapters/types'
import { shellQuote } from '../adapters/shellQuote'
import { ToolPathResolver } from './ToolPathResolver'
import { DirectoryWalker } from './support/DirectoryWalker'
import { SessionTaskRegistry, type TaskHandle } from './support/SessionTaskRegistry'
import { t } from '../i18n'
import {
  createLineMatcher,
  globsToGrepArgs,
  globsToRgArgs,
  grepFlags,
  looksBinary,
  matchGlob,
  parseGrepLine,
  rgFlags,
  truncateLine
} from './support/grepParsing'

const log = console

const PROGRESS_EMIT_INTERVAL_MS = 100
/** 批量冲刷阈值：条数或间隔先到即推。 */
const BATCH_FLUSH_MATCHES = 200
/** 流式回退引擎的单文件大小上限（读取成本）。 */
const STREAM_ENGINE_MAX_FILE_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_RESULTS = 10000

interface GrepTaskState {
  child: ChildProcessWithoutNullStreams | null
}

/**
 * GrepService —— 内容搜索引擎矩阵（按设备能力分流）：
 *
 *  ┌ 本地 + rg 可用 → ripgrep 子进程流式 stdout（最快，尊重 .gitignore）
 *  ├ SSH/Android    → 远端 exec `grep -rn`（数据不过网，远端执行）
 *  └ 其余(SMB/WebDAV/本地无rg) → DirectoryWalker + openReadStream 逐行扫描
 *    （二进制嗅探跳过；单文件 ≤5MB）
 *
 * 设计依据：
 *  - 策略矩阵封装在服务内，调用方（renderer/IPC）只有一个 start；
 *  - 取消语义：协作标志逐行检查 + onCancel 杀 rg 子进程；
 *  - 命中批量推送（100ms/200 条），maxResults 截断置 truncated。
 */
export class GrepService {
  private readonly registry = new SessionTaskRegistry()

  constructor(private readonly devices: { getReadyAdapter(deviceId: string): Promise<IFileSystemAdapter> }) {}

  start(request: GrepRequest, emit: (event: GrepProgress) => void): { taskId: string } {
    const task = this.registry.create<GrepTaskState>(request.sessionId, { child: null })
    log.info('[Grep] task started', {
      taskId: task.taskId, sessionId: request.sessionId,
      deviceId: request.deviceId, rootPath: request.rootPath, pattern: request.pattern
    })
    void this.run(task, request, emit)
    return { taskId: task.taskId }
  }

  cancel(taskId: string): boolean {
    return this.registry.cancel(taskId)
  }

  private async run(task: TaskHandle<GrepTaskState>, request: GrepRequest, emit: (event: GrepProgress) => void) {
    const maxResults = request.maxResults ?? DEFAULT_MAX_RESULTS
    const adapter = await this.devices.getReadyAdapter(request.deviceId)
    const capabilities = adapter.getCapabilities()
    if (!capabilities.canGrepContent) {
      emit(this.terminal(task, request, 'failed', [], `设备 ${request.deviceId} 不支持内容搜索`))
      this.registry.finish(task)
      return
    }

    let matchCount = 0
    let truncated = false
    let lastEmitAt = 0
    let batch: GrepMatch[] = []
    let currentPath: string | undefined

    const flush = (force = false) => {
      const now = Date.now()
      const timed = now - lastEmitAt >= PROGRESS_EMIT_INTERVAL_MS
      if (batch.length === 0) return
      if (!force && !timed && batch.length < BATCH_FLUSH_MATCHES) return
      lastEmitAt = now
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: 'searching', matchCount, currentPath, matches: batch })
      batch = []
    }

    const pushMatch = (match: GrepMatch): boolean => {
      if (matchCount >= maxResults) {
        truncated = true
        return false
      }
      matchCount++
      batch.push(match)
      flush()
      return true
    }

    try {
      const engine = this.pickEngine(adapter)
      log.info('[Grep] engine selected', { taskId: task.taskId, engine })

      if (engine === 'ripgrep') {
        await this.runRipgrep(task, request, pushMatch, () => { currentPath = undefined; flush(true) })
      } else if (engine === 'remote-exec') {
        await this.runRemoteGrep(adapter, request, pushMatch, () => { flush(true) })
      } else {
        await this.runStreamScan(task, adapter, request, current => { currentPath = current }, pushMatch, () => { flush(true) })
      }

      flush(true)
      emit(this.terminal(task, request, task.cancelled ? 'cancelled' : 'completed', [], undefined, truncated, matchCount))
    } catch (error) {
      const cancelled = task.cancelled
      const message = error instanceof Error ? error.message : String(error)
      flush(true)
      log.warn('[Grep] task ended', { taskId: task.taskId, cancelled, message })
      emit(this.terminal(task, request, cancelled ? 'cancelled' : 'failed', [], cancelled ? undefined : message, truncated, matchCount))
    } finally {
      this.registry.finish(task)
      log.info('[Grep] task finished', { taskId: task.taskId, cancelled: task.cancelled, matchCount, truncated })
    }
  }

  private terminal(
    task: TaskHandle<GrepTaskState>,
    request: GrepRequest,
    status: GrepProgress['status'],
    matches: GrepMatch[],
    message?: string,
    truncated?: boolean,
    matchCount = 0
  ): GrepProgress {
    return {
      sessionId: task.sessionId,
      taskId: task.taskId,
      status,
      matchCount,
      currentPath: request.rootPath,
      matches,
      truncated,
      message
    }
  }

  private pickEngine(adapter: IFileSystemAdapter): 'ripgrep' | 'remote-exec' | 'stream' {
    if (adapter.type === 'local') {
      return ToolPathResolver.hasRipgrep() ? 'ripgrep' : 'stream'
    }
    if (typeof adapter.exec === 'function') return 'remote-exec'
    return 'stream'
  }

  // ============ 引擎 1：ripgrep 子进程 ============

  private runRipgrep(
    task: TaskHandle<GrepTaskState>,
    request: GrepRequest,
    pushMatch: (match: GrepMatch) => boolean,
    finalize: () => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const rg = ToolPathResolver.getRipgrepExecutable()
      const args = [
        ...rgFlags(request.isRegex, request.caseSensitive),
        ...globsToRgArgs(request.includeGlob, request.excludeGlob),
        '--', request.pattern, request.rootPath
      ]
      const child = spawn(rg, args)
      task.state.child = child
      task.onCancel(() => { try { child.kill('SIGKILL') } catch { /* already exited */ } })

      let buffer = ''
      let overflow = false
      child.stdout.on('data', (chunk: Buffer) => {
        if (task.cancelled) return
        buffer += chunk.toString('utf-8')
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const match = parseGrepLine(line, request.rootPath)
          if (match) {
            if (!pushMatch(match)) { overflow = true; child.kill('SIGKILL'); return }
          }
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8').trim()
        if (text && !task.cancelled) log.warn('[Grep] rg stderr', { text: text.slice(0, 200) })
      })
      child.on('error', reject)
      child.on('close', code => {
        task.state.child = null
        if (task.cancelled) { resolve(); return }
        // rg: 0=有匹配 1=无匹配 2=错误；1 不是失败
        if (code === 2) reject(new Error(t('errors.main.grepRgExit2')))
        else resolve()
        void overflow
        finalize()
      })
    })
  }

  // ============ 引擎 2：远端 grep（SSH exec / adb shell） ============

  private async runRemoteGrep(
    adapter: IFileSystemAdapter,
    request: GrepRequest,
    pushMatch: (match: GrepMatch) => boolean,
    finalize: () => void
  ): Promise<void> {
    const { include, exclude } = globsToGrepArgs(request.includeGlob, request.excludeGlob)
    const flags = grepFlags(request.isRegex, request.caseSensitive)
    // 远端 cd 到 root 再执行：输出为相对路径，解析侧归一化；同时规避绝对路径含冒号歧义
    const command = [
      `cd ${shellQuote(request.rootPath)} &&`,
      `grep ${flags.join(' ')} ${include.join(' ')} ${exclude.join(' ')}`.replace(/\s+/g, ' ').trim(),
      `-e ${shellQuote(request.pattern)}`,
      '-r .'
    ].filter(Boolean).join(' ')

    const { stdout, code } = await adapter.exec!(command)
    if (code !== 0 && code !== 1) {
      throw new Error(t('errors.main.grepRemoteExit', { code }))
    }
    for (const line of stdout.split('\n')) {
      const match = parseGrepLine(line, request.rootPath)
      if (match && !pushMatch(match)) break
    }
    finalize()
  }

  // ============ 引擎 3：流式逐行扫描（SMB/WebDAV/本地无 rg） ============

  private async runStreamScan(
    task: TaskHandle<GrepTaskState>,
    adapter: IFileSystemAdapter,
    request: GrepRequest,
    setCurrentPath: (path: string) => void,
    pushMatch: (match: GrepMatch) => boolean,
    finalize: () => void
  ): Promise<void> {
    const matcher = createLineMatcher(request.pattern, request.isRegex, request.caseSensitive)
    const includeGlobs = (request.includeGlob ?? '').split(/[\s,]+/).filter(Boolean)
    const excludeGlobs = (request.excludeGlob ?? '').split(/[\s,]+/).filter(Boolean)
    const walker = new DirectoryWalker(this.devices)

    await walker.walk(request.deviceId, request.rootPath, () => task.cancelled, {
      fileFilter: file => {
        if (file.size > STREAM_ENGINE_MAX_FILE_BYTES) return false
        if (includeGlobs.length > 0 && !includeGlobs.some(glob => matchGlob(file.name, glob))) return false
        if (excludeGlobs.some(glob => matchGlob(file.name, glob))) return false
        return true
      },
      onFile: async file => {
        if (task.cancelled) return
        setCurrentPath(file.path)
        if (!adapter.openReadStream) return
        const stream = await adapter.openReadStream(file.path)
        try {
          let pending = ''
          let firstChunk = true
          let lineNo = 0
          for await (const chunkRaw of stream) {
            if (task.cancelled) { stream.destroy(); return }
            const chunk = chunkRaw as Buffer
            if (firstChunk) {
              firstChunk = false
              if (looksBinary(chunk)) return // 二进制跳过
            }
            pending += chunk.toString('utf-8')
            const lines = pending.split('\n')
            pending = lines.pop() ?? ''
            for (const line of lines) {
              lineNo++
              const index = matcher(line)
              if (index >= 0) {
                if (!pushMatch({ path: file.path, line: lineNo, lineText: truncateLine(line), matchStart: index, matchEnd: index + request.pattern.length })) {
                  stream.destroy()
                  return
                }
              }
            }
          }
          if (pending) {
            lineNo++
            const index = matcher(pending)
            if (index >= 0) {
              pushMatch({ path: file.path, line: lineNo, lineText: truncateLine(pending), matchStart: index, matchEnd: index + request.pattern.length })
            }
          }
        } finally {
          stream.destroy()
        }
      }
    })
    finalize()
  }
}

