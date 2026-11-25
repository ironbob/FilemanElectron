/**
 * resources.arsc（ResTable）精简解析器 —— 纯函数、无依赖（不 import electron /
 * adbkit / apkreader / i18n），供 ApkInfoService 把 Manifest 里的资源引用
 * （apkreader 给出的 'resourceId:0x7f10002c'）解析成应用名字符串与图标文件路径。
 *
 *  - 只实现本功能需要的子集：表头、全局字符串池、ResTable_type 的条目偏移与
 *    简单值（TYPE_STRING / TYPE_REFERENCE，含 FLAG_COMPACT 紧凑条目）；复杂条目
 *    （style / string-array 等 bag）视为取不到。二进制布局依据 AOSP
 *    libs/androidfw/ResourceTypes.h，全部小端。
 *  - 防御损坏 / 恶意输入：所有偏移与长度读取前做边界检查，越界、截断、顶层未知块头
 *    一律抛带「arsc」字样的 Error（调用方按「取不到」降级），不返回半截数据；包内不认识的
 *    子块类型（如 LIBRARY / OVERLAYABLE）按已校验的 size 跳过。
 *  - 解析期只校验结构；字符串与条目值按需解码（大表不至于为取一个应用名解码上万条）。
 */

export interface ResourceLocale {
  /** 两字母语言码（小写，如 'zh'），空串表示不限。 */
  language: string
  /** 两字母国家码（大写，如 'CN'），空串表示不限。 */
  country: string
}

export interface ResourceStringPool {
  readonly length: number
  /** 按下标取字符串；下标越界或内容损坏抛 arsc 错误。 */
  get(index: number): string
}

/** 一个 ResTable_type：某资源类型在一种配置（语言 / 国家 / 密度…）下的条目表。 */
export interface ResourceTypeChunk {
  /** 资源 id 的 typeId 段（(id >>> 16) & 0xff）。 */
  id: number
  language: string
  country: string
  /** 原始密度值：0 默认、0xfffe ANY、0xffff 无、其余为 dpi。 */
  density: number
  entryCount: number
  sparse: boolean
  offset16: boolean
  /** 条目偏移数组的绝对起点（= 块起点 + headerSize，headerSize 已含变长的 ResTable_config）。 */
  offsetsStart: number
  /** 条目数据的绝对起点（= 块起点 + entriesStart）。 */
  dataStart: number
  /** 块末尾的绝对位置。 */
  end: number
}

export interface ResourcePackage {
  /** 资源 id 的 packageId 段（id >>> 24），应用自身资源通常为 0x7f。 */
  id: number
  types: ResourceTypeChunk[]
}

export interface ResourceTable {
  buffer: Buffer
  strings: ResourceStringPool
  packages: ResourcePackage[]
}

const RES_STRING_POOL_TYPE = 0x0001
const RES_TABLE_TYPE = 0x0002
const RES_TABLE_PACKAGE_TYPE = 0x0200
const RES_TABLE_TYPE_TYPE = 0x0201

const STRING_POOL_UTF8_FLAG = 0x100
const TYPE_FLAG_SPARSE = 0x01
const TYPE_FLAG_OFFSET16 = 0x02
const ENTRY_FLAG_COMPLEX = 0x01
/** 紧凑条目：dataType 放在 flags 高 8 位，data 直接放在条目里（无独立 Res_value）。 */
const ENTRY_FLAG_COMPACT = 0x08
const NO_ENTRY = 0xffffffff
const NO_ENTRY16 = 0xffff
/** 0xfffe = ANYDPI；0xffff（NONE）与它同组处理。 */
const DENSITY_ANY = 0xfffe

const TYPE_REFERENCE = 0x01
const TYPE_STRING = 0x03

const CHUNK_HEADER_SIZE = 8
/** ResStringPool_header：块头 + 5 个 u32。 */
const STRING_POOL_HEADER_SIZE = 28
/** ResTable_package：块头 + id + name[128] + 4 个 u32（可选的 typeIdOffset 不计入）。 */
const PACKAGE_HEADER_SIZE = 284
/** ResTable_type 固定部分：块头 + id / flags / reserved(u16) / entryCount(u32) / entriesStart(u32)。 */
const TYPE_FIXED_SIZE = 20
/** 本功能要读的 config 字段（语言 +8、国家 +10、密度 +14，相对 config 起点）止于 +16。 */
const CONFIG_FIELDS_SIZE = 16

const RESOURCE_ID_PATTERN = /^resourceId:0x([0-9a-f]+)$/i

function fail(message: string): never {
  throw new Error(`resources.arsc: ${message}`)
}

/** 断言 [offset, offset + length) 落在 [start, end) 内，否则按损坏输入抛错。 */
function assertWithin(start: number, end: number, offset: number, length: number, what: string): void {
  if (offset < start || offset + length > end) fail(`${what} out of bounds`)
}

interface ChunkHeader {
  type: number
  headerSize: number
  /** 含块头的总长；子块区间为 [start + headerSize, start + size)。 */
  size: number
}

function readChunkHeader(buffer: Buffer, start: number, end: number, what: string): ChunkHeader {
  assertWithin(start, end, start, CHUNK_HEADER_SIZE, `${what} header`)
  const type = buffer.readUInt16LE(start)
  const headerSize = buffer.readUInt16LE(start + 2)
  const size = buffer.readUInt32LE(start + 4)
  if (headerSize < CHUNK_HEADER_SIZE) fail(`${what} headerSize ${headerSize} < ${CHUNK_HEADER_SIZE}`)
  if (size < headerSize) fail(`${what} size ${size} smaller than headerSize ${headerSize}`)
  assertWithin(start, end, start, size, what)
  return { type, headerSize, size }
}

function expectChunkType(header: ChunkHeader, expected: number, what: string): void {
  if (header.type !== expected) {
    fail(`expected ${what} chunk 0x${expected.toString(16)}, got 0x${header.type.toString(16)}`)
  }
}

// ── 字符串池 ────────────────────────────────────────────────────────────────

/** 字符串长度前缀（u8 宽度）：最高位为 1 时占两个单元。返回 [长度, 下一个读取位置]。 */
function readLength8(buffer: Buffer, pos: number, end: number): [number, number] {
  assertWithin(pos, end, pos, 1, 'length prefix')
  const first = buffer[pos]
  if ((first & 0x80) === 0) return [first, pos + 1]
  assertWithin(pos, end, pos, 2, 'length prefix')
  return [((first & 0x7f) << 8) | buffer[pos + 1], pos + 2]
}

/** 字符串长度前缀（u16 宽度）：最高位为 1 时占两个单元。 */
function readLength16(buffer: Buffer, pos: number, end: number): [number, number] {
  assertWithin(pos, end, pos, 2, 'length prefix')
  const first = buffer.readUInt16LE(pos)
  if ((first & 0x8000) === 0) return [first, pos + 2]
  assertWithin(pos, end, pos, 4, 'length prefix')
  return [((first & 0x7fff) << 16) | buffer.readUInt16LE(pos + 2), pos + 4]
}

function decodeString(buffer: Buffer, pos: number, end: number, utf8: boolean): string {
  if (utf8) {
    // 先 UTF-16 字符数（解码用不到），再 UTF-8 字节数，然后字节 + NUL
    const [, afterChars] = readLength8(buffer, pos, end)
    const [byteLength, bytesStart] = readLength8(buffer, afterChars, end)
    assertWithin(pos, end, bytesStart, byteLength + 1, 'UTF-8 string')
    if (buffer[bytesStart + byteLength] !== 0) fail('UTF-8 string is not NUL terminated')
    return buffer.toString('utf8', bytesStart, bytesStart + byteLength)
  }
  const [length, unitsStart] = readLength16(buffer, pos, end)
  const bytes = length * 2
  assertWithin(pos, end, unitsStart, bytes + 2, 'UTF-16 string')
  if (buffer.readUInt16LE(unitsStart + bytes) !== 0) fail('UTF-16 string is not NUL terminated')
  return buffer.toString('utf16le', unitsStart, unitsStart + bytes)
}

function parseStringPool(buffer: Buffer, start: number, end: number): ResourceStringPool {
  const header = readChunkHeader(buffer, start, end, 'string pool')
  expectChunkType(header, RES_STRING_POOL_TYPE, 'string pool')
  if (header.headerSize < STRING_POOL_HEADER_SIZE) {
    fail(`string pool headerSize ${header.headerSize} < ${STRING_POOL_HEADER_SIZE}`)
  }
  const stringCount = buffer.readUInt32LE(start + 8)
  const styleCount = buffer.readUInt32LE(start + 12)
  const flags = buffer.readUInt32LE(start + 16)
  const stringsStart = buffer.readUInt32LE(start + 20)
  const poolEnd = start + header.size
  const offsetsStart = start + header.headerSize
  const offsetsBytes = stringCount * 4
  // 样式偏移数组紧跟字符串偏移数组（内容不用，但必须不越界）
  assertWithin(start, poolEnd, offsetsStart, offsetsBytes + styleCount * 4, 'string pool offsets')
  const dataStart = start + stringsStart
  if (stringCount > 0 && stringsStart < header.headerSize + offsetsBytes + styleCount * 4) {
    fail('string pool data overlaps its offsets')
  }
  const utf8 = (flags & STRING_POOL_UTF8_FLAG) !== 0
  const cache = new Map<number, string>()
  return {
    length: stringCount,
    get(index: number): string {
      if (!Number.isInteger(index) || index < 0 || index >= stringCount) {
        fail(`string index ${index} out of range (${stringCount})`)
      }
      const cached = cache.get(index)
      if (cached !== undefined) return cached
      const offset = buffer.readUInt32LE(offsetsStart + index * 4)
      const value = decodeString(buffer, dataStart + offset, poolEnd, utf8)
      cache.set(index, value)
      return value
    }
  }
}

// ── 包与类型块 ──────────────────────────────────────────────────────────────

/**
 * 语言 / 国家：两个 7-bit 字符打包成一个 u16（低字节是首字母）。
 * 首字节带 0x80 的是三字母语言编码：解成不会与两字母语言码相等的非默认值（按「不匹配」处理）。
 */
function unpackLocaleWord(word: number): string {
  if (word === 0) return ''
  const first = word & 0xff
  if ((first & 0x80) !== 0) return `\u0080${String.fromCharCode(first & 0x7f, (word >> 8) & 0x7f)}`
  return String.fromCharCode(first & 0x7f, (word >> 8) & 0x7f)
}

/** 偏移数组第 index 项对应的条目绝对起点；该项为 NO_ENTRY 时返回 undefined。 */
function itemOffset(buffer: Buffer, chunk: ResourceTypeChunk, index: number): number | undefined {
  if (chunk.sparse) {
    // SPARSE 项为 {u16 idx, u16 offset}，offset 以 4 字节为单位（条目 4 字节对齐）
    const offset = buffer.readUInt16LE(chunk.offsetsStart + index * 4 + 2)
    return offset === NO_ENTRY16 ? undefined : chunk.dataStart + offset * 4
  }
  if (chunk.offset16) {
    // OFFSET16：u16 数组，同样以 4 字节为单位
    const offset = buffer.readUInt16LE(chunk.offsetsStart + index * 2)
    return offset === NO_ENTRY16 ? undefined : chunk.dataStart + offset * 4
  }
  const offset = buffer.readUInt32LE(chunk.offsetsStart + index * 4)
  return offset === NO_ENTRY ? undefined : chunk.dataStart + offset
}

/** 条目 entryId 的绝对起点；该配置下没有此条目返回 undefined。 */
function entryOffsetAt(buffer: Buffer, chunk: ResourceTypeChunk, entryId: number): number | undefined {
  if (!chunk.sparse) return entryId < chunk.entryCount ? itemOffset(buffer, chunk, entryId) : undefined
  // SPARSE 项按 idx 升序，二分查找
  let lo = 0
  let hi = chunk.entryCount
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (buffer.readUInt16LE(chunk.offsetsStart + mid * 4) < entryId) lo = mid + 1
    else hi = mid
  }
  if (lo >= chunk.entryCount || buffer.readUInt16LE(chunk.offsetsStart + lo * 4) !== entryId) return undefined
  return itemOffset(buffer, chunk, lo)
}

function parseTypeChunk(buffer: Buffer, start: number, header: ChunkHeader): ResourceTypeChunk {
  if (header.headerSize < TYPE_FIXED_SIZE + CONFIG_FIELDS_SIZE) {
    fail(`type chunk headerSize ${header.headerSize} too small`)
  }
  const id = buffer.readUInt8(start + 8)
  const flags = buffer.readUInt8(start + 9)
  const entryCount = buffer.readUInt32LE(start + 12)
  const entriesStart = buffer.readUInt32LE(start + 16)
  const configStart = start + TYPE_FIXED_SIZE
  const configSize = buffer.readUInt32LE(configStart)
  if (configSize < CONFIG_FIELDS_SIZE) fail(`ResTable_config size ${configSize} too small`)
  if (header.headerSize < TYPE_FIXED_SIZE + configSize) {
    fail(`type chunk headerSize ${header.headerSize} smaller than its config`)
  }
  const sparse = (flags & TYPE_FLAG_SPARSE) !== 0
  const offset16 = (flags & TYPE_FLAG_OFFSET16) !== 0
  const offsetsStart = start + header.headerSize
  const offsetsBytes = entryCount * (sparse || !offset16 ? 4 : 2)
  const chunk: ResourceTypeChunk = {
    id,
    language: unpackLocaleWord(buffer.readUInt16LE(configStart + 8)),
    country: unpackLocaleWord(buffer.readUInt16LE(configStart + 10)),
    density: buffer.readUInt16LE(configStart + 14),
    entryCount,
    sparse,
    offset16,
    offsetsStart,
    dataStart: start + entriesStart,
    end: start + header.size
  }
  assertWithin(start, chunk.end, offsetsStart, offsetsBytes, 'entry offsets')
  if (header.headerSize + offsetsBytes > entriesStart) fail('entry offsets overlap entry data')
  if (entriesStart > header.size) fail(`entriesStart ${entriesStart} beyond type chunk`)
  // 解析期即校验每个在册条目的头都落在块内，截断 / 垃圾输入不留到取值阶段
  for (let index = 0; index < entryCount; index++) {
    const entryStart = itemOffset(buffer, chunk, index)
    if (entryStart !== undefined) assertWithin(chunk.dataStart, chunk.end, entryStart, 8, 'entry')
  }
  return chunk
}

function parsePackage(buffer: Buffer, start: number, end: number): ResourcePackage {
  const header = readChunkHeader(buffer, start, end, 'package')
  expectChunkType(header, RES_TABLE_PACKAGE_TYPE, 'package')
  if (header.headerSize < PACKAGE_HEADER_SIZE) {
    fail(`package headerSize ${header.headerSize} < ${PACKAGE_HEADER_SIZE}`)
  }
  const id = buffer.readUInt32LE(start + 8)
  const types: ResourceTypeChunk[] = []
  const packageEnd = start + header.size
  let cursor = start + header.headerSize
  while (cursor < packageEnd) {
    const chunk = readChunkHeader(buffer, cursor, packageEnd, 'package child')
    if (chunk.type === RES_TABLE_TYPE_TYPE) {
      types.push(parseTypeChunk(buffer, cursor, chunk))
    }
    // 其余子块（包内 typeStrings / keyStrings 字符串池、typeSpec，以及 LIBRARY / OVERLAYABLE 等
    // 本功能不认识的类型）头已校验、按 size 跳过即可，不影响已解析的条目数据
    cursor += chunk.size
  }
  return { id, types }
}

// ── 导出 API ────────────────────────────────────────────────────────────────

/** apkreader 的资源引用形态 'resourceId:0x7f10002c' → 数字 id；字面量、空串、非字符串返回 undefined。 */
export function parseResourceId(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = RESOURCE_ID_PATTERN.exec(value)
  if (!match) return undefined
  const id = Number.parseInt(match[1], 16)
  return id <= 0xffffffff ? id : undefined
}

/**
 * 解析 resources.arsc 全量结构（表头、全局字符串池、各包的 ResTable_type）。
 * 越界 / 截断 / 未知块头一律抛带「arsc」字样的 Error，不返回半截数据。
 */
export function parseResourceTable(buffer: Buffer): ResourceTable {
  if (!Buffer.isBuffer(buffer)) fail('expected a Buffer')
  const end = buffer.length
  const header = readChunkHeader(buffer, 0, end, 'table')
  expectChunkType(header, RES_TABLE_TYPE, 'table')
  if (header.headerSize < 12) fail(`table headerSize ${header.headerSize} < 12`)
  const packageCount = buffer.readUInt32LE(CHUNK_HEADER_SIZE)
  let strings: ResourceStringPool | undefined
  const packages: ResourcePackage[] = []
  let cursor = header.headerSize
  while (cursor < header.size) {
    const chunk = readChunkHeader(buffer, cursor, header.size, 'table child')
    if (strings) packages.push(parsePackage(buffer, cursor, cursor + chunk.size))
    else strings = parseStringPool(buffer, cursor, cursor + chunk.size)
    cursor += chunk.size
  }
  if (!strings) fail('table has no string pool')
  if (packages.length !== packageCount) {
    fail(`package count ${packageCount} does not match ${packages.length} parsed packages`)
  }
  return { buffer, strings, packages }
}

interface EntryValue {
  dataType: number
  data: number
}

/** 条目 entryId 的简单值；复杂条目（bag：style、string-array 等）返回 undefined。 */
function readEntryValue(buffer: Buffer, chunk: ResourceTypeChunk, entryId: number): EntryValue | undefined {
  const entryStart = entryOffsetAt(buffer, chunk, entryId)
  if (entryStart === undefined) return undefined
  const entryFlags = buffer.readUInt16LE(entryStart + 2)
  if ((entryFlags & ENTRY_FLAG_COMPLEX) !== 0) return undefined
  if ((entryFlags & ENTRY_FLAG_COMPACT) !== 0) return { dataType: entryFlags >>> 8, data: buffer.readUInt32LE(entryStart + 4) }
  const entrySize = buffer.readUInt16LE(entryStart)
  if (entrySize < 8) fail(`entry size ${entrySize} < 8`)
  const valueStart = entryStart + entrySize
  assertWithin(entryStart, chunk.end, valueStart, 8, 'entry value')
  if (buffer.readUInt16LE(valueStart) < 8) fail('entry value size < 8')
  return { dataType: buffer[valueStart + 3], data: buffer.readUInt32LE(valueStart + 4) }
}

/** 全局字符串池取值；单个条目损坏不拖垮整次查找，按取不到处理。 */
function safePoolString(table: ResourceTable, index: number): string | undefined {
  try {
    return table.strings.get(index)
  } catch {
    return undefined
  }
}

function chunksFor(table: ResourceTable, resourceId: number): ResourceTypeChunk[] {
  const pkg = table.packages.find(candidate => candidate.id === resourceId >>> 24)
  if (!pkg) return []
  const typeId = (resourceId >>> 16) & 0xff
  return pkg.types.filter(type => type.id === typeId)
}

/** 配置对当前语言的匹配等级：0 语言+国家、1 仅语言、2 默认、3 其它（兜底）。 */
function localeTier(chunk: ResourceTypeChunk, locale: ResourceLocale | undefined): number {
  if (locale && locale.language) {
    if (chunk.language === locale.language && chunk.country === locale.country) return 0
    if (chunk.language === locale.language && !chunk.country) return 1
  }
  return !chunk.language && !chunk.country ? 2 : 3
}

/**
 * 把资源引用解析成字符串（应用名）：在所有 typeId 匹配的配置里按
 * 语言+国家 → 仅语言 → 默认 → 其它 的顺序取第一个能解析出字符串的。
 * TYPE_STRING 取全局字符串池；TYPE_REFERENCE 只跟一跳；复杂条目跳过。
 */
export function resolveResourceString(table: ResourceTable, resourceId: number, locale?: ResourceLocale): string | undefined {
  return resolveString(table, resourceId, locale, true)
}

function resolveString(table: ResourceTable, resourceId: number, locale: ResourceLocale | undefined, followReference: boolean): string | undefined {
  const chunks = chunksFor(table, resourceId)
  const entryId = resourceId & 0xffff
  for (let tier = 0; tier <= 3; tier++) {
    for (const chunk of chunks) {
      if (localeTier(chunk, locale) !== tier) continue
      const value = readEntryValue(table.buffer, chunk, entryId)
      if (!value) continue
      if (value.dataType === TYPE_STRING) return safePoolString(table, value.data)
      if (value.dataType === TYPE_REFERENCE && followReference && value.data !== resourceId) {
        const referenced = resolveString(table, value.data, locale, false)
        if (referenced !== undefined) return referenced
      }
    }
  }
  return undefined
}

/** 密度排序值：数值 dpi 越大越靠前；ANY / NONE 居中；默认（0）最后。 */
function densityRank(density: number): number {
  if (density === 0) return 0
  if (density >= DENSITY_ANY) return 0.5
  return density
}

/**
 * 把资源引用解析成 APK 内文件路径列表（图标）：收集该条目在所有配置里的简单字符串值，
 * 复杂条目（自适应图标 XML）跳过；按密度从高到低排序后去重，由调用方挑第一个能读到的。
 */
export function resolveResourceFilePaths(table: ResourceTable, resourceId: number): string[] {
  const entryId = resourceId & 0xffff
  const candidates: Array<{ path: string; rank: number }> = []
  for (const chunk of chunksFor(table, resourceId)) {
    const value = readEntryValue(table.buffer, chunk, entryId)
    if (!value || value.dataType !== TYPE_STRING) continue
    const path = safePoolString(table, value.data)
    if (path) candidates.push({ path, rank: densityRank(chunk.density) })
  }
  // sort 稳定：同密度保持表内顺序
  candidates.sort((a, b) => b.rank - a.rank)
  const seen = new Set<string>()
  const paths: string[] = []
  for (const { path } of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }
  return paths
}
