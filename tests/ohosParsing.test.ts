/**
 * OHOS(hdc) 输出解析 — 最小断言 harness。
 * 覆盖 parseHdcListTargets 与 parseStatLines(`stat -c '%n|%F|%s|%Y|%a'` 自报文件名格式)。
 */

import assert from 'node:assert/strict'
import { parseHdcListTargets, parseStatLines } from '../electron/src/services/support/ohosParsing'

// ============ parseHdcListTargets ============

// 正常多设备(USB 序列号 + 网络目标混排)
{
  const stdout = '[Empty]\nSERIAL123\n127.0.0.1:5555\n'
  assert.deepEqual(parseHdcListTargets(stdout), ['SERIAL123', '127.0.0.1:5555'])
}

// 带表头/信息行/空行/CR 的容错
{
  const stdout = '\r\n[I] No device is connected now.\r\n\r\nEMULATOR-1\r\n\r\n'
  assert.deepEqual(parseHdcListTargets(stdout), ['EMULATOR-1'])
}

// 空输出与纯 [Empty]
assert.deepEqual(parseHdcListTargets(''), [])
assert.deepEqual(parseHdcListTargets('[Empty]\n'), [])

// ============ parseStatLines ============

// 单行:目录
{
  const out = parseStatLines('/storage/media|directory|4096|1723766400|755')
  assert.equal(out.length, 1)
  const e = out[0]!
  assert.equal(e.name, '/storage/media')
  assert.equal(e.kind, 'directory')
  assert.equal(e.size, 4096)
  assert.equal(e.mtimeMs, 1723766400 * 1000) // %Y 秒 → 毫秒
  assert.equal(e.mode, 0o755)                // %a 八进制 → 数值
}

// 单行:普通文件 / 符号链接 / 未知类型
{
  const out = parseStatLines('/data/a.txt|regular file|1024|1723766401|644')
  assert.equal(out[0]!.kind, 'file')
}
{
  const out = parseStatLines('/bin/sh|symbolic link|7|1723766402|777')
  assert.equal(out[0]!.kind, 'symlink')
  assert.equal(out[0]!.size, 7)
}
{
  const out = parseStatLines('/dev/tty|character special file|0|1723766403|666')
  assert.equal(out[0]!.kind, 'other')
}

// GNU stat 对空文件报 "regular empty file"(容错同 file)
{
  const out = parseStatLines('/tmp/empty|regular empty file|0|1723766404|644')
  assert.equal(out[0]!.kind, 'file')
}

// 批量:多行保持顺序,行自报文件名(与传参序无关也可正确映射)
{
  const stdout = '/b|directory|4096|1|755\n/a|regular file|10|2|644\n'
  const out = parseStatLines(stdout)
  assert.equal(out.length, 2)
  assert.equal(out[0]!.name, '/b')
  assert.equal(out[1]!.name, '/a')
}

// 文件名含空格(kind 字段允许空格,自右侧数字组定界)
{
  const out = parseStatLines('/data/My File Name.jpeg|regular file|204800|1723766405|600')
  assert.equal(out[0]!.name, '/data/My File Name.jpeg')
  assert.equal(out[0]!.size, 204800)
}

// 坏行 → null(顺序占位);空行跳过
{
  const stdout = '/ok|regular file|1|2|644\nthis-is-garbage\n/also-ok|directory|4|5|755\n'
  const out = parseStatLines(stdout)
  assert.equal(out.length, 3)
  assert.equal(out[0]!.name, '/ok')
  assert.equal(out[1], null)
  assert.equal(out[2]!.name, '/also-ok')
}

// 非数字 size/mtime/mode → null
assert.equal(parseStatLines('/x|regular file|NaN|1|644')[0], null)
assert.equal(parseStatLines('/x|regular file|10|abc|644')[0], null)
assert.equal(parseStatLines('/x|regular file|10|1|99z')[0], null)

// 空输出
assert.deepEqual(parseStatLines(''), [])

console.log('ohosParsing tests passed ✓')
