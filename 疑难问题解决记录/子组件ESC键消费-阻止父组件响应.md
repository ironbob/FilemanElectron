# 子组件按键消费机制 — 阻止父组件响应 ESC

## 问题描述

**现象**：在文本预览组件（`PreviewTextContent`）打开 diff 弹窗时，按下 ESC 键，期望只关闭 diff 弹窗，实际却同时关闭了整个 `PreviewFullscreen` 预览控件。

**根因**：`App.vue` 在 `onMounted` 中以 **bubble 阶段**注册了：

```ts
document.addEventListener('keydown', handleKeydown)
```

`PreviewTextContent` 也在 `onMounted` 中以同样方式注册了自己的 handler。由于 `App.vue` 更早挂载，它的 handler **先执行**，此时 diff 弹窗的关闭逻辑尚未运行，全屏预览已经被关闭。

原有的 `window.__previewEscHandled` flag 方案无效，因为 `App.vue` 的 handler 跑完之后 flag 才被子组件设置。

---

## 解决方案：Capture 阶段拦截 + LIFO 优先级

新建通用 composable `src/composables/useKeyInterceptor.ts`，利用 DOM 事件传播机制：

- **Capture 阶段**总是早于所有 **bubble 阶段** handler 执行，与注册顺序无关。
- 统一的 capture-phase 入口按 **LIFO**（后注册先执行）遍历各子组件 handler。
- handler 返回 `true` 表示**消费**该事件，框架调用 `e.stopImmediatePropagation()`，后续所有 capture 和 bubble handler 均不再收到此次按键。

---

## 完整代码

### `src/composables/useKeyInterceptor.ts`（新增）

```ts
import { onMounted, onUnmounted } from 'vue'

type KeyHandler = (e: KeyboardEvent) => boolean | void

const _handlers: KeyHandler[] = []

let _initialized = false
function _ensureInitialized() {
  if (_initialized) return
  _initialized = true
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // 从最新注册（最内层子组件）往前遍历
      for (let i = _handlers.length - 1; i >= 0; i--) {
        if (_handlers[i](e) === true) {
          // 阻止所有后续 capture + bubble handler
          e.stopImmediatePropagation()
          break
        }
      }
    },
    true, // capture phase
  )
}

/**
 * 为组件生命周期注册一个 keydown 拦截器。
 * onMounted 时自动注册，onUnmounted 时自动注销。
 * 在 handler 中返回 true，表示消费该事件，父组件不再响应。
 */
export function useKeyInterceptor(handler: KeyHandler): void {
  _ensureInitialized()
  onMounted(() => _handlers.push(handler))
  onUnmounted(() => {
    const idx = _handlers.indexOf(handler)
    if (idx !== -1) _handlers.splice(idx, 1)
  })
}
```

### `src/components/preview/PreviewTextContent.vue`（修改）

**import 部分**增加：
```ts
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
```

**用 `useKeyInterceptor` 替换原来的 `handleKeydown` 函数及其 `document.addEventListener/removeEventListener` 调用**：

```ts
// 删掉原来的：
// function handleKeydown(event: KeyboardEvent) { ... }
// onMounted:   document.addEventListener('keydown', handleKeydown)
// onUnmounted: document.removeEventListener('keydown', handleKeydown)

// 替换为：
useKeyInterceptor((e: KeyboardEvent) => {
  if (e.key === 'Escape' && showDiffModal.value) {
    closeDiff()
    return true // 消费 — 父组件的 ESC handler 不再触发
  }
})
```

### `src/App.vue`（修改）

删除 `__previewEscHandled` 的检查，handler 在子组件消费后本就不会被调用：

```ts
// 清理后的 App.vue handleKeydown：
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && previewStore.tabs.length > 0) {
    if (previewStore.isFullscreen) {
      previewStore.closeFullscreen()
    } else {
      previewStore.closeAllTabs()
    }
  }
}
```

---

## 机制示意图

```
按键 ESC
    │
    ▼ capture phase（早于一切 bubble 监听，与注册顺序无关）
┌─────────────────────────────────────────────┐
│  useKeyInterceptor 全局入口（LIFO 遍历）      │
│                                             │
│  PreviewTextContent handler 先执行           │
│    showDiffModal === true → closeDiff()     │
│    return true                              │
│    → stopImmediatePropagation()             │
│    → 后续所有 handler 跳过 ✓                 │
└─────────────────────────────────────────────┘
    │  （stopImmediatePropagation 后，App.vue
    │   bubble-phase handler 不执行）
    ✗  App.vue handleKeydown 不触发

─────────────────────────────────────────────
如果 diff 弹窗未打开，handler 不返回 true：

    ▼ capture phase
│  PreviewTextContent handler → 不消费，继续
    ▼ bubble phase
│  App.vue handleKeydown → 正常执行 closeFullscreen()
```

---

## 扩展使用

未来其他子组件（图片全屏、ZIP 预览等）有相同需求，直接复用：

```ts
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'

useKeyInterceptor((e) => {
  if (e.key === 'Escape' && myPanelOpen.value) {
    closePanel()
    return true
  }
})
```

父组件（`App.vue`）无需任何改动。
