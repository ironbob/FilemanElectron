/**
 * HexEditJournal 编辑日志 — 最小断言 harness。
 * 固定场景（覆写/插入/删除/合并/非法入参/describe 裁剪）+
 * 数组参考模型随机压力测试（compose 与模型逐字节一致、logicalSize 恒等、
 * undo/redo 逆演一致）。
 */

import assert from 'node:assert/strict'
import { HexEditJournal, piecesLength, type ContentPiece, type EditOp } from '../src/utils/hexEditJournal'

const BASE_SIZE = 32
const base = new Uint8Array(BASE_SIZE)
for (let i = 0; i < BASE_SIZE; i++) base[i] = (i * 7 + 3) % 256

/** compose：describe 片段 + base → 逻辑文档字节数组。 */
function compose(journal: HexEditJournal, baseBytes: Uint8Array, offset = 0, length = journal.logicalSize): number[] {
  const out: number[] = []
  for (const piece of journal.describe(offset, length)) {
    if (piece.kind === 'base') {
      for (let i = 0; i < piece.length; i++) out.push(baseBytes[piece.start + i])
    } else {
      for (const b of piece.bytes) out.push(b)
    }
  }
  return out
}

function piecesToNumbers(pieces: ContentPiece[], baseBytes: Uint8Array): number[] {
  return compose({ describe: () => pieces, logicalSize: 0 } as unknown as HexEditJournal, baseBytes)
}

const baseNumbers = Array.from(base)

// ============ 初始状态 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  assert.equal(j.logicalSize, BASE_SIZE)
  assert.equal(j.isModified, false)
  assert.equal(j.canUndo, false)
  assert.equal(j.canRedo, false)
  assert.equal(j.undo(), null)
  const whole = j.describe(0, BASE_SIZE)
  assert.equal(whole.length, 1)
  assert.deepEqual(whole[0], { kind: 'base', start: 0, length: BASE_SIZE })
}

// ============ 覆写：单字节 + describe 合并相邻 base ============

{
  const j = new HexEditJournal(BASE_SIZE)
  const op = j.overwrite(5, new Uint8Array([0xaa]))
  assert.ok(op)
  assert.equal(op.type, 'overwrite')
  assert.deepEqual(op.removed, [{ kind: 'base', start: 5, length: 1 }])
  assert.equal(j.isModified, true)
  // describe：base[0,5) + edit + base[6,32) —— 相邻 base 合并成两段
  const pieces = j.describe(0, BASE_SIZE)
  assert.equal(pieces.length, 3)
  assert.deepEqual(pieces[0], { kind: 'base', start: 0, length: 5 })
  assert.equal(pieces[1].kind, 'edit')
  assert.deepEqual(pieces[2], { kind: 'base', start: 6, length: 26 })
  // compose 与原文仅差一个字节
  const expect = [...baseNumbers]; expect[5] = 0xaa
  assert.deepEqual(compose(j, base), expect)
  // undo → 完全还原；redo → 回到已改
  assert.ok(j.undo())
  assert.deepEqual(compose(j, base), baseNumbers)
  assert.equal(j.isModified, false)
  assert.equal(j.canRedo, true)
  assert.ok(j.redo())
  assert.equal(compose(j, base)[5], 0xaa)
}

// ============ 覆写：跨既有补丁边界 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(10, new Uint8Array([1, 2]))
  j.overwrite(13, new Uint8Array([3]))
  const op = j.overwrite(9, new Uint8Array([9, 9, 9, 9, 9]))  // 覆盖 [9,14)：跨 10-11 补丁 + 原始 12 + 13 补丁
  assert.ok(op)
  assert.equal(piecesLength(op.removed), 5)
  const expect = [...baseNumbers]
  expect.splice(9, 5, 9, 9, 9, 9, 9)
  assert.deepEqual(compose(j, base), expect)
}

// ============ 插入：中间 / 行首 / 追加 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  assert.ok(j.insert(4, new Uint8Array([0xde, 0xad])))
  assert.equal(j.logicalSize, BASE_SIZE + 2)
  const expect = [...baseNumbers]
  expect.splice(4, 0, 0xde, 0xad)
  assert.deepEqual(compose(j, base), expect)
  // undo 还原大小与内容
  assert.ok(j.undo())
  assert.equal(j.logicalSize, BASE_SIZE)
  assert.deepEqual(compose(j, base), baseNumbers)

  assert.ok(j.insert(0, new Uint8Array([0x01])))          // 行首
  assert.ok(j.insert(j.logicalSize, new Uint8Array([0x02]))) // 追加
  assert.equal(compose(j, base)[0], 0x01)
  assert.equal(compose(j, base)[j.logicalSize - 1], 0x02)
  assert.equal(j.undoDepth, 2 + 0)  // 此前 undo 已清栈
}

// ============ 删除：混合 base+edit 区间，undo 字节级还原 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(3, new Uint8Array([0x11, 0x22, 0x33]))
  const op = j.delete(2, 4)  // [2,6)：原始 2 + 补丁 11 22 33 + 原始 5
  assert.ok(op)
  assert.equal(op.type, 'delete')
  assert.equal(piecesLength(op.removed), 4)
  assert.equal(j.logicalSize, BASE_SIZE - 4)
  const after = [...baseNumbers]; after.splice(2, 4)
  assert.deepEqual(compose(j, base), after)
  assert.ok(j.undo())
  const restored = [...baseNumbers]
  restored[3] = 0x11; restored[4] = 0x22; restored[5] = 0x33
  assert.deepEqual(compose(j, base), restored)  // 补丁内容随 undo 恢复
  assert.equal(j.logicalSize, BASE_SIZE)
}

// ============ 合并（coalesce）：nibble 连续输入的三种形态 ============

// 同区间（同一字节两次 nibble 输入）
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(5, new Uint8Array([0xa0]), { coalesce: true })
  j.overwrite(5, new Uint8Array([0xab]), { coalesce: true })
  assert.equal(j.undoDepth, 1)
  assert.equal(compose(j, base)[5], 0xab)
  j.undo()
  assert.deepEqual(compose(j, base), baseNumbers)  // 一步还原原始字节
}
// 右相邻（顺序输入）
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(10, new Uint8Array([1]), { coalesce: true })
  j.overwrite(11, new Uint8Array([2]), { coalesce: true })
  j.overwrite(12, new Uint8Array([3]), { coalesce: true })
  assert.equal(j.undoDepth, 1)
  j.undo()
  assert.deepEqual(compose(j, base), baseNumbers)
}
// 左相邻（回退输入）
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(10, new Uint8Array([1]), { coalesce: true })
  j.overwrite(9, new Uint8Array([2]), { coalesce: true })
  assert.equal(j.undoDepth, 1)
  j.undo()
  assert.deepEqual(compose(j, base), baseNumbers)
}
// 不相邻 / 显式不合并 / 栈顶异型 → 不合并
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(10, new Uint8Array([1]), { coalesce: true })
  j.overwrite(14, new Uint8Array([2]), { coalesce: true })
  assert.equal(j.undoDepth, 2)
  j.overwrite(10, new Uint8Array([7]))  // coalesce 缺省 false
  assert.equal(j.undoDepth, 3)
  j.delete(0, 1)
  j.overwrite(11, new Uint8Array([8]), { coalesce: true })  // 栈顶是 delete
  assert.equal(j.undoDepth, 5)
}

// ============ markSaved：保存基准与脏状态 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(0, new Uint8Array([1]))
  assert.equal(j.isModified, true)
  j.markSaved()
  assert.equal(j.isModified, false)       // 保存后未修改
  assert.ok(j.undo())                     // 撤销回保存点之前 → 又变脏
  assert.equal(j.isModified, true)
  assert.ok(j.redo())                     // 回到保存点 → 干净
  assert.equal(j.isModified, false)
  j.overwrite(2, new Uint8Array([2]))     // 保存后新编辑 → 脏
  assert.equal(j.isModified, true)
  j.markSaved()
  assert.equal(j.isModified, false)
}

// 合并屏障：保存后对同一字节的 coalesce 输入不得并入已保存的栈顶 op
// （否则深度不变 → 脏状态漏报）
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(5, new Uint8Array([0xa0]), { coalesce: true })
  j.overwrite(5, new Uint8Array([0xab]), { coalesce: true })  // 同区间合并 → depth 1
  assert.equal(j.undoDepth, 1)
  j.markSaved()
  j.overwrite(5, new Uint8Array([0xcd]), { coalesce: true })  // 屏障：不并入已保存 op
  assert.equal(j.undoDepth, 2)
  assert.equal(j.isModified, true)
  // 保存后的新输入之间仍正常合并（同区间替换 inserted）
  j.overwrite(5, new Uint8Array([0xef]), { coalesce: true })
  assert.equal(j.undoDepth, 2)
  assert.equal(j.isModified, true)
}

// ============ redo 分支作废 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(0, new Uint8Array([1]))
  j.overwrite(1, new Uint8Array([2]))
  assert.ok(j.undo())
  assert.equal(j.canRedo, true)
  j.overwrite(2, new Uint8Array([3]))  // 新编辑 → redo 作废
  assert.equal(j.canRedo, false)
  assert.equal(j.redoDepth, 0)
  assert.equal(j.undoDepth, 2)
}

// ============ 非法入参（不改状态） ============

{
  const j = new HexEditJournal(BASE_SIZE)
  assert.equal(j.overwrite(BASE_SIZE - 1, new Uint8Array([1, 2])), null)  // 越界
  assert.equal(j.overwrite(-1, new Uint8Array([1])), null)
  assert.equal(j.insert(-1, new Uint8Array([1])), null)
  assert.equal(j.insert(BASE_SIZE + 1, new Uint8Array([1])), null)
  assert.equal(j.delete(0, BASE_SIZE + 1), null)
  assert.equal(j.delete(0, 0), null)
  assert.equal(j.overwrite(0, new Uint8Array(0)), null)
  assert.equal(j.overwrite(Number.NaN, new Uint8Array([1])), null)
  assert.equal(j.isModified, false)  // 全部被拒绝，状态未变
  assert.deepEqual(compose(j, base), baseNumbers)
}

// ============ describe 裁剪与空文件 ============

{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(5, new Uint8Array([0xff]))
  // 越界长度裁剪到末尾；负偏移收敛到 0
  const pieces = j.describe(3, 1000)
  assert.equal(piecesLength(pieces), BASE_SIZE - 3)
  const fromZero = j.describe(-5, 10)
  assert.equal(piecesLength(fromZero), 10)
  assert.deepEqual(fromZero[0], { kind: 'base', start: 0, length: 5 })
  assert.equal(j.describe(100, 5).length, 0)  // 起点越界 → 空

  const empty = new HexEditJournal(0)
  assert.equal(empty.logicalSize, 0)
  assert.equal(empty.overwrite(0, new Uint8Array([1])), null)
  assert.ok(empty.insert(0, new Uint8Array([0x42])))  // 空文件可插入
  assert.deepEqual(compose(empty, new Uint8Array(0)), [0x42])
}

// ============ 随机压力：参考模型逐字节对照 ============

{
  const SIZE = 64
  const stressBase = new Uint8Array(SIZE)
  for (let i = 0; i < SIZE; i++) stressBase[i] = (i * 13 + 7) % 256
  const j = new HexEditJournal(SIZE)
  const model: number[] = Array.from(stressBase)

  // LCG 确定性随机
  let seed = 42
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const applyToModel = (op: EditOp) => {
    const removedLen = piecesLength(op.removed)
    const inserted = piecesToNumbers(op.inserted, stressBase)
    model.splice(op.offset, removedLen, ...inserted)
  }
  const undoToModel = (op: EditOp) => {
    const insertedLen = piecesLength(op.inserted)
    const removed = piecesToNumbers(op.removed, stressBase)
    model.splice(op.offset, insertedLen, ...removed)
  }

  for (let step = 0; step < 300; step++) {
    const roll = rand()
    let op: EditOp | null = null
    let forward = false  // 正向编辑（需 applyToModel；undo/redo 分支自行同步）
    if (roll < 0.3 && j.logicalSize > 0) {
      // 覆写：合法区间内随机
      const len = 1 + Math.floor(rand() * 4)
      const maxStart = j.logicalSize - len
      if (maxStart >= 0) {
        op = j.overwrite(Math.floor(rand() * (maxStart + 1)), new Uint8Array(Array.from({ length: len }, () => Math.floor(rand() * 256))))
        forward = true
      }
    } else if (roll < 0.5) {
      // 插入：任意位置（含追加）
      const len = 1 + Math.floor(rand() * 3)
      op = j.insert(Math.floor(rand() * (j.logicalSize + 1)), new Uint8Array(Array.from({ length: len }, () => Math.floor(rand() * 256))))
      forward = true
    } else if (roll < 0.65 && j.logicalSize > 1) {
      // 删除：合法区间
      const len = 1 + Math.floor(rand() * Math.min(5, j.logicalSize))
      const maxStart = j.logicalSize - len
      op = j.delete(Math.floor(rand() * (maxStart + 1)), len)
      forward = true
    } else if (roll < 0.85 && j.canUndo) {
      op = j.undo()
      if (op) undoToModel(op)
    } else if (j.canRedo) {
      op = j.redo()
      if (op) applyToModel(op)
    }
    if (op && forward) applyToModel(op)
    assert.equal(j.logicalSize, model.length, `step ${step} logicalSize`)
    assert.deepEqual(compose(j, stressBase), model, `step ${step} 内容一致`)
    assert.equal(j.isModified, j.undoDepth > 0, `step ${step} isModified`)
  }
}

// ============ dirtyRanges（未保存修改的字节标记） ============

// 初始无脏区间；覆写点亮、相邻覆写合并为一段
{
  const j = new HexEditJournal(BASE_SIZE)
  assert.deepEqual(j.dirtyRanges(), [])
  j.overwrite(4, new Uint8Array([1]))
  j.overwrite(5, new Uint8Array([2]))
  assert.deepEqual(j.dirtyRanges(), [{ start: 4, length: 2 }])
  j.overwrite(10, new Uint8Array([3]))
  assert.deepEqual(j.dirtyRanges(), [{ start: 4, length: 2 }, { start: 10, length: 1 }])
}

// markSaved 清零全部脏区间；保存后再编辑重新点亮
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(4, new Uint8Array([9]))
  assert.equal(j.isModified, true)
  j.markSaved()
  assert.deepEqual(j.dirtyRanges(), [])
  assert.equal(j.isModified, false)
  j.overwrite(4, new Uint8Array([8]))
  assert.deepEqual(j.dirtyRanges(), [{ start: 4, length: 1 }])
  // undo 回到保存点 → 脏清零（深度差语义 + 区间一致）
  j.undo()
  assert.deepEqual(j.dirtyRanges(), [])
  assert.equal(j.isModified, false)
}

// 撤销/重做随 run 结构自然增减；redo 恢复脏标记
{
  const j = new HexEditJournal(BASE_SIZE)
  j.overwrite(2, new Uint8Array([7]))
  j.undo()
  assert.deepEqual(j.dirtyRanges(), [])
  j.redo()
  assert.deepEqual(j.dirtyRanges(), [{ start: 2, length: 1 }])
}

// 插入的字节为脏；撤销插入后脏区间消失
{
  const j = new HexEditJournal(BASE_SIZE)
  j.insert(4, new Uint8Array([1, 2, 3]))
  assert.deepEqual(j.dirtyRanges(), [{ start: 4, length: 3 }])
  j.undo()
  assert.deepEqual(j.dirtyRanges(), [])
}

// 删除不产生区间（结构性变更由 isModified 表达）；删除后重插内容为脏
{
  const j = new HexEditJournal(BASE_SIZE)
  j.delete(4, 2)
  assert.deepEqual(j.dirtyRanges(), [])
  assert.equal(j.isModified, true)
  j.insert(4, new Uint8Array([5, 6]))
  assert.deepEqual(j.dirtyRanges(), [{ start: 4, length: 2 }])
}

console.log('✓ hexEditJournal 稀疏补丁 + Undo/Redo 测试全部通过')
