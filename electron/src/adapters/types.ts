import type { Readable, Writable } from 'stream'
import type { DeviceCapabilities } from './capabilities'

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  modifiedTime: string
  createdTime?: string
  extension?: string
}

export interface FileStats {
  size: number
  isDirectory: boolean
  isFile: boolean
  modifiedTime: string
  createdTime: string
  mode: number
}

export interface SearchQuery {
  pattern: string
  fileTypes?: string[]
  minSize?: number
  maxSize?: number
  modifiedAfter?: string
  modifiedBefore?: string
}

export interface IFileSystemAdapter {
  readonly type: string
  readonly deviceId: string
  readonly name: string

  /**
   * Get the capabilities of this device adapter
   */
  getCapabilities(): DeviceCapabilities

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  list(path: string): Promise<FileInfo[]>
  mkdir(path: string): Promise<void>
  rmdir(path: string, recursive?: boolean): Promise<void>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer): Promise<void>
  delete(path: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  copy(srcPath: string, dstPath: string): Promise<void>
  stat(path: string): Promise<FileStats>
  exists(path: string): Promise<boolean>
  search(path: string, query: SearchQuery): Promise<FileInfo[]>

  /**
   * Streaming access (optional). Adapters that support it set `canStream: true`
   * in their capabilities. Used by StreamTransfer for large-file cross-device
   * copy without buffering the whole file in memory.
   *
   * Why optional + capability-gated (ISP): callers check `canStream` before
   * calling, so adapters that can't stream (SMB/iOS) are not forced to implement
   * these — they fall back to the buffer-based readFile/writeFile path.
   */
  openReadStream?(path: string): Promise<Readable>
  openWriteStream?(path: string): Promise<Writable>
}
