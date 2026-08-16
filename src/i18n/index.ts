/**
 * 渲染层 i18n 单一入口。主窗口与简介窗口是两个渲染进程、各自持有独立的
 * 本模块实例；语言经 localStorage 'locale' + storage 事件跨窗口同步（与
 * theme 同范式，见 src/utils/theme.ts）。
 *
 * 用法：
 * - 模板：`$t('key')`（globalInjection，组件无需 useI18n）
 * - script/stores/utils：`import { t } from '@/i18n'`。每次调用读取 locale
 *   ref，包在 computed 里即随语言切换响应；禁止把 t() 结果存进模块级常量
 *   （会在 import 时刻冻结）。
 */
import { createI18n } from 'vue-i18n'
import { catalogs, DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@shared/locales'

export { DEFAULT_LOCALE, isAppLocale }
export type { AppLocale }

/** localStorage 持久化键（主窗口与简介窗口同源共享）。 */
export const LOCALE_STORAGE_KEY = 'locale'

/**
 * 同步解析初始语言：localStorage → 系统语言（en* → en-US）→ zh-CN。
 * src/main.ts 挂载前无异步阶段，必须同步求值避免闪错语言。
 */
function resolveInitialLocale(): AppLocale {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isAppLocale(saved)) return saved
  return navigator.language?.toLowerCase().startsWith('en') ? 'en-US' : DEFAULT_LOCALE
}

const initialLocale = resolveInitialLocale()
document.documentElement.lang = initialLocale

// 不使用 vue-i18n 的元组泛型重载：该形态会把 locale 收窄成字面量类型（非 ref），
// 与 vue-tsc 2.0.6 不合。词表形状由 en-US: MessageSchema 静态保证，与此处无关。
export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: catalogs,
  globalInjection: true
})

/** script/stores/utils 用的翻译函数（绑定 this 后 locale ref 仍响应）。 */
export const t = i18n.global.t.bind(i18n.global)

/**
 * 切换语言：更新 i18n locale + localStorage + <html lang>，默认经
 * settingsStore 持久化到 config（主进程随 config:save 刷新缓存）。
 *
 * persist:false 专用于跨窗口 storage 事件同步：未执行 settingsStore.load()
 * 的窗口（简介窗口）若回写，会把 DEFAULT_SETTINGS 写进 config 覆盖用户
 * 真实设置，必须禁用。
 */
export async function setLocale(
  locale: AppLocale,
  opts: { persist?: boolean } = {}
): Promise<void> {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
  if (opts.persist !== false) {
    const { useSettingsStore } = await import('@/stores/settings')
    await useSettingsStore().setLocale(locale)
  }
}
