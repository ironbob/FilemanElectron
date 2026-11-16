import type { FileInfo } from '@/types'
import { IMAGE_EXTENSIONS_WITH_DOT, isImageFile } from './fileTypes'

/**
 * 收集目录下的图片（集合预览唯一数据源）：递归 = 主进程 search 一次收集
 * （空 pattern 匹配全部），非递归 = 该目录直接子级。按路径数值序排序。
 */
export async function scanFolderImages(deviceId: string, folderPath: string, recursive: boolean): Promise<FileInfo[]> {
  const entries = recursive
    ? await window.fileman.search(deviceId, folderPath, { pattern: '', fileTypes: IMAGE_EXTENSIONS_WITH_DOT })
    : await window.fileman.listFiles(deviceId, folderPath)
  return entries
    .filter(entry => !entry.isDirectory && isImageFile(entry.extension || ''))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

/** collectionKey（`${deviceId}:${folderPath}:${'recursive'|'flat'}`）解析。 */
export function parseCollectionKey(key: string): { deviceId: string; root: string; recursive: boolean } | null {
  const recursive = key.endsWith(':recursive')
  if (!recursive && !key.endsWith(':flat')) return null
  const base = key.slice(0, key.lastIndexOf(':'))
  const colon = base.indexOf(':')
  if (colon < 0) return null
  return { deviceId: base.slice(0, colon), root: base.slice(colon + 1), recursive }
}
