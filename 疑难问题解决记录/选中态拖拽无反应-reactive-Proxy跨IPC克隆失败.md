# 选中态文件拖拽无反应：reactive Proxy 跨 IPC 克隆失败

## 现象

列表里**未选中**的文件可以正常拖动；**先单击选中再拖**则完全无反应
（无拖拽图像、不进放置流程）。与「列表视图拖拽死区」（另一份记录，
同一天修）叠加构成「拖动没有任何反应」的完整表象。

## 根因

`FileList.vue handleDragStart` 的拖拽 payload：

```ts
files: isSelected(file.path) ? props.selectedFiles : [file.path]
```

- 未选中 → `[file.path]` 是**普通数组** → IPC 正常；
- 已选中 → `props.selectedFiles` 是从 Pinia tabs store 一路传下的
  **reactive Proxy**。`window.fileman.startNativeDrag(files, icon)` 经
  contextBridge 结构化克隆参数时抛
  `Error: An object could not be cloned.`——异常发生在
  `log.info('dragstart (native takeover)')` 之前，且此刻 HTML5 拖拽已被
  `preventDefault` 取消 → **原生 IPC 没发出、HTML5 也不存在，拖拽彻底死**，
  仅有一条未捕获异常躺在控制台。

`_electron` 实测复现日志（修复前）：

```
[renderer] [DnD][dragSession] begin {...}
[PAGEERROR] ★★★ Error: An object could not be cloned.
（无 native takeover 日志；主进程未收到 dragStartNative）
```

引入时间：4438534（原生拖拽接管）——`startNativeDrag(files)` 首次把
`props.selectedFiles` 直接送过 IPC 之时。

## 修复（2026-08-18）

```ts
files: isSelected(file.path) ? [...props.selectedFiles] : [file.path]
```

展开即脱离 Proxy（元素是 string 原始值，浅拷贝足够）。

### 同款地雷清扫（本次一并修）

- `FilePane.vue` archive 分支：`window.fileman.createArchive(deviceId, op.files, …)`
  —— `op.files` 来自 FileList 兜底 `emit('operation', { files: props.selectedFiles })`
  同为 Proxy，异常被 `catch` 吞成「压缩任务静默不入队」。同样加 `[...op.files]`。
- 其余链路已天然安全：`fileOperations` store 的 copy/move/delete/recycle 全部
  `sourcePaths: [...sourcePaths]` 展开；`clipboard` store set 时 `[...newFiles]`；
  checksum 已在 4d92a51 用选中快照修过。

## 验证

- `_electron` 真实应用三变体实测：**选中后拖 / 未选中拖 / 选中态下拖未选中行**
  全部出现 `dragstart (native takeover)` + 主进程 `startDrag invoked`，无
  PAGEERROR；
- `npm run typecheck` 干净；drag-transfer e2e 5/5。

## 教训（再次印证）

**任何 store/props 里的数组或对象，跨 `window.fileman.*`（IPC）前必须展开成
普通对象。** 该异常多被调用点的 try/catch 或「日志行在异常之后」掩盖，表象
是无声失败。新写 IPC 调用时优先在 preload 入口断言
`Array.isArray(x) && !isRef(x)`？——不现实；靠约定：**store 状态出界即展开**。
