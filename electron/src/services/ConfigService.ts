import Store from 'electron-store'

interface AppConfig {
  devices: unknown[]
  favorites: unknown[]
  fileMetadata?: unknown[]
  settings: {
    defaultView: string
    showHiddenFiles: boolean
    confirmDelete: boolean
    autoConnectDevices?: string[]
    autoRefresh?: boolean
    /** 界面语言（@shared/locales 的 AppLocale）；缺省 = zh-CN。默认值不含此键，旧配置不动。 */
    locale?: string
  }
}

const defaultConfig: AppConfig = {
  devices: [],
  favorites: [],
  settings: {
    defaultView: 'list',
    showHiddenFiles: false,
    confirmDelete: true,
    autoRefresh: true
  }
}

export class ConfigService {
  private store: Store<AppConfig>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'config',
      defaults: defaultConfig
    })
  }

  getConfig(): AppConfig {
    return this.store.store
  }

  saveConfig(config: Partial<AppConfig>): void {
    if (config.devices !== undefined) {
      this.store.set('devices', config.devices)
    }
    if (config.favorites !== undefined) {
      this.store.set('favorites', config.favorites)
    }
    if (config.settings !== undefined) {
      this.store.set('settings', config.settings)
    }
    if (config.fileMetadata !== undefined) {
      this.store.set('fileMetadata', config.fileMetadata)
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key)
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value)
  }
}
