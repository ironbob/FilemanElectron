/**
 * HexEditJournal —— hex 编辑日志（稀疏补丁 + Undo/Redo 栈）。
 *
 * 模型（piece-table 变体，全内存稀疏结构，纯同步无 IO）：
 *   逻辑文档 ≡ runs 串联。run 只有两种：
 *     - base  { start, length }   引用源文件不可变字节 [start, start+length)
 *     - edit  { bytes }           编辑写入的字节（拷贝入库，视为不可变）
 *   初始为单个 base run 覆盖全文件；覆写/插入/删除均为 run 切分手术，
 *   未编辑区域永远只是引用 —— 大文件下内存占用 ∝ 编辑量。
 *
 * 可逆操作（EditOp）：记录 offset + 被移除/新写入的内容片段。
 * 删除的内容在手术时从 run 结构自动捕获（base 区间或 edit 字节），
 * 调用方无需提供旧值。Undo = 逆手术（移除 inserted、放回 removed）；
 * Redo = 重放。栈序严格：新编辑清空 redo 栈。
 *
 * 合并（coalesce，供 P0-4 nibble 连续输入）：overwrite 且与栈顶
 * overwrite 同区间或左右相邻时并入栈顶（一步 Undo 还原一段输入）。
 * 正确性依赖：仅与栈顶（最后应用的 op）合并，所有更早 op 不受影响，
 * removed 片段描述的恰是栈顶应用前的内容。
 *
 * 不变量：
 *  - runs 串联长度 = logicalSize = fileSize + Σ(插入) − Σ(删除)；
 *  - base 物理区间互不重叠且按逻辑序递增（源文件的子序列）；
 *  - undo/redo 后 logicalSize 与字节内容与正演/逆演一致；
 *  - 一切非法入参（越界/负值/空字节）返回 null，不抛异常、不改状态；
 *  - 纯同步：base 数据读取由消费方通过 describe() 组合完成（DIP）。
 */

/** 内容片段：base 引用源文件区间；edit 持有编辑字节（不可变）。 */
export type ContentPiece =
  | { kind: 'base'; start: number; length: number }
  | { kind: 'edit'; bytes: Uint8Array }

/** 可逆编辑操作：offset 为应用时的逻辑偏移。 */
export interface EditOp {
  type: 'overwrite' | 'insert' | 'delete'
  offset: number
  /** 被移除的逻辑内容（顺序即文档序；insert 时为空）。 */
  removed: ContentPiece[]
  /** 新写入的内容（delete 时为空）。 */
  inserted: ContentPiece[]
}

/** 片段总字节数。 */
export function piecesLength(pieces: ContentPiece[]): number {
  let total = 0
  for (const piece of pieces) total += pieceLength(piece)
  return total
}

function pieceLength(piece: ContentPiece): number {
  return piece.kind === 'base' ? piece.length : piece.bytes.length
}

/**
 * 尝试把 b 并入栈顶同型操作 a（仅 overwrite）：
 * 同区间 → 保留 a.removed（还原到 a 之前的原始内容）；
 * 右相邻（b 在 a 尾部之后）→ 顺序拼接；左相邻 → 前插并平移 offset。
 * 不满足合并条件返回 null。
 */
function coalesceOps(a: EditOp, b: EditOp): EditOp | null {
  if (a.type !== 'overwrite' || b.type !== 'overwrite') return null
  const aLen = piecesLength(a.inserted)
  const bLen = piecesLength(b.inserted)
  if (b.offset === a.offset && bLen === aLen) {
    return { type: 'overwrite', offset: a.offset, removed: a.removed, inserted: b.inserted }
  }
  if (b.offset === a.offset + aLen) {
    return { type: 'overwrite', offset: a.offset, removed: [...a.removed, ...b.removed], inserted: [...a.inserted, ...b.inserted] }
  }
  if (b.offset + bLen === a.offset) {
    return { type: 'overwrite', offset: b.offset, removed: [...b.removed, ...a.removed], inserted: [...b.inserted, ...a.inserted] }
  }
  return null
}

export class HexEditJournal {
  /** 源文件大小（base 物理上界）。 */
  private readonly baseSize: number
  /** 逻辑文档的 run 串联（串联即文档；base 物理序递增）。 */
  private runs: ContentPiece[] = []
  private logicalSizeValue: number
  private readonly undoStack: EditOp[] = []
  private readonly redoStack: EditOp[] = []
  /** 最近保存时的 undo 栈深（isModified 基准；0 = 源文件态）。 */
  private savedDepth = 0

  constructor(fileSize: number) {
    this.baseSize = Number.isFinite(fileSize) && fileSize > 0 ? Math.floor(fileSize) : 0
    if (this.baseSize > 0) this.runs = [{ kind: 'base', start: 0, length: this.baseSize }]
    this.logicalSizeValue = this.baseSize
  }

  /** 逻辑文档大小（源大小 + 插入 − 删除）。 */
  get logicalSize(): number { return this.logicalSizeValue }

  /**
   * 是否存在未保存修改：undo 栈深偏离最近保存点。撤销回到保存点深度
   * 即视为未修改（栈序线性，内容 == 保存时内容）。
   */
  get isModified(): boolean { return this.undoStack.length !== this.savedDepth }

  /** 保存成功后打点（当前状态 = 已保存基准）。 */
  markSaved(): void {
    this.savedDepth = this.undoStack.length
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  /** 栈深（测试/调试）。 */
  get undoDepth(): number { return this.undoStack.length }
  get redoDepth(): number { return this.redoStack.length }

  /**
   * 覆写逻辑区间 [offset, offset+newBytes.length)。越界返回 null。
   * coalesce: true 时尝试并入栈顶（nibble 连续输入）。
   */
  overwrite(offset: number, newBytes: Uint8Array, options?: { coalesce?: boolean }): EditOp | null {
    return this.applyEdit('overwrite', offset, newBytes, newBytes.length, options?.coalesce === true)
  }

  /** 在逻辑 offset 处插入 bytes（允许 == logicalSize 追加）。 */
  insert(offset: number, bytes: Uint8Array): EditOp | null {
    return this.applyEdit('insert', offset, bytes, 0, false)
  }

  /** 删除逻辑区间 [offset, offset+length)。 */
  delete(offset: number, length: number): EditOp | null {
    if (!Number.isFinite(length) || length <= 0) return null
    return this.applyEdit('delete', offset, null, Math.floor(length), false)
  }

  /**
   * 描述逻辑区间 [offset, offset+length) 的内容来源（base 物理区间 /
   * 编辑字节），相邻 base 片段已合并；越界部分自动裁剪。消费方据此
   * 组合读取（base 经 HexWindowCache、edit 直取）。
   */
  describe(offset: number, length: number): ContentPiece[] {
    const from = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
    const end = Math.min(this.logicalSizeValue, from + (Number.isFinite(length) && length > 0 ? Math.floor(length) : 0))
    if (from >= end) return []
    const out: ContentPiece[] = []
    let logical = 0
    for (const run of this.runs) {
      const len = pieceLength(run)
      const runEnd = logical + len
      if (runEnd <= from) { logical = runEnd; continue }
      if (logical >= end) break
      const cutStart = Math.max(0, from - logical)
      const visibleLen = Math.min(runEnd, end) - logical - cutStart
      out.push(
        run.kind === 'base'
          ? { kind: 'base', start: run.start + cutStart, length: visibleLen }
          : { kind: 'edit', bytes: run.bytes.subarray(cutStart, cutStart + visibleLen) }
      )
      logical = runEnd
    }
    return mergeAdjacentBase(out)
  }

  /** 撤销栈顶操作（逆手术），返回该操作；栈空返回 null。 */
  undo(): EditOp | null {
    const op = this.undoStack.pop()
    if (!op) return null
    const insertedLen = piecesLength(op.inserted)
    const removedLen = piecesLength(op.removed)
    this.removeRange(op.offset, insertedLen)
    this.insertPieces(op.offset, op.removed)
    this.logicalSizeValue += removedLen - insertedLen
    this.redoStack.push(op)
    return op
  }

  /** 重放 redo 栈顶（恢复被撤销的操作），栈空返回 null。 */
  redo(): EditOp | null {
    const op = this.redoStack.pop()
    if (!op) return null
    const insertedLen = piecesLength(op.inserted)
    const removedLen = piecesLength(op.removed)
    this.removeRange(op.offset, removedLen)
    this.insertPieces(op.offset, op.inserted)
    this.logicalSizeValue += insertedLen - removedLen
    this.undoStack.push(op)
    return op
  }

  // ── 内部：run 手术 ────────────────────────────────────────────────────────

  /**
   * 应用编辑并压栈（或合并入栈顶）。newBytes=null 表示 delete；
   * removedLength 为待移除的逻辑长度（overwrite=新长度、insert=0、delete=指定长度）。
   */
  private applyEdit(
    type: 'overwrite' | 'insert' | 'delete',
    offset: number,
    newBytes: Uint8Array | null,
    removedLength: number,
    coalesce: boolean
  ): EditOp | null {
    if (!Number.isFinite(offset) || offset < 0) return null
    const at = Math.floor(offset)
    const newLen = newBytes ? newBytes.length : 0
    if (type !== 'delete' && newLen === 0) return null
    const size = this.logicalSizeValue
    if (type === 'insert') {
      if (at > size) return null
    } else if (at + removedLength > size) {
      return null
    }
    const removed = this.removeRange(at, removedLength)
    const inserted: ContentPiece[] = newBytes ? [{ kind: 'edit', bytes: newBytes.slice() }] : []
    this.insertPieces(at, inserted)
    this.logicalSizeValue += newLen - piecesLength(removed)
    const op: EditOp = { type, offset: at, removed, inserted }
    this.redoStack.length = 0  // 新编辑作废 redo 分支（标准语义）
    if (coalesce && type === 'overwrite') {
      const top = this.undoStack[this.undoStack.length - 1]
      // 合并屏障：仅与保存点之后压栈的 op 合并 —— 否则保存后的输入会被
      // 藏进已保存的栈顶 op（深度不变），脏状态漏报（isModified 依深度差）
      if (top && this.undoStack.length > this.savedDepth) {
        const merged = coalesceOps(top, op)
        if (merged) {
          this.undoStack[this.undoStack.length - 1] = merged
          return merged
        }
      }
    }
    this.undoStack.push(op)
    return op
  }

  /** 在 offset 处切分 run（mid-run 边界补齐；0/末尾无操作）。 */
  private sliceAt(offset: number): void {
    let logical = 0
    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i]
      const len = pieceLength(run)
      if (offset > logical && offset < logical + len) {
        const cut = offset - logical
        this.runs.splice(
          i, 1,
          run.kind === 'base'
            ? { kind: 'base', start: run.start, length: cut }
            : { kind: 'edit', bytes: run.bytes.subarray(0, cut) },
          run.kind === 'base'
            ? { kind: 'base', start: run.start + cut, length: len - cut }
            : { kind: 'edit', bytes: run.bytes.subarray(cut) }
        )
        return
      }
      logical += len
      if (logical >= offset) return
    }
  }

  /** 移除逻辑区间 [offset, offset+length)，返回被移除的片段（文档序）。 */
  private removeRange(offset: number, length: number): ContentPiece[] {
    if (length <= 0) return []
    this.sliceAt(offset)
    this.sliceAt(offset + length)
    const removed: ContentPiece[] = []
    let logical = 0
    let i = 0
    while (i < this.runs.length) {
      const run = this.runs[i]
      const len = pieceLength(run)
      const runStart = logical
      logical += len
      if (runStart >= offset && runStart + len <= offset + length) {
        removed.push(run)
        this.runs.splice(i, 1)
        if (logical >= offset + length) break
        continue  // splice 后下一 run 仍在原索引
      }
      if (runStart >= offset + length) break
      i++
    }
    return removed
  }

  /** 在 offset 边界处插入片段（前置：sliceAt 已保证边界存在）。 */
  private insertPieces(offset: number, pieces: ContentPiece[]): void {
    if (pieces.length === 0) return
    this.sliceAt(offset)
    let logical = 0
    let index = this.runs.length
    for (let i = 0; i < this.runs.length; i++) {
      if (logical === offset) { index = i; break }
      logical += pieceLength(this.runs[i])
    }
    this.runs.splice(index, 0, ...pieces)
  }
}

/** describe 输出收尾：物理相邻的 base 片段合并（减少消费方读取次数）。 */
function mergeAdjacentBase(pieces: ContentPiece[]): ContentPiece[] {
  const out: ContentPiece[] = []
  for (const piece of pieces) {
    const last = out[out.length - 1]
    if (
      piece.kind === 'base' && last && last.kind === 'base' &&
      last.start + last.length === piece.start
    ) {
      last.length += piece.length
      continue
    }
    out.push(piece)
  }
  return out
}
