import { defineStore } from 'pinia'
import type { InternalFileDragPayload } from '@/types/fileOperation'

/**
 * 应用内拖拽会话记录。
 *
 * FileList 的 dragstart 每次都会 begin（包括走 startNativeDrag 的 local 原生拖拽），
 * 因为原生拖拽在应用内落下时只表现为 dataTransfer.files，payload 不可读；
 * 会话记录是 dragover 阶段（DataTransfer 数据不可读）与原生拖拽落点
 * 识别源面板/源设备的唯一途径。
 *
 * 防陈旧：App.vue 在 window 上安装 capture 阶段 pointerdown / dragend 清理
 * （App 内新拖拽必然先触发 pointerdown；HTML5 拖拽结束触发 dragend）。
 * 原生拖拽拖出到 Finder 后释放鼠标不会产生任何 App 内事件，因此落点侧
 * 还会用「文件名匹配」校验 dataTransfer.files 与会话是否同源（见 dragTransfer.ts）。
 */
export const useDragSessionStore = defineStore('dragSession', {
  state: () => ({
    payload: null as InternalFileDragPayload | null
  }),
  getters: {
    isActive: state => state.payload !== null
  },
  actions: {
    begin(payload: InternalFileDragPayload) {
      console.info('[DnD][dragSession] begin', {
        paneId: payload.paneId,
        deviceId: payload.deviceId,
        fileCount: payload.files.length
      })
      this.payload = payload
    },
    peek(): InternalFileDragPayload | null {
      return this.payload
    },
    /** 取走并清空会话（仅在确认消费时调用，如 drop 落点处理）。 */
    consume(): InternalFileDragPayload | null {
      const payload = this.payload
      console.info('[DnD][dragSession] consume', {
        hadPayload: payload !== null,
        paneId: payload?.paneId,
        deviceId: payload?.deviceId,
        fileCount: payload?.files.length ?? 0
      })
      this.payload = null
      return payload
    },
    clear() {
      if (this.payload) {
        console.info('[DnD][dragSession] clear (discarded)', {
          paneId: this.payload.paneId,
          deviceId: this.payload.deviceId,
          fileCount: this.payload.files.length
        })
      }
      this.payload = null
    }
  }
})
