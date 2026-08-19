import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ColorTag } from '@/types'

const log = (message: string, ...args: unknown[]) => {
  console.log(`[ColorTagsStore] ${message}`, ...args)
}

/**
 * 颜色标记（Finder 式彩色标签）。镜像 favorites 范式：全量常驻内存 Map，
 * `config.colorTags` 落盘（`config:save` 按键非破坏写入，与 devices/settings
 * /favorites/fileMetadata 多写者共存）。FileList 行圆点与主 tab 圆点都靠
 * byKey 做同步 O(1) 查找，不做逐条目 IPC。
 *
 * color 存色板 key（'red'…'teal'），渲染侧经 @/utils/colorTags 映射 CSS 变量。
 */
export const useColorTagsStore = defineStore('colorTags', () => {
  const tags = ref<ColorTag[]>([])
  const loaded = ref(false)

  function keyOf(deviceId: string, path: string): string {
    return `${deviceId}::${path}`
  }

  const byKey = computed(() => {
    const m = new Map<string, string>()
    for (const t of tags.value) m.set(keyOf(t.deviceId, t.path), t.color)
    return m
  })

  /** 单条查询：返回色板 key，无标记返回 null。行渲染 / tab 圆点共用。 */
  function colorOf(deviceId: string, path: string): string | null {
    return byKey.value.get(keyOf(deviceId, path)) ?? null
  }

  /** 批量查询目标集合的颜色集（菜单 ✓ 态：去重后恰 1 色才打勾）。 */
  function colorsOf(deviceId: string, paths: string[]): Set<string> {
    const colors = new Set<string>()
    for (const p of paths) {
      const c = colorOf(deviceId, p)
      if (c) colors.add(c)
    }
    return colors
  }

  /** 任一目标有标记（「清除标记」的 disabled 判定）。 */
  function hasAny(deviceId: string, paths: string[]): boolean {
    return paths.some(p => byKey.value.has(keyOf(deviceId, p)))
  }

  async function load(): Promise<void> {
    try {
      const cfg = (await window.fileman.getConfig()) as { colorTags?: ColorTag[] }
      tags.value = Array.isArray(cfg?.colorTags) ? cfg.colorTags : []
      log('loaded', tags.value.length, 'color tags')
    } catch (e) {
      console.error('[ColorTagsStore] load failed:', e)
      tags.value = []
    } finally {
      loaded.value = true
    }
  }

  async function persist(): Promise<void> {
    try {
      // tags.value 是深层 reactive Proxy，无法跨 contextBridge/IPC 结构化克隆
      // （"An object could not be cloned"），必须先展开成普通对象再发送。
      await window.fileman.saveConfig({ colorTags: tags.value.map(t => ({ ...t })) })
    } catch (e) {
      console.error('[ColorTagsStore] persist failed:', e)
    }
  }

  /**
   * 批量设置：color = null 清除这些路径的标记，否则统一覆盖为该色。
   * 一次变更只 persist 一笔（多选批量不会放大写盘次数）。
   */
  async function setColor(deviceId: string, paths: string[], color: string | null): Promise<void> {
    const wanted = new Set(paths.map(p => keyOf(deviceId, p)))
    const before = tags.value.length
    // 先剔除全部目标（清除与覆盖共用），有色再补写
    tags.value = tags.value.filter(t => !wanted.has(keyOf(t.deviceId, t.path)))
    if (color) {
      for (const p of paths) tags.value.push({ deviceId, path: p, color })
    }
    if (tags.value.length !== before || color) {
      log('setColor:', color ?? '(cleared)', '×', paths.length, 'on', deviceId)
      await persist()
    }
  }

  return { tags, loaded, colorOf, colorsOf, hasAny, load, setColor }
})
