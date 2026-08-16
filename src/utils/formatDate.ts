import { i18n } from '@/i18n'

const LOCALE_TAGS: Record<string, string> = { 'zh-CN': 'zh-CN', 'en-US': 'en-US' }

/** 按当前界面语言格式化日期（FileList mtime 列等）。opts 透传 Intl.DateTimeFormatOptions。 */
export function formatDate(value: number | string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (Number.isNaN(time)) return ''
  const tag = LOCALE_TAGS[i18n.global.locale.value] ?? 'zh-CN'
  return new Date(time).toLocaleDateString(tag, opts)
}

/** 按当前界面语言格式化日期+时间。 */
export function formatDateTime(value: number | string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (Number.isNaN(time)) return ''
  const tag = LOCALE_TAGS[i18n.global.locale.value] ?? 'zh-CN'
  return new Date(time).toLocaleString(tag, opts)
}
