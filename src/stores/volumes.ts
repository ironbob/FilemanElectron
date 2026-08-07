import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 外接卷（渲染层视图，与 main 侧 Volume 值对象字段一致）。
 * 以 mountPath 唯一标识；浏览入口即 mountPath（落在 local 设备上）。
 */
export interface Volume {
  id: string
  name: string
  mountPath: string
  isRemovable: boolean
}

/**
 * useVolumesStore（ROLE-L04，store 层）。
 * 仅负责：持有卷列表 + 拉取初始 + 订阅 main 推送的挂载/弹出变化。
 * 不掺 UI 逻辑（UI 在 AppSidebar）；不知道「如何检测卷」（检测在 VolumeScanner）。
 */
export const useVolumesStore = defineStore('volumes', () => {
  const volumes = ref<Volume[]>([])
  let listenerSetup = false

  /**
   * 拉取当前卷快照（首屏用）
   */
  async function loadVolumes(): Promise<void> {
    try {
      volumes.value = await window.fileman.volumes.list()
    } catch (error) {
      console.error('[VolumesStore] Failed to load volumes:', error)
      volumes.value = []
    }
  }

  /**
   * 订阅卷变化（挂载/弹出）。幂等：多次调用只挂一次监听。
   */
  function setupVolumesListener(): void {
    if (listenerSetup) return
    listenerSetup = true
    console.log('[VolumesStore] Setting up volumes listener')
    window.fileman.volumes.onChanged((next) => {
      console.log('[VolumesStore] volumes:changed received:', next.length, next)
      volumes.value = next
    })
  }

  return {
    volumes,
    loadVolumes,
    setupVolumesListener
  }
})
