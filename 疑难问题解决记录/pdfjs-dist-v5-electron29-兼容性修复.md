# pdfjs-dist v5 在 Electron 29 下的兼容性修复

## 问题背景

- **pdfjs-dist 版本**：`^5.5.207`
- **Electron 版本**：`^29.1.0`（内置 Chromium 122）
- **现象**：PDF 预览失败，控制台报各种 JS 错误

pdfjs-dist v5 要求 Chrome 130-131 才支持的新 JS API，而 Electron 29 的 Chromium 122 均不具备。

---

## 修复一：`Promise.try` 参数未透传

### 错误信息
```
Cannot destructure property 'docId' of 'docParams' as it is undefined.
```

### 根因

pdfjs 内部用 `Promise.try(action, data)` 分发消息处理函数，原有 polyfill 实现为：

```ts
// 错误：没有透传参数，action() 收不到 data，导致 docParams = undefined
(Promise as any).try = (fn) => new Promise(resolve => resolve(fn()))
```

### 修复

```ts
(Promise as any).try = (fn, ...args) => new Promise(resolve => resolve(fn(...args)))
```

---

## 修复二：`Uint8Array.prototype.toHex` 缺失

### 错误信息
```
hashOriginal.toHex is not a function
```

### 根因

pdfjs 在计算 PDF 指纹时调用 `Uint8Array#toHex()`，该方法在 Chrome 130 才引入。

### 修复

```ts
if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array) {
      return Array.from(this, b => b.toString(16).padStart(2, '0')).join('')
    },
    writable: true, configurable: true
  })
}
```

---

## 修复三：`Uint8Array.prototype.toBase64` / `Uint8Array.fromBase64` 缺失

### 根因

pdfjs 在字体数据 URL 拼接（`toBase64`）和签名验证（`fromBase64`）中使用了 Chrome 130 引入的这两个 API。

### 修复

```ts
// toBase64
Object.defineProperty(Uint8Array.prototype, 'toBase64', {
  value(this: Uint8Array, options?) {
    let binary = ''
    for (let i = 0; i < this.byteLength; i++) binary += String.fromCharCode(this[i])
    let result = btoa(binary)
    if (options?.alphabet === 'base64url') result = result.replace(/\+/g, '-').replace(/\//g, '_')
    if (options?.omitPadding) result = result.replace(/=+$/, '')
    return result
  },
  writable: true, configurable: true
})

// fromBase64
;(Uint8Array as any).fromBase64 = function(str, options?) {
  let s = str
  if (options?.alphabet === 'base64url') s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4 !== 0) s += '='
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
```

---

## 修复四：`Map.prototype.getOrInsertComputed` 缺失

### 错误信息
```
__privateGet(...).getOrInsertComputed is not a function
```

### 根因

pdfjs 在页面缓存、对象缓存等大量场景中使用了 `Map#getOrInsertComputed(key, compute)`，该方法在 Chrome 131 才引入（TC39 Stage 4）。

### 修复

```ts
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
```

---

## 修复五：`pdfDoc` 用 `ref()` 导致私有字段访问失败

### 错误信息
```
Cannot read from private field
```

### 根因

pdfjs 的 `PDFDocumentProxy` 类内部使用了 JS 私有字段（`#field`）。Vue 的 `ref()` 会将对象包装为深层 `Proxy`，通过 Proxy 访问私有字段会抛出 TypeError（私有字段只能在原始实例上访问）。

### 修复

将 `ref()` 改为 `shallowRef()`，避免对 pdfDoc 做深层代理：

```ts
// 错误
const pdfDoc = ref<pdfjsLib.PDFDocumentProxy | null>(null)

// 正确
const pdfDoc = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
```

> **通用原则**：任何含有私有字段（`#field`）的第三方类实例，都应用 `shallowRef` 而不是 `ref` 存储。

---

## 修复六：渲染时 canvas 元素还未挂载

### 现象

PDF 加载成功，但页面空白，日志报：
```
Cannot render page: pdfDoc or canvasRef is null
```

### 根因

canvas 位于 `v-else`（`loading=false` 时才渲染）的条件块中。在 `loadContent` 的 `try` 块里，`loading` 还是 `true`，canvas 尚未插入 DOM，`canvasRef` 为 null。

### 修复

在渲染前先将 `loading` 置为 `false`，并等待 `nextTick()` 确保 DOM 已更新：

```ts
loading.value = false
await nextTick()
await renderAllPages()
```

---

## 总体方案

所有 polyfill 集中到 `src/polyfills.ts`，在 `src/main.ts` 最顶部引入，保证在 pdfjs 代码执行前生效（包括 fake worker 在主线程内运行的情况）：

```ts
// src/main.ts
import './polyfills'
import { createApp } from 'vue'
// ...
```

---

## API 兼容性速查

| API | 最低 Chrome | pdfjs 用途 |
|-----|------------|-----------|
| `Promise.try(fn, ...args)` | 130 | 消息处理函数分发（需透传参数） |
| `Uint8Array#toHex()` | 130 | PDF 指纹计算 |
| `Uint8Array#toBase64()` | 130 | 字体数据 URL、签名数据 |
| `Uint8Array.fromBase64()` | 130 | 签名验证 |
| `Map#getOrInsertComputed()` | 131 | 页面/对象/意图缓存 |
