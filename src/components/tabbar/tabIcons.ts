/**
 * 标签栏图标注册表（24×24 stroke SVG，heroicons/lucide 风格，与 App 内
 * 既有内联图标同语言：stroke=currentColor、统一 stroke-width=2）。
 *
 * 语义约定：图标只回答「这是什么类型」——文件夹/文本/图片/PDF/归档/Hex/
 * 对比/diff/工具页；不使用「眼睛」作为预览标识（类型图标即语义）。
 * 仅 folder 在激活态染系统蓝，其余一律次级灰（组件侧控制颜色）。
 */

import type { Tab } from '@/types'
import { isZipVirtualPath } from '@shared/zipPath'

export type TabIconName =
  | 'folder' | 'text' | 'image' | 'video' | 'audio' | 'pdf'
  | 'zip' | 'zipDir' | 'hex' | 'compare' | 'diff' | 'dupes' | 'grep' | 'space'

/** 每个图标 = 若干 path 的 d 串（TabIcon.vue 逐条渲染）。 */
export const TAB_ICON_PATHS: Record<TabIconName, string[]> = {
  // heroicons outline folder（与旧版标签栏一致）
  folder: [
    'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
  ],
  // lucide file-text（文档 + 行）
  text: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M16 13H8',
    'M16 17H8'
  ],
  // lucide image（画框 + 圆 + 山形）
  image: [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21'
  ],
  // lucide film（片窗框）
  video: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M7 3v18',
    'M17 3v18',
    'M3 8h4',
    'M3 16h4',
    'M17 8h4',
    'M17 16h4',
    'M7 12h10'
  ],
  // lucide audio-lines（波形）
  audio: [
    'M2 10v4',
    'M6 6v12',
    'M10 3v18',
    'M14 8v8',
    'M18 5v14',
    'M22 10v4'
  ],
  // doc.richtext 意象：文档 + 密排行（与 text 的行距区分）
  pdf: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M16 9H8',
    'M16 13H8',
    'M14 17H8'
  ],
  // lucide archive（归档盒）
  zip: [
    'M3 3h18v5H3z',
    'M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8',
    'M10 12h4'
  ],
  // folder-archive 意象：ZIP 内部目录
  zipDir: [
    'M3 7v10a2 2 0 002 2h6',
    'M3 9a2 2 0 012-2h6l2 2h6a2 2 0 012 2v2',
    'M9 13h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
    'M11 16h4'
  ],
  // lucide hexagon（Hex 编辑器 mnemonic：六边形）
  hex: [
    'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
  ],
  // columns-2（目录对比：分栏）
  compare: [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M12 3v18'
  ],
  // lucide files（文件 diff：叠放双文档）
  diff: [
    'M20 7h-3a2 2 0 0 1-2-2V2',
    'M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2Z',
    'M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8'
  ],
  // lucide copy（重复文件）
  dupes: [
    'M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
    'M5 16V4a1 1 0 0 1 1-1h11'
  ],
  // lucide search（内容搜索）
  grep: [
    'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
    'm21 21-4.35-4.35'
  ],
  // layout-dashboard（空间分析：矩形树图意象）
  space: [
    'M4 3h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 3h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 12h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
    'M4 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z'
  ]
}

/** 按标签内容解析图标（预览 → 类型；工具页 → 专属；浏览 → folder/zipDir）。 */
export function iconForTab(tab: Tab): TabIconName {
  if (tab.preview) {
    const type = tab.preview.forceType ?? tab.preview.type
    switch (type) {
      case 'text': return 'text'
      case 'image': return 'image'
      case 'video': return 'video'
      case 'audio': return 'audio'
      case 'pdf': return 'pdf'
      case 'zip': return 'zip'
      case 'hex': return 'hex'
      default: return 'hex'
    }
  }
  if (tab.fileDiffSession) return 'diff'
  if (tab.compareSession) return 'compare'
  if (tab.dupesSession) return 'dupes'
  if (tab.grepSession) return 'grep'
  if (tab.spaceSession) return 'space'
  const pane = tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]
  return pane && isZipVirtualPath(pane.path) ? 'zipDir' : 'folder'
}
