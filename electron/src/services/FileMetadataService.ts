import { ConfigService } from './ConfigService'
const log = console

export interface FileMetadata {
  deviceId: string
  path: string
  tags: string[]
  updatedAt: number
}

/** Application-owned metadata: remote files are never mutated just to add a tag. */
export class FileMetadataService {
  constructor(private readonly configService: ConfigService) {}

  get(deviceId: string, filePath: string): FileMetadata {
    return this.all().find(item => item.deviceId === deviceId && item.path === filePath)
      ?? { deviceId, path: filePath, tags: [], updatedAt: 0 }
  }

  setTags(deviceId: string, filePath: string, tags: string[]): FileMetadata {
    const normalized = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))].slice(0, 12)
    const metadata = this.all().filter(item => item.deviceId !== deviceId || item.path !== filePath)
    const value: FileMetadata = { deviceId, path: filePath, tags: normalized, updatedAt: Date.now() }
    metadata.push(value)
    this.save(metadata)
    log.info('[FileMetadataService] tags saved', { deviceId, filePath, tagCount: normalized.length })
    return value
  }

  findByTags(tags: string[]): FileMetadata[] {
    const required = tags.map(tag => tag.trim()).filter(Boolean)
    return this.all().filter(item => required.every(tag => item.tags.includes(tag)))
  }

  private all(): FileMetadata[] {
    const config = this.configService.getConfig() as { fileMetadata?: FileMetadata[] }
    return Array.isArray(config.fileMetadata) ? config.fileMetadata : []
  }

  private save(fileMetadata: FileMetadata[]): void {
    this.configService.saveConfig({ fileMetadata } as never)
  }
}
