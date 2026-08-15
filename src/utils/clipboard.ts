/**
 * 剪贴板写入，带回退。
 * Electron 渲染进程的 navigator.clipboard 在 file:// 下通常可用，
 * 但个别场景（无焦点窗口）会抛错，此时退回隐藏 textarea + execCommand。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    textarea.remove()
    return ok
  }
}
