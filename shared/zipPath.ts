/**
 * ZIP 虚拟路径协议（单一事实源，main 与 renderer 共用）
 *
 * 一个位于 ZIP 内部的路径编码为 `"<zipFilePath>::<innerPath>"`（分隔符
 * 字面量 '::'）。此前该解析逻辑有三份手写实现（electron/main.ts、
 * src/stores/tabs.ts、src/components/FilePane.vue），边界处理已出现方言
 * （如结尾 '/' 是否归一）。本模块收敛全部解析/构造/导航操作：
 *
 * 约定（IFC-1/IFC-2 契约）：
 * - innerPath 归一化：无结尾 '/'，'' 表示 ZIP 根。
 * - 往返一致：joinZipPath(parse(p)) === 归一化(p)。
 * - zipVirtualParent：inner 非根 → 去掉最后一段；inner 为根 → 退到 ZIP
 *   文件所在的文件系统父目录（根目录兜底 '/'）。
 */

export const ZIP_PATH_SEP = '::'

/** 路径是否为 ZIP 虚拟路径（包含 '::' 分隔符）。 */
export function isZipVirtualPath(p: string): boolean {
  return p.includes(ZIP_PATH_SEP)
}

/**
 * 解析虚拟路径。容错：无 '::' 时视为普通文件系统路径（zipFilePath=p、
 * innerPath=''）。innerPath 已归一化（无结尾 '/'，'' 表示 ZIP 根）。
 */
export function parseZipVirtualPath(p: string): { zipFilePath: string; innerPath: string } {
  const idx = p.indexOf(ZIP_PATH_SEP)
  if (idx === -1) {
    return { zipFilePath: p, innerPath: '' }
  }
  const zipFilePath = p.slice(0, idx)
  const rawInner = p.slice(idx + ZIP_PATH_SEP.length)
  return { zipFilePath, innerPath: normalizeInnerPath(rawInner) }
}

/** 归一化 ZIP 内部路径：去结尾 '/'，'' 表示根。 */
function normalizeInnerPath(innerPath: string): string {
  return innerPath.replace(/\/+$/, '')
}

/** 构造虚拟路径。innerPath 为 '' 或 '/' 时表示 ZIP 根（`<zip>::`）。 */
export function joinZipPath(zipFilePath: string, innerPath: string): string {
  const inner = normalizeInnerPath(innerPath)
  return inner ? `${zipFilePath}${ZIP_PATH_SEP}${inner}` : `${zipFilePath}${ZIP_PATH_SEP}`
}

/**
 * 向上一级（goUp 语义）：
 * - inner 非根 → ZIP 内部去最后一段；
 * - inner 为根 → 退出到 ZIP 文件所在的文件系统父目录（'/' 兜底）。
 * 前置条件：isZipVirtualPath(p) === true。
 */
export function zipVirtualParent(p: string): string {
  const { zipFilePath, innerPath } = parseZipVirtualPath(p)
  const parts = innerPath.split('/').filter(Boolean)
  if (parts.length > 0) {
    parts.pop()
    return joinZipPath(zipFilePath, parts.join('/'))
  }
  // Already at ZIP root → exit to the ZIP file's parent directory.
  const fsParent = zipFilePath.split('/').slice(0, -1).join('/') || '/'
  return fsParent
}

/**
 * 面包屑 segments：ZIP 文件宿主路径段 + 内部路径段（FilePane 现语义）。
 * 非虚拟路径直接返回文件系统路径段。
 */
export function zipBreadcrumbSegments(p: string): string[] {
  const { zipFilePath, innerPath } = parseZipVirtualPath(p)
  const fsSegments = zipFilePath.split('/').filter(Boolean)
  const innerSegs = innerPath ? innerPath.split('/').filter(Boolean) : []
  return [...fsSegments, ...innerSegs]
}
