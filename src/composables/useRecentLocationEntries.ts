import { computed, type ComputedRef } from 'vue'
import { useDevicesStore } from '@/stores/devices'
import { useFileBrowserStore } from '@/stores/fileBrowser'

/** 一条最近目录记录的展示字段（叶子名 + 副行文本已算好，浮层直接渲染）。 */
export interface RecentLocationEntry {
  deviceId: string
  path: string
  /** 叶子名（zip 虚拟路径取内层尾段；根路径显示 Root）。 */
  name: string
  /** 副行：父路径；远程设备前缀「设备名 › 」。 */
  detail: string
}

/**
 * 最近打开目录 → 展示条目（标签栏历史菜单与 ⌘⇧P 快速跳转面板共用）。
 *
 * 推导规则集中在此，两处浮层不各自复制 zip `::` 尾段剥离等边界处理：
 * recentLocations 本身按 MRU 排序（新访问置顶），computed 原样保序。
 */
export function useRecentLocationEntries(): ComputedRef<RecentLocationEntry[]> {
  const browserStore = useFileBrowserStore()
  const devicesStore = useDevicesStore()

  return computed(() =>
    browserStore.recent.map(loc => {
      const segs = loc.path.split('/').filter(Boolean)
      // zip 根路径形如「a.zip::」，叶子名去掉 '::' 尾巴只显示 zip 文件名
      const name = segs.length ? segs[segs.length - 1].replace(/::$/, '') : 'Root'
      const parent = segs.length > 1
        ? (loc.path.slice(0, loc.path.length - segs[segs.length - 1].length).replace(/\/+$/, '') || '/')
        : '/'
      const deviceName = loc.deviceId === 'local'
        ? undefined
        : devicesStore.devices.find(d => d.id === loc.deviceId)?.name
      const detail = deviceName ? `${deviceName} › ${parent}` : parent
      return { deviceId: loc.deviceId, path: loc.path, name, detail }
    })
  )
}
