import type { FileInfo } from '@/types'
import type { InternalFileDragPayload, FileOperationTask } from '@/types/fileOperation'
import { isZipVirtualPath } from '@shared/zipPath'
import type { useDragSessionStore } from '@/stores/dragSession'
import type { useFileOperationsStore } from '@/stores/fileOperations'

type DragSessionStore = ReturnType<typeof useDragSessionStore>
type FileOperationsStore = ReturnType<typeof useFileOperationsStore>

export type DropAction = 'copy' | 'move'

export interface DragTransferSource {
  paneId: string
  deviceId: string
  files: string[]
}

export interface DropTarget {
  deviceId: string
  path: string
}

/** 解析 DataTransfer 中的 application/json 内部拖拽 payload（原 App.vue 实现，唯一解析器）。 */
export function parseInternalFileDragPayload(value: string): InternalFileDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null

    const payload = parsed as Record<string, unknown>
    if (
      typeof payload.paneId !== 'string' ||
      typeof payload.deviceId !== 'string' ||
      payload.deviceId.length === 0 ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0 ||
      !payload.files.every(file => typeof file === 'string')
    ) {
      return null
    }

    return {
      paneId: payload.paneId,
      deviceId: payload.deviceId,
      files: payload.files
    }
  } catch {
    return null
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

/** 父目录（根路径返回 '/'）；用于 move 任务源目录匹配刷新。 */
export function parentDirectoryOf(path: string): string {
  if (isZipVirtualPath(path)) {
    const parent = path.slice(0, path.lastIndexOf('/'))
    return parent || '/'
  }
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

/** 会话记录与原生拖入 files 是否同源（数量与文件名集合一致）。 */
function filesMatchSession(files: File[], sessionFiles: string[]): boolean {
  if (files.length === 0 || files.length !== sessionFiles.length) {
    console.info('[DnD][extract] session fallback mismatch: count', {
      droppedCount: files.length,
      sessionCount: sessionFiles.length
    })
    return false
  }
  const sessionNames = new Set(sessionFiles.map(basename))
  const droppedNames = files.map(file => file.name)
  if (!droppedNames.every(name => sessionNames.has(name))) {
    console.info('[DnD][extract] session fallback mismatch: names', {
      droppedNames,
      sessionNames: [...sessionNames]
    })
    return false
  }
  return true
}

/**
 * dragover 阶段探测拖拽源（不消费会话）。
 * DataTransfer 数据在 dragover 期间不可读，应用内拖拽（HTML5 与原生）统一以
 * dragSession 为准；会话不活跃则为外部（Finder）拖入。
 */
export function peekDragSource(_event: DragEvent, session: DragSessionStore): DragTransferSource | null {
  return session.peek()
}

/**
 * drop 落点解析拖拽源（消费会话）：
 * 1. application/json payload（远程设备等 HTML5 内部拖拽）优先；
 * 2. dataTransfer.files + 活跃会话（local 原生拖拽回落到应用内）；
 * 3. 否则返回 null（外部 Finder 拖入）。
 */
export function extractDragSource(event: DragEvent, session: DragSessionStore): DragTransferSource | null {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) {
    console.info('[DnD][extract] no dataTransfer')
    return null
  }

  const internalDragData = dataTransfer.getData('application/json')
  if (internalDragData) {
    const payload = parseInternalFileDragPayload(internalDragData)
    if (payload) {
      console.info('[DnD][extract] source=json-payload', {
        paneId: payload.paneId,
        deviceId: payload.deviceId,
        fileCount: payload.files.length
      })
      session.clear()
      return payload
    }
    console.warn('[DnD][extract] invalid application/json payload, ignored', { internalDragData })
    return null
  }

  if (dataTransfer.files.length > 0) {
    const payload = session.peek()
    if (payload && filesMatchSession(Array.from(dataTransfer.files), payload.files)) {
      console.info('[DnD][extract] source=native-session-fallback', {
        paneId: payload.paneId,
        deviceId: payload.deviceId,
        fileCount: payload.files.length,
        droppedCount: dataTransfer.files.length
      })
      return session.consume()
    }
    console.info('[DnD][extract] source=external (Finder) drop', {
      droppedCount: dataTransfer.files.length,
      sessionActive: !!payload
    })
    return null
  }

  console.info('[DnD][extract] drop carried neither json nor files', {
    types: [...dataTransfer.types]
  })
  return null
}

/** 能力探测缓存（dragover 高频触发，不能每次都走 IPC）。 */
const transferCapabilityCache = new Map<string, Promise<boolean>>()

export function probeTransferCapability(
  sourceDeviceId: string,
  targetDeviceId: string,
  operation: 'copy' | 'move'
): Promise<boolean> {
  const key = `${sourceDeviceId}->${targetDeviceId}:${operation}`
  let cached = transferCapabilityCache.get(key)
  if (!cached) {
    cached = window.fileman.canTransferBetween(sourceDeviceId, targetDeviceId, operation)
    // 缓存 Promise 本身：并发调用共享同一次探测
    transferCapabilityCache.set(key, cached)
    cached.catch(() => transferCapabilityCache.delete(key))
  }
  return cached
}

/**
 * 解析放置动作（Finder 惯例）：
 * - Option(alt) 按住 → 强制 copy；
 * - 同设备默认 move，跨设备默认 copy；
 * - move 能力不允许时回退 copy，copy 也不允许时返回 null（拒绝放置）。
 */
export async function resolveDropAction(
  sourceDeviceId: string,
  targetDeviceId: string,
  event: DragEvent
): Promise<DropAction | null> {
  const base = event.altKey ? 'copy(option)' : sourceDeviceId !== targetDeviceId ? 'copy(cross-device)' : 'move(same-device)'
  let action: DropAction = base.startsWith('copy') ? 'copy' : 'move'
  if (action === 'move') {
    try {
      if (!(await probeTransferCapability(sourceDeviceId, targetDeviceId, 'move'))) {
        console.info('[DnD][action] move denied by capability, falling back to copy', { sourceDeviceId, targetDeviceId })
        action = 'copy'
      }
    } catch (error) {
      console.warn('[DnD][action] move capability probe failed, falling back to copy', { sourceDeviceId, targetDeviceId, error })
      action = 'copy'
    }
  }
  try {
    if (!(await probeTransferCapability(sourceDeviceId, targetDeviceId, 'copy'))) {
      console.warn('[DnD][action] copy denied by capability, drop rejected', { sourceDeviceId, targetDeviceId })
      return null
    }
  } catch (error) {
    // 探测失败不拦截放置，交给任务队列报错
    console.warn('[DnD][action] copy capability probe failed, allowing drop anyway', { sourceDeviceId, targetDeviceId, error })
  }
  console.info('[DnD][action] resolved', { base, action, sourceDeviceId, targetDeviceId })
  return action
}

/** 文件夹行是否可作为放置目标（目录、非 '..'、非 ZIP 虚拟路径）。 */
export function isFolderDropTarget(file: FileInfo): boolean {
  return file.isDirectory && file.name !== '..' && !isZipVirtualPath(file.path)
}

/** 目标目录是否是被拖动文件自身或其后代（禁止拖入自身内部）。 */
export function isSelfOrDescendant(sourceFiles: string[], targetDir: string): boolean {
  return sourceFiles.some(source => targetDir === source || targetDir.startsWith(`${source}/`))
}

/** 建传输任务（行级放置与面板背景放置共用）。任务面板由用户手动展开。 */
export async function queueTransfer(
  fileOpsStore: FileOperationsStore,
  source: DragTransferSource,
  action: DropAction,
  target: DropTarget
): Promise<FileOperationTask> {
  const task = action === 'move'
    ? await fileOpsStore.createMoveTask(source.deviceId, source.files, target.deviceId, target.path)
    : await fileOpsStore.createCopyTask(source.deviceId, source.files, target.deviceId, target.path)
  return task
}
