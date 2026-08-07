import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { FileInfo } from '@/types'

const LOG_PREFIX = '[ThumbnailStore]'

function log(message: string, ...args: unknown[]) {
  console.log(`${LOG_PREFIX} ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`${LOG_PREFIX} ${message}`, ...args)
}

const MAX_MEMORY_CACHE_SIZE = 200
// 最大并发 IPC 请求数，防止大目录爆炸式请求
const MAX_CONCURRENT_REQUESTS = 6

export const useThumbnailStore = defineStore('thumbnail', () => {
  const thumbnails = reactive<Map<string, string>>(new Map())
  // Fix #2: 用 Promise Map 替代 Set，让后续调用者复用同一个 Promise 而非返回 null
  const pendingRequests = new Map<string, Promise<string | null>>()
  const cacheOrder = ref<string[]>([])

  // Fix #3: 并发信号量，限制同时进行的 IPC 调用数量
  let activeCount = 0
  const semaphoreQueue: Array<() => void> = []

  function acquireSemaphore(): Promise<void> {
    if (activeCount < MAX_CONCURRENT_REQUESTS) {
      activeCount++
      return Promise.resolve()
    }
    return new Promise(resolve => {
      semaphoreQueue.push(() => {
        activeCount++
        resolve()
      })
    })
  }

  function releaseSemaphore(): void {
    activeCount--
    const next = semaphoreQueue.shift()
    if (next) next()
  }

  log('ThumbnailStore initialized, max memory cache size:', MAX_MEMORY_CACHE_SIZE,
      'max concurrent requests:', MAX_CONCURRENT_REQUESTS)

  // Fix #1: cacheKey 加入 size 参数，区分 small 和 large 缓存
  function generateCacheKey(
    deviceId: string,
    file: FileInfo,
    size: 'small' | 'large'
  ): string {
    const raw = `${deviceId}:${file.path}:${file.size}:${file.modifiedTime}:${size}`
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
    const cacheKey = generateCacheKey(deviceId, file, size)

    // 内存缓存命中
    if (thumbnails.has(cacheKey)) {
      log('Memory cache HIT for:', file.name, 'size:', size, 'key:', cacheKey)
      return thumbnails.get(cacheKey) || null
    }

    // Fix #2: 已有进行中的请求，直接复用其 Promise，等待结果
    if (pendingRequests.has(cacheKey)) {
      log('Dedup: reusing pending promise for:', file.name, 'size:', size)
      return pendingRequests.get(cacheKey)!
    }

    log('Cache MISS for:', file.name, 'size:', size, 'key:', cacheKey)

    // 创建新的请求 Promise，经过并发信号量排队
    const promise = (async (): Promise<string | null> => {
      // Fix #3: 等待信号量许可
      await acquireSemaphore()
      try {
        log('Calling IPC thumbnail.get for:', file.name, 'size:', size,
            'active:', activeCount, 'queued:', semaphoreQueue.length)
        const startTime = Date.now()

        const result = await window.fileman.thumbnail.get(
          deviceId,
          file.path,
          file.size,
          file.modifiedTime,
          size
        )

        const elapsed = Date.now() - startTime

        if (result) {
          log('IPC succeeded for:', file.name, 'size:', size,
              'base64 length:', result.thumbnailBase64.length, 'elapsed:', elapsed, 'ms')

          if (thumbnails.size >= MAX_MEMORY_CACHE_SIZE && cacheOrder.value.length > 0) {
            const oldestKey = cacheOrder.value.shift()
            if (oldestKey) {
              thumbnails.delete(oldestKey)
              log('LRU eviction: removed oldest key:', oldestKey)
            }
          }

          thumbnails.set(cacheKey, result.thumbnailBase64)
          cacheOrder.value.push(cacheKey)
          log('Cached:', file.name, 'size:', size, 'total cached:', thumbnails.size)
          return result.thumbnailBase64
        } else {
          log('IPC returned null for:', file.name, 'size:', size, 'elapsed:', elapsed, 'ms')
        }
      } catch (e) {
        logError('Failed to get thumbnail for:', file.name, 'size:', size, 'error:', e)
      } finally {
        releaseSemaphore()
        pendingRequests.delete(cacheKey)
        log('Pending removed, key:', cacheKey, 'remaining pending:', pendingRequests.size)
      }
      return null
    })()

    pendingRequests.set(cacheKey, promise)
    log('Pending added, key:', cacheKey, 'total pending:', pendingRequests.size)
    return promise
  }

  function preloadThumbnails(
    deviceId: string,
    files: FileInfo[],
    size: 'small' | 'large'
  ): void {
    log('preloadThumbnails called, files count:', files.length, 'size:', size)
    let preloadCount = 0

    for (const file of files) {
      const cacheKey = generateCacheKey(deviceId, file, size)
      if (!thumbnails.has(cacheKey) && !pendingRequests.has(cacheKey)) {
        preloadCount++
        getThumbnail(deviceId, file, size)
      }
    }

    log('preloadThumbnails: queued', preloadCount, 'requests (limited to', MAX_CONCURRENT_REQUESTS, 'concurrent)')
  }

  function clearMemoryCache(): void {
    log('Clearing memory cache, current size:', thumbnails.size)
    thumbnails.clear()
    cacheOrder.value = []
    pendingRequests.clear()
    // 重置信号量状态
    activeCount = 0
    semaphoreQueue.length = 0
    log('Memory cache cleared')
  }

  async function clearDiskCache(): Promise<void> {
    log('Clearing disk cache via IPC')
    try {
      await window.fileman.thumbnail.clearCache()
      log('Disk cache cleared successfully')
    } catch (e) {
      logError('Failed to clear disk cache:', e)
    }
  }

  function getCacheStats(): { memoryCacheSize: number; pendingCount: number; activeCount: number; queuedCount: number } {
    return {
      memoryCacheSize: thumbnails.size,
      pendingCount: pendingRequests.size,
      activeCount,
      queuedCount: semaphoreQueue.length,
    }
  }

  return {
    thumbnails,
    getThumbnail,
    preloadThumbnails,
    clearMemoryCache,
    clearDiskCache,
    getCacheStats,
  }
})
