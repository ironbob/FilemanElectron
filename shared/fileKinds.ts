/**
 * 文件类型 → 双击打开方式 · 单一事实源（跨进程注册表）
 *
 * 消费方（改动本表即全局生效，勿在各处另立清单）：
 *  - 渲染进程 src/types/preview.ts   getPreviewType（双击/QuickLook/内联预览路由）
 *  - 渲染进程 src/utils/fileTypes.ts  分类派生（图标回退分类 / FileDiffView / 搜索过滤）
 *  - 渲染进程 PreviewTextContent / FileDiffView 的 Monaco 语言检测
 *  - 主进程   ThumbnailService 的 SUPPORTED_IMAGE/VIDEO_FORMATS 派生
 *
 * 决策管线（docs/architecture/2026-08-16-double-click-open-map-arch.md §4）：
 *   目录→导航 → .zip→进虚拟目录 → 扩展名注册表 → 文件名规则（无扩展名/点文件）
 *   → 内容嗅探（sniffPreviewKind，读头部 8KB）→ 兜底 hex。
 * 冲突裁决：`.ts` = TypeScript（程序员工作台定位，优先于 MPEG-TS）。
 */

/** 双击后的内容打开方式（预览 tab / QuickLook / 内联预览共用）。 */
export type FilePreviewKind = 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'hex'

/** 旧分类体系（图标回退 / FileInfoDialog / FileDiffView isTextFile 判定沿用）。 */
export type FileCategory = 'text' | 'image' | 'video' | 'audio' | 'archive' | 'document' | 'unknown'

export interface FileKindDef {
  kind: FilePreviewKind
  /** Monaco 语言 id（仅 kind==='text' 有意义；缺省 'plaintext'）。 */
  lang?: string
  /** Chromium 无法解码、需走主进程 sips（ImageDecodeService）的图片格式。 */
  sips?: boolean
  /** 分类覆盖；缺省按 kind 派生（hex→unknown，pdf→document，zip→archive）。 */
  cat?: FileCategory
}

// ── 表构造糖 ──────────────────────────────────────────────────────────────────
const text = (lang = 'plaintext'): FileKindDef => ({ kind: 'text', lang })
const image: FileKindDef = { kind: 'image' }
const sipsImage: FileKindDef = { kind: 'image', sips: true }
const video: FileKindDef = { kind: 'video' }
const audio: FileKindDef = { kind: 'audio' }
const zipOf = (cat: FileCategory = 'archive'): FileKindDef => ({ kind: 'zip', cat })
const hexOf = (cat?: FileCategory): FileKindDef => ({ kind: 'hex', cat })

/**
 * 扩展名（小写、不带点）→ 打开方式。
 * 语言映射是 PreviewTextContent / FileDiffView 两份旧 map 的并集移植。
 */
export const EXTENSION_KINDS: Record<string, FileKindDef> = {
  // ── 文本：Web / 前端 ──────────────────────────────────────────────────────
  js: text('javascript'), jsx: text('javascript'), mjs: text('javascript'), cjs: text('javascript'),
  ts: text('typescript'), tsx: text('typescript'), mts: text('typescript'), cts: text('typescript'),
  vue: text('html'), svelte: text('html'), astro: text('html'),
  html: text('html'), htm: text('html'), xhtml: text('html'), shtml: text('html'),
  css: text('css'), scss: text('scss'), sass: text('scss'), less: text('less'),

  // ── 文本：数据 / 序列化 ───────────────────────────────────────────────────
  json: text('json'), jsonc: text('json'), json5: text('json'), jsonl: text('json'),
  ndjson: text('json'), har: text('json'), geojson: text('json'), ipynb: text('json'),
  avsc: text('json'), mcmeta: text('json'),
  xml: text('xml'), xsl: text('xml'), xsd: text('xml'), xslt: text('xml'),
  plist: text('xml'), entitlements: text('xml'), mobileconfig: text('xml'),
  xcscheme: text('xml'), xctestplan: text('xml'), storyboard: text('xml'), xib: text('xml'),
  resx: text('xml'), csproj: text('xml'), vbproj: text('xml'), fsproj: text('xml'),
  props: text('xml'), targets: text('xml'), wxs: text('xml'), wxi: text('xml'),
  appxmanifest: text('xml'), pom: text('xml'),
  yaml: text('yaml'), yml: text('yaml'),
  toml: text('ini'), ini: text('ini'), cfg: text('ini'), conf: text('ini'), cnf: text('ini'),
  properties: text('ini'), editorconfig: text('ini'), npmrc: text('ini'), yarnrc: text('ini'),
  xcconfig: text('ini'),
  csv: text(), tsv: text(), lock: text(),

  // ── 文本：脚本语言 ────────────────────────────────────────────────────────
  py: text('python'), pyw: text('python'), pyx: text('python'), pyi: text('python'),
  rb: text('ruby'), rbs: text('ruby'), rake: text('ruby'), gemspec: text('ruby'),
  php: text('php'), phtml: text('php'), php3: text('php'), php4: text('php'), php5: text('php'),
  lua: text('lua'),
  pl: text('perl'), pm: text('perl'), t: text('perl'), pod: text('perl'),
  r: text('r'), rmd: text('markdown'), jl: text('julia'),
  tcl: text('tcl'), gd: text(), feature: text(),

  // ── 文本：Shell ───────────────────────────────────────────────────────────
  sh: text('shell'), bash: text('shell'), zsh: text('shell'), ksh: text('shell'), fish: text('shell'),
  bat: text('bat'), cmd: text('bat'),
  ps1: text('powershell'), psm1: text('powershell'), ps1m: text('powershell'), psd1: text('powershell'),

  // ── 文本：系统编程 ────────────────────────────────────────────────────────
  c: text('cpp'), h: text('cpp'),
  cpp: text('cpp'), cc: text('cpp'), cxx: text('cpp'), 'c++': text('cpp'),
  hpp: text('cpp'), hxx: text('cpp'), hh: text('cpp'), inc: text('cpp'), ino: text('cpp'),
  cs: text('csharp'), vb: text('vb'), vbs: text('vb'), bas: text('vb'),
  java: text('java'), jav: text('java'),
  kt: text('kotlin'), kts: text('kotlin'),
  swift: text('swift'), go: text('go'), rs: text('rust'), dart: text('dart'),
  scala: text('scala'), sc: text('scala'), sbt: text('scala'),
  nim: text(), zig: text(), v: text(), vsh: text(), odin: text(), cr: text(),

  // ── 文本：函数式 ──────────────────────────────────────────────────────────
  ml: text(), mli: text(),
  fs: text('fsharp'), fsi: text('fsharp'), fsx: text('fsharp'), fsscript: text('fsharp'),
  hs: text(), lhs: text(), elm: text(),
  clj: text('clojure'), cljs: text('clojure'), cljc: text('clojure'), edn: text('clojure'),
  ex: text('elixir'), exs: text('elixir'), eex: text(), leex: text(), heex: text(),
  erl: text(), hrl: text(),
  lisp: text(), lsp: text(), cl: text(), el: text(), elisp: text(),
  scm: text('scheme'), ss: text('scheme'), rkt: text(),

  // ── 文本：移动 / Apple 工程 ───────────────────────────────────────────────
  m: text('objective-c'), mm: text('objective-c'),
  pbxproj: text(), sln: text(),

  // ── 文本：数据库 / 接口定义 ───────────────────────────────────────────────
  sql: text('sql'), ddl: text('sql'), dml: text('sql'),
  graphql: text('graphql'), gql: text('graphql'), proto: text('protobuf'), prisma: text(),

  // ── 文本：标记 / 文档 ─────────────────────────────────────────────────────
  md: text('markdown'), markdown: text('markdown'), mdx: text('mdx'),
  rst: text('restructuredtext'),
  tex: text(), sty: text(), cls: text(), bib: text(),
  adoc: text(), asciidoc: text(), asc: text(),
  org: text(), nfo: text(), rtf: text(), eps: text(), ps: text(),

  // ── 文本：DevOps / 构建 ───────────────────────────────────────────────────
  dockerfile: text('dockerfile'), dockerignore: text(),
  helm: text('yaml'), tf: text('hcl'), tfvars: text('hcl'), hcl: text('hcl'), nix: text(),
  nginx: text(), apache: text(), vhost: text(),
  makefile: text(), mk: text(), mak: text(), ninja: text(), meson: text(), just: text(),
  cmake: text(), 'cmake.in': text(),
  gradle: text(), groovy: text(), gvy: text(), gy: text(),
  bazel: text(), bzl: text(),
  ac: text(), am: text(), in: text(),

  // ── 文本：systemd / 桌面项 ────────────────────────────────────────────────
  desktop: text('ini'),
  service: text(), socket: text(), timer: text(), mount: text(), policy: text(), rules: text(),

  // ── 文本：证书（PEM 为文本） ───────────────────────────────────────────────
  // 注：`.key`（PEM 私钥）与 Keynote（zip 包）冲突，不注册——交给内容嗅探裁决：
  // '-----BEGIN' → text；'PK\x03\x04' → zip。
  pem: text(), crt: text(), cer: text(), pub: text(),

  // ── 文本：播放列表 / 字幕 / 邮件 / 快捷方式（均为文本格式） ────────────────
  m3u: text(), m3u8: text(), pls: text(), asx: text(), xspf: text(),
  srt: text(), ass: text(), ssa: text(), vtt: text(),
  eml: text(), url: text(), webloc: text(),

  // ── 文本：日志 / 杂项 ─────────────────────────────────────────────────────
  log: text(), logcat: text(), ips: text(),
  txt: text(), text: text(),
  asm: text(), s: text(), wat: text(),
  sol: text('solidity'), move: text(), coq: text(),
  verilog: text('systemverilog'), vlog: text('systemverilog'),
  sv: text('systemverilog'), svh: text('systemverilog'), vhdl: text(),
  coffee: text('coffee'), litcoffee: text('coffee'), pug: text('pug'),
  hbs: text('handlebars'), handlebars: text('handlebars'), mustache: text('handlebars'),
  ejs: text(), twig: text('twig'), liquid: text('liquid'), haml: text(), slim: text(), erb: text(),

  // ── 文本：着色器 / GPU ────────────────────────────────────────────────────
  glsl: text(), vert: text(), frag: text(), comp: text(), geom: text(),
  tesc: text(), tese: text(),
  hlsl: text(), fx: text(), shader: text(), cg: text(),
  cu: text('cpp'), cuh: text('cpp'), metal: text(),

  // ── 图片：Chromium <img> 原生可解 ─────────────────────────────────────────
  jpg: image, jpeg: image, png: image, gif: image, webp: image, avif: image,
  bmp: image, svg: image, ico: image,

  // ── 图片：Chromium 不可解，走主进程 sips（ImageDecodeService） ─────────────
  tiff: sipsImage, tif: sipsImage, heic: sipsImage, heif: sipsImage, psd: sipsImage,
  tga: sipsImage, sgi: sipsImage, jp2: sipsImage, pict: sipsImage, qtif: sipsImage,
  icns: sipsImage,
  dng: sipsImage, cr2: sipsImage, nef: sipsImage, arw: sipsImage,
  orf: sipsImage, raf: sipsImage, sr2: sipsImage, raw: sipsImage,

  // ── 视频（容器/编码不可解的进入播放器后报错并提供 hex/系统打开） ──────────
  mp4: video, m4v: video, mov: video, webm: video, mkv: video,
  avi: video, wmv: video, asf: video, flv: video, f4v: video,
  rmvb: video, rm: video, mpg: video, mpeg: video, mpe: video, vob: video,
  m2ts: video, '3gp': video, '3g2': video,
  ogv: video, ogm: video, divx: video, dv: video, amv: video, roq: video, mxf: video,
  qt: video, insv: video, lrv: video, prx: video, vid: video,
  // 注：`ts` 判为 TypeScript（MPEG-TS 用右键/打开方式进播放器已不可行，走 hex 兜底可看）

  // ── 音频 ──────────────────────────────────────────────────────────────────
  mp3: audio, flac: audio, aac: audio, ogg: audio, oga: audio,
  m4a: audio, m4b: audio, wav: audio, wma: audio,
  alac: audio, ape: audio, aiff: audio, aif: audio, amr: audio,
  opus: audio, ac3: audio, eac3: audio, caf: audio, mka: audio, pcm: audio,

  // ── PDF ───────────────────────────────────────────────────────────────────
  pdf: { kind: 'pdf' },

  // ── ZIP 族（.zip 双击进虚拟目录；其余开 zip 浏览 tab） ─────────────────────
  zip: zipOf(), jar: zipOf(), war: zipOf(), ear: zipOf(), apk: zipOf(), ipa: zipOf(),
  docx: zipOf('document'), xlsx: zipOf('document'), pptx: zipOf('document'),
  docm: zipOf('document'), xlsm: zipOf('document'), pptm: zipOf('document'),
  odt: zipOf(), ods: zipOf(), odp: zipOf(), epub: zipOf(), cbz: zipOf(),
  pages: zipOf('document'), numbers: zipOf('document'),
  whl: zipOf(), vsix: zipOf(), xpi: zipOf(), nupkg: zipOf(), sar: zipOf(), kmz: zipOf(),

  // ── 十六进制：压缩（非 zip，暂无应用内浏览） ───────────────────────────────
  rar: hexOf('archive'), '7z': hexOf('archive'), tar: hexOf('archive'), gz: hexOf('archive'),
  tgz: hexOf('archive'), bz2: hexOf('archive'), tbz: hexOf('archive'),
  xz: hexOf('archive'), txz: hexOf('archive'), zst: hexOf('archive'), lz4: hexOf('archive'),
  lz: hexOf('archive'), z: hexOf('archive'), br: hexOf('archive'),
  xar: hexOf('archive'), pkg: hexOf('archive'), iso: hexOf('archive'),

  // ── 十六进制：磁盘镜像 ─────────────────────────────────────────────────────
  dmg: hexOf(), sparseimage: hexOf(), sparsebundle: hexOf(),
  vmdk: hexOf(), vhd: hexOf(), vhdx: hexOf(), qcow2: hexOf(), vdi: hexOf(), wim: hexOf(),
  img: hexOf(),

  // ── 十六进制：Office OLE 二进制（右键可用系统应用打开） ─────────────────────
  doc: hexOf('document'), dot: hexOf('document'), xls: hexOf('document'),
  xlt: hexOf('document'), ppt: hexOf('document'), pps: hexOf('document'), msi: hexOf('document'),

  // ── 十六进制：库 / 编译产物 ────────────────────────────────────────────────
  bin: hexOf(), dat: hexOf(), o: hexOf(), a: hexOf(), class: hexOf(), wasm: hexOf(),
  dylib: hexOf(), so: hexOf(), exe: hexOf(), dll: hexOf(),
  lib: hexOf(), pdb: hexOf(), obj: hexOf(), node: hexOf(),
  pyc: hexOf(), pyo: hexOf(), elc: hexOf(), mo: hexOf(),
  hevc: hexOf(), h264: hexOf(),

  // ── 十六进制：字体 ────────────────────────────────────────────────────────
  ttf: hexOf(), otf: hexOf(), ttc: hexOf(), woff: hexOf(), woff2: hexOf(), eot: hexOf(), fon: hexOf(),

  // ── 十六进制：数据库文件 ──────────────────────────────────────────────────
  db: hexOf(), sqlite: hexOf(), sqlite3: hexOf(), db3: hexOf(), mdb: hexOf(), accdb: hexOf(), mdf: hexOf(),

  // ── 十六进制：证书二进制 / 杂项 ───────────────────────────────────────────
  der: hexOf(), p12: hexOf(), pfx: hexOf(), jks: hexOf(), keystore: hexOf(),
  mobileprovision: hexOf(),
  ds_store: hexOf(), swf: hexOf(), lnk: hexOf(),

  // ── 十六进制：无解码器的图片格式（GIMP/EXR/HDR/netpbm） ────────────────────
  xcf: hexOf(), exr: hexOf(), hdr: hexOf(),
  pbm: hexOf(), pgm: hexOf(), ppm: hexOf(), pam: hexOf(),
}

// ── 文件名规则（path.extname 对这些返回 ''，扩展名表永远接不到） ───────────────
// 精确名 → Monaco 语言（kind 恒为 text）。
export const EXACT_FILENAMES: Record<string, string> = {
  makefile: 'plaintext', gnumakefile: 'plaintext',
  dockerfile: 'dockerfile',
  rakefile: 'ruby', gemfile: 'ruby', vagrantfile: 'ruby',
  justfile: 'plaintext', kbuild: 'plaintext', procfile: 'plaintext', configure: 'plaintext',
  build: 'plaintext', 'build.bazel': 'plaintext', 'module.bazel': 'plaintext', workspace: 'plaintext',
  config: 'ini',
  id_rsa: 'plaintext', id_ed25519: 'plaintext', id_ecdsa: 'plaintext', id_dsa: 'plaintext',
  authorized_keys: 'plaintext', known_hosts: 'plaintext',
}

// 前缀名 → Monaco 语言。仅当扩展名未命中注册表、且文件名无扩展名或是点文件时生效，
// 避免误伤 "Installer.bin" 这类恰好前缀相同的文件。
export const FILENAME_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['cmakelists', 'plaintext'],
  ['dockerfile', 'dockerfile'],
  ['readme', 'plaintext'], ['changelog', 'plaintext'],
  ['license', 'plaintext'], ['licence', 'plaintext'], ['copying', 'plaintext'],
  ['notice', 'plaintext'], ['authors', 'plaintext'], ['contributing', 'plaintext'],
  ['install', 'plaintext'], ['todo', 'plaintext'], ['version', 'plaintext'], ['news', 'plaintext'],
  ['gemfile', 'ruby'], ['id_rsa', 'plaintext'], ['id_ed25519', 'plaintext'],
  ['.gitignore', 'plaintext'], ['.gitattributes', 'plaintext'], ['.gitmodules', 'plaintext'],
  ['.dockerignore', 'plaintext'], ['.editorconfig', 'ini'],
  ['.npmrc', 'ini'], ['.yarnrc', 'ini'], ['.nvmrc', 'plaintext'],
  ['.babelrc', 'json'], ['.eslintrc', 'json'], ['.prettierrc', 'json'],
  ['.env', 'ini'],
  ['.zshrc', 'shell'], ['.bashrc', 'shell'], ['.bash_profile', 'shell'], ['.profile', 'shell'],
  ['.vimrc', 'plaintext'], ['.gvimrc', 'plaintext'],
  ['.gitconfig', 'ini'], ['.curlrc', 'ini'], ['.wgetrc', 'ini'],
]

// ── 派生集合 ──────────────────────────────────────────────────────────────────
const KIND_DEFAULT_CAT: Record<FilePreviewKind, FileCategory> = {
  text: 'text', image: 'image', video: 'video', audio: 'audio',
  pdf: 'document', zip: 'archive', hex: 'unknown',
}

export const IMAGE_EXTS: ReadonlySet<string> = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'image').map(([e]) => e)
)
export const SIPS_IMAGE_EXTS: ReadonlySet<string> = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'image' && d.sips).map(([e]) => e)
)
export const VIDEO_EXTS: ReadonlySet<string> = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'video').map(([e]) => e)
)
export const AUDIO_EXTS: ReadonlySet<string> = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === 'audio').map(([e]) => e)
)

/** sharp 可直接读取并进入编辑管道的图片格式（不含 SVG/ICO 等矢量或复合格式）。 */
export const SHARP_IMAGE_EXTS: ReadonlySet<string> = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'avif', 'bmp',
])

/** 可编辑图片 = sharp 直读 ∪ SIPS 解码集（HEIC/相机 RAW 等，经 sips 解码后进入管道）。 */
export const EDITABLE_IMAGE_EXTS: ReadonlySet<string> = new Set([...SHARP_IMAGE_EXTS, ...SIPS_IMAGE_EXTS])

export function isEditableImageExt(extension: string): boolean {
  return EDITABLE_IMAGE_EXTS.has(normalizeExt(extension))
}

// ── 查询函数 ──────────────────────────────────────────────────────────────────

export function normalizeExt(extension: string): string {
  return extension.toLowerCase().replace(/^\./, '')
}

/** 文件名规则命中时的合成定义（语言供 Monaco 用）。 */
function matchFilenameRule(lowerName: string): FileKindDef | null {
  const exact = EXACT_FILENAMES[lowerName]
  if (exact !== undefined) return text(exact)
  for (const [prefix, lang] of FILENAME_PREFIXES) {
    if (lowerName.startsWith(prefix)) return text(lang)
  }
  return null
}

/**
 * 解析打开方式。优先级：扩展名注册表 > 文件名规则（仅无扩展名/点文件可触达）。
 * 返回 null 表示需要内容嗅探兜底（调用方读头部字节走 sniffPreviewKind）。
 */
export function resolveFileKindDef(name: string, extension: string): FileKindDef | null {
  const def = EXTENSION_KINDS[normalizeExt(extension)]
  if (def) return def
  const lower = name.toLowerCase()
  // 前缀规则仅两类文件可触达：完全无扩展名（Makefile / LICENSE）与
  // 点文件族（.gitignore / .env.production——lastIndexOf('.') 不在首位但
  // 整名以点开头）。带普通扩展名的交给嗅探，避免 "Installer.bin" 被误判。
  // 精确名（build.bazel / known_hosts 等）无此限制。
  if (EXACT_FILENAMES[lower] !== undefined) return text(EXACT_FILENAMES[lower])
  const dot = lower.lastIndexOf('.')
  if (dot === -1 || lower.startsWith('.')) return matchFilenameRule(lower)
  return null
}

export function resolveFileKind(name: string, extension: string): FilePreviewKind | null {
  return resolveFileKindDef(name, extension)?.kind ?? null
}

/** Monaco 语言：扩展名表优先（README.md→markdown），文件名规则兜底。 */
export function getLanguageForFile(name: string, extension: string): string {
  const e = normalizeExt(extension)
  const def = EXTENSION_KINDS[e]
  if (def?.kind === 'text' && def.lang) return def.lang
  if (e === 'svg') return 'xml'
  const rule = matchFilenameRule(name.toLowerCase())
  if (rule?.lang) return rule.lang
  return 'plaintext'
}

/** 分类（图标回退 / FileInfoDialog / FileDiffView）。 */
export function getFileCategoryFor(name: string, extension: string): FileCategory {
  const def = resolveFileKindDef(name, extension)
  return def ? (def.cat ?? KIND_DEFAULT_CAT[def.kind]) : 'unknown'
}

// ── 内容嗅探（读头部 8KB；调用方：renderer preview store） ─────────────────────

export const SNIFF_HEADER_BYTES = 8192

function startsWith(b: Uint8Array, sig: string, offset = 0): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (b[offset + i] !== sig.charCodeAt(i)) return false
  }
  return true
}

function asciiAt(b: Uint8Array, offset: number, len: number): string {
  let s = ''
  for (let i = 0; i < len && offset + i < b.length; i++) s += String.fromCharCode(b[offset + i])
  return s
}

/**
 * 无 NUL 字节且可打印字符占比高（容忍 UTF-8/GBK 多字节与少量控制字符）。
 * 阈值 1/64：文本里坏字节超过 ~1.5% 即视为二进制。
 */
export function looksLikeText(b: Uint8Array): boolean {
  const len = Math.min(b.length, SNIFF_HEADER_BYTES)
  let bad = 0
  for (let i = 0; i < len; i++) {
    const c = b[i]
    if (c === 0) return false
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) bad++
  }
  return bad * 64 < len
}

/**
 * 魔数嗅探：根据头部字节判定打开方式。
 * 返回 null 表示无法判定（空/读取失败场景由调用方决定兜底）。
 */
export function sniffPreviewKind(b: Uint8Array): FilePreviewKind | null {
  if (b.length === 0) return 'text'

  // 压缩/归档（zip 单列；其余归档暂无应用内浏览 → hex）
  if (startsWith(b, 'PK\x03\x04') || startsWith(b, 'PK\x05\x06') || startsWith(b, 'PK\x07\x08')) return 'zip'
  if (startsWith(b, 'Rar!')) return 'hex'
  if (startsWith(b, '7z\xbc\xaf')) return 'hex'
  if (b[0] === 0x1f && b[1] === 0x8b) return 'hex' // gzip
  if (startsWith(b, 'BZh')) return 'hex' // bzip2
  if (startsWith(b, '\xfd7zXZ')) return 'hex' // xz
  if (b.length > 261 && asciiAt(b, 257, 5) === 'ustar') return 'hex' // tar

  // 文档
  if (startsWith(b, '%PDF-')) return 'pdf'
  if (startsWith(b, '\xd0\xcf\x11\xe0')) return 'hex' // OLE（doc/xls/ppt/msi）

  // 图片
  if (startsWith(b, '\x89PNG')) return 'image'
  if (startsWith(b, '\xff\xd8\xff')) return 'image' // JPEG
  if (startsWith(b, 'GIF87a') || startsWith(b, 'GIF89a')) return 'image'
  if (startsWith(b, 'BM') && b.length > 14) return 'image' // BMP
  if (startsWith(b, 'II*\x00') || startsWith(b, 'MM\x00*')) return 'image' // TIFF 系
  if (startsWith(b, '8BPS')) return 'image' // PSD
  if (startsWith(b, 'icns')) return 'image'
  if (asciiAt(b, 4, 4) === 'ftyp') {
    const brand = asciiAt(b, 8, 4)
    // HEIC/HEIF 系列 brand；其余 ftyp（isom/mp42/qt 等）按视频
    return brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1' ? 'image' : 'video'
  }

  // RIFF 家族
  if (startsWith(b, 'RIFF')) {
    const sub = asciiAt(b, 8, 4)
    if (sub === 'WEBP') return 'image'
    if (sub === 'WAVE') return 'audio'
    if (sub === 'AVI ') return 'video'
    return 'hex'
  }

  // 音视频流
  // UTF-16 BOM（FF FE / FE FF）先于 MP3 帧同步（FF Ex）判定，避免撞车
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return 'text'
  if (startsWith(b, 'OggS')) return 'audio'
  if (startsWith(b, 'fLaC')) return 'audio'
  if (startsWith(b, 'ID3')) return 'audio'
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio' // MP3 帧同步

  // 可执行 / 库 / 字体 / 数据库 / 二进制 plist
  if (startsWith(b, 'MZ')) return 'hex'
  if (startsWith(b, '\x7fELF')) return 'hex'
  const m0 = (b[0] << 8) | b[1]
  const m1 = (b[2] << 8) | b[3]
  if (m0 === 0xfeed || m0 === 0xcefa || m0 === 0xcffa || m0 === 0xcafe) return 'hex' // Mach-O / class
  if (asciiAt(b, 0, 4) === 'wOFF' || asciiAt(b, 0, 4) === 'wOF2' ||
      asciiAt(b, 0, 4) === 'OTTO' || asciiAt(b, 0, 4) === 'ttcf' ||
      (m0 === 0x0001 && m1 === 0x0000)) return 'hex' // 字体
  if (startsWith(b, 'SQLite format 3')) return 'hex'
  if (startsWith(b, 'bplist00')) return 'hex'

  return looksLikeText(b) ? 'text' : 'hex'
}
