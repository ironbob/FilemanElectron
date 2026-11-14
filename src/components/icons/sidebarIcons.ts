/**
 * 侧边栏图标 —— 统一走 glyphs.ts 单一字形库（24 网格线性，currentColor）。
 * 取代此前 IconPark 镂空填充风格，与工具栏/菜单/预览同一视觉语言。
 * 颜色由 finder-ui.css 的 --finder-nav-icon 统一接管（激活态白色），
 * 使用方仅传尺寸类（w-5 h-5 / w-4 h-4）。保留全部 export 名以兼容调用点。
 */
import { h, type FunctionalComponent } from 'vue'
import { glyph, type GlyphName } from './glyphs'

/** 规范字形 → 侧栏图标组件（内联 SVG，尺寸/颜色由使用方 class 控制）。 */
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

export const HomeIcon = icon('home')
export const DesktopIcon = icon('monitor')
export const DocumentIcon = icon('fileText')
export const DownloadIcon = icon('download')
export const ApplicationIcon = icon('layoutGrid')
export const BookmarkIcon = icon('bookmark')
export const LocalIcon = icon('finderFace')
export const AndroidIcon = icon('smartphone')
export const SmbIcon = icon('server')
export const SshIcon = icon('terminal')
export const WebDavIcon = icon('cloud')
export const IosIcon = icon('smartphone')
export const VolumeDriveIcon = icon('hardDrive')
export const SunIcon = icon('sun')
export const MoonIcon = icon('moon')
export const TransferIcon = icon('arrowLeftRight')
export const DualPaneIcon = icon('columns')
export const SettingsIcon = icon('settings')
export const CameraIcon = icon('camera')
export const OhosIcon = icon('smartphone')