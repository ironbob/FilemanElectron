import { reactive } from 'vue'
import type { PreviewTab } from '@/types/preview'
import { isZipVirtualPath } from '@shared/zipPath'
import { useClipboardStore } from '@/stores/clipboard'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useTabsStore } from '@/stores/tabs'

/**
 * 图片集合面板的文件管理控制器（PreviewView 组合根创建，经 Router 下传到
 * ImageCollectionNav）。选择态归 Nav；本控制器只管操作入口与确认 Sheet：
 * - 拷贝/剪切进应用内剪贴板（本地真实文件写穿系统板，主面板/Finder 可粘贴）；
 * - 制作副本 = 同目录 copy（rename 冲突策略）；定位 = 新 tab 打开所在文件夹并选中；
 * - 删除/重命名经确认 Sheet → 既有任务队列。
 * 任务完成后的集合同步由 preview store 应用级订阅单点维护（含非活动 tab）。
 */
export interface CollectionFileOps {
  copy(paths: string[]): void
  cut(paths: string[]): void
  duplicate(paths: string[]): void
  reveal(path: string): void
  requestRename(path: string): void
  requestDelete(paths: string[], permanent?: boolean): void
  renameDialog: { visible: boolean; filePath: string }
  deleteDialog: { visible: boolean; paths: string[]; names: string[]; recoverable: boolean }
  closeRename(): void
  confirmRename(newName: string): void
  closeDelete(): void
  confirmDelete(): void
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : '/'
}

export function useCollectionFileOps(session: PreviewTab): CollectionFileOps {
  const clipboardStore = useClipboardStore()
  const fileOpsStore = useFileOperationsStore()
  const tabsStore = useTabsStore()

  const renameDialog = reactive({ visible: false, filePath: '' })
  const deleteDialog = reactive({ visible: false, paths: [] as string[], names: [] as string[], recoverable: true })

  // ── 剪贴板（应用内 + 系统板镜像，语义与 FilePane 一致） ──────────────────────
  let mirrorToken = 0
  async function mirrorToSystemClipboard(paths: string[]) {
    const token = ++mirrorToken
    const mirrorable = session.deviceId === 'local' ? paths.filter(p => !isZipVirtualPath(p)) : []
    if (mirrorable.length === 0) return
    try {
      const ok = await window.fileman.writeFileClipboard(mirrorable)
      if (token === mirrorToken) clipboardStore.setSystemMirrored(ok && mirrorable.length === paths.length)
    } catch (error) {
      console.warn('[CollectionFileOps] mirror to system clipboard failed', error)
    }
  }

  function setClipboard(paths: string[], action: 'copy' | 'cut') {
    if (paths.length === 0) return
    clipboardStore.setClipboard(paths, action, '', session.deviceId)
    void mirrorToSystemClipboard(paths)
  }

  // ── 制作副本：按所在目录分组入队（同目录 copy，冲突自动改名） ────────────────
  function duplicate(paths: string[]) {
    if (paths.length === 0) return
    const byDir = new Map<string, string[]>()
    for (const p of paths) {
      const dir = dirOf(p)
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir)!.push(p)
    }
    for (const [dir, group] of byDir) {
      void fileOpsStore.createCopyTask(session.deviceId, group, session.deviceId, dir, 'rename').catch(error => {
        console.error('[CollectionFileOps] duplicate queue failed', error)
      })
    }
  }

  /** 定位：新 tab 打开所在文件夹，选中并滚动揭示该文件。 */
  function reveal(path: string) {
    tabsStore.openPathInNewTab(session.deviceId, dirOf(path), path)
  }

  // ── 重命名 / 删除（确认 Sheet → 任务队列；完成事件由 preview store 同步会话） ──
  function requestRename(path: string) {
    renameDialog.filePath = path
    renameDialog.visible = true
  }
  function closeRename() {
    renameDialog.visible = false
  }
  function confirmRename(newName: string) {
    const filePath = renameDialog.filePath
    renameDialog.visible = false
    if (!filePath || !newName.trim()) return
    void fileOpsStore.createRenameTask(session.deviceId, filePath, newName.trim()).catch(error => {
      console.error('[CollectionFileOps] rename queue failed', error)
    })
  }

  function requestDelete(paths: string[], permanent = false) {
    if (paths.length === 0) return
    deleteDialog.paths = [...paths]
    deleteDialog.names = paths.map(p => p.slice(p.lastIndexOf('/') + 1) || p)
    deleteDialog.recoverable = !permanent
    deleteDialog.visible = true
  }
  function closeDelete() {
    deleteDialog.visible = false
  }
  function confirmDelete() {
    const paths = [...deleteDialog.paths]
    const recoverable = deleteDialog.recoverable
    deleteDialog.visible = false
    deleteDialog.paths = []
    deleteDialog.names = []
    if (paths.length === 0) return
    const create = recoverable
      ? fileOpsStore.createRecycleTask(session.deviceId, paths)
      : fileOpsStore.createDeleteTask(session.deviceId, paths)
    void create.catch(error => {
      console.error('[CollectionFileOps] delete queue failed', error)
    })
  }

  return {
    copy: paths => setClipboard(paths, 'copy'),
    cut: paths => setClipboard(paths, 'cut'),
    duplicate,
    reveal,
    requestRename,
    requestDelete,
    renameDialog,
    deleteDialog,
    closeRename,
    confirmRename,
    closeDelete,
    confirmDelete
  }
}
