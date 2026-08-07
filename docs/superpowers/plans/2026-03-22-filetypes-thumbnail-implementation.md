# File Types Extraction and Thumbnail System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract file type mappings to a dedicated module and implement a thumbnail system for images and videos with hybrid caching.

**Architecture:** 
- Frontend: ThumbnailStore (Pinia) manages memory cache and requests thumbnails via IPC
- Backend: ThumbnailService generates thumbnails using Sharp (images) and ffmpeg (videos), stores in disk cache
- Cache Key: MD5 hash of deviceId + path + size + mtime

**Tech Stack:** Vue 3, Pinia, Electron, Sharp, ffmpeg-static

---

## File Structure

### New Files
- `src/utils/fileTypes.ts` - File type classification and icon mapping
- `src/stores/thumbnail.ts` - Thumbnail store (memory cache)
- `electron/src/services/ThumbnailService.ts` - Thumbnail generation service

### Modified Files
- `src/components/FileList.vue` - Import from fileTypes.ts, display thumbnails
- `src/env.d.ts` - Add thumbnail IPC type declarations
- `electron/main.ts` - Initialize ThumbnailService, add IPC handlers
- `electron/preload.ts` - Expose thumbnail APIs
- `package.json` - Add sharp and ffmpeg-static dependencies

---

## Task 1: Extract File Types Module

**Files:**
- Create: `src/utils/fileTypes.ts`
- Modify: `src/components/FileList.vue`

- [ ] **Step 1: Create fileTypes.ts with extension categories and icon mappings**

```typescript
// src/utils/fileTypes.ts

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
  
  image: new Set(['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp', 'tiff', 'ico', 'dng', 'heic', 'heif', 'raw', 'arw', 'cr2', 'nef', 
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
```

- [ ] **Step 2: Update FileList.vue to import from fileTypes.ts**

Remove the inline `extensionCategories` and `extensionIconMap` definitions (lines 252-403) and add import at the top:

```typescript
import { extensionCategories, extensionIconMap, isThumbnailable } from '@/utils/fileTypes'
```

- [ ] **Step 3: Verify build passes**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/utils/fileTypes.ts src/components/FileList.vue
git commit -m "refactor: extract file type mappings to dedicated module"
```

---

## Task 2: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install sharp and ffmpeg-static**

```bash
npm install sharp ffmpeg-static
npm install -D @types/sharp
```

- [ ] **Step 2: Verify installation**

Run: `npm list sharp ffmpeg-static`
Expected: Both packages listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add sharp and ffmpeg-static dependencies"
```

---

## Task 3: Create ThumbnailService (Main Process)

**Files:**
- Create: `electron/src/services/ThumbnailService.ts`

- [ ] **Step 1: Create ThumbnailService.ts**

```typescript
// electron/src/services/ThumbnailService.ts
import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'

const THUMBNAIL_SIZES = {
  small: { width: 32, height: 32 },
  large: { width: 128, height: 128 },
}

const SUPPORTED_IMAGE_FORMATS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'raw', 'svg'
])

const SUPPORTED_VIDEO_FORMATS = new Set([
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', 'ts', 'mts', 'm2ts'
])

interface ThumbnailResult {
  cacheKey: string
  thumbnailBase64: string
}

export class ThumbnailService {
  private cacheDir: string
  private maxDiskCacheSize = 500 * 1024 * 1024 // 500MB

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'thumbnails')
    this.ensureCacheDir()
  }

  private async ensureCacheDir(): Promise<void> {
    await fs.ensureDir(this.cacheDir)
  }

  generateCacheKey(
    deviceId: string,
    filePath: string,
    size: number,
    mtime: string
  ): string {
    const raw = `${deviceId}:${filePath}:${size}:${mtime}`
    return crypto.createHash('md5').update(raw).digest('hex').slice(0, 16)
  }

  async getThumbnail(
    deviceId: string,
    filePath: string,
    size: number,
    mtime: string,
    thumbnailSize: 'small' | 'large',
    readFile: (deviceId: string, path: string) => Promise<Buffer>
  ): Promise<ThumbnailResult | null> {
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime)
    
    // Check disk cache
    const cachedThumbnail = await this.getFromDiskCache(cacheKey)
    if (cachedThumbnail) {
      return { cacheKey, thumbnailBase64: cachedThumbnail }
    }

    // Generate thumbnail
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const dimensions = THUMBNAIL_SIZES[thumbnailSize]
    
    let thumbnailBuffer: Buffer | null = null

    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions)
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions)
    }

    if (!thumbnailBuffer) {
      return null
    }

    // Save to disk cache
    await this.saveToDiskCache(cacheKey, thumbnailBuffer)

    return {
      cacheKey,
      thumbnailBase64: thumbnailBuffer.toString('base64')
    }
  }

  private async getFromDiskCache(cacheKey: string): Promise<string | null> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.webp`)
    try {
      if (await fs.pathExists(cachePath)) {
        const buffer = await fs.readFile(cachePath)
        return buffer.toString('base64')
      }
    } catch {
      // Ignore cache read errors
    }
    return null
  }

  private async saveToDiskCache(cacheKey: string, thumbnailBuffer: Buffer): Promise<void> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.webp`)
    try {
      await fs.writeFile(cachePath, thumbnailBuffer)
    } catch (e) {
      console.error('[ThumbnailService] Failed to save to disk cache:', e)
    }
  }

  private async generateImageThumbnail(
    filePath: string,
    deviceId: string,
    readFile: (deviceId: string, path: string) => Promise<Buffer>,
    dimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    try {
      const fileBuffer = await readFile(deviceId, filePath)
      
      return await sharp(fileBuffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer()
    } catch (e) {
      console.error('[ThumbnailService] Failed to generate image thumbnail:', e)
      return null
    }
  }

  private async generateVideoThumbnail(
    filePath: string,
    deviceId: string,
    readFile: (deviceId: string, path: string) => Promise<Buffer>,
    dimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    if (!ffmpeg) {
      console.error('[ThumbnailService] ffmpeg not available')
      return null
    }

    try {
      // For local files, use ffmpeg directly on the file path
      if (deviceId === 'local') {
        return await this.extractVideoFrameLocal(filePath, dimensions)
      }
      
      // For remote files, we'd need to download first or stream
      // For now, return null for remote videos
      console.warn('[ThumbnailService] Video thumbnail for remote files not yet supported')
      return null
    } catch (e) {
      console.error('[ThumbnailService] Failed to generate video thumbnail:', e)
      return null
    }
  }

  private async extractVideoFrameLocal(
    filePath: string,
    dimensions: { width: number; height: number }
  ): Promise<Buffer | null> {
    const { execFile } = require('child_process')
    const util = require('util')
    const execFileAsync = util.promisify(execFile)

    const tempDir = app.getPath('temp')
    const outputPath = path.join(tempDir, `thumb_${Date.now()}.webp`)

    try {
      // Extract frame at 1 second or 10% of video
      await execFileAsync(ffmpeg, [
        '-i', filePath,
        '-ss', '00:00:01',
        '-vframes', '1',
        '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
        '-y',
        outputPath
      ], { timeout: 10000 })

      const buffer = await fs.readFile(outputPath)
      await fs.unlink(outputPath).catch(() => {})
      
      return buffer
    } catch (e) {
      // Try with first frame if 1 second fails
      try {
        await execFileAsync(ffmpeg, [
          '-i', filePath,
          '-ss', '00:00:00',
          '-vframes', '1',
          '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
          '-y',
          outputPath
        ], { timeout: 10000 })

        const buffer = await fs.readFile(outputPath)
        await fs.unlink(outputPath).catch(() => {})
        return buffer
      } catch {
        return null
      }
    }
  }

  async clearCache(): Promise<void> {
    await fs.emptyDir(this.cacheDir)
  }

  async getCacheSize(): Promise<number> {
    let totalSize = 0
    try {
      const files = await fs.readdir(this.cacheDir)
      for (const file of files) {
        const stat = await fs.stat(path.join(this.cacheDir, file))
        totalSize += stat.size
      }
    } catch {
      // Ignore errors
    }
    return totalSize
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/services/ThumbnailService.ts
git commit -m "feat: add ThumbnailService for image and video thumbnails"
```

---

## Task 4: Add IPC Handlers and Preload API

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add IPC handlers in main.ts**

Add after the existing IPC handlers:

```typescript
// Import at top
import { ThumbnailService } from './src/services/ThumbnailService'

// Initialize after other services
const thumbnailService = new ThumbnailService()

// Add IPC handlers (after existing handlers)
ipcMain.handle('thumbnail:get', async (_, deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') => {
  return thumbnailService.getThumbnail(
    deviceId,
    filePath,
    size,
    mtime,
    thumbnailSize,
    (devId, path) => deviceManager.readFile(devId, path)
  )
})

ipcMain.handle('thumbnail:clearCache', async () => {
  await thumbnailService.clearCache()
})

ipcMain.handle('thumbnail:getCacheSize', async () => {
  return thumbnailService.getCacheSize()
})
```

- [ ] **Step 2: Add preload API in preload.ts**

Add to the `fileman` object:

```typescript
thumbnail: {
  get: (deviceId: string, filePath: string, size: number, mtime: string, thumbnailSize: 'small' | 'large') => 
    ipcRenderer.invoke('thumbnail:get', deviceId, filePath, size, mtime, thumbnailSize),
  clearCache: () => ipcRenderer.invoke('thumbnail:clearCache'),
  getCacheSize: () => ipcRenderer.invoke('thumbnail:getCacheSize'),
},
```

- [ ] **Step 3: Add type declarations in env.d.ts**

Add to the `FilemanAPI` interface:

```typescript
thumbnail: {
  get: (
    deviceId: string,
    filePath: string,
    size: number,
    mtime: string,
    thumbnailSize: 'small' | 'large'
  ) => Promise<{ cacheKey: string; thumbnailBase64: string } | null>
  clearCache: () => Promise<void>
  getCacheSize: () => Promise<number>
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: add thumbnail IPC handlers and preload API"
```

---

## Task 5: Create ThumbnailStore (Renderer)

**Files:**
- Create: `src/stores/thumbnail.ts`

- [ ] **Step 1: Create thumbnail.ts store**

```typescript
// src/stores/thumbnail.ts
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { FileInfo } from '@/types'

const MAX_MEMORY_CACHE_SIZE = 200

export const useThumbnailStore = defineStore('thumbnail', () => {
  const thumbnails = reactive<Map<string, string>>(new Map())
  const pendingRequests = new Set<string>()
  const cacheOrder = ref<string[]>([])

  function generateCacheKey(
    deviceId: string,
    file: FileInfo
  ): string {
    const raw = `${deviceId}:${file.path}:${file.size}:${file.modifiedTime}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).slice(0, 16)
  }

  async function getThumbnail(
    deviceId: string,
    file: FileInfo,
    size: 'small' | 'large'
  ): Promise<string | null> {
    const cacheKey = generateCacheKey(deviceId, file)
    
    // Check memory cache
    if (thumbnails.has(cacheKey)) {
      return thumbnails.get(cacheKey) || null
    }

    // Avoid duplicate requests
    if (pendingRequests.has(cacheKey)) {
      return null
    }

    pendingRequests.add(cacheKey)

    try {
      const result = await window.fileman.thumbnail.get(
        deviceId,
        file.path,
        file.size,
        file.modifiedTime,
        size
      )

      if (result) {
        // LRU eviction
        if (thumbnails.size >= MAX_MEMORY_CACHE_SIZE && cacheOrder.value.length > 0) {
          const oldestKey = cacheOrder.value.shift()
          if (oldestKey) {
            thumbnails.delete(oldestKey)
          }
        }
        
        thumbnails.set(cacheKey, result.thumbnailBase64)
        cacheOrder.value.push(cacheKey)
        return result.thumbnailBase64
      }
    } catch (e) {
      console.error('[ThumbnailStore] Failed to get thumbnail:', e)
    } finally {
      pendingRequests.delete(cacheKey)
    }

    return null
  }

  function preloadThumbnails(
    deviceId: string,
    files: FileInfo[],
    size: 'small' | 'large'
  ): void {
    for (const file of files) {
      const cacheKey = generateCacheKey(deviceId, file)
      if (!thumbnails.has(cacheKey) && !pendingRequests.has(cacheKey)) {
        getThumbnail(deviceId, file, size)
      }
    }
  }

  function clearMemoryCache(): void {
    thumbnails.clear()
    cacheOrder.value = []
    pendingRequests.clear()
  }

  async function clearDiskCache(): Promise<void> {
    await window.fileman.thumbnail.clearCache()
  }

  return {
    thumbnails,
    getThumbnail,
    preloadThumbnails,
    clearMemoryCache,
    clearDiskCache,
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/thumbnail.ts
git commit -m "feat: add ThumbnailStore for memory cache management"
```

---

## Task 6: Update FileList.vue to Display Thumbnails

**Files:**
- Modify: `src/components/FileList.vue`

- [ ] **Step 1: Import ThumbnailStore and add thumbnail display logic**

Add imports:

```typescript
import { useThumbnailStore } from '@/stores/thumbnail'
import { isThumbnailable } from '@/utils/fileTypes'
```

Add store initialization:

```typescript
const thumbnailStore = useThumbnailStore()
```

Add thumbnail state:

```typescript
const thumbnailData = reactive<Map<string, string>>(new Map())
```

Add thumbnail loading function:

```typescript
async function loadThumbnail(file: FileInfo): Promise<void> {
  if (!isThumbnailable(file.extension || '')) return
  
  const size = props.viewMode === 'list' ? 'small' : 'large'
  const result = await thumbnailStore.getThumbnail(props.deviceId, file, size)
  
  if (result) {
    thumbnailData.set(file.path, result)
  }
}

function getThumbnailSrc(file: FileInfo): string | null {
  return thumbnailData.get(file.path) || null
}
```

Add watcher to load thumbnails when files change:

```typescript
watch([files, () => props.viewMode], () => {
  thumbnailData.clear()
  for (const file of files.value) {
    if (isThumbnailable(file.extension || '')) {
      loadThumbnail(file)
    }
  }
}, { immediate: true })
```

- [ ] **Step 2: Update List View template to show thumbnails**

Replace the icon component in list view with conditional thumbnail display:

```vue
<!-- In List View row -->
<div class="w-6 h-6 flex-shrink-0 flex items-center justify-center">
  <img
    v-if="isThumbnailable(file.extension || '') && getThumbnailSrc(file)"
    :src="`data:image/webp;base64,${getThumbnailSrc(file)}`"
    class="w-6 h-6 object-cover rounded"
    alt=""
  />
  <component v-else :is="getFileIconComponent(file)" class="w-6 h-6" />
</div>
```

- [ ] **Step 3: Update Grid View template to show thumbnails**

Replace the icon container in grid view:

```vue
<!-- In Grid View item -->
<div class="w-20 h-20 flex items-center justify-center rounded-md mb-2 flex-shrink-0 overflow-hidden bg-bg-secondary/50">
  <img
    v-if="isThumbnailable(file.extension || '') && getThumbnailSrc(file)"
    :src="`data:image/webp;base64,${getThumbnailSrc(file)}`"
    class="w-full h-full object-cover"
    alt=""
  />
  <component v-else :is="getFileIconComponent(file)" class="w-16 h-16" />
</div>
```

- [ ] **Step 4: Verify build passes**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 5: Test manually**

Run: `npm run dev`
Expected: Thumbnails appear for images and videos in both list and grid views

- [ ] **Step 6: Commit**

```bash
git add src/components/FileList.vue
git commit -m "feat: display thumbnails in FileList for images and videos"
```

---

## Task 7: Final Verification and Cleanup

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Test thumbnail functionality**

1. Open app with `npm run dev`
2. Navigate to folder with images
3. Verify thumbnails appear in list view
4. Switch to grid view
5. Verify larger thumbnails appear
6. Navigate to folder with videos
7. Verify video thumbnails are extracted

- [ ] **Step 3: Verify cache works**

1. Navigate to a folder, wait for thumbnails
2. Navigate away, then back
3. Verify thumbnails load instantly (from cache)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete thumbnail system with hybrid caching"
```

---

## Summary

This implementation provides:
1. **File type module extraction** - Clean separation of concerns
2. **Hybrid caching** - Memory (LRU, 200 items) + Disk (persistent)
3. **Smart cache key** - deviceId + path + size + mtime
4. **Image thumbnails** - Using Sharp for fast, high-quality resizing
5. **Video thumbnails** - Using bundled ffmpeg for frame extraction
6. **Seamless integration** - Thumbnails replace icons where applicable
