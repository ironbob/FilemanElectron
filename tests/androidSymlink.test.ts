/**
 * AndroidAdapter 符号链接类型解析 — 最小断言 harness。
 * adb sync LIST/STAT 返回链接自身 mode(S_IFLNK),适配器须 stat -L 跟随:
 * 指向目录的链接(如 /sdcard)按目录呈现,断链回退链接自身属性。
 * 私有 device/runShell 以桩注入,不依赖真机与 adbkit。
 */

import assert from 'node:assert/strict'
import { AndroidAdapter } from '../electron/src/adapters/AndroidAdapter'

const S_IFLNK = 0o120000
const S_IFDIR = 0o040000
const S_IFREG = 0o100000

function entry(name: string, mode: number, size = 0, mtimeMs = 0) {
  return {
    name,
    mode,
    size,
    mtimeMs,
    isDirectory: () => (mode & 0o170000) === S_IFDIR,
    isFile: () => (mode & 0o170000) === S_IFREG,
    isSymbolicLink: () => (mode & 0o170000) === S_IFLNK,
  }
}

interface ShellCall { cmd: string }

function makeAdapter(opts: {
  entries?: ReturnType<typeof entry>[]
  statEntry?: ReturnType<typeof entry>
  shell?: (cmd: string) => string
}) {
  const adapter = new AndroidAdapter('test', 'test')
  const calls: ShellCall[] = []
  const device = {
    readdir: async () => opts.entries ?? [],
    stat: async () => opts.statEntry ?? entry('x', S_IFREG),
  }
  ;(adapter as any).connected = true
  ;(adapter as any).device = device
  ;(adapter as any).runShell = async (cmd: string) => {
    calls.push({ cmd })
    if (!opts.shell) throw new Error('unexpected shell call')
    return opts.shell(cmd)
  }
  return { adapter, calls }
}

async function main() {
  // ============ list:目录链接按目录呈现 ============

  {
    const { adapter, calls } = makeAdapter({
      entries: [
        entry('sdcard', S_IFLNK | 0o644, 21, 1230768000000),
        entry('DCIM', S_IFDIR | 0o755),
        entry('notes.txt', S_IFREG | 0o644, 100, 1700000000000),
        entry('broken', S_IFLNK | 0o644, 9, 0),
      ],
      // sdcard → 目录(45f8), broken → 断链(0 0)
      shell: () => '45f8 1794041056\n0 0\n',
    })
    const files = await adapter.list('/')
    assert.equal(calls.length, 1, '符号链接应合并为一条 shell 批量解析')
    assert.match(calls[0].cmd, /stat -L/)
    assert.match(calls[0].cmd, /'\/sdcard'/)
    assert.match(calls[0].cmd, /'\/broken'/)
    assert.ok(!calls[0].cmd.includes("'\/DCIM'"), '非链接条目不应参与解析')

    const sdcard = files.find(f => f.name === 'sdcard')!
    assert.equal(sdcard.isDirectory, true)
    assert.equal(sdcard.isFile, false)
    assert.equal(sdcard.extension, undefined)
    assert.equal(sdcard.modifiedTime, new Date(1794041056 * 1000).toISOString(), 'mtime 应取目标而非链接')
    assert.equal(sdcard.path, '/sdcard')

    const dcim = files.find(f => f.name === 'DCIM')!
    assert.equal(dcim.isDirectory, true)

    const notes = files.find(f => f.name === 'notes.txt')!
    assert.equal(notes.isFile, true)
    assert.equal(notes.extension, '.txt')

    const broken = files.find(f => f.name === 'broken')!
    assert.equal(broken.isDirectory, false, '断链不得误标为目录')
    assert.equal(broken.isFile, true)
  }

  // ============ list:无链接时零 shell 开销 ============

  {
    const { adapter, calls } = makeAdapter({
      entries: [entry('DCIM', S_IFDIR | 0o755), entry('a.txt', S_IFREG | 0o644)],
    })
    const files = await adapter.list('/sdcard')
    assert.equal(calls.length, 0)
    assert.equal(files.length, 2)
  }

  // ============ list:解析失败不阻断列表 ============

  {
    const { adapter } = makeAdapter({
      entries: [entry('sdcard', S_IFLNK | 0o644)],
      shell: () => { throw new Error('shell unavailable') },
    })
    const files = await adapter.list('/')
    assert.equal(files.length, 1)
    assert.equal(files[0].isDirectory, false, '解析失败按链接自身类型呈现')
  }

  // ============ stat:跟随目录链接 ============

  {
    const { adapter, calls } = makeAdapter({
      statEntry: entry('sdcard', S_IFLNK | 0o644, 21, 0),
      shell: () => '45f8 3452 1794041056',
    })
    const st = await adapter.stat('/sdcard')
    assert.equal(calls.length, 1)
    assert.equal(st.isDirectory, true)
    assert.equal(st.isFile, false)
    assert.equal(st.size, 3452)
    assert.equal(st.mode, 0x45f8)
    assert.equal(st.modifiedTime, new Date(1794041056 * 1000).toISOString())
  }

  // ============ stat:断链回退链接自身属性 ============

  {
    const { adapter } = makeAdapter({
      statEntry: entry('broken', S_IFLNK | 0o644, 9, 1230768000000),
      shell: () => { throw new Error('命令失败(code=1)') },
    })
    const st = await adapter.stat('/broken')
    assert.equal(st.isDirectory, false)
    assert.equal(st.size, 9)
    assert.equal(st.mode, S_IFLNK | 0o644)
  }

  // ============ stat:普通文件不触发 shell ============

  {
    const { adapter, calls } = makeAdapter({
      statEntry: entry('a.txt', S_IFREG | 0o644, 100, 1700000000000),
    })
    const st = await adapter.stat('/a.txt')
    assert.equal(calls.length, 0)
    assert.equal(st.isFile, true)
    assert.equal(st.size, 100)
  }
  console.log('androidSymlink.test.ts: all assertions passed')
}

main().catch(e => { console.error(e); process.exit(1) })
