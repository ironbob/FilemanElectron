import { safeStorage } from 'electron'
import Store from 'electron-store'

export interface Credentials {
  username?: string
  password?: string
  privateKey?: string
  domain?: string
  share?: string
}

interface StoredCredentials extends Credentials {
  // Passwords are stored with 'encrypted:' prefix
}

export class CredentialService {
  private store: Store

  constructor() {
    this.store = new Store({
      name: 'credentials',
      // Note: electron-store has built-in encryption, but we add extra layer with safeStorage
    })
  }

  /**
   * Save credentials for a device (encrypted)
   */
  async save(deviceId: string, credentials: Credentials): Promise<void> {
    const stored: StoredCredentials = { ...credentials }

    // Encrypt password using safeStorage
    if (credentials.password) {
      stored.password = this.encryptValue(credentials.password)
    }

    // Encrypt privateKey if present
    if (credentials.privateKey) {
      stored.privateKey = this.encryptValue(credentials.privateKey)
    }

    this.store.set(`credentials.${deviceId}`, stored)
  }

  /**
   * Get credentials for a device (decrypted)
   */
  async get(deviceId: string): Promise<Credentials | null> {
    const stored = this.store.get(`credentials.${deviceId}`) as StoredCredentials | undefined

    if (!stored) {
      return null
    }

    const credentials: Credentials = { ...stored }

    // Decrypt password
    if (credentials.password?.startsWith('encrypted:')) {
      credentials.password = this.decryptValue(credentials.password)
    }

    // Decrypt privateKey
    if (credentials.privateKey?.startsWith('encrypted:')) {
      credentials.privateKey = this.decryptValue(credentials.privateKey)
    }

    return credentials
  }

  /**
   * Delete credentials for a device
   */
  async delete(deviceId: string): Promise<void> {
    this.store.delete(`credentials.${deviceId}`)
  }

  /**
   * Check if credentials exist for a device
   */
  has(deviceId: string): boolean {
    return this.store.has(`credentials.${deviceId}`)
  }

  /**
   * List all device IDs that have stored credentials
   */
  listDeviceIds(): string[] {
    const credentials = this.store.get('credentials') as Record<string, unknown> | undefined
    return credentials ? Object.keys(credentials) : []
  }

  /**
   * Encrypt a value using safeStorage
   */
  private encryptValue(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: store as base64 (not secure, but better than plain text)
      console.warn('safeStorage encryption not available, using base64 fallback')
      return 'encoded:' + Buffer.from(value).toString('base64')
    }

    const encrypted = safeStorage.encryptString(value)
    return 'encrypted:' + encrypted.toString('base64')
  }

  /**
   * Decrypt a value using safeStorage
   */
  private decryptValue(value: string): string {
    if (value.startsWith('encrypted:')) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption was used but safeStorage is not available')
      }

      const encrypted = Buffer.from(value.replace('encrypted:', ''), 'base64')
      return safeStorage.decryptString(encrypted)
    }

    if (value.startsWith('encoded:')) {
      // Fallback decoding
      return Buffer.from(value.replace('encoded:', ''), 'base64').toString()
    }

    // Plain text (shouldn't happen, but handle gracefully)
    return value
  }

  /**
   * Clear all stored credentials
   */
  async clearAll(): Promise<void> {
    this.store.clear()
  }
}
