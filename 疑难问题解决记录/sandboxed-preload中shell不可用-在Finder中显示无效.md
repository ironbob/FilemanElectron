# sandboxed preload 中 shell 不可用：「在 Finder 中显示」右键无效

## 现象

右键文件 →「在 Finder 中显示」点击后毫无反应；FilePane 工具栏「在 Finder 中定位」
与任务抽屉 TaskRow 的定位按钮同样无效。应用其余功能正常，DevTools 里也看不到
明显报错（除非恰好开着 console）。

## 根因：sandboxed preload 的 electron 模块不含 shell

历史实现让 preload 直接执行宿主 shell 调用：

```ts
// electron/preload.ts（旧）
import { shell } from 'electron'
showInFolder: (path: string) => { shell.showItemInFolder(path) }
```

Electron 20 起 renderer sandbox **默认开启**（本项目 `webPreferences` 只设了
`contextIsolation: true` / `nodeIntegration: false`，未显式关 sandbox）。sandboxed
preload 里 `require('electron')` 只返回一个子集（`contextBridge` / `ipcRenderer` /
`webFrame` / `webUtils` / `nativeImage` / `crashReporter` 等）——**没有 `shell`**。

于是 `shell` 是 `undefined`，点击即抛
`TypeError: Cannot read properties of undefined (reading 'showItemInFolder')`。
该异常发生在 contextBridge 包裹的同步函数内部，只会打到 renderer console，
不进主进程 stdout，也不弹任何 UI——表现为「菜单点了没反应」。

### 排查过程中的两个假阴性（值得记住）

1. **preload 的 console.log 不会出现在终端**。renderer/preload 的 console 输出只进
   DevTools；想从终端观察 preload 状态，得用「顶层 throw」（会以
   `Unable to load preload script: ...` 打到 stderr）或 `ELECTRON_ENABLE_LOGGING=1`。
2. **「没有报错」≠「shell 可用」**。`import { shell } from 'electron'` 解构
   `undefined` 属性不会在加载期抛错，preload 照常加载成功，window.fileman 里
   其它方法全部正常——只有调到 `showInFolder` 那一刻才炸。

### 确认手段（CDP 直连真实 App）

```bash
ELECTRON_RENDERER_URL=http://127.0.0.1:4173 npx electron out/main/index.js \
  --remote-debugging-port=9222 --user-data-dir=/tmp/probe
# node 侧 chromium.connectOverCDP → page.on('console') 捕获：
# [error] Unable to load preload script: .../out/preload/index.js
# [error] Error: preload shell is UNDEFINED (sandboxed)
#     at runPreloadScript (node:electron/js2c/sandbox_bundle:...)
```

调用栈里的 `sandbox_bundle` 是 sandbox 生成的铁证。

## 正确实现（2026-08-17 落地）

与其余 shell 操作（openInTerminal / openWith / openDefault）完全同构——一律经
主进程 handler 中转，preload 只留 `ipcRenderer.invoke`：

1. `electron/src/ipc/channels.ts`：新增 `shellShowInFolder: 'shell:showInFolder'`。
2. `HostShellService.showInFolder(targetPath)`：主进程里 `shell.showItemInFolder`
   （主进程的 electron 模块是完整的，sandbox 只影响 preload）。
3. `electron/main.ts`：`ipcMain.handle(CH.invoke.shellShowInFolder, ...)`。
4. `electron/preload.ts`：`showInFolder: (path) => ipcRenderer.invoke(...)`，
   并**删掉对 `shell` 的导入**（防止后来人再犯）。
5. `src/env.d.ts`：签名改 `Promise<void>`，调用点补 `.catch`。

## 通用规则

- **preload 里永远不要直接用 `shell` / `dialog` / `app` 等完整 Node/Electron 模块**，
  sandboxed 环境只有 IPC 桥这一个合法出口；新增宿主集成能力时先在
  HostShellService 落方法，再挂 IPC handler。
- 判断 preload 是否被 sandbox：看报错调用栈是否来自 `sandbox_bundle`，或在
  preload 顶层临时 `throw`（用后即删）。
