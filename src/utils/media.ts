import type { MediaMetadata } from '@/types/preview'
import { resolveFileKind } from '@shared/fileKinds'

/**
 * Format file size in human-readable format
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '--:--'

  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format bitrate in kbps or Mbps
 */
export function formatBitrate(bitrate: number | undefined): string {
  if (bitrate === undefined || bitrate === null) return '--'
  if (bitrate >= 1000000) {
    return (bitrate / 1000000).toFixed(2) + ' Mbps'
  }
  return (bitrate / 1000).toFixed(0) + ' kbps'
}

/**
 * Format sample rate in kHz
 */
export function formatSampleRate(sampleRate: number | undefined): string {
  if (sampleRate === undefined || sampleRate === null) return '--'
  return (sampleRate / 1000).toFixed(1) + ' kHz'
}

/**
 * Get resolution string
 */
export function formatResolution(width: number | undefined, height: number | undefined): string {
  if (!width || !height) return '--'
  return `${width} x ${height}`
}

/**
 * Extract media metadata from video/audio element
 */
export async function extractMediaMetadata(
  url: string,
  fileName: string,
  fileSize: number
): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const metadata: MediaMetadata = {
      fileName,
      fileSize,
    }

    // Try to extract metadata from video element
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      metadata.duration = video.duration
      metadata.width = video.videoWidth
      metadata.height = video.videoHeight

      video.remove()
      resolve(metadata)
    }

    video.onerror = () => {
      video.remove()

      // Try audio element as fallback
      const audio = document.createElement('audio')
      audio.preload = 'metadata'

      audio.onloadedmetadata = () => {
        metadata.duration = audio.duration

        audio.remove()
        resolve(metadata)
      }

      audio.onerror = () => {
        audio.remove()
        resolve(metadata)
      }

      audio.src = url
    }

    video.src = url
  })
}

/**
 * 以下判定全部委托 shared/fileKinds.ts 注册表（与双击路由同一事实源），
 * 不再维护独立扩展名清单。
 */
export function isTextFile(extension: string): boolean {
  return resolveFileKind('', extension) === 'text'
}

export function isImageFile(extension: string): boolean {
  return resolveFileKind('', extension) === 'image'
}

export function isVideoFile(extension: string): boolean {
  return resolveFileKind('', extension) === 'video'
}

export function isAudioFile(extension: string): boolean {
  return resolveFileKind('', extension) === 'audio'
}

/**
 * Check if file is a PDF
 */
export function isPdfFile(extension: string): boolean {
  return extension.toLowerCase().replace('.', '') === 'pdf'
}

/**
 * Get file type category for display
 */
export function getFileTypeLabel(extension: string): string {
  const ext = extension.toLowerCase().replace('.', '')

  if (isImageFile(ext)) return 'Image'
  if (isVideoFile(ext)) return 'Video'
  if (isAudioFile(ext)) return 'Audio'
  if (ext === 'pdf') return 'PDF Document'
  if (isTextFile(ext)) return 'Text File'

  return 'File'
}
