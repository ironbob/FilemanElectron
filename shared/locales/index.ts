/**
 * 共享词表入口 — main / preload / renderer 三侧共用（@shared 别名）。
 *
 * 新增语言 = 新增一个词条文件（形状对齐 zh-CN）+ 在 SUPPORTED_LOCALES 登记。
 */
import zhCN, { type MessageSchema } from './zh-CN'
import enUS from './en-US'

export type AppLocale = 'zh-CN' | 'en-US'
export type { MessageSchema }

export const SUPPORTED_LOCALES: readonly AppLocale[] = ['zh-CN', 'en-US']
export const DEFAULT_LOCALE: AppLocale = 'zh-CN'

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'zh-CN' || value === 'en-US'
}

export const catalogs: Record<AppLocale, MessageSchema> = {
  'zh-CN': zhCN,
  'en-US': enUS
}
