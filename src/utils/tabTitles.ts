/**
 * 标签标题同名消歧（纯函数，无 Vue/Pinia 依赖）
 *
 * 渲染层契约：叶子名（leaf）永远主色显示；发生同名冲突的标签整体升级为
 * 「前缀 › 叶子」，前缀次要色、空间不足时先牺牲外层前缀（组件侧用
 * flex-shrink 差异实现）。前缀层级逐级升级（仅在仍冲突时加深）：父 →
 * 祖父 → … → 设备名（作最外层）→ 仍不可分（同设备同路径）则保持裸叶子。
 *
 * 关键约束：结果只在渲染层 computed 消费，绝不写回 Tab——标题在每次
 * 导航时都会变化，写回会持续触发 tabs store 的 300ms 防抖持久化。
 */

import type { Tab } from '@/types'
import { zipBreadcrumbSegments } from '@shared/zipPath'

/** 消歧输入（由 Tab 提取；别名 titleAlias 不进本模块——显示层另行整体替换）。 */
export interface TabTitleEntry {
  tabId: string
  /** 末段：浏览 = 目录名（'/' → 'Root'）；预览 = 文件名（含扩展名）。 */
  leaf: string
  /** 祖先段，由近及远（父在前）；ZIP 虚拟路径 = 内部段 + zip 文件宿主段。 */
  ancestorSegments: string[]
  deviceId: string
  /** 工具页（titleKey / compare / diff / dupes / grep / space）：标题自释义，不参与。 */
  tool: boolean
}

/** 消歧输出。prefix = null 表示无冲突（或冲突不可分：同设备同路径的重复标签）。 */
export interface DisambiguatedTitle {
  tabId: string
  leaf: string
  prefix: string | null
}

const PREFIX_SEP = ' › '

/** 从 Tab 提取消歧输入；浏览页取活动 pane（双窗格时以焦点侧为准）。 */
export function tabTitleEntry(tab: Tab): TabTitleEntry {
  const tool = Boolean(
    tab.titleKey || tab.compareSession || tab.fileDiffSession ||
    tab.dupesSession || tab.grepSession || tab.spaceSession
  )
  if (tool) {
    return { tabId: tab.id, leaf: tab.title, ancestorSegments: [], deviceId: '', tool: true }
  }

  if (tab.preview) {
    const segs = zipBreadcrumbSegments(tab.preview.file.path)
    return {
      tabId: tab.id,
      leaf: tab.preview.file.name || (segs[segs.length - 1] ?? ''),
      ancestorSegments: segs.slice(0, -1).reverse(),
      deviceId: tab.preview.deviceId,
      tool: false
    }
  }

  const pane = tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]
  const path = pane?.path ?? '/'
  const segs = zipBreadcrumbSegments(path)
  return {
    tabId: tab.id,
    leaf: segs.length > 0 ? segs[segs.length - 1] : 'Root',
    ancestorSegments: segs.slice(0, -1).reverse(),
    deviceId: pane?.deviceId ?? '',
    tool: false
  }
}

/** 标签的完整路径（tooltip 第二行 / 总览菜单路径行 / 复制路径用）。 */
export function tabFullPath(tab: Tab): string {
  if (tab.preview) return tab.preview.file.path
  const pane = tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]
  return pane?.path ?? ''
}

/** 标签大类（aria / 总览菜单图标）。 */
export function tabKindOf(tab: Tab): 'browse' | 'preview' | 'tool' {
  if (tab.preview) return 'preview'
  if (tab.compareSession || tab.fileDiffSession || tab.dupesSession || tab.grepSession || tab.spaceSession || tab.titleKey) {
    return 'tool'
  }
  return 'browse'
}

interface Work {
  entry: TabTitleEntry
  /** 前缀段，渲染序（最外层在前）。 */
  parts: string[]
  /** 已消费的祖先层级数。 */
  depth: number
  triedDevice: boolean
}

function groupKey(w: Work): string {
  return `${w.parts.join('\u0000')}\u0001${w.entry.leaf}`
}

/**
 * 同名消歧主算法。
 *
 * @param entries tabTitleEntry 结果（当前打开的全部标签）
 * @param deviceName 可选的设备名解析器（跨设备同名时设备名作最外层前缀）
 */
export function disambiguateTabTitles(
  entries: TabTitleEntry[],
  deviceName?: (deviceId: string) => string | undefined
): Map<string, DisambiguatedTitle> {
  const result = new Map<string, DisambiguatedTitle>()
  const works: Work[] = []

  for (const entry of entries) {
    if (entry.tool) {
      result.set(entry.tabId, { tabId: entry.tabId, leaf: entry.leaf, prefix: null })
    } else {
      works.push({ entry, parts: [], depth: 0, triedDevice: false })
    }
  }

  // 安全阀：每轮至少消费一个层级或终止，正常输入远达不到该上限。
  for (let round = 0; works.length > 0 && round < 32; round++) {
    const groups = new Map<string, Work[]>()
    for (const w of works) {
      const key = groupKey(w)
      const list = groups.get(key)
      if (list) {
        list.push(w)
      } else {
        groups.set(key, [w])
      }
    }

    works.length = 0
    for (const group of groups.values()) {
      if (group.length === 1) {
        const w = group[0]
        const joined = w.parts.join(PREFIX_SEP)
        result.set(w.entry.tabId, {
          tabId: w.entry.tabId,
          leaf: w.entry.leaf,
          prefix: joined || null
        })
        continue
      }

      // 仍冲突：优先加祖先层；祖先耗尽且设备名可区分时加设备名；到顶（同设备
      // 同路径等真正不可分的重复标签）保持裸叶子——此前会升级成「… › a › b ›
      // 叶子」把全路径当文件名展示，但重复标签拿到的是同一个全路径，升级毫无
      // 区分度，只剩噪音。
      const extensible = group.filter(w => w.depth < w.entry.ancestorSegments.length)
      if (extensible.length > 0) {
        for (const w of extensible) {
          w.parts.unshift(w.entry.ancestorSegments[w.depth])
          w.depth++
        }
        works.push(...group)
        continue
      }

      if (deviceName && group.every(w => !w.triedDevice)) {
        const names = group.map(w => deviceName(w.entry.deviceId))
        const distinct = new Set(names.filter(Boolean))
        if (distinct.size > 1) {
          for (const w of group) {
            w.triedDevice = true
            const name = deviceName(w.entry.deviceId)
            if (name) w.parts.unshift(name)
          }
          works.push(...group)
          continue
        }
      }

      // 层级用尽仍无法区分（同设备同路径的重复标签）：双方任何前缀都必然相同，
      // 保持裸叶子（Finder 语义：同一目录的两个标签都只显示目录名）。
      for (const w of group) {
        result.set(w.entry.tabId, {
          tabId: w.entry.tabId,
          leaf: w.entry.leaf,
          prefix: null
        })
      }
    }
  }

  return result
}
