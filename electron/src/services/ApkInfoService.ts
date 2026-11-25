import { createRequire } from 'module'
import type { ApkInfo } from '@shared/types'
import {
  parseResourceId,
  parseResourceTable,
  resolveResourceFilePaths,
  resolveResourceString,
  type ResourceLocale,
  type ResourceTable
} from './support/arscResources'

// `@devicefarmer/adbkit-apkreader` is CommonJS (`export = ApkReader`). It is loaded
// through Node's CommonJS interop boundary so the externalized ESM main bundle
// never imports it statically (same contract as adbkit in AndroidAdapter).
type ApkReaderModule = typeof import('@devicefarmer/adbkit-apkreader')
type ApkReaderInstance = Awaited<ReturnType<ApkReaderModule['open']>>

let apkReaderModule: ApkReaderModule | null = null

function getApkReader(): ApkReaderModule {
  if (!apkReaderModule) {
    apkReaderModule = createRequire(import.meta.url)('@devicefarmer/adbkit-apkreader') as ApkReaderModule
  }
  return apkReaderModule
}

/** 只取用到的 Manifest 字段（apkreader 返回无原型对象；完整形状见其 types.d.ts）。 */
interface ParsedManifest {
  package: string
  versionCode?: number | string
  versionName?: string
  usesSdk?: Record<string, unknown> | null
  application?: Record<string, unknown> | null
}

const RESOURCES_ARSC = 'resources.arsc'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** 应用图标体积上限：超过多为误判的大资源，不值得经 IPC 送到渲染层。 */
const ICON_MAX_BYTES = 256 * 1024

type IconMime = NonNullable<ApkInfo['iconMime']>
interface IconImage {
  base64: string
  mime: IconMime
}

/** 数值属性（usesSdk / versionCode）；字符串数字也接受，resourceId 引用视为缺失。 */
function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

/** 字面文本属性；资源表引用（'resourceId:…'）与空串返回 undefined（引用另行解析）。 */
function literalOf(value: unknown): string | undefined {
  return typeof value === 'string' && value && !value.startsWith('resourceId:') ? value : undefined
}

/** 应用语言（'zh-CN' / 'en-US'）→ 资源表 locale（语言小写、国家大写）；形态不合法时不做语言限定。 */
function resourceLocaleOf(locale: string | undefined): ResourceLocale | undefined {
  const match = locale ? /^([A-Za-z]{2,3})(?:-([A-Za-z]{2}))?$/.exec(locale.trim()) : null
  return match ? { language: match[1].toLowerCase(), country: (match[2] ?? '').toUpperCase() } : undefined
}

/** 图片签名：PNG，或 'RIFF' 开头且第 8–12 字节为 'WEBP'；其它（自适应图标 XML 等）返回 undefined。 */
function sniffImageMime(content: Buffer): IconMime | undefined {
  if (content.length >= PNG_SIGNATURE.length && content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png'
  if (content.length >= 12 && content.toString('latin1', 0, 4) === 'RIFF' && content.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

/**
 * ApkInfoService —— 本地 APK 的 Manifest 摘要（「显示简介」安装包区块与
 * 安装 Sheet 共用）。
 *
 *  - 只读 zip 中央目录、AndroidManifest.xml 与 resources.arsc，不整包读入（R8 / PRD §9）。
 *  - 应用名 / 图标在真实 APK 里多是资源引用：按主进程当前语言从资源表解析应用名，
 *    图标取密度最高且内容为 PNG / WebP 的文件；资源表缺失或损坏时降级为只有包名 / 版本。
 *  - Manifest 解析失败抛错，由调用方降级（不阻塞安装）。
 */
export class ApkInfoService {
  /**
   * @param locale 主进程当前语言（如 'zh-CN'），用于挑选资源表的语言限定值；缺省只取默认配置。
   *   由调用方传入而非 import 主进程 i18n，便于在纯 Node 下验证。
   */
  async inspect(localPath: string, locale?: string): Promise<ApkInfo> {
    const reader: ApkReaderInstance = await getApkReader().open(localPath)
    // apkreader 每次 readXxx 都重新打开 zip 并遍历一遍中央目录（大包约几十毫秒一次），
    // Manifest 与资源表并行取以重叠两次遍历的等待；资源表缺失 / 损坏按「无资源表」降级。
    const [manifest, arsc] = await Promise.all([
      reader.readManifest() as unknown as Promise<ParsedManifest>,
      reader.readContent(RESOURCES_ARSC).catch(() => undefined)
    ])
    if (!manifest || typeof manifest.package !== 'string' || !manifest.package) {
      throw new Error('APK manifest has no package name')
    }
    const application = manifest.application ?? {}
    const usesSdk = manifest.usesSdk ?? {}
    const labelId = parseResourceId(application.label)
    const iconId = parseResourceId(application.icon)
    const table = labelId === undefined && iconId === undefined ? undefined : this.parseResourceTable(arsc)
    const info: ApkInfo = {
      packageName: manifest.package,
      appName: literalOf(application.label) ?? this.resolveLabel(table, labelId, resourceLocaleOf(locale)),
      versionName: literalOf(manifest.versionName),
      versionCode: numberOf(manifest.versionCode),
      minSdk: numberOf(usesSdk.minSdkVersion),
      targetSdk: numberOf(usesSdk.targetSdkVersion)
    }
    const icon = await this.readIcon(reader, application.icon, table)
    if (icon) {
      info.iconBase64 = icon.base64
      info.iconMime = icon.mime
    }
    return info
  }

  /** resources.arsc 缺失 / 损坏 / 格式不认识一律按「无资源表」降级，不影响包名与版本。 */
  private parseResourceTable(arsc: Buffer | undefined): ResourceTable | undefined {
    if (!arsc) return undefined
    try {
      return parseResourceTable(arsc)
    } catch {
      return undefined
    }
  }

  private resolveLabel(table: ResourceTable | undefined, resourceId: number | undefined, locale: ResourceLocale | undefined): string | undefined {
    if (!table || resourceId === undefined) return undefined
    try {
      // 与 Android ApplicationInfo.loadLabel 一致：去掉首尾空白，空白标签视为没有
      return resolveResourceString(table, resourceId, locale)?.trim() || undefined
    } catch {
      return undefined
    }
  }

  /**
   * 图标候选：Manifest 字面路径在前，资源表引用解析出的路径（密度从高到低）在后；
   * 取第一个存在、不超过体积上限且内容是 PNG / WebP 的文件（自适应图标 XML 在这里被淘汰）。
   */
  private async readIcon(reader: ApkReaderInstance, manifestIcon: unknown, table: ResourceTable | undefined): Promise<IconImage | undefined> {
    const candidates: string[] = []
    const literal = literalOf(manifestIcon)
    if (literal) candidates.push(literal)
    const resourceId = parseResourceId(manifestIcon)
    if (table && resourceId !== undefined) {
      try {
        candidates.push(...resolveResourceFilePaths(table, resourceId))
      } catch {
        // 资源表条目损坏：按取不到处理
      }
    }
    for (const candidate of candidates) {
      if (candidate.startsWith('@') || candidate.includes('://')) continue
      const icon = await this.readIconFile(reader, candidate.replace(/^\/+/, ''))
      if (icon) return icon
    }
    return undefined
  }

  private async readIconFile(reader: ApkReaderInstance, iconPath: string): Promise<IconImage | undefined> {
    try {
      const content = await reader.readContent(iconPath)
      if (content.length === 0 || content.length > ICON_MAX_BYTES) return undefined
      const mime = sniffImageMime(content)
      return mime ? { base64: content.toString('base64'), mime } : undefined
    } catch {
      return undefined
    }
  }
}
