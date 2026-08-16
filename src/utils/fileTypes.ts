/**
 * 分类 / 图标工具。分类不再手写清单——全部从 shared/fileKinds.ts 注册表派生，
 * 与双击路由（getPreviewType）、Monaco 语言、缩略图格式保持单一事实源。
 * 图标映射（extensionIconMap）是纯外观，允许独立维护。
 */
import {
  EXTENSION_KINDS,
  IMAGE_EXTS,
  SIPS_IMAGE_EXTS,
  VIDEO_EXTS,
  getFileCategoryFor,
  normalizeExt,
  type FileCategory,
} from '@shared/fileKinds'

function categorySet(cat: FileCategory): Set<string> {
  return new Set(
    Object.keys(EXTENSION_KINDS).filter(ext => getFileCategoryFor('', ext) === cat)
  )
}

export const extensionCategories = {
  text: categorySet('text'),
  image: categorySet('image'),
  video: categorySet('video'),
  audio: categorySet('audio'),
  archive: categorySet('archive'),
  document: categorySet('document'),
}

export const extensionIconMap: Record<string, string> = {
  c: 'ic_c.svg',
  cpp: 'ic_cpp.svg',
  h: 'ic_h.svg',
  hpp: 'ic_hpp.svg',
  java: 'ic_java.svg',
  js: 'ic_js.svg',
  jsx: 'ic_js.svg',
  ts: 'ic_tsx.svg',
  tsx: 'ic_tsx.svg',
  py: 'ic_python_color.svg',
  go: 'ic_go.svg',
  rs: 'ic_code.svg',
  php: 'ic_php.svg',
  rb: 'ic_ruby_color.svg',
  swift: 'ic_swift.svg',
  kt: 'ic_kt.svg',
  sh: 'ic_sh.svg',
  bash: 'ic_sh.svg',
  zsh: 'ic_sh.svg',
  m: 'ic_objc.svg',
  mm: 'ic_objc.svg',
  scala: 'ic_java.svg',
  lua: 'ic_code.svg',
  dart: 'ic_code.svg',
  pl: 'ic_perl.svg',
  json: 'ic_json.svg',
  xml: 'ic_xml.svg',
  yaml: 'ic_yml.svg',
  yml: 'ic_yml.svg',
  csv: 'ic_csv.svg',
  toml: 'ic_properties.svg',
  sql: 'ic_sql.svg',
  properties: 'ic_properties.svg',
  gradle: 'ic_gradle.svg',
  ini: 'ic_properties.svg',
  cfg: 'ic_properties.svg',
  conf: 'ic_properties.svg',
  jpg: 'ic_jpg_blue.svg',
  jpeg: 'ic_jpg_blue.svg',
  png: 'ic_png.svg',
  gif: 'ic_picture.svg',
  webp: 'ic_picture.svg',
  svg: 'ic_svg.svg',
  bmp: 'ic_picture.svg',
  ico: 'ic_picture.svg',
  tiff: 'ic_picture.svg',
  dng: 'ic_picture.svg',
  heic: 'ic_picture.svg',
  heif: 'ic_picture.svg',
  raw: 'ic_picture.svg',
  psd: 'ic_picture.svg',
  mp3: 'ic_mp3.svg',
  flac: 'ic_audio.svg',
  aac: 'ic_audio.svg',
  wav: 'ic_wave.svg',
  m4a: 'ic_audio.svg',
  wma: 'ic_audio.svg',
  alac: 'ic_audio.svg',
  ape: 'ic_audio.svg',
  aiff: 'ic_audio.svg',
  ogg: 'ic_audio.svg',
  mp4: 'ic_mp4.svg',
  mov: 'ic_mov.svg',
  avi: 'ic_video.svg',
  mkv: 'ic_video.svg',
  webm: 'ic_video.svg',
  flv: 'ic_video.svg',
  wmv: 'ic_video.svg',
  rmvb: 'ic_video.svg',
  '3gp': 'ic_video.svg',
  zip: 'ic_zip.svg',
  rar: 'ic_archive.svg',
  '7z': 'ic_archive.svg',
  tar: 'ic_archive.svg',
  gz: 'ic_archive.svg',
  bz2: 'ic_archive.svg',
  iso: 'ic_archive.svg',
  pdf: 'ic_pdf.svg',
  doc: 'ic_file.svg',
  docx: 'ic_file.svg',
  xls: 'ic_file.svg',
  xlsx: 'ic_file.svg',
  ppt: 'ic_file.svg',
  pptx: 'ic_file.svg',
  md: 'ic_md.svg',
  markdown: 'ic_markdown.svg',
  html: 'ic_html.svg',
  htm: 'ic_html.svg',
  css: 'ic_code.svg',
  vue: 'ic_vue.svg',
  log: 'ic_log.svg',
  txt: 'ic_txt.svg',
  dockerfile: 'ic_code.svg',
  gitignore: 'ic_code.svg',
  cmake: 'ic_cmake.svg',
  makefile: 'ic_cmake.svg',
  command: 'ic_command.svg',
  shell: 'ic_shell.svg',
  torrent: 'ic_torrent.svg',
  db: 'ic_db.svg',
  licence: 'ic_licence.svg',
  license: 'ic_licence.svg',
  apk: 'ic_apk.svg',
  pkg: 'ic_pkg.svg',
  dmg: 'ic_dmg.svg',
  exe: 'ic_command.svg',
  deb: 'ic_pkg.svg',
  rpm: 'ic_pkg.svg',
}

export function getFileCategory(extension: string): string {
  return getFileCategoryFor('', extension)
}

export function getFileIcon(extension: string): string {
  const ext = extension.toLowerCase().replace('.', '')
  return extensionIconMap[ext] || 'ic_file.svg'
}

export function isImageFile(extension: string): boolean {
  return IMAGE_EXTS.has(normalizeExt(extension))
}

export function isVideoFile(extension: string): boolean {
  return VIDEO_EXTS.has(normalizeExt(extension))
}

export function isThumbnailable(extension: string): boolean {
  return isImageFile(extension) || isVideoFile(extension)
}

/** 图片扩展名（带点小写，如 '.jpg'），供主进程 search 的 fileTypes 过滤参数使用。 */
export const IMAGE_EXTENSIONS_WITH_DOT: string[] = [...IMAGE_EXTS].map(ext => `.${ext}`)

/**
 * Image formats Chromium cannot decode natively and must route through the
 * main-process native decoder (macOS `sips` via ImageDecodeService).
 * Derived from the shared registry (SIPS_IMAGE_EXTS) — no separate list.
 */
export const NATIVE_DECODE_EXTS: ReadonlySet<string> = SIPS_IMAGE_EXTS

export function needsNativeDecode(extension: string): boolean {
  return SIPS_IMAGE_EXTS.has(normalizeExt(extension))
}
