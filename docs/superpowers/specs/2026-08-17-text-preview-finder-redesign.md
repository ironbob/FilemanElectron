# 文本预览界面重设计 · 设计契约（2026-08-17）

> Finder 式文本预览重设计。完整设计讨论见本次会话交付稿；本文件归档**落地契约**：
> 布局度量、交互状态机、高亮分层、键盘语义，以及 5 个实现决策。

## 1. 布局

```
系统标题栏（不变）
预览标签栏（不变，当前文件标签）
预览工具栏 44px ★ 三段：左=元信息(+模式切换组) 中=查找 右=阅读/内容/更多
过滤状态条 28px（仅搜索激活时）
文本阅读区（铺满，无卡片/浮层；行号槽+正文）
加载状态脚注 24px（仅分片加载时）
```

- 图标 16px、热区 ≥28px（`finder-icon-button` 28×28）；hover 浅灰圆角；开启态系统蓝
  （`--finder-selection`），全局唯一强调色。
- 组间 1px 发丝竖线（`finder-toolbar-divider` / `edit-sep-v`）；最小字号 12px。

## 2. 工具栏三段

- **左**：类型徽标（弱化）+ `N 行 · 大小`（次级灰）；JSON/CSV/MD 模式切换组紧随其后。
- **中**：macOS 搜索框（280px，聚焦扩 320px）：`⌕ 查询文本 计数 选项⌄ 清除✕`；
  独立 `[▲][▼]` 匹配导航对（无匹配禁用）。计数 `N 个匹配` / `i / N 个匹配`。
- **右**：阅读组（自动换行 toggle、`语法：X ▾` 轻量菜单）│ 内容组（复制、导出菜单：
  全文/匹配结果/所选）│ `⋯` 更多（编码(只读)、字号、显示行号、迷你地图、跳转到行）。

## 3. 查找状态机

```
全文 ──输入──▶ A 过滤视图（匹配块+上下文+省略块） ⇄ B 全文高亮视图
                    │ 点击匹配行/省略块 → B 并定位            │
                    └────────── Esc / ✕ ──▶ 全文（无高亮）────┘
```

- **A 视图**：上下文行 55% 透明度（沿用 `fma-hl-context`）；所有未显示的连续区段
  （含文件头尾）渲染省略块 `⋯ N 行未显示 ⋯`（胶囊、可点击、点击跳 B 定位）。
- **B 视图**：全文 + 匹配软高亮（L3）+ 当前项蓝实底（L2），只读。
- **状态条**：`“query”：N 个匹配 · 上下文描述` + `[显示全文]⇄[仅显示匹配行]` + Esc 提示。
  分片未全量时追加 `（仅已加载范围）`。
- **0 匹配**：非错误空态 + `调整搜索选项` 按钮。
- **查找选项 Popover**：匹配规则（大小写/全字/正则 = co/CO/word/reg 谓词糖，表达式模式
  下禁用）；上下文行数分段 `[0|1|3|5]`（默认 3）；高级（排除、着色方案+方案…、历史…）。

## 4. 高亮分层（五层）

| 层 | 用途 | 视觉 |
|---|---|---|
| L1 选区 | 用户选择 | 系统蓝 25%（Monaco 原生） |
| L2 当前匹配 | 导航焦点 | `fma-find-current`：系统蓝实底+白字 |
| L3 其他匹配 | 其余命中 | `fma-find-match`：淡黄低透明 |
| L4 当前行 | 活动行 | Monaco 原生 line highlight |
| L5 上下文行 | A 视图陪衬 | 文字 55%（`fma-hl-context`） |

无字符区间的命中（复合表达式/invert/level/lines）降级为整行 L3。

## 5. 阅读区

- 等宽栈 SF Mono→Menlo；默认 14px（12–18，⌘±0）；行高 ≈ 字号×1.6。
- 行号右对齐可隐藏；跳转到行 ⌘L（行内浮层，非法值行内红字）。
- 语法菜单：自动检测（默认）/ 语言清单，会话级手动覆盖。
- 大文件分片：首片 2MB，脚注 `已加载 x / y` + `再加载 2 MB` / `加载全部`；
  绝对上限 64MB。**未全量 → 编辑器只读 + 保存禁用**（旧实现 8MB 截断后可保存会截断
  原文件，属数据丢失缺陷，本次修复）。

## 6. 键盘

- `⌘F` 聚焦搜索框（全选）；`Enter/⌘G` 下一匹配；`⇧Enter/⇧⌘G` 上一匹配；
- `Esc` 链（capture/LIFO）：diff 弹窗 → 方案编辑器 → 清除搜索恢复全文 →（父级）；
- `⌘C` 复制（有选区复制选区，否则全文）；`⌘L` 跳转到行；`⌘+ / ⌘− / ⌘0` 字号。
- 移除 Monaco 内置 findController（⌘F 归一走自定义搜索框）。

## 7. 已拍板的实现决策

| # | 决策 | 结论 |
|---|---|---|
| ① | 工具栏高度 | **44px**（与 hex 工具栏一致；设计稿要求；图片编辑器 40px 不动） |
| ② | Monaco 内置 Find | 移除 `findController` contribution，⌘F/⌘G 自定义接管 |
| ③ | 匹配区间 | 仅根节点为单谓词（co/CO/eq/EQ/word/WORD/reg/REG）时提取字符区间；复合/invert/level/lines 整行降级 |
| ④ | 编码 | 先只读显示 `UTF-8`；编码切换（需 chardet/iconv-lite + IPC 扩展）另立任务 |
| ⑤ | 模式切换组 | 保留在左段元信息右侧（`.finder-control-group`） |
| ⑥ | 纯文本查询 | 搜索框 plain-text 优先：无法按表达式解析（或未以谓词开头）→ 包装为 `co(原文)`；以谓词开头但解析失败 → 显示错误。新增 `ComposePlainQuery`（AST 直构，免字符串转义） |
| ⑦ | 历史版本菜单项 | 现无该功能，**不加**死菜单项 |
| ⑧ | 导出文件名 | 全文 → `<名>.copy<ext>`；匹配 → `<名>.filtered.log`（沿用）；所选 → `<名>.selection.txt`；冲突递增后缀 |

## 8. 自适应（密度档位）

| 档位 | 宽度 | 变化 |
|---|---|---|
| full | ≥1120 | 全量 |
| medium | ≥980 | 导出 → ⋯ 菜单 |
| compact | ≥840 | 语法 → ⋯ 菜单；元信息仅徽标 |
| minimal | <840 | 元信息隐藏；搜索收为 ⌕ 图标 + 覆盖式浮层 |

按钮永不换行/重叠/截断；查找与复制任何宽度直达。

## 9. 落地映射

| 现有 | 新去处 |
|---|---|
| `PreviewTextContent.vue` 工具栏模板 | 抽出 → `textview/TextPreviewToolbar.vue`（逻辑留父组件，事件透传） |
| `LogAnalysisToolbar.vue` | 解体：搜索框/计数/▲▼ → 中段；排除/上下文/方案/历史 → FindOptionsPopover；复制/导出 → 右段 |
| `useLogAnalysis` | 保留扩展：plain-query、A/B 视图、命中导航、gap 模型、click 定位 |
| `monacoFilterView.ts` | v2：gap 伪行、L2/L3 装饰、B 全文高亮模式、hitTest |
| `filterPipeline.ts` | FilterEntry 增 `ranges?`；新增 matchRanges/filterGaps 纯函数 + node 测试 |
| `logAnalysis` store / 引擎 / SchemeEditorDialog | 不动 |

## 10. v2 修订记录（同日第二轮反馈，已拍板并实施）

确认决策：**搜索框固定 280px（不随聚焦变宽）**；**工具栏高度 44px**。

| # | 变更 | 实施 |
|---|---|---|
| 1 | 查找组拼合：搜索胶囊与 `▲▼` 附件分段 **0 间隙拼合**（-1px 共享描边、同 28px 高、同材质、右圆角） | `.finder-nav-pair` |
| 2 | 状态条文案：视图描述并入左侧摘要 —— `· 全文已高亮` / `· 仅显示匹配行(与前后 N 行)`；切换钮只表目的地 | i18n `fullHighlightNote/statusContextDesc` |
| 3 | 语法控件升级为**轻量材质菜单按钮**（`--finder-control` pill、hover 加深、打开蓝描边 `is-open`） | `.finder-text-menu-btn` |
| 4 | **单蓝规则**成文并实施：图标切换钮=蓝底白图标（仅换行一处可能）；菜单类控件打开态一律 1px 蓝内嵌描边（`.is-open`），永不长蓝 | CSS + 语法/导出/⋯ 按钮 |
| 5 | 响应式改 **980/840 两档**：<980 导出→⋯；<840 语法+元信息→⋯（元信息以只读行呈现）；**搜索任何宽度保留**（原 minimal 覆盖浮层方案删除） | `TextPreviewToolbar` density |
| 6 | 禁用态带原因 Tooltip（▲▼ 无匹配 →「先查找，再在匹配间跳转」） | i18n `findNavDisabledTip` |

图标规范（第一轮反馈）：`src/components/icons/previewToolIcons.ts`，iconfont cid=48811 IconPark 线性库（search/close-one/up-one/down-one/copy/more/upload-three/text-wrap-overflow）。

## 10.5 工具栏组件对齐 FilePane（第三轮反馈，已实施）

从 `FilePane.vue` 工具栏抽取共享组件（单一事实源，两侧同渲染）：

| 组件 | 说明 |
|---|---|
| `toolbar/FinderToolbarButton.vue` | variant `round`=`toolbar-btn-enhanced`（30×30 圆钮，FilePane 同款全局类）；`segment`=视图切换分段钮（28×28）。`active`=唯一长蓝；`open`=菜单打开 1px 内嵌蓝描边 |
| `toolbar/FinderToolbarGroup.vue` | 浅灰分组托盘（`bg-bg-secondary/50 rounded-lg p-0.5`，可选 `bordered`） |
| `toolbar/FinderSearchField.vue` | FilePane 搜索框同款（h-8 / bg-bg-secondary/50 / border-border/50 / rounded-lg，聚焦 accent 蓝）；leading/trailing 插槽；宽度由调用方类控制（FilePane `w-36 focus-within:w-52`，文本预览固定 `w-[280px]`） |

应用范围：FilePane 工具栏全量重构改用组件（行为/title/aria/disabled 全保留）；文本预览工具栏（搜索框+▲▼ 托盘+右侧圆钮+语法 pill）同步替换。

关键样式事实：`bg-bg-secondary/50` 工具类因颜色变量不支持透明度修饰，实际着色由 `.finder-pane-toolbar` 下的 CSS 覆盖完成——已扩展至 `.text-view-toolbar`；因覆盖含 `border-color: transparent !important`，聚焦/错误/菜单打开态统一改用 box-shadow 环表达（`.finder-search-control:focus-within` 蓝环 / `.is-invalid` 红环 / `.syntax-open` 内嵌蓝描边）。另：工程根字号 14px ⇒ `h-8` 实际渲染 28px，两侧一致。
