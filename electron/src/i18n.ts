/**
 * 主进程消息查表 — 共享词表（@shared/locales）的轻量消费者。
 *
 * 主进程不引入 vue-i18n（避免把 Vue 打进主包）：仅点路径查找 + {param} 插值。
 * 主进程词条措辞规避复数形式（vue-i18n 管道语法不在此实现）。
 *
 * 语言来源：config.settings.locale（ConfigService）。组合根在启动时与每次
 * config:save 后调用 setMainLocale；各服务/适配器直接 import { t } 使用。
 */
import {
  catalogs,
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
  type MessageSchema
} from '@shared/locales'

let currentLocale: AppLocale = DEFAULT_LOCALE

/** 非法值回落默认语言。 */
export function setMainLocale(value: unknown): void {
  currentLocale = isAppLocale(value) ? value : DEFAULT_LOCALE
}

export function getMainLocale(): AppLocale {
  return currentLocale
}

/** 点路径查找 + {param} 替换；缺 key 先回退默认语言，再缺回退 key 本身。 */
export function t(key: string, params?: Record<string, string | number>): string {
  const resolved =
    lookup(catalogs[currentLocale], key) ?? lookup(catalogs[DEFAULT_LOCALE], key) ?? key
  if (!params) return resolved
  return resolved.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match
  )
}

function lookup(catalog: MessageSchema, key: string): string | undefined {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}
