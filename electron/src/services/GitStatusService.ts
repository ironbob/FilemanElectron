import { execFile } from 'child_process'
import type { GitDirectoryStatus } from '@shared/types'
import { notARepoStatus, parseGitStatusZ, toDirectoryStatus } from './support/gitStatusParse'

const log = console

/** git 子进程超时：仓库过大/磁盘慢时不得拖住 IPC。 */
const GIT_TIMEOUT_MS = 5000
/** 非仓库目录的负结果缓存时长（避免每次导航都跑一次 rev-parse）。 */
const NOT_REPO_TTL_MS = 30_000
/** 仓库状态正结果缓存：默认不缓存（每次 status 全量查询，本地 exec 便宜），仅 TTL 负缓存。 */
const MAX_BUFFER = 16 * 1024 * 1024

interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

function execGit(args: string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }))
        return
      }
      resolve({ stdout: String(stdout), stderr: String(stderr), code: 0 })
    })
  })
}

/**
 * GitStatusService —— 本地目录 git 状态的只读查询。
 *
 * 设计依据：
 *  - SRP —— 只做「execFile git → 解析 → 契约对象」，不做缓存失效策略
 *    （渲染层 store 订阅 watch:changed 决定何时重取）与 UI。
 *  - 宿主级而非适配器级 —— git 是本机工具链概念，不是文件系统操作，
 *    不进 IFileSystemAdapter/DeviceManager（iOS/SMB 等「git 状态」无意义）。
 *  - execFile 参数数组 —— 沿用 HostShellService 的「无引号地狱」原则。
 *
 * 取舍：rev-parse 与 status 两次 exec（而非 status 后猜仓库根）——
 * porcelain 路径相对仓库根（实测确认），必须知道 repoRoot 才能转绝对路径。
 */
export class GitStatusService {
  /** 非仓库负缓存：dirPath → 过期时间戳。 */
  private readonly notRepoUntil = new Map<string, number>()

  async getStatus(dirPath: string): Promise<GitDirectoryStatus> {
    const cachedUntil = this.notRepoUntil.get(dirPath)
    if (cachedUntil !== undefined && Date.now() < cachedUntil) {
      return notARepoStatus()
    }

    // 1) 是否在仓库内 + 仓库根
    let repoRoot: string
    try {
      const rev = await execGit(['rev-parse', '--show-toplevel'], dirPath)
      repoRoot = rev.stdout.trim()
      if (!repoRoot.startsWith('/')) return this.rememberNotRepo(dirPath)
    } catch (error) {
      // "not a git repository" / git 未安装 / 超时 → 负结果
      log.info('[GitStatus] not a repo (or git unavailable)', { dirPath, message: error instanceof Error ? error.message.split('\n')[0] : String(error) })
      return this.rememberNotRepo(dirPath)
    }

    // 2) 状态快照（-z：NUL 分隔无引号转义；--branch：拿分支与 ahead/behind）
    try {
      const status = await execGit(['status', '--porcelain=v1', '-z', '--branch'], dirPath)
      return toDirectoryStatus(parseGitStatusZ(status.stdout), repoRoot)
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
      log.warn('[GitStatus] status failed', { dirPath, message })
      // 仓库存在但查询失败（如 index.lock 竞争）：返回 isRepo 但空 entries，不长时间负缓存
      return { isRepo: true, repoRoot, entries: [] }
    }
  }

  private rememberNotRepo(dirPath: string): GitDirectoryStatus {
    this.notRepoUntil.set(dirPath, Date.now() + NOT_REPO_TTL_MS)
    if (this.notRepoUntil.size > 200) {
      // 简单防膨胀：超限清掉已过期项
      const now = Date.now()
      for (const [key, until] of Array.from(this.notRepoUntil)) {
        if (until < now) this.notRepoUntil.delete(key)
      }
    }
    return notARepoStatus()
  }
}
