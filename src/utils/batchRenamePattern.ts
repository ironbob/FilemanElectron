/**
 * 批量改名规则应用（纯函数，ROLE-L11）。
 *
 * 规则：前缀 + 序号(start/step/pad) + 查找替换；扩展名保持不变。
 * 输出重名（规则产生相同新名）→ conflicts 非空，调用方必须禁用提交。
 *
 * 设计依据：SRP/defensive_design —— 只做映射与冲突检测，不做 IPC/任务。
 */

export interface RenameSequenceRule {
  start: number
  step: number
  /** 序号最小位数，不足补零（如 3 → 001） */
  pad: number
}

export interface RenameRule {
  prefix?: string
  sequence?: RenameSequenceRule
  find?: string
  replace?: string
}

export interface RenameInput {
  path: string
  name: string
}

export interface RenamePreviewItem {
  sourcePath: string
  newName: string
}

export interface BuildRenameItemsResult {
  items: RenamePreviewItem[]
  /** 产生重复新名的源路径（含与规则内其他输出冲突者）；非空时禁用提交 */
  conflicts: string[]
}

export function buildRenameItems(files: RenameInput[], rule: RenameRule): BuildRenameItemsResult {
  const useSequence = !!rule.sequence
  const useFind = !!rule.find && rule.replace !== undefined
  const usePrefix = !!rule.prefix
  if (!useSequence && !useFind && !usePrefix) {
    return { items: files.map(f => ({ sourcePath: f.path, newName: f.name })), conflicts: [] }
  }

  const seq = rule.sequence ?? { start: 1, step: 1, pad: 0 }
  const seen = new Map<string, string>() // newName -> sourcePath（首个占有者）
  const conflicts = new Set<string>()
  const items: RenamePreviewItem[] = []

  files.forEach((file, i) => {
    const dot = file.name.lastIndexOf('.')
    const rawBase = dot > 0 ? file.name.slice(0, dot) : file.name
    const ext = dot > 0 ? file.name.slice(dot) : ''

    let base = usePrefix ? `${rule.prefix}${rawBase}` : rawBase
    if (useFind) {
      base = base.split(rule.find!).join(rule.replace!)
    }
    if (useSequence) {
      const n = seq.start + i * seq.step
      const numbered = String(n).padStart(Math.max(0, seq.pad), '0')
      // 有其它规则时序号追加在尾部；仅序号时作为完整新名（照片重排场景）
      base = usePrefix || useFind ? `${base}_${numbered}` : numbered
    }
    const newName = `${base}${ext}`

    if (newName === file.name) {
      items.push({ sourcePath: file.path, newName })
      return
    }
    const holder = seen.get(newName)
    if (holder !== undefined) {
      conflicts.add(holder)
      conflicts.add(file.path)
    } else {
      seen.set(newName, file.path)
    }
    items.push({ sourcePath: file.path, newName })
  })

  return { items, conflicts: [...conflicts] }
}
