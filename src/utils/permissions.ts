/**
 * 数值 mode 转类 Unix rwx 字符串，如 0o755 → "rwxr-xr-x"。
 * （自 InlinePreview.vue 提取，供属性弹窗与内联预览共用。）
 */
export function formatPermissions(mode?: number): string {
  if (mode == null) return '—'
  let result = ''
  for (let shift = 6; shift >= 0; shift -= 3) {
    const bits = (mode >> shift) & 7
    result += (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-')
  }
  return result
}
