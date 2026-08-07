/**
 * ZipService – ZIP archive browsing via Central Directory parsing.
 *
 * Strategy: read the whole ZIP file into a Buffer (cached by mtime) so that all
 * offset arithmetic operates on a plain in-memory slice – no fd/readSync drift.
 * Individual entry data is decompressed on-demand using node:zlib.
 *
 * Supported compression methods: 0 (Store) and 8 (Deflate).
 * ZIP64 extra fields are handled for files > 4 GB.
 */

import * as fs from 'fs'
import * as zlib from 'zlib'

// ── Signatures ───────────────────────────────────────────────────────────────
const EOCD_SIG       = 0x06054b50  // PK\x05\x06
const EOCD64_SIG     = 0x06064b50  // PK\x06\x06 (ZIP64 EOCD)
const EOCD64_LOC_SIG = 0x07064b50  // PK\x06\x07 (ZIP64 EOCD locator)
const CD_SIG         = 0x02014b50  // PK\x01\x02
const LFH_SIG        = 0x04034b50  // PK\x03\x04

export interface ZipEntry {
  name: string
  path: string           // internal path, no leading slash, no trailing slash
  isDirectory: boolean
  size: number           // uncompressed size
  compressedSize: number
  modifiedTime: string   // ISO-8601
  localHeaderOffset: number
  compressionMethod: number
}

interface CacheEntry {
  mtimeMs: number
  buf: Buffer
  entries: ZipEntry[]
}

export class ZipService {
  private readonly _cache = new Map<string, CacheEntry>()

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Load the ZIP file into memory and parse its central directory (cached by mtime). */
  private _load(zipFilePath: string): CacheEntry {
    const stat = fs.statSync(zipFilePath)
    const cached = this._cache.get(zipFilePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached

    console.log(`[ZipService] Parsing: ${zipFilePath} (${stat.size} bytes)`)
    const buf = fs.readFileSync(zipFilePath)
    const entries = this._parseCentralDirectory(buf, zipFilePath)
    console.log(`[ZipService] Found ${entries.length} entries in ${zipFilePath}`)
    const entry: CacheEntry = { mtimeMs: stat.mtimeMs, buf, entries }
    this._cache.set(zipFilePath, entry)
    return entry
  }

  /** Return all central-directory entries for a ZIP file (cached by mtime). */
  async getEntries(zipFilePath: string): Promise<ZipEntry[]> {
    return this._load(zipFilePath).entries
  }

  /**
   * Return immediate children of `internalPath` inside the ZIP (directory listing).
   * internalPath='' returns the root level.
   */
  async listDirectory(zipFilePath: string, internalPath: string): Promise<ZipEntry[]> {
    const prefix = normalizeDirPath(internalPath)  // '' or 'dir/sub/'
    const all = await this.getEntries(zipFilePath)

    // Use a Map keyed by child name to avoid duplicate implicit directories
    const children = new Map<string, ZipEntry>()

    for (const entry of all) {
      // entry.path has no leading slash, no trailing slash (even for dirs)
      // but ZIP raw names for dirs end with '/' – we strip that in _parseCentralDirectory
      const entryPath = entry.path + (entry.isDirectory ? '/' : '')

      if (!entryPath.startsWith(prefix)) continue

      const rel = entryPath.slice(prefix.length)
      if (!rel) continue  // the directory itself

      const slash = rel.indexOf('/')

      if (slash === -1) {
        // Direct file child (no further slashes)
        const key = rel
        if (!children.has(key)) children.set(key, entry)
      } else if (slash === rel.length - 1) {
        // Direct directory child (one trailing slash)
        const name = rel.slice(0, slash)
        const key = name + '/'
        if (!children.has(key)) {
          children.set(key, {
            ...entry,
            name,
            path: prefix.slice(0, -1) ? `${prefix.slice(0, -1)}/${name}` : name,
            isDirectory: true,
          })
        }
      } else {
        // Implicit directory (file deeper than one level implies it)
        const name = rel.slice(0, slash)
        const key = name + '/'
        if (!children.has(key)) {
          children.set(key, {
            name,
            path: prefix.slice(0, -1) ? `${prefix.slice(0, -1)}/${name}` : name,
            isDirectory: true,
            size: 0,
            compressedSize: 0,
            modifiedTime: entry.modifiedTime,
            localHeaderOffset: 0,
            compressionMethod: 0,
          })
        }
      }
    }

    // Sort: directories first, then alphabetically
    return Array.from(children.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
  }

  /** Read and decompress a single entry, returning its raw bytes. */
  async readEntry(zipFilePath: string, entryPath: string): Promise<Buffer> {
    const { buf, entries } = this._load(zipFilePath)
    const entry = entries.find(e => e.path === entryPath || e.path === entryPath.replace(/\/$/, ''))
    if (!entry) throw new Error(`ZIP entry not found: ${entryPath}`)
    return this._readEntryData(buf, entry)
  }

  // ── Central Directory Parser ───────────────────────────────────────────────

  private _parseCentralDirectory(buf: Buffer, label: string): ZipEntry[] {
    const fileSize = buf.length
    if (fileSize < 22) throw new Error('File too small to be a valid ZIP')

    // Step 1: find EOCD by scanning backward through last 65 557 bytes
    const scanStart = Math.max(0, fileSize - 65_557)
    let eocdOff = -1
    for (let i = fileSize - 22; i >= scanStart; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOff = i; break }
    }
    if (eocdOff < 0) throw new Error(`EOCD not found in ${label}`)

    // Step 2: detect ZIP64 locator (20 bytes before EOCD)
    let cdOffset: number
    let cdSize: number

    const locOff = eocdOff - 20
    if (locOff >= 0 && buf.readUInt32LE(locOff) === EOCD64_LOC_SIG) {
      const eocd64Abs = Number(buf.readBigUInt64LE(locOff + 8))
      if (buf.readUInt32LE(eocd64Abs) !== EOCD64_SIG) throw new Error('ZIP64 EOCD signature mismatch')
      cdSize   = Number(buf.readBigUInt64LE(eocd64Abs + 40))
      cdOffset = Number(buf.readBigUInt64LE(eocd64Abs + 48))
    } else {
      cdSize   = buf.readUInt32LE(eocdOff + 12)
      cdOffset = buf.readUInt32LE(eocdOff + 16)
    }

    console.log(`[ZipService] CD at offset=${cdOffset} size=${cdSize}`)

    // Step 3: parse central directory entries directly from the buffer
    const entries: ZipEntry[] = []
    let pos = cdOffset
    const cdEnd = cdOffset + cdSize

    while (pos + 46 <= cdEnd && pos + 46 <= fileSize) {
      if (buf.readUInt32LE(pos) !== CD_SIG) {
        console.warn(`[ZipService] CD_SIG mismatch at pos=${pos}, got 0x${buf.readUInt32LE(pos).toString(16)}`)
        break
      }

      const compressionMethod = buf.readUInt16LE(pos + 10)
      const lastModTime       = buf.readUInt16LE(pos + 12)
      const lastModDate       = buf.readUInt16LE(pos + 14)
      let compressedSize      = buf.readUInt32LE(pos + 20)
      let uncompressedSize    = buf.readUInt32LE(pos + 24)
      const fileNameLen       = buf.readUInt16LE(pos + 28)
      const extraLen          = buf.readUInt16LE(pos + 30)
      const commentLen        = buf.readUInt16LE(pos + 32)
      let localHeaderOffset   = buf.readUInt32LE(pos + 42)

      const rawName = buf.slice(pos + 46, pos + 46 + fileNameLen).toString('utf8')

      // Handle ZIP64 extra fields
      if (compressedSize === 0xFFFFFFFF || uncompressedSize === 0xFFFFFFFF || localHeaderOffset === 0xFFFFFFFF) {
        const extra = buf.slice(pos + 46 + fileNameLen, pos + 46 + fileNameLen + extraLen)
        let ep = 0
        while (ep + 4 <= extra.length) {
          const tag = extra.readUInt16LE(ep)
          const sz  = extra.readUInt16LE(ep + 2)
          if (tag === 0x0001) {
            let off64 = ep + 4
            if (uncompressedSize === 0xFFFFFFFF && off64 + 8 <= extra.length) {
              uncompressedSize = Number(extra.readBigUInt64LE(off64)); off64 += 8
            }
            if (compressedSize === 0xFFFFFFFF && off64 + 8 <= extra.length) {
              compressedSize = Number(extra.readBigUInt64LE(off64)); off64 += 8
            }
            if (localHeaderOffset === 0xFFFFFFFF && off64 + 8 <= extra.length) {
              localHeaderOffset = Number(extra.readBigUInt64LE(off64))
            }
            break
          }
          ep += 4 + sz
        }
      }

      const isDir = rawName.endsWith('/')
      const path  = isDir ? rawName.slice(0, -1) : rawName
      const name  = path.split('/').pop() || path

      entries.push({
        name,
        path,
        isDirectory: isDir,
        size: uncompressedSize,
        compressedSize,
        modifiedTime: dosDateToIso(lastModDate, lastModTime),
        localHeaderOffset,
        compressionMethod,
      })

      pos += 46 + fileNameLen + extraLen + commentLen
    }

    return entries
  }

  // ── On-demand entry extraction ─────────────────────────────────────────────

  private _readEntryData(buf: Buffer, entry: ZipEntry): Buffer {
    if (entry.isDirectory) return Buffer.alloc(0)

    const lfhOff = entry.localHeaderOffset
    if (buf.readUInt32LE(lfhOff) !== LFH_SIG) throw new Error('Local file header signature mismatch')

    const lfhFileNameLen = buf.readUInt16LE(lfhOff + 26)
    const lfhExtraLen    = buf.readUInt16LE(lfhOff + 28)
    const dataOffset     = lfhOff + 30 + lfhFileNameLen + lfhExtraLen

    const compressed = buf.slice(dataOffset, dataOffset + entry.compressedSize)

    if (entry.compressionMethod === 0) {
      return Buffer.from(compressed) // Store
    } else if (entry.compressionMethod === 8) {
      return zlib.inflateRawSync(compressed) // Deflate
    } else {
      throw new Error(`Unsupported compression method: ${entry.compressionMethod}`)
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise an internal-path prefix so it can be used for startsWith comparisons.
 * Returns '' for root, or 'dir/sub/' (with trailing slash) for subdirs.
 */
function normalizeDirPath(internalPath: string): string {
  const clean = internalPath.replace(/^\/+/, '').replace(/\/+$/, '')
  return clean ? clean + '/' : ''
}

function dosDateToIso(date: number, time: number): string {
  const year    = ((date >> 9) & 0x7F) + 1980
  const month   = (date >> 5) & 0x0F
  const day     = date & 0x1F
  const hours   = (time >> 11) & 0x1F
  const minutes = (time >> 5)  & 0x3F
  const seconds = (time & 0x1F) * 2
  return new Date(year, month - 1, day, hours, minutes, seconds).toISOString()
}
