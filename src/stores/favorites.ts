import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Favorite } from '@/types'

const log = (message: string, ...args: unknown[]) => {
  console.log(`[FavoritesStore] ${message}`, ...args)
}

/**
 * User bookmarks (收藏夹). Backed by `config.favorites` in electron-store
 * (persisted via the `config:save` IPC, which is per-key and non-destructive
 * to devices/settings). Each favorite is device-scoped so remote paths
 * (SMB/SSH/Android/iOS) remember which device they belong to.
 */
export const useFavoritesStore = defineStore('favorites', () => {
  const favorites = ref<Favorite[]>([])
  const loaded = ref(false)

  function keyOf(deviceId: string, path: string): string {
    return `${deviceId}::${path}`
  }

  const byKey = computed(() => {
    const m = new Map<string, Favorite>()
    for (const f of favorites.value) m.set(keyOf(f.deviceId, f.path), f)
    return m
  })

  function has(deviceId: string, path: string): boolean {
    return byKey.value.has(keyOf(deviceId, path))
  }

  async function load(): Promise<void> {
    try {
      const cfg = (await window.fileman.getConfig()) as { favorites?: Favorite[] }
      favorites.value = Array.isArray(cfg?.favorites) ? cfg.favorites : []
      log('loaded', favorites.value.length, 'favorites')
    } catch (e) {
      console.error('[FavoritesStore] load failed:', e)
      favorites.value = []
    } finally {
      loaded.value = true
    }
  }

  async function persist(): Promise<void> {
    try {
      // favorites.value 是深层 reactive Proxy，无法跨 contextBridge/IPC 结构化克隆
      // （"An object could not be cloned"），必须先展开成普通对象再发送。
      await window.fileman.saveConfig({ favorites: favorites.value.map(f => ({ ...f })) })
    } catch (e) {
      console.error('[FavoritesStore] persist failed:', e)
    }
  }

  async function add(fav: Favorite): Promise<void> {
    if (has(fav.deviceId, fav.path)) {
      log('already favorited, skip:', fav.deviceId, fav.path)
      return
    }
    favorites.value.push(fav)
    log('added:', fav.name, '→', fav.deviceId + ':' + fav.path)
    await persist()
  }

  async function remove(deviceId: string, path: string): Promise<void> {
    const before = favorites.value.length
    favorites.value = favorites.value.filter(
      f => !(f.deviceId === deviceId && f.path === path)
    )
    if (favorites.value.length !== before) {
      log('removed:', deviceId, path)
      await persist()
    }
  }

  return { favorites, loaded, has, load, add, remove }
})
