import { getCurrentScope, onScopeDispose, watchEffect } from 'vue'

/**
 * 弹层打开期间临时放行拖拽区的鼠标事件。
 *
 * 背景：macOS 上 `-webkit-app-region: drag` 区域（标题栏/标签栏，即 style.css
 * 的 .app-drag）由窗口层整片吞掉鼠标事件——pointerdown/click 根本不进渲染
 * 进程。所有靠「document 捕获监听外点关闭」的浮层因此收不到标题栏的点击，
 * 表现为「点标题栏弹层不消失」。
 *
 * 方案：弹层打开期间在 <html> 置 data-app-drag-suspended，全局规则把 .app-drag
 * 临时降级为 no-drag（点击恢复派发，外点关闭照常触发）；弹层关闭后引用计数
 * 归零、拖拽自动还原。代价是弹层打开期间不能用标题栏拖动/双击缩放窗口——
 * 与原生菜单、浮层的模态跟踪行为一致（点哪儿都先收起）。
 *
 * 两种用法：
 * - `useAppDragSuspend()`：组件存续期间挂起。适用于 v-if 控制显隐的浮层根
 *   组件——setup 即「打开」，卸载即「关闭」。
 * - `useAppDragSuspend(() => open.value)`：传入活性 getter。适用于常驻组件
 *   内的开合状态（工具栏下拉菜单等），状态回落即还原。
 *
 * 引用计数：多个弹层嵌套/并存时各自持有，全部关闭后才还原拖拽。
 */

/** <html> 上的挂起标记；style.css 据此把 .app-drag 降级为 no-drag。 */
const SUSPENDED_ATTR = 'data-app-drag-suspended'

/** 当前挂起持有的引用计数（>0 时 <html> 带标记）。 */
let holders = 0

function acquire(): () => void {
  holders++
  document.documentElement.toggleAttribute(SUSPENDED_ATTR, true)
  let released = false
  return () => {
    if (released) return
    released = true
    holders = Math.max(0, holders - 1)
    document.documentElement.toggleAttribute(SUSPENDED_ATTR, holders > 0)
  }
}

export function useAppDragSuspend(active?: () => boolean): void {
  if (active) {
    watchEffect(onCleanup => {
      if (active()) onCleanup(acquire())
    })
    return
  }
  const release = acquire()
  if (getCurrentScope()) onScopeDispose(release)
}
