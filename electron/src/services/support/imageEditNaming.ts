import path from 'path'

/**
 * 图片编辑输出路径命名策略（纯函数，ROLE-L03）。
 *
 * 设计依据：
 *  - SRP —— 只回答「输出文件写到哪里」；探测通过注入 exists 保持可测。
 *  - defensive_design —— copy 模式绝不返回已存在路径；冲突 -1 递增，
 *    上限 100 次后抛错（防同名风暴）。
 */

/** 输出格式 → 扩展名（不带点，小写）。keep 由调用方先解析成具体格式。 */
export function extensionForFormat(format: 'jpeg' | 'webp' | 'png'): string {
  return format === 'jpeg' ? 'jpg' : format
}

export interface ResolveOutputPathOptions {
  sourcePath: string
  mode: 'overwrite' | 'copy'
  /** 解析后的具体输出格式（'keep' 已在上游映射）。 */
  format: 'jpeg' | 'webp' | 'png'
  /** copy 模式后缀，默认 '_edited'。 */
  suffix?: string
  /** 存在性探测（注入以保持纯函数可测；生产传 fs.existsSync）。 */
  exists: (p: string) => boolean
}

/**
 * 计算唯一输出路径：
 * - overwrite → 原路径（临时文件与原子替换由服务层负责）；
 * - copy → `<name><suffix>.<ext>`，冲突时 `<name><suffix>-1.<ext>` 递增。
 * 扩展名随输出格式变化（jpg→webp 时输出 .webp）。
 */
export function resolveOutputPath(options: ResolveOutputPathOptions): string {
  const { sourcePath, mode, format, suffix = '_edited', exists } = options
  if (mode === 'overwrite') return sourcePath

  const dir = path.dirname(sourcePath)
  const base = path.basename(sourcePath, path.extname(sourcePath))
  const ext = extensionForFormat(format)
  const candidate = (n: number) => path.join(dir, `${base}${suffix}${n > 0 ? `-${n}` : ''}.${ext}`)

  for (let n = 0; n <= 100; n++) {
    const p = candidate(n)
    if (!exists(p)) return p
  }
  throw new Error(`无法生成唯一输出文件名（已尝试 100 个候选）：${candidate(0)}`)
}
