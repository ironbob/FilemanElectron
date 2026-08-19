/**
 * 颜色标记色板：固定 7 色（Finder 式），全部走 CSS accent 变量随主题适配。
 * 存储侧只落盘色板 key（'red'…'teal'），渲染侧经 colorTagCssVar 映射；
 * 未知 key（如未来删改色板后的旧数据）返回 null —— 不渲染圆点，静默降级。
 */
export interface ColorTagPaletteEntry {
  key: string
  cssVar: string
  labelKey: string
}

export const COLOR_TAG_PALETTE: readonly ColorTagPaletteEntry[] = [
  { key: 'red', cssVar: 'var(--accent-red)', labelKey: 'fileList.menu.colorRed' },
  { key: 'orange', cssVar: 'var(--accent-orange)', labelKey: 'fileList.menu.colorOrange' },
  { key: 'yellow', cssVar: 'var(--accent-yellow)', labelKey: 'fileList.menu.colorYellow' },
  { key: 'green', cssVar: 'var(--accent-green)', labelKey: 'fileList.menu.colorGreen' },
  { key: 'blue', cssVar: 'var(--accent-blue)', labelKey: 'fileList.menu.colorBlue' },
  { key: 'purple', cssVar: 'var(--accent-purple)', labelKey: 'fileList.menu.colorPurple' },
  { key: 'teal', cssVar: 'var(--accent-teal)', labelKey: 'fileList.menu.colorTeal' },
]

const BY_KEY = new Map(COLOR_TAG_PALETTE.map(entry => [entry.key, entry]))

/** 色板 key → CSS 颜色值；不在色板内返回 null（调用方不渲染）。 */
export function colorTagCssVar(key: string | null | undefined): string | null {
  if (!key) return null
  return BY_KEY.get(key)?.cssVar ?? null
}

/** 色板 key → i18n label key；不在色板内返回 null。 */
export function colorTagLabelKey(key: string | null | undefined): string | null {
  if (!key) return null
  return BY_KEY.get(key)?.labelKey ?? null
}
