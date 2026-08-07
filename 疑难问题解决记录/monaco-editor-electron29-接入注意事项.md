# Monaco Editor + Electron 29 接入注意事项

> 环境：`monaco-editor@0.44.0` + `electron@29` + `electron-vite@2` + `vite@5` + `vue@3`

---

## 1. 版本选择

**使用 `monaco-editor@0.44.0`，不要使用最新版本。**

- `0.44.0`（2023-11）是与 Vite 5 + Electron 29（Chromium 122）兼容性最好的稳定版本。
- `0.50+` 系列有破坏性 ESM 变更，在 electron-vite 场景下 worker 路径解析会出现问题。

```bash
npm install monaco-editor@0.44.0 --save-exact
```

---

## 2. Worker 必须使用 `?worker&inline`（避免卡死的关键）

这是防止 Electron 中 Monaco 卡死 **最重要的一步**。

```ts
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'

;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  }
}
```

**原因：**

Electron 的渲染进程使用 `file://` 协议加载页面。当 Monaco 尝试通过相对路径 `new Worker('./editor.worker.js')` 创建 worker 时，Electron 的沙箱机制会拦截该 file URL 请求，导致 worker **静默挂起**，整个编辑器随之卡死。

`?worker&inline` 让 Vite 在构建时把 worker 内容编译为 base64 blob URI，绕开 file 协议问题。

---

## 3. 只引入 `editor.worker`，不引入语言 Worker

对于只读预览场景，**不需要** JSON / TypeScript / CSS / HTML 等语言服务 worker：

```ts
// ✅ 正确：只用核心 editor.worker
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'

// ❌ 不要引入这些（只读预览不需要，引入后会在后台持续分析代码）
// import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline'
// import TsWorker   from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline'
```

语言 worker 会在后台持续进行语义分析，如果组件在分析过程中卸载，worker 任务无法取消，累积后会导致进程冻结。

---

## 4. `MonacoEnvironment` 必须在 `import monaco` 之前设置

```ts
// ✅ 先设置环境，再导入 monaco
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker() { return new EditorWorker() }
}
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

// ❌ 顺序反了，monaco 初始化时找不到环境配置
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
;(self as any).MonacoEnvironment = { ... }
```

---

## 5. 编辑器实例必须用 `shallowRef`

```ts
// ✅ 正确
import { shallowRef } from 'vue'
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// ❌ 错误：会导致 Vue 对 Monaco 内部状态做深度响应式代理，触发卡顿或崩溃
import { ref } from 'vue'
const editorInstance = ref<monaco.editor.IStandaloneCodeEditor | null>(null)
```

Vue 3 的 `ref()` 会对对象做深度 Proxy 包裹。Monaco 编辑器对象内部有大量状态和私有方法，被 Proxy 拦截后行为异常，会造成持续性渲染抖动乃至挂起。`shallowRef` 只对引用本身做响应式，不触碰内部内容。

---

## 6. 创建编辑器时关闭不必要的后台功能

```ts
monaco.editor.create(container, {
  readOnly: true,
  automaticLayout: true,       // 使用内置 ResizeObserver，安全，无需手动监听
  smoothScrolling: false,      // 关闭平滑滚动，减少 Electron 事件循环压力
  hover: { enabled: false },   // 关闭悬浮提示（只读不需要）
  quickSuggestions: false,     // 关闭自动补全
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: false,
  copyWithSyntaxHighlighting: false,
})
```

---

## 7. 组件卸载时必须正确 dispose

**先 dispose model，再 dispose editor**，否则内存泄漏会在多次切换 tab 后累积，最终冻结进程。

```ts
function destroyEditor() {
  if (editorInstance.value) {
    editorInstance.value.getModel()?.dispose()   // 1. 先释放内容 model
    editorInstance.value.dispose()               // 2. 再释放编辑器实例
    editorInstance.value = null
  }
}

onUnmounted(() => destroyEditor())
```

---

## 8. Vite 配置：移除 monaco 相关的 `manualChunks` 和 `optimizeDeps`

使用 `?worker&inline` 方式时，这两项配置会产生冲突：

```ts
// electron.vite.config.ts

// ❌ 删除以下配置
output: {
  manualChunks: { monaco: ['monaco-editor'] }   // 与 inline worker 冲突
}
optimizeDeps: {
  include: ['monaco-editor/esm/vs/editor/editor.api']  // 会 pre-bundle，破坏 ?worker 查询
}
```

保持 renderer 构建配置干净即可，monaco 会通过 ESM 按需 tree-shaking。

---

## 参考

- Monaco Editor 只使用部分 API（`editor.api`）可大幅减小包体积
- Electron 中 Worker 相关问题：[electron/electron#22582](https://github.com/electron/electron/issues/22582)
- Vite `?worker&inline`：[Vite 官方文档 - Importing Script as a Worker](https://vitejs.dev/guide/assets.html#importing-script-as-a-worker)
