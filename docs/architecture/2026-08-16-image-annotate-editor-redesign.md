# 图片标注编辑器 Finder 式重设计（2026-08-16）

对应设计方案：《图片标注编辑器 & 保存 Sheet macOS Finder 风格重设计》（会话内设计稿）。
本文记录落地后的组件契约、状态机与回归面。裁剪/压缩/批量部分见同日
`2026-08-16-image-preview-editing-arch.md`。

## 布局：三区结构（重叠在结构上不可能发生）

```
┌ 标签栏（AppTabBar，36px，沿用）──────────────────────────────┐
├ ① ImageEditTopToolbar（40px，恒显，z-50）─────────────────────┤
├ ② 画布区(flex-1) ─────────────────────┬ 右侧轨道列(64px) ────┤
│   img + ImageCropOverlay/ImageAnnotate │ AnnotationRail(52)   │
│   Overlay + SelectionContextBar(浮动)  │ ToolParamPopover(浮) │
├ ③ 底部状态栏（32px：文件名/大小/尺寸/缩放/flash/已编辑）───────┤
```

- 旧实现的三处 absolute 叠放（FAB、右侧竖排面板、底部横条）全部删除；
  集合导航箭头/计数徽标从 PreviewView 浮层收编进顶栏（‹ › + `n / n`）。
- z 台账：画布 0 ／ 裁剪·标注 overlay 20 ／ 上下文条 30 ／ Popover 40 ／
  顶栏 50 ／ 未保存 Alert 70 ／ Sheet 遮罩+面板 80+。
  （顶栏 z-50 的必要性见 `疑难问题解决记录/backdrop-filter层叠顺序…md`。）

## 组件契约

| 组件 | 职责 | 关键 props/emits |
|---|---|---|
| `ImageEditTopToolbar` | 视图+编辑意图（缩放读数 `100%▾` 菜单、旋转、裁剪、标注可见性、⋯ 集合菜单、完成） | 纯展示；全部 emit 给宿主 |
| `AnnotationRail` | 工具轨道：选择｜箭头/矩形/圆形/画笔/文字｜撤销/重做/删除 | `pick/undo/redo/delete` |
| `ToolParamPopover` | 颜色(8 色+自定义)/线宽(3 档)/填充(3 态)/透明度；画布交互自动收起、Esc 只收面板 | `update(patch)/close` |
| `SelectionContextBar` | 选中对象上方浮动：迷你色板/线宽/复制/删除 | 由宿主按 `selectionDisplayBox` 定位夹紧 |
| `ImageAnnotateOverlay` | 绘制 + 选择/拖动/框选/角柄缩放(单选 rect/ellipse)/文字双击再编辑/键盘 | expose `exportOverlay`、`selectionDisplayBox` |
| `ImageSaveSheet` | 顶部吸附实色 Sheet：segmented 意图、存储为(name+dir)、位置选取、恒常预估摘要、折叠导出选项、替换二次确认 | `confirm(save, params)/params-change` |

## VM（useImageEdit）要点

- **选中集** `selectedIds`；**undo/redo 双栈**（所有变更经 `commit()`）。
- **按工具参数记忆** `annoParams: Record<AnnoTool, AnnoToolParam>`；
  `setAnnoParam` 同时更新默认值并即时作用于选中对象（可撤销）。
- **未保存确认** `requestAnnotateExit({onDiscard,onStore})` → `unsavedPrompt`：
  退出标注 / 集合切图共用；「存储」回调注入 overlay 导出 → 保存 Sheet。
- **恒常预估**：`refreshEstimate` 仅以 `saveDialogVisible` 为门（修复旧版
  纯标注保存无预估的缺口）；估算含真实输出格式（ImageEditService.estimate）。
- **Esc 阶梯**（capture LIFO，逐层消费）：Popover → 浮层(文字→交互中→选中) →
  宿主(退出标注，dirty 先确认)。Esc 永不直达关预览 tab。
- 保存成功 → `flashMessage`（4s）+ `applyEditResult` 刷新 + 标注复位。

## 保存链路扩展（shared/types + 主进程）

- `EditSaveSpec` 增加 `name`（完整文件名）/`dir`（输出目录）/`format:'png'`；
  `resolveOutputPath` 支持 name/dir（校验非法字符，见 `imageEditNaming`）。
- 新 IPC `system:pickDirectory`（channels/main/preload/env.d.ts 四处同步）。
- 冲突预检：Sheet 内 `fileman.exists` 探测同名 → 提示自动 `-1` 递增名。

## 回归面

- `e2e/image-edit.spec.ts`（9 用例）：顶栏无 FAB、标注→Popover→绘制→完成→
  Sheet→apply(annotate)、dirty Esc 未保存确认、裁剪 Esc、⋯ 菜单压缩入口
  （选项默认展开）、替换警示+二次确认、集合导航收编、批量压缩/改名。
- `tests/annotationShapes.test.ts`：8 色断言（新增 `#AF52DE`）。
- 已知预存失败（与本次无关，HEAD `8a423ba` 起）：quick-look×2、symlink-chmod×2、
  directory-compare×1 —— FileList 选中样式改为 `finder-selected` 后旧断言未更新。

## 遗留（v2 候选）

- 选中对象的箭头端点编辑、freehand 节点编辑（当前仅整体移动）。
- 标签页关闭按钮（tab ×）尚未挂 dirty 守卫（Esc/完成/切图已覆盖）。
- 状态栏缩放读数暂不可点击（菜单在顶栏，双入口属锦上添花）。
