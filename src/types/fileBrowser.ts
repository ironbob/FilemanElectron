export type FileSortField = 'name' | 'size' | 'modifiedTime' | 'extension'
export type SortDirection = 'asc' | 'desc'
export type ConflictStrategy = 'skip' | 'overwrite' | 'rename'

export interface FileSortDescriptor {
  field: FileSortField
  direction: SortDirection
  foldersFirst: boolean
}

export interface FileBrowserViewState {
  sort: FileSortDescriptor
  recursiveSearch: boolean
  showInfoPane: boolean
}

export interface RecentLocation {
  deviceId: string
  path: string
  visitedAt: number
}

export interface FileMetadata {
  deviceId: string
  path: string
  tags: string[]
  updatedAt: number
}

export interface BatchRenameItem {
  sourcePath: string
  newName: string
}
