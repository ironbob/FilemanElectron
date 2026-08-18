import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useClipboardStore = defineStore('clipboard', () => {
  const files = ref<string[]>([])
  const action = ref<'copy' | 'cut'>('copy')
  const sourcePaneId = ref('')
  const sourceDeviceId = ref('')
  // 当前内部剪贴板是否已成功镜像到系统剪贴板（仅本地真实文件才可能为 true）。
  // 粘贴源决策依据：true 才允许「读系统板与内部比对」——镜像失败/远端/ZIP 虚拟
  // 路径时系统板上是陈旧内容，比对会把用户的旧 Finder 复制误判成新粘贴源。
  const systemMirrored = ref(false)

  function setClipboard(
    newFiles: string[],
    newAction: 'copy' | 'cut',
    paneId: string,
    deviceId: string
  ) {
    files.value = [...newFiles]
    action.value = newAction
    sourcePaneId.value = paneId
    sourceDeviceId.value = deviceId
    // 写穿系统板是 setClipboard 之后的异步动作，先置 false，成功后再翻转
    systemMirrored.value = false
  }

  function setSystemMirrored(mirrored: boolean) {
    systemMirrored.value = mirrored
  }

  function clearClipboard() {
    files.value = []
    action.value = 'copy'
    sourcePaneId.value = ''
    sourceDeviceId.value = ''
    systemMirrored.value = false
  }

  return {
    files,
    action,
    sourcePaneId,
    sourceDeviceId,
    systemMirrored,
    setClipboard,
    setSystemMirrored,
    clearClipboard
  }
})
