import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useClipboardStore = defineStore('clipboard', () => {
  const files = ref<string[]>([])
  const action = ref<'copy' | 'cut'>('copy')
  const sourcePaneId = ref('')
  const sourceDeviceId = ref('')

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
  }

  function clearClipboard() {
    files.value = []
    action.value = 'copy'
    sourcePaneId.value = ''
    sourceDeviceId.value = ''
  }

  return {
    files,
    action,
    sourcePaneId,
    sourceDeviceId,
    setClipboard,
    clearClipboard
  }
})
