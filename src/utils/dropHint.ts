/**
 * 拖拽悬停时的「动作胶囊」：跟随光标的小标签，实时显示
 * "Move to docs" / "Copy to docs"，明确告知放置目标。
 *
 * 拖拽事件期间 dragover 高频触发，元素做成 body 下的单例、
 * 用 transform 移动；drop / dragend / pointerdown 时由调用方 hide。
 */
let hintEl: HTMLDivElement | null = null

const PILL_BASE_STYLE =
  'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;' +
  'display:flex;align-items:center;gap:6px;padding:3px 10px 3px 6px;border-radius:9999px;' +
  'background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);' +
  'font-size:12px;line-height:1.4;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);'

export type DropHintAction = 'copy' | 'move'

export function hideDropHint() {
  if (hintEl) console.info('[DnD][dropHint] hide')
  hintEl?.remove()
  hintEl = null
}

export function showDropHint(x: number, y: number, action: DropHintAction, targetName: string) {
  if (!hintEl) {
    hintEl = document.createElement('div')
    hintEl.style.cssText = PILL_BASE_STYLE
    document.body.appendChild(hintEl)
    console.info('[DnD][dropHint] show', { action, targetName, x, y })
  }

  // 复制时带一个 Finder 式的 "+" 徽标（移动则只有文本）
  hintEl.textContent = ''
  if (action === 'copy') {
    const badge = document.createElement('span')
    badge.textContent = '+'
    badge.style.cssText =
      'width:16px;height:16px;border-radius:9999px;background:var(--accent-blue);color:#fff;' +
      'display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;'
    hintEl.appendChild(badge)
  }
  const label = document.createElement('span')
  label.textContent = `${action === 'move' ? 'Move to' : 'Copy to'} ${targetName}`
  hintEl.appendChild(label)

  // 拖拽图标以光标为中心（±32px），胶囊放在右下方并贴边收拢
  const width = hintEl.offsetWidth
  const clampedX = Math.max(8, Math.min(x + 24, window.innerWidth - width - 8))
  const clampedY = Math.min(y + 26, window.innerHeight - 26)
  hintEl.style.transform = `translate(${clampedX}px, ${clampedY}px)`
}
