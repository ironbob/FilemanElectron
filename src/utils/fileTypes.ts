export const extensionCategories = {
  text: new Set(['txt', 'log', 'json', 'xml', 'yml', 'yaml', 'csv', 'md', 'mm', 'm', 'cpp', 'h', 'hpp', 'c', 'cc', 'cxx', 'c++', 
                 'cs', 'java', 'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'php', 'php3', 'php4', 'php5', 
                 'phtml', 'rb', 'ruby', 'erb', 'pl', 'pm', 'perl', 'go', 'rs', 'swift', 'kt', 'kts', 'scala', 'groovy', 'sql', 'sh', 
                 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'ini', 'conf', 'cfg', 'toml', 'lua', 'tcl', 'asm', 's', 'dart', 'fs', 'fsx', 
                 'fsharp', 'hs', 'lhs', 'haskell', 'ml', 'mli', 'ocaml', 'erl', 'hrl', 'elixir', 'clj', 'cljs', 'cljc', 'clojure', 
                 'lisp', 'el', 'elisp', 'vim', 'vimrc', 'tex', 'latex', 'rst', 'adoc', 'asciidoc', 'graphql', 'gql', 'proto', 
                 'dockerfile', 'dockerignore', 'gitignore', 'gitattributes', 'gitmodules', 'properties', 'env', 'envrc', 'makefile', 
                 'mk', 'mak', 'cmake', 'cmake.in', 'gradle', 'gradle.kts', 'pom', 'logcat', 'ips']),
  
  video: new Set(['mp4', 'mov', 'avi', 'mkv', 'insv', 'lrv', 'prx', 'webm', 'wav', '3gp', '3g2', 'ts', 'mts', 'm2ts', 'flv', 'f4v', 
                  'rmvb', 'rm', 'mpeg', 'mpg', 'mpe', 'vob', 'ogv', 'ogm', 'mxf', 'roq', 'divx', 'wmv', 'asf', 'dv', 'amv', 'dat', 
                  'qt', 'vid', 'hevc', 'h264']),
  
  image: new Set(['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp', 'avif', 'tiff', 'ico', 'dng', 'heic', 'heif', 'raw', 'arw', 'cr2', 'nef',
                  'orf', 'raf', 'sr2', 'psd', 'xcf', 'pbm', 'pgm', 'ppm', 'pam', 'exr', 'hdr']),
  
  audio: new Set(['mp3', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'alac', 'ape', 'aiff', 'amr', 'ac3', 'eac3', 'opus', 'wavpack', 'pcm', 
                  'mka', 'm3u', 'm4b', 'caf']),
  
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso']),
  
  document: new Set(['pdf', 'md', 'markdown', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']),
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
  const ext = extension.toLowerCase().replace('.', '')
  if (extensionCategories.image.has(ext)) return 'image'
  if (extensionCategories.video.has(ext)) return 'video'
  if (extensionCategories.audio.has(ext)) return 'audio'
  if (extensionCategories.archive.has(ext)) return 'archive'
  if (extensionCategories.document.has(ext)) return 'document'
  if (extensionCategories.text.has(ext)) return 'text'
  return 'unknown'
}

export function getFileIcon(extension: string): string {
  const ext = extension.toLowerCase().replace('.', '')
  return extensionIconMap[ext] || 'ic_file.svg'
}

export function isImageFile(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '')
  return extensionCategories.image.has(ext)
}

export function isVideoFile(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '')
  return extensionCategories.video.has(ext)
}

export function isThumbnailable(extension: string): boolean {
  return isImageFile(extension) || isVideoFile(extension)
}

/**
 * Image formats Chromium cannot decode natively and must route through the
 * main-process native decoder (macOS `sips` via ImageDecodeService).
 * Renderer-side single source of truth. Keep aligned with the electron-side
 * SUPPORTED_IMAGE_FORMATS in ThumbnailService.ts.
 */
export const NATIVE_DECODE_EXTS = new Set([
  'heic', 'heif', 'cr2', 'nef', 'arw', 'dng', 'orf', 'raf', 'sr2', 'raw'
])

export function needsNativeDecode(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '')
  return NATIVE_DECODE_EXTS.has(ext)
}
