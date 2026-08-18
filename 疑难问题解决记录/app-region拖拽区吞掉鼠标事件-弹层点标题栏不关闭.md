# app-region 拖拽区吞掉鼠标事件 — 弹层点标题栏不关闭

## 问题描述

**现象**：打开右上角「历史目录」（时钟按钮）或「标签总览」（⌄ 按钮）等弹层后，点击标题栏空白处（或标签条空白处）弹层**不关闭**；点击主内容区则正常关闭。

**根因**：macOS 上 `-webkit-app-region: drag` 区域（`.app-drag`，见 `style.css`：标题栏根 + 标签条根）由**窗口层整片吞掉鼠标事件**——`pointerdown`/`click` 根本不进渲染进程。所有弹层的「document 捕获阶段外点关闭」监听因此收不到标题栏的点击。

这不是事件冒泡/时序问题，事件压根没派发，capture/stopPropagation/LIFO 等手段全部无效。

## 解决方案：弹层存续期间临时放行拖拽区

新建 composable `src/composables/useAppDragSuspend.ts`：弹层打开期间在 `<html>` 置 `data-app-drag-suspended`（引用计数，嵌套/并存弹层各自持有），全局规则把 `.app-drag` 降级为 `no-drag`：

```css
html[data-app-drag-suspended] .app-drag {
  -webkit-app-region: no-drag;
  cursor: default; /* 防 I-beam */
}
```

点击恢复派发 → document 捕获监听照常触发 → 弹层关闭 → 计数归零、拖拽自动还原。两种用法：

- `useAppDragSuspend()`：组件存续期间挂起（v-if 挂载即「打开」，卸载即「关闭」）。
- `useAppDragSuspend(() => open.value)`：常驻组件内部的开合状态（getter）。

已接入：TabHistoryMenu / TabOverviewMenu / QuickJumpPanel / TaskDrawerMenu / FinderContextMenu（连带覆盖 FileList、FilePane 网格与面包屑菜单、DirCompareView、TabContextMenu）/ FilePane 最近访问+搜索历史下拉 / TextPreviewToolbar / ImageEditTopToolbar / PreviewHexContent / SelectionContextBar 色板。

**代价（符合原生语义）**：弹层打开期间不能用标题栏拖动/双击缩放窗口——与原生 NSMenu/浮层的模态跟踪行为一致（点哪儿都先收起）。

**注意**：ToolParamPopover（图片标注参数面板）是**常驻编辑面板**而非瞬时菜单，故意不接入——否则整个标注会话期间窗口都不可拖动。

## 验证

- `e2e/popover-titlebar-dismiss.spec.ts`（4 用例）：三条链路（历史/总览/右键菜单）打开后断言 `<html>` 带标记且标题栏/标签条 computed `-webkit-app-region` 变 `no-drag`；点标题栏空白（红绿灯保留区坐标）后弹层关闭、标记清除、region 回 `drag`；Esc 路径同样还原不残留。
- Playwright 合成事件不经 OS 窗口层，e2e 验证的是放行机制（标记置位/清除 + CSS 命中）；OS 级 region 动态更新由 Chromium 保证（样式失效触发新 compositor frame，Electron 29 无旧版「需重绘才更新」问题）。
