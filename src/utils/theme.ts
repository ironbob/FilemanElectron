export type AppTheme = 'light' | 'dark'

/** localStorage 持久化键（主窗口与简介窗口同源共享）。 */
export const THEME_STORAGE_KEY = 'theme'

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark'
}

/** localStorage 保存值优先，否则跟随系统偏好。两个窗口入口（App / FileInfoWindow）共用。 */
export function resolveInitialTheme(): AppTheme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (isAppTheme(saved)) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function persistTheme(theme: AppTheme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
