/**
 * 文本预览工具栏图标 —— 统一走 glyphs.ts 单一字形库（24 网格线性，currentColor）。
 * 与侧边栏 / 菜单 / 预览控件同一视觉语言。尺寸由使用方 class 传入
 * （工具栏 w-4 h-4，搜索框内 w-3.5 h-3.5，菜单小箭头 w-2.5 h-2.5）。
 * 保留全部 export 名以兼容调用点。
 */
import { h, type FunctionalComponent } from 'vue'
import { glyph, type GlyphName } from './glyphs'

function icon(name: GlyphName): FunctionalComponent {
  return () => h('svg', {
    class: 'app-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    innerHTML: glyph(name)
  })
}

export const SearchIcon = icon('search')
export const ClearIcon = icon('xCircle')
export const ChevronUpIcon = icon('chevronUp')
export const ChevronDownIcon = icon('chevronDown')
export const CopyIcon = icon('copy')
export const MoreIcon = icon('ellipsis')
export const ExportIcon = icon('upload')
export const PencilIcon = icon('pencil')

// Quick Look 步进/关闭三钮（chevron.up / chevron.down / xmark 语义）
export const StepUpIcon = icon('chevronUp')
export const StepDownIcon = icon('chevronDown')
export const CloseXIcon = icon('x')

// 着色 / 自动换行
export const PaletteIcon = icon('palette')
export const WrapIcon = icon('wrapText')