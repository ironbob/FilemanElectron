/**
 * Polyfills for APIs used by pdfjs-dist v5 that are not yet available in
 * Electron 29 (Chromium 122). pdfjs v5 targets Chrome 130+ features.
 */

// Promise.try — pdfjs calls Promise.try(handler, data) to dispatch message actions.
// Args must be forwarded; the original polyfill dropped them causing docParams=undefined.
if (typeof (Promise as any).try !== 'function') {
  ;(Promise as any).try = function <T>(fn: (...a: any[]) => T | PromiseLike<T>, ...args: any[]): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn(...args)))
  }
}

// Uint8Array.prototype.toHex — Chrome 130, used for PDF fingerprints.
if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array): string {
      return Array.from(this, b => b.toString(16).padStart(2, '0')).join('')
    },
    writable: true, configurable: true
  })
}

// Uint8Array.prototype.toBase64 — Chrome 130, used for font data URLs and signatures.
if (typeof Uint8Array.prototype.toBase64 !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toBase64', {
    value(this: Uint8Array, options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }): string {
      let binary = ''
      for (let i = 0; i < this.byteLength; i++) binary += String.fromCharCode(this[i])
      let result = btoa(binary)
      if (options?.alphabet === 'base64url') result = result.replace(/\+/g, '-').replace(/\//g, '_')
      if (options?.omitPadding) result = result.replace(/=+$/, '')
      return result
    },
    writable: true, configurable: true
  })
}

// Uint8Array.fromBase64 — Chrome 130, used for signature verification.
if (typeof (Uint8Array as any).fromBase64 !== 'function') {
  ;(Uint8Array as any).fromBase64 = function (str: string, options?: { alphabet?: 'base64' | 'base64url' }): Uint8Array {
    let s = str
    if (options?.alphabet === 'base64url') s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4 !== 0) s += '='
    const binary = atob(s)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
}

// Map.prototype.getOrInsertComputed — Chrome 131, heavily used by pdfjs for caching.
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value<K, V>(this: Map<K, V>, key: K, compute: (key: K) => V): V {
      if (this.has(key)) return this.get(key) as V
      const value = compute(key)
      this.set(key, value)
      return value
    },
    writable: true, configurable: true
  })
}
