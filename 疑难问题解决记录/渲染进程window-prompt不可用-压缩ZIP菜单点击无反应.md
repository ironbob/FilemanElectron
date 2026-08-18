# 渲染进程 window.prompt() 不可用 —— 右键「压缩为 ZIP」点击无反应

日期：2026-08-17

## 症状

右键选中文件 →「压缩为 ZIP」，点击后没有任何反应：不弹输入框、不报错、任务面板无任务。

## 根因

`FilePane.vue` 的 `case 'archive'` 用 `window.prompt()` 询问压缩包名：

```ts
const name = prompt(t('filePane.archivePrompt'), 'Archive.zip')  // 恒返回 null
if (name && op.files.length) { ... }  // 永远为 false → 静默中止
```

**Electron 渲染进程不实现 `window.prompt()`**（Chromium 侧被 Electron 显式禁用）。
调用时只往 console 打一条 `prompt() is and will not be supported.`，返回值恒为
`undefined/null`——不抛错，所以没有任何可见失败。`alert`/`confirm` 是可用的，
唯独 `prompt` 被砍。这是 Electron 与浏览器最常见的静默行为差异之一。

叠加问题：即便 prompt 可用，`ArchiveService.createZip` 也是一次性内存打爆式
（全部源文件 read 进内存 → zipSync → 一次性写盘），且不经过
FileOperationManager 任务队列——任务抽屉看不到进度、不能取消、IPC invoke
全程阻塞。

## 修复

1. **去掉 prompt**，按 Finder 规则直接生成包名：单选 `a.txt → a.zip`
   （目录 `dir → dir.zip`），多选 `Archive.zip`；包名冲突由主进程
   `resolveTargetPath(…, 'rename')` 自动「副本」递增。
2. **压缩改为任务**：`archive:create` handler 改为
   `fileOperationManager.addTask({ type: 'archive', … })`；
   `FileOperationManager.executeArchive` 负责总量统计/进度/取消，
   `ArchiveService.runCreateZip(adapter, …, hooks)` 只做打包机械学
   （collect → zipSync → 一次性写盘）。只在最后写盘，中途取消不留半成品。
3. 渲染层 `taskDisplay.ts` 补 `archive` 的动词/图标组/句式/路径摘要，
   词表加 `tasks.verb.archive`（压缩 / Compressing）。

## 教训

- Electron 渲染层禁用 `window.prompt()` 且**不抛错**——任何依赖 prompt 的
  分支都是死代码。需要文本输入时用自绘 dialog（参照 `RenameDialog.vue`）或
  主进程 `dialog.showMessageBox`；能用合理默认值直接执行的（如 Finder 的
  压缩命名）就别问。
- 耗时的文件操作必须走 FileOperationManager 任务队列：可见（任务抽屉）、
  可取消、可恢复，且不阻塞 IPC invoke。

## 关联

同一批次的 Finder 对齐：同目录 Cmd+C → Cmd+V 生成「xxx 副本」
（`FilePane.vue` paste 分支同目录判定强制 rename 策略；
`resolveTargetPath` 副本命名 `a 副本.txt → a 副本 2.txt`，词表
`tasks.duplicateWord`）。
