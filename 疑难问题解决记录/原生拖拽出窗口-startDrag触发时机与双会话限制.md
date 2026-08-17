# 原生拖拽出窗口：startDrag 触发时机与双会话限制

## 现象

从 FileList 拖动文件到外部应用（VSCode、Finder 等）完全无反应。应用内双面板拖放正常。

## 根因：HTML5 拖拽会话进行中无法转换为原生拖拽

旧实现思路是「应用内保持 HTML5 拖拽，`dragleave`（光标离开窗口）时再调
`webContents.startDrag()` 转原生拖拽」。这条路在 Electron 里**不可能成功**：

- `startDrag` 必须在**没有拖拽会话进行时**调用。`dragleave` 触发时鼠标仍按住，
  Chromium 的 HTML5 拖拽循环仍持有该手势，`startDrag` 试图开启第二个原生会话被
  拒绝（静默失败/抛错）。
- 官方唯一支持的模式（[Native File Drag & Drop 教程](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop)）：
  在 `dragstart` 里 `event.preventDefault()` 取消 HTML5 拖拽，**同一手势内立即**
  通过 IPC（单向 `send`，不能用 `invoke` 往返）调用 `startDrag`。
- 中途转换没有 API（[electron#13083](https://github.com/electron/electron/issues/13083)）；
  [electron#7118](https://github.com/electron/electron/issues/7118)（"startDrag 后源窗口收不到 dragover/drop"）
  是 **Windows** 的 `DoDragDrop` 阻塞模型限制，macOS 不受影响——旧注释据此认为
  「不能在 dragstart 劫持」是对该 issue 的误读。

因此拖到外部落下时，系统剪贴板上只有 `application/json` 这种外部无人认识的类型，
目标应用拒绝放置。

## 正确实现（2026-08-17 落地）

`FileList.vue handleDragStart`：**本地实体文件（非 ZIP 虚拟路径）在 dragstart
一瞬间由原生 `startDrag` 接管**；远程设备 / ZIP 内部路径维持 HTML5 应用内拖拽
（对外部无本地实体，拖出本来无意义）。

关键顺序（错了就失效）：

1. `dragSessionStore.begin(dragData)` —— 原生拖拽的 payload 在落点不可读，
   会话是应用内识别源的唯一途径，必须先于 IPC 开启；
2. `event.preventDefault()` —— 取消 HTML5 拖拽（官方模式）；
3. `window.fileman.startNativeDrag(files, iconDataUrl)` —— 单向 IPC。

### 应用内回落（拖回本窗口）

原生拖拽落回本应用时表现为 `dataTransfer.files`（File 对象）。识别链在
`dragTransfer.ts extractDragSource`：json payload → **活跃会话 + 文件名匹配**
（`filesMatchSession`）→ 外部（Finder）导入。drop 事件 altKey 由 Chromium
合成，Option=copy 修饰键语义不受影响。

### e2e mock 陷阱：Proxy 兜底返回 truthy 函数

e2e 用 Proxy mock `window.fileman`，缺失属性兜底返回 `async () => undefined`
——**这是个 truthy 函数**！原生接管分支若用 `if (window.fileman.supportsNativeDrag)`
宽松判定，合成拖拽会走进 `preventDefault` + mock no-op 的死路，
`drag-transfer.spec.ts` 全挂。

解法：preload 暴露 `supportsNativeDrag: true`，renderer 必须
`=== true` 严格判定（mock 下返回函数 → false → HTML5 路径原样）。

### 原生拖拽图标：canvas 同步合成

`startDrag` 的 `icon` 只接受 NativeImage（`setDragImage` 的 DOM 快照不可用），
`buildNativeDragIcon` 用 canvas 合成「图标 + 多选计数角标」。**不能异步**——
await 图片解码会错过 dragstart 手势窗口：

- 行内缩略图 `img` 已解码（`complete`）→ 直接 `drawImage`；
- SVG 类型图标需异步解码 → 退化为通用文档图形（预热缓存列为后续打磨项）；
- 解码失败时 main 侧回退 1×1 透明图（`NATIVE_DRAG_ICON`）。

### 会话卫生：blur 清理

原生拖拽期间本窗口**保持焦点**（blur 不触发，会话存活到 drop/下一次 pointerdown）；
而用户从 Finder 发起拖入前，本窗口**必已失焦**。App.vue 据此在 `window blur`
时清 dragSession，堵住「陈旧会话 + Finder 同名文件」被 `filesMatchSession`
误判为内部拖拽的竞态。

## 验证

- `npm run typecheck` 零错误；`tsc -p tsconfig.node.json` 无新增错误。
- e2e：drag-transfer / tab-actions / image-edit / task-drawer 不回归
  （mock 天然关闸，走 HTML5 路径）。
- 手动清单（OS 级拖拽无法自动化）：拖到 Finder / VSCode 生效；拖回另一面板
  出现 `[DnD][extract] source=native-session-fallback`；远程/ZIP 拖拽不受影响；
  多选拖出带计数角标。

## 参考

- [官方 Native File Drag & Drop 教程](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop)
- [electron#13083 — DataTransfer 原生拖拽扩展（无中途转换 API）](https://github.com/electron/electron/issues/13083)
- [electron#7118 — startDrag 源窗口限制（Windows）](https://github.com/electron/electron/issues/7118)
- [Fileside — Fixing drag and drop in Electron](https://www.fileside.app/blog/2019-04-22_fixing-drag-and-drop/)
