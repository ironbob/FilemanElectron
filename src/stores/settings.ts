import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppLocale } from '@shared/locales'
import type { AppSettings } from '@/types'

const log = (message: string, ...args: unknown[]) => {
  console.log(`[SettingsStore] ${message}`, ...args)
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultView: 'list',
  showHiddenFiles: false,
  showPermissions: false,
  confirmDelete: true,
  autoRefresh: true
}

/**
 * App settings (`config.settings` in electron-store).
 *
 * Persistence gotcha: the main-process `config:save` handler replaces the
 * whole `settings` object (`store.set('settings', …)`), and settings may also
 * carry main-process-owned fields (e.g. `autoConnectDevices` from
 * MobileDiscoveryService). Always persist the raw stored object with only the
 * known fields overridden — never write a freshly constructed AppSettings.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  /** Raw settings record including fields this store does not model. */
  const rawSettings = ref<Record<string, unknown>>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)

  async function load(): Promise<void> {
    try {
      const cfg = (await window.fileman.getConfig()) as { settings?: Partial<AppSettings> }
      const stored = cfg?.settings ?? {}
      rawSettings.value = { ...stored }
      settings.value = { ...DEFAULT_SETTINGS, ...stored }
      log('loaded', settings.value)
    } catch (e) {
      console.error('[SettingsStore] load failed:', e)
      settings.value = { ...DEFAULT_SETTINGS }
      rawSettings.value = { ...DEFAULT_SETTINGS }
    } finally {
      loaded.value = true
    }
  }

  async function persist(): Promise<void> {
    try {
      await window.fileman.saveConfig({
        settings: { ...rawSettings.value, ...settings.value }
      })
      rawSettings.value = { ...rawSettings.value, ...settings.value }
    } catch (e) {
      console.error('[SettingsStore] persist failed:', e)
    }
  }

  async function setShowHiddenFiles(v: boolean): Promise<void> {
    if (settings.value.showHiddenFiles === v) return
    settings.value.showHiddenFiles = v
    log('showHiddenFiles →', v)
    await persist()
  }

  async function toggleShowHiddenFiles(): Promise<void> {
    await setShowHiddenFiles(!settings.value.showHiddenFiles)
  }

  async function setShowPermissions(v: boolean): Promise<void> {
    if (settings.value.showPermissions === v) return
    settings.value.showPermissions = v
    log('showPermissions →', v)
    await persist()
  }

  async function toggleShowPermissions(): Promise<void> {
    await setShowPermissions(!settings.value.showPermissions)
  }

  async function setAutoRefresh(v: boolean): Promise<void> {
    if (settings.value.autoRefresh === v) return
    settings.value.autoRefresh = v
    log('autoRefresh →', v)
    await persist()
  }

  /** 界面语言（i18n.setLocale 的持久化路径；主进程随 config:save 刷新缓存）。 */
  async function setLocale(locale: AppLocale): Promise<void> {
    if (settings.value.locale === locale) return
    settings.value.locale = locale
    log('locale →', locale)
    await persist()
  }

  return {
    settings,
    loaded,
    load,
    setShowHiddenFiles,
    toggleShowHiddenFiles,
    setShowPermissions,
    toggleShowPermissions,
    setAutoRefresh,
    setLocale
  }
})
