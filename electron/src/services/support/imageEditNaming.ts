import path from 'path'
import { t } from '../../i18n'

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
  /** copy 模式完整文件名（不含扩展名）；设置后忽略 suffix。 */
  name?: string
  /** copy 模式输出目录；缺省 = 原图所在目录。 */
  dir?: string
  /** 存在性探测（注入以保持纯函数可测；生产传 fs.existsSync）。 */
  exists: (p: string) => boolean
}

/**
 * 计算唯一输出路径：
 * - overwrite → 原路径（临时文件与原子替换由服务层负责）；
 * - copy → `<base><suffix>.<ext>`（指定 name 时 `<name>.<ext>`），
 *   冲突时 `-1` 递增。扩展名随输出格式变化（jpg→webp 时输出 .webp）。
 */
export function resolveOutputPath(options: ResolveOutputPathOptions): string {
  const { sourcePath, mode, format, suffix = '_edited', name, dir, exists } = options
  if (mode === 'overwrite') return sourcePath

  if (name !== undefined) {
    // 保存 Sheet「存储为」输入的完整文件名：只允许文件名字符（防路径注入）
    if (!name.trim() || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      throw new Error(t('errors.main.imageEditInvalidName', { name }))
    }
  }

  const outDir = dir ?? path.dirname(sourcePath)
  const base = name ?? path.basename(sourcePath, path.extname(sourcePath)) + suffix
  const ext = extensionForFormat(format)
  const candidate = (n: number) => path.join(outDir, `${base}${n > 0 ? `-${n}` : ''}.${ext}`)

  for (let n = 0; n <= 100; n++) {
    const p = candidate(n)
    if (!exists(p)) return p
  }
  throw new Error(t('errors.main.imageEditNameExhausted', { path: candidate(0) }))
}
