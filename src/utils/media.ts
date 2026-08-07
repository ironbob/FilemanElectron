import type { MediaMetadata } from '@/types/preview'

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
 * Check if file is a text file based on extension
 */
export function isTextFile(extension: string): boolean {
  const textExts = new Set([
    'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'log', 'csv',
    'js', 'jsx', 'ts', 'tsx', 'vue', 'html', 'htm', 'css', 'scss', 'sass',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'sql', 'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'lua',
    'ini', 'conf', 'cfg', 'toml', 'env', 'gitignore', 'dockerfile',
    'm', 'mm', 'pl', 'pm', 'asm', 's', 'dart', 'fs', 'hs', 'ml', 'erl'
  ])
  return textExts.has(extension.toLowerCase().replace('.', ''))
}

/**
 * Check if file is an image
 */
export function isImageFile(extension: string): boolean {
  const imageExts = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'dng', 'heic', 'heif', 'raw'
  ])
  return imageExts.has(extension.toLowerCase().replace('.', ''))
}

/**
 * Check if file is a video
 */
export function isVideoFile(extension: string): boolean {
  const videoExts = new Set([
    'mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'rmvb', '3gp', 'ts', 'mts', 'm2ts'
  ])
  return videoExts.has(extension.toLowerCase().replace('.', ''))
}

/**
 * Check if file is audio
 */
export function isAudioFile(extension: string): boolean {
  const audioExts = new Set([
    'mp3', 'flac', 'aac', 'ogg', 'm4a', 'wav', 'wma', 'alac', 'ape', 'aiff', 'amr', 'opus'
  ])
  return audioExts.has(extension.toLowerCase().replace('.', ''))
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
