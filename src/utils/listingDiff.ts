import type { FileInfo } from '@shared/types'

/**
 * 目录列表差异判定（纯函数）—— watch 自动刷新的 diff 守卫。
 *
 * fs.watch 事件风暴 / 远程轮询推送到达时，先取一次新列表与当前列表比对，
 * 签名（name+size+mtime）无变化则不触发重载——保护选区与滚动位置，
 * 避免「深层事件 → 无意义整页刷新」。
 */

function entrySignature(file: FileInfo): string {
  // isDirectory 变化（文件↔目录同名替换）也必须触发刷新
  return `${file.isDirectory ? 1 : 0}:${file.size}:${file.modifiedTime}:${file.name}`
}

/** 两个列表的条目签名集合是否存在差异（与顺序无关）。 */
export function listingDiffers(current: FileInfo[], fresh: FileInfo[]): boolean {
  if (current.length !== fresh.length) return true
  const freshSignatures = new Set(fresh.map(entrySignature))
  for (const file of current) {
    if (!freshSignatures.has(entrySignature(file))) return true
  }
  return false
}
