import { nextTick, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Sheet 焦点管理（弹窗高级感升级）：打开即聚焦首个可聚焦元素（或 [data-autofocus]），
 * Tab/Shift+Tab 焦点陷阱循环于卡片内，关闭归还焦点到触发元素。与 useKeyInterceptor
 * 的 Esc 消费互补——本 composable 只管 Tab 与初始/归还焦点。
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function useSheetFocus(root: Ref<HTMLElement | null>): void {
  let returnTo: HTMLElement | null = null

  function focusables(): HTMLElement[] {
    const el = root.value
    if (!el) return []
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null)
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && (active === first || !root.value?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  onMounted(() => {
    returnTo = document.activeElement as HTMLElement | null
    void nextTick(() => {
      const el = root.value
      if (!el) return
      // 已有内部焦点（如 CreateItemSheet 自管文件名主体选中）则不抢占。
      if (!el.contains(document.activeElement)) {
        const auto = el.querySelector<HTMLElement>('[data-autofocus]')
        ;(auto ?? focusables()[0])?.focus()
      }
      el.addEventListener('keydown', onKeydown)
    })
  })

  onUnmounted(() => {
    root.value?.removeEventListener('keydown', onKeydown)
    returnTo?.focus?.()
  })
}