// Type declarations for the native iosafc addon (built by node-gyp into build/Release/iosafc.node).
// 实现:native/iosafc/iosafc.cpp。字段语义见该文件注释。

export interface AfcEntry {
  name: string
  isDirectory: boolean
  size: number
  /** 修改时间,毫秒(epoch ms)。 */
  mtime: number
}

export interface AfcStat {
  isDirectory: boolean
  size: number
  mtime: number
}

/** 连接设备并建立 AFC 会话;返回整数 handle。未配对时按 pairIfNeeded 决定是否发起配对。 */
export function connect(udid: string, pairIfNeeded?: boolean): number
export function disconnect(handle: number): void
/** 是否已与本机配对(信任)。 */
export function isPaired(udid: string): boolean
/** 发起配对(触发设备端"信任此电脑"弹窗)。返回是否成功发起。 */
export function pair(udid: string): boolean
export function list(handle: number, path: string): AfcEntry[]
export function stat(handle: number, path: string): AfcStat
export function readFile(handle: number, path: string): Buffer
export function writeFile(handle: number, path: string, data: Buffer): void
export function mkdir(handle: number, path: string): void
export function remove(handle: number, path: string): void
export function rename(handle: number, from: string, to: string): void
