import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseResourceId,
  parseResourceTable,
  resolveResourceFilePaths,
  resolveResourceString,
  type ResourceLocale,
  type ResourceTable
} from '../electron/src/services/support/arscResources'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

// 夹具由 tests/fixtures/apk-resources/generate.sh 用 Android SDK 的 aapt / aapt2 生成；
// 资源 id 见 generate.sh 头部说明与 `aapt dump resources`。
const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'apk-resources')
const fixture = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, `${name}.arsc`))
const tableOf = (name: string): ResourceTable => parseResourceTable(fixture(name))
const arscError = /arsc/

const ZH_CN: ResourceLocale = { language: 'zh', country: 'CN' }
const EN_US: ResourceLocale = { language: 'en', country: 'US' }

/** 在表里定位首个指定 typeId 的 ResTable_type 块起点（测试改写偏移用）：表 → 包 → 子块。 */
function typeChunkOffset(buffer: Buffer, typeId: number): number {
  let cursor = buffer.readUInt16LE(2)
  while (cursor < buffer.length) {
    const type = buffer.readUInt16LE(cursor)
    const headerSize = buffer.readUInt16LE(cursor + 2)
    const size = buffer.readUInt32LE(cursor + 4)
    if (type === 0x0200) {
      let child = cursor + headerSize
      while (child < cursor + size) {
        const childType = buffer.readUInt16LE(child)
        const childSize = buffer.readUInt32LE(child + 4)
        if (childType === 0x0201 && buffer[child + 8] === typeId) return child
        child += childSize
      }
    }
    cursor += size
  }
  throw new Error(`no type chunk with id ${typeId}`)
}

// ============ parseResourceId ============

test('parseResourceId：apkreader 的 resourceId:0x… 形态 → 数字；字面量 / 空串 / 非字符串 / 超 32 位 → undefined', () => {
  assert.equal(parseResourceId('resourceId:0x7f10002c'), 0x7f10002c)
  assert.equal(parseResourceId('resourceId:0x7F0E0000'), 0x7f0e0000)
  assert.equal(parseResourceId('resourceId:0x0'), 0)
  assert.equal(parseResourceId('Open Camera'), undefined)
  assert.equal(parseResourceId(''), undefined)
  assert.equal(parseResourceId('@string/app_name'), undefined)
  assert.equal(parseResourceId('resourceId:7f10002c'), undefined)
  assert.equal(parseResourceId('resourceId:0x7f10002c '), undefined)
  assert.equal(parseResourceId('resourceId:0x100000000'), undefined)
  assert.equal(parseResourceId(0x7f10002c), undefined)
  assert.equal(parseResourceId(null), undefined)
  assert.equal(parseResourceId(undefined), undefined)
})

// ============ 夹具结构 ============

test('default-only（aapt，UTF-16 字符串池）：单包单类型，默认配置，字符串正确解码', () => {
  const table = tableOf('default-only')
  assert.deepEqual(table.packages.map(p => p.id), [0x7f])
  assert.equal(table.packages[0].types.length, 1)
  const [type] = table.packages[0].types
  assert.equal(type.id, 2)
  assert.equal(type.entryCount, 2)
  assert.equal(`${type.language}/${type.country}`, '/')
  assert.equal(type.sparse, false)
  assert.equal(type.offset16, false)
  assert.equal(table.strings.length, 1)
  assert.equal(table.strings.get(0), 'Default App')
})

test('zh-rCN（aapt）：三个 string 配置 = 默认 / en / zh-CN，语言国家按两字母解出', () => {
  const table = tableOf('zh-rCN')
  const locales = table.packages[0].types.map(t => `${t.language}-${t.country}`)
  assert.deepEqual(locales, ['-', 'en-', 'zh-CN'])
  assert.deepEqual(
    Array.from({ length: table.strings.length }, (_, i) => table.strings.get(i)).sort(),
    ['English App', 'Locale App', '区域应用'].sort()
  )
})

test('icons（aapt）：mipmap 四个配置密度 160 / 240 / 320 / ANY(0xfffe)，另有 drawable / array / string 类型', () => {
  const table = tableOf('icons')
  const byId = (id: number) => table.packages[0].types.filter(t => t.id === id)
  assert.deepEqual(byId(3).map(t => t.density), [160, 240, 320, 0xfffe])
  assert.deepEqual(byId(2).map(t => t.entryCount), [2])
  assert.deepEqual(byId(4).map(t => t.entryCount), [1])
  assert.deepEqual(byId(5).map(t => t.entryCount), [1])
})

test('sparse（aapt2 optimize，UTF-8 字符串池）：values-en 块为 SPARSE，仅含 2 项', () => {
  const table = tableOf('sparse')
  const sparseChunks = table.packages[0].types.filter(t => t.sparse)
  assert.equal(sparseChunks.length, 1)
  assert.equal(sparseChunks[0].language, 'en')
  assert.equal(sparseChunks[0].entryCount, 2)
  assert.equal(table.packages[0].types.find(t => !t.sparse)?.entryCount, 41)
  assert.equal(table.strings.get(table.strings.length - 1).includes('English'), true)
})

// ============ resolveResourceString：按 locale 取应用名 ============

test('zh-rCN：zh-CN → 区域应用；en-US → English App；无 locale → 默认 Locale App', () => {
  const table = tableOf('zh-rCN')
  const APP_NAME = 0x7f020000
  assert.equal(resolveResourceString(table, APP_NAME, ZH_CN), '区域应用')
  assert.equal(resolveResourceString(table, APP_NAME, EN_US), 'English App')
  assert.equal(resolveResourceString(table, APP_NAME), 'Locale App')
  assert.equal(resolveResourceString(table, APP_NAME, undefined), 'Locale App')
})

test('zh-rCN：zh-TW / fr-FR / 仅语言 zh 都回退默认（无「仅语言」配置时其它区域的变体不优先）', () => {
  const table = tableOf('zh-rCN')
  const APP_NAME = 0x7f020000
  assert.equal(resolveResourceString(table, APP_NAME, { language: 'zh', country: 'TW' }), 'Locale App')
  assert.equal(resolveResourceString(table, APP_NAME, { language: 'fr', country: 'FR' }), 'Locale App')
  assert.equal(resolveResourceString(table, APP_NAME, { language: 'zh', country: '' }), 'Locale App')
  assert.equal(resolveResourceString(table, APP_NAME, { language: '', country: '' }), 'Locale App')
})

test('default-only：zh-CN 下回退默认 Default App', () => {
  const table = tableOf('default-only')
  assert.equal(resolveResourceString(table, 0x7f020000, ZH_CN), 'Default App')
  assert.equal(resolveResourceString(table, 0x7f020000), 'Default App')
})

test('不存在的条目 / 类型 / 包 → undefined', () => {
  const table = tableOf('default-only')
  assert.equal(resolveResourceString(table, 0x7f020005), undefined)
  assert.equal(resolveResourceString(table, 0x7f030000), undefined)
  assert.equal(resolveResourceString(table, 0x01020000), undefined)
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f030000), [])
})

// ============ TYPE_REFERENCE 跟一跳 ============

test('default-only：@string/app_name 别名（TYPE_REFERENCE）跟一跳 → Default App；路径解析不跟引用', () => {
  const table = tableOf('default-only')
  assert.equal(resolveResourceString(table, 0x7f020001, ZH_CN), 'Default App')
  assert.equal(resolveResourceString(table, 0x7f020001), 'Default App')
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f020001), [])
})

// ============ resolveResourceFilePaths：图标按密度降序 ============

test('icons：PNG 路径按密度 xhdpi → hdpi → mdpi，ANYDPI 的自适应图标 XML 排在其后；默认配置无图标', () => {
  const table = tableOf('icons')
  const ICON = 0x7f030000
  assert.deepEqual(resolveResourceFilePaths(table, ICON), [
    'res/mipmap-xhdpi-v4/ic_launcher.png',
    'res/mipmap-hdpi-v4/ic_launcher.png',
    'res/mipmap-mdpi-v4/ic_launcher.png',
    'res/mipmap-anydpi-v26/ic_launcher.xml'
  ])
  // 字符串解析只取首个可解析配置（默认等级里密度最高的在文件顺序里并不保证，此处仅断言是某张 PNG）
  assert.match(resolveResourceString(table, ICON) ?? '', /^res\/mipmap-(mdpi|hdpi|xhdpi)-v4\/ic_launcher\.png$/)
})

test('icons：string-array（复杂条目，bag 内含字符串路径）被跳过——既不当作字符串也不当作路径', () => {
  const table = tableOf('icons')
  const ARRAY = 0x7f040000
  // 前提：bag 的 map 值确实在全局字符串池里，证明下面的 undefined / [] 是「跳过复杂条目」而非「没有数据」
  const poolHasHint = Array.from({ length: table.strings.length }, (_, i) => table.strings.get(i))
    .includes('res/not-a-real-file.png')
  assert.equal(poolHasHint, true)
  assert.equal(resolveResourceString(table, ARRAY), undefined)
  assert.equal(resolveResourceString(table, ARRAY, ZH_CN), undefined)
  assert.deepEqual(resolveResourceFilePaths(table, ARRAY), [])
})

test('icons：drawable 两条目各自解析到自己的文件', () => {
  const table = tableOf('icons')
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f020000), ['res/drawable/ic_launcher_background.png'])
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f020001), ['res/drawable/ic_launcher_foreground.png'])
})

// ============ SPARSE ============

test('sparse：SPARSE 块里的条目按 idx 二分取到；块里没有的条目回退默认配置', () => {
  const table = tableOf('sparse')
  // str_7 = 0x7f010026、str_39 = 0x7f010022 在 values-en（SPARSE）；str_4 = 0x7f010023 只在默认配置
  assert.equal(resolveResourceString(table, 0x7f010026, EN_US), 'English 7')
  assert.equal(resolveResourceString(table, 0x7f010026, { language: 'en', country: 'GB' }), 'English 7')
  assert.equal(resolveResourceString(table, 0x7f010026, ZH_CN), 'Default 7')
  assert.equal(resolveResourceString(table, 0x7f010026), 'Default 7')
  assert.equal(resolveResourceString(table, 0x7f010022, EN_US), 'English 39')
  assert.equal(resolveResourceString(table, 0x7f010023, EN_US), 'Default 4')
  assert.equal(resolveResourceString(table, 0x7f010000, EN_US), 'Sparse App')
  // 两块密度都为默认 → 保持表内顺序（默认配置在前）
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f010026), ['Default 7', 'English 7'])
})

// ============ OFFSET16（手工改写：aapt / aapt2 35.0.0 都不会生成 16 位偏移表）============

test('OFFSET16：u16 偏移数组（×4）与 0xffff NO_ENTRY 正确解码', () => {
  const buffer = Buffer.from(fixture('icons'))
  const start = typeChunkOffset(buffer, 2) // drawable：2 条目，偏移数组 [0, 16]
  const headerSize = buffer.readUInt16LE(start + 2)
  const entryCount = buffer.readUInt32LE(start + 12)
  assert.equal(entryCount, 2)
  assert.deepEqual(
    Array.from({ length: entryCount }, (_, i) => buffer.readUInt32LE(start + headerSize + i * 4)),
    [0, 16]
  )
  // 改写成 OFFSET16：flags |= 0x02，偏移数组换成 u16 且以 4 字节为单位；第二项置 NO_ENTRY16
  buffer[start + 9] |= 0x02
  buffer.writeUInt16LE(0, start + headerSize)
  buffer.writeUInt16LE(0xffff, start + headerSize + 2)
  const table = parseResourceTable(buffer)
  const type = table.packages[0].types.find(t => t.id === 2)
  assert.equal(type?.offset16, true)
  assert.equal(type?.entryCount, 2)
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f020000), ['res/drawable/ic_launcher_background.png'])
  assert.deepEqual(resolveResourceFilePaths(table, 0x7f020001), [])
  assert.equal(resolveResourceString(table, 0x7f020001), undefined)
})

// ============ 损坏 / 截断 / 垃圾输入 ============

test('空缓冲区 / 全零 / 文本垃圾 → 抛 arsc 错误，不返回半截数据', () => {
  assert.throws(() => parseResourceTable(Buffer.alloc(0)), arscError)
  assert.throws(() => parseResourceTable(Buffer.alloc(64)), arscError)
  assert.throws(() => parseResourceTable(Buffer.alloc(4096, 0xff)), arscError)
  assert.throws(() => parseResourceTable(Buffer.from('hello world, this is not a resource table')), arscError)
  assert.throws(() => parseResourceTable(Buffer.from([0x02, 0x00, 0x0c, 0x00, 0xff, 0xff, 0xff, 0x7f, 1, 0, 0, 0])), arscError)
})

test('非 Buffer 入参 → 抛 arsc 错误', () => {
  assert.throws(() => parseResourceTable(new Uint8Array(16) as unknown as Buffer), /expected a Buffer/)
})

test('四个夹具在任意位置截断（逐字节）都抛错，绝不返回部分解析结果', () => {
  for (const name of ['default-only', 'zh-rCN', 'icons', 'sparse']) {
    const full = fixture(name)
    assert.equal(parseResourceTable(full).packages.length, 1)
    for (const cut of [0, 1, 7, 8, 11, 12, 13, 20, 28, 40, 100, full.length - 1, full.length - 8]) {
      assert.throws(() => parseResourceTable(full.subarray(0, cut)), arscError, `${name} truncated to ${cut}`)
    }
  }
})

test('块头 / 偏移被改坏（顶层块类型未知、字符串池越界、entriesStart 越界、条目数虚高）→ 抛错', () => {
  const full = fixture('icons')
  // 顶层第一个子块不是字符串池
  const badTopType = Buffer.from(full)
  const stringPoolAt = badTopType.readUInt16LE(2)
  badTopType.writeUInt16LE(0x0203, stringPoolAt)
  assert.throws(() => parseResourceTable(badTopType), /expected string pool chunk/)
  // 字符串池 stringCount 虚高 → 偏移数组越界
  const badCount = Buffer.from(full)
  badCount.writeUInt32LE(0x7fffffff, stringPoolAt + 8)
  assert.throws(() => parseResourceTable(badCount), /string pool offsets out of bounds/)
  // 字符串池 stringsStart 落到偏移数组里
  const badStringsStart = Buffer.from(full)
  badStringsStart.writeUInt32LE(29, stringPoolAt + 20)
  assert.throws(() => parseResourceTable(badStringsStart), /overlaps its offsets/)
  // TYPE 块 entriesStart 超出块长
  const badEntriesStart = Buffer.from(full)
  badEntriesStart.writeUInt32LE(0x7fffffff, typeChunkOffset(badEntriesStart, 3) + 16)
  assert.throws(() => parseResourceTable(badEntriesStart), /entriesStart .* beyond type chunk/)
  // TYPE 块 entryCount 虚高 → 偏移数组越界
  const badEntryCount = Buffer.from(full)
  badEntryCount.writeUInt32LE(0x7fffffff, typeChunkOffset(badEntryCount, 3) + 12)
  assert.throws(() => parseResourceTable(badEntryCount), /entry offsets out of bounds/)
  // TYPE 块 headerSize 放得下固定部分与要读的 config 字段，但小于 config 自身长度
  const badHeaderSize = Buffer.from(full)
  badHeaderSize.writeUInt16LE(40, typeChunkOffset(badHeaderSize, 3) + 2)
  assert.throws(() => parseResourceTable(badHeaderSize), /smaller than its config/)
  // 条目区被截短（chunk size 缩小到放不下条目）
  const badChunkSize = Buffer.from(full)
  const typeAt = typeChunkOffset(badChunkSize, 3)
  badChunkSize.writeUInt32LE(badChunkSize.readUInt32LE(typeAt + 16) + 4, typeAt + 4)
  assert.throws(() => parseResourceTable(badChunkSize), /entry out of bounds/)
})

test('单个条目的值损坏（字符串下标越界）只让该条目取不到，不抛错也不拖垮其它条目', () => {
  const buffer = Buffer.from(fixture('default-only'))
  const typeAt = typeChunkOffset(buffer, 2)
  const entriesStart = buffer.readUInt32LE(typeAt + 16)
  // app_name 的条目在 entriesStart + 0：ResTable_entry(8) + Res_value(8)，data 在 +12
  const entryAt = typeAt + entriesStart
  assert.equal(buffer.readUInt16LE(entryAt), 8)
  buffer.writeUInt32LE(0x7fffffff, entryAt + 12)
  const table = parseResourceTable(buffer)
  assert.equal(resolveResourceString(table, 0x7f020000), undefined)
  assert.equal(resolveResourceString(table, 0x7f020001, ZH_CN), undefined) // 引用指向的正是损坏条目
})

console.log(`\narscResources: ${passed} tests passed`)
