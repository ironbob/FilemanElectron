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

/**
 * rwx 三段九位 → 数值 mode（chmod 编辑用）。
 * "rwxr-xr-x" → 0o755；非法输入返回 null。
 */
export function parsePermissions(text: string): number | null {
  const trimmed = text.trim()
  if (!/^[rwx-]{9}$/.test(trimmed)) return null
  let mode = 0
  for (let i = 0; i < 9; i++) {
    if (trimmed[i] !== '-') mode |= 1 << (8 - i)
  }
  return mode
}

/** 八进制字符串（"755"/"0644"）→ 数值 mode；非法返回 null。 */
export function parseOctalPermissions(text: string): number | null {
  const trimmed = text.trim().replace(/^0o?/, '')
  if (!/^[0-7]{3,4}$/.test(trimmed)) return null
  return parseInt(trimmed, 8)
}

/** 数值 mode → 三位八进制（"755"）。 */
export function toOctalPermissions(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0')
}

/** rwx 九位 → 三位八进制（"rwxr-xr-x" → "755"）。 */
export function rwxToOctal(text: string): string | null {
  const mode = parsePermissions(text)
  return mode === null ? null : toOctalPermissions(mode)
}
