# File Types Extraction and Thumbnail System Design

## Overview

This document describes the design for:
1. Extracting file type mappings from `FileList.vue` to a dedicated module
2. Implementing a thumbnail system for images and videos with hybrid caching

## Part 1: File Types Module Extraction

### Current State
File type mappings are embedded in `FileList.vue` (lines 252-403):
- `extensionCategories` - categorizes extensions (text, video, image, audio, archive, document)
- `extensionIconMap` - maps extensions to icon files

### Target State
Create `src/utils/fileTypes.ts` with:

```typescript
export const extensionCategories = {
  text: new Set(['txt', 'log', 'json', ...]),
  video: new Set(['mp4', 'mov', 'avi', ...]),
  image: new Set(['jpg', 'jpeg', 'png', ...]),
  audio: new Set(['mp3', 'flac', 'aac', ...]),
  archive: new Set(['zip', 'rar', '7z', ...]),
  document: new Set(['pdf', 'md', 'doc', ...]),
}

export const extensionIconMap: Record<string, string> = {
  c: 'ic_c.svg',
  cpp: 'ic_cpp.svg',
  // ... all mappings
}

export function getFileCategory(extension: string): string
export function getFileIcon(extension: string): string
export function isImageFile(extension: string): boolean
export function isVideoFile(extension: string): boolean
```

## Part 2: Thumbnail System

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Renderer Process                        │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │  FileList   │───▶│ ThumbnailStore  │───▶│  IPC Call   │ │
│  │  (Vue)      │    │  (Memory Cache) │    │             │ │
│  └─────────────┘    └─────────────────┘    └──────┬──────┘ │
└─────────────────────────────────────────────────────┼───────┘
                                                      │
┌─────────────────────────────────────────────────────┼───────┐
│                      Main Process                    │       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌────▼─────┐ │
│  │ ThumbnailService│───▶│  Disk Cache     │    │ ffmpeg   │ │
│  │                 │    │  (App Data Dir) │    │ (bundled)│ │
│  └────────┬────────┘    └─────────────────┘    └──────────┘ │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │ Sharp / Canvas  │  (Image thumbnail generation)          │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

### Cache Key Design

```typescript
function generateCacheKey(
  deviceId: string, 
  path: string, 
  size: number, 
  mtime: string
): string {
  const raw = `${deviceId}:${path}:${size}:${mtime}`
  return crypto.createHash('md5').update(raw).digest('hex').slice(0, 16)
}
```

Example key: `a1b2c3d4e5f6`

### Disk Cache Structure

```
~/Library/Application Support/FilemanElectron/
└── thumbnails/
    ├── a1b2c3d4e5f6.webp
    ├── b2c3d4e5f6g7.webp
    └── ...
```

### Thumbnail Specifications

| Scenario | Size | Format | Quality |
|----------|------|--------|---------|
| List View | 32x32 | WebP | 80% |
| Grid View | 128x128 | WebP | 80% |

### Core Modules

| Module | Location | Responsibility |
|--------|----------|----------------|
| `fileTypes.ts` | `src/utils/` | File type classification and icon mapping |
| `ThumbnailStore` | `src/stores/` | Memory cache management, request deduplication |
| `ThumbnailService` | `electron/src/services/` | Thumbnail generation, disk cache |
| `ffmpeg` | `electron/bin/` | Bundled ffmpeg binary for video frame extraction |

### IPC API

```typescript
// Get thumbnail (generate or load from cache)
ipcMain.handle('thumbnail:get', 
  (deviceId: string, path: string, size: number, mtime: string, thumbnailSize: 'small' | 'large')
): Promise<{ cacheKey: string, thumbnailBase64: string } | null>

// Prefetch thumbnails (batch)
ipcMain.handle('thumbnail:prefetch', 
  (files: Array<{ deviceId, path, size, mtime }>)
): Promise<void>

// Clear cache
ipcMain.handle('thumbnail:clearCache'): Promise<void>
```

### Frontend Store API

```typescript
// src/stores/thumbnail.ts
export const useThumbnailStore = defineStore('thumbnail', () => {
  const thumbnails = reactive<Map<string, string>>()  // cacheKey -> base64
  const pendingRequests = new Set<string>()           // deduplication

  async function getThumbnail(
    deviceId: string,
    file: FileInfo,
    size: 'small' | 'large'
  ): Promise<string | null>

  function preloadThumbnails(
    deviceId: string,
    files: FileInfo[]
  ): void

  return { thumbnails, getThumbnail, preloadThumbnails }
})
```

### Thumbnail Generation Flow

#### For Images
1. Read file content via device adapter
2. Decode image using `sharp` library
3. Resize to target dimensions
4. Encode as WebP
5. Save to disk cache
6. Return base64 to renderer

#### For Videos
1. Read first 1MB of file (for format detection)
2. Use ffmpeg to extract frame at 10% of duration (or first frame)
3. Resize to target dimensions
4. Encode as WebP
5. Save to disk cache
6. Return base64 to renderer

### Memory Cache Strategy

- **LRU eviction**: Keep max 200 thumbnails in memory
- **TTL**: No expiration (files are identified by mtime)
- **Preloading**: When entering a directory, prefetch thumbnails for visible files

### Error Handling

- Failed thumbnail generation returns `null`
- Errors are logged but don't block file listing
- Retry on next access (cache key will be different if file changed)

### Bundled FFmpeg

- Download ffmpeg static binary during build process
- Platform-specific binaries: `ffmpeg-darwin-x64`, `ffmpeg-darwin-arm64`
- Store in `electron/bin/ffmpeg`
- Use `ffmpeg-static` or `@ffmpeg-installer/ffmpeg` npm package

## Implementation Order

1. Extract `fileTypes.ts` and update imports in `FileList.vue`
2. Create `ThumbnailService` in main process
3. Add IPC handlers for thumbnail operations
4. Create `ThumbnailStore` in renderer
5. Update `FileList.vue` to display thumbnails
6. Add bundled ffmpeg dependency
7. Implement video thumbnail extraction

## Dependencies

### New npm packages needed:
- `sharp` - Image processing (main process)
- `@ffmpeg-installer/ffmpeg` or `ffmpeg-static` - Bundled ffmpeg binary

### Existing packages to use:
- `fs-extra` - File system operations
- `crypto` - Hash generation (Node.js built-in)
