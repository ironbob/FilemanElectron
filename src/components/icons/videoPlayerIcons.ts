/**
 * 视频预览播放器图标 —— 统一走 glyphs.ts 单一字形库（24 网格线性，currentColor）。
 * 与侧边栏 / 文本预览 / 菜单同一视觉语言。尺寸由使用方 class 传入
 * （控制条按钮 w-5 h-5 / w-4 h-4，错误态 w-12 h-12）。保留全部 export 名。
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

export const CautionIcon = icon('alertTriangle')
export const PlayIcon = icon('play')
export const PauseIcon = icon('pause')
export const SkipBackIcon = icon('skipBack')
export const SkipForwardIcon = icon('skipForward')
export const VolumeIcon = icon('volume2')
export const VolumeMuteIcon = icon('volumeX')
export const FullScreenIcon = icon('maximize')
export const PipIcon = icon('pip')