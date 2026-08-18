# 右键菜单 Finder 化（NSMenu 重设计）：子菜单状态机、键盘导航与 e2e 类名兼容

日期：2026-08-18。涉及 `src/components/menu/FinderContextMenu.vue`（根：定位/钳制/键盘）、
`src/components/menu/FinderMenuNode.vue`（递归列表 + 图标集）、`FileList.vue`（IA 重排 + 文案）、
`style.css`（`--menu-*` 主题变量）、zh/en 词表、`e2e/copy-path|hex-preview|context-menu.spec.ts`。

目标：右键菜单视觉/交互对齐 macOS 原生 NSMenu（半透明浮层 + backdrop blur、12px 圆角、
208–224px 宽、28px 行高、图标/文本/快捷键三列、系统蓝底白字选中态（悬停=键盘焦点，
2026-08-18 用户裁定由初版低对比浅灰改为蓝底白字，与列表选中同语言）、↑↓←→/Enter/Esc 键盘导航、
任意层嵌套子菜单），信息架构按 Finder 重排（打开 → 移到废纸篓 → 文件管理组 → 快速操作▸ →
打开方式▸），不改任何既有 action 的功能逻辑。样式规范沉淀于
`docs/design/finder-ui-standard.md` §11。

## 坑 1：子菜单「展开」不能由 CSS :hover 推导，也不能纯由高亮路径推导

旧实现是 CSS：`.context-menu-item:hover .context-submenu { display: block }`。重设计要键盘
导航（→ 进入 / ← 收起）后 CSS 方案直接失效，且隐藏层的 `.context-submenu` 仍占 DOM，会被
Playwright `strict mode` 误命中。

改成 JS 状态机后又撞上第二个冲突：**「悬停父项 = 子菜单展开」（鼠标必需）与「← 高亮退回
父项 = 子菜单收起」（键盘必需）在同一状态下矛盾**——高亮路径 `[11]`（快速操作）既可能来自
悬停也可能来自 ← 退回，纯前缀推导无法区分。

解法：三层状态协作——

- `highlight: number[] | null`：悬停与键盘焦点共用的绝对路径（mouseenter 只是 `emit('hover',
  path)` 把高亮移过去，NSMenu 语义）；
- 子菜单展开 = 「highlight 落在该项自身或其后代」的前缀推导；
- `suppressedAt: number[] | null`：← 收起时写入父项路径的**显式覆盖位**，推导时命中即视为
  收起；任何悬停 / ↑↓ / → 移动都会清掉它。这样 ← 退回父项时父项保持高亮但子菜单收起，
  再按 → 或重新悬停即可重开。

未展开的子菜单**不渲染**（`v-if`），DOM 里永远只有可见层。

## 坑 2：Playwright 里静止指针不触发 mouseenter

右键打开菜单后指针静止在菜单上（click 定点后不动），Chromium 不会对「出现在静止指针下
的元素」补发 mouseenter——所以菜单刚打开时 `highlight === null`。这与 NSMenu 行为一致
（不悬停不高亮），但写键盘用例时必须意识到：第一次 ↓ 从 null 起步会落在首个可导航项，
之后的步进计数要把这一步算进去（同一用例里第二次打开菜单步数不同就是这个原因）。

## 坑 3：嵌套子菜单的 DOM 从属让「后代选择器」全面沦陷

子菜单渲染在父项 div **内部**（absolute 定位出去，DOM 不出去）。于是
`.context-menu-item.highlighted .menu-label` 会同时命中父项自己的 label 和它展开的整棵
子树的 label——strict mode 报「resolved to N elements」。e2e 断言一律用直接子代：
`.context-menu-item.highlighted > .menu-label`、`.context-menu > .context-menu-item`。
新写的 `context-menu.spec.ts` 里踩了两轮才收敛。

## 坑 4：e2e 类名是公共契约

`.context-menu / .context-menu-item / .has-submenu / .context-submenu` 四个类名被
copy-path、hex-preview、zip-container-formats、image-edit、tab-actions、duplicates、treemap、
grep、text-preview、symlink-chmod 十个 spec 引用。重写组件时原样保留这套类名，只有
copy-path（复制路径→拷贝路径 + 收进快速操作）和 hex-preview（以十六进制查看收进快速操作）
需要同步改 spec——词表 zh 值与 UI 逐字节一致的既有铁律再次生效。

## 坑 5：e2e mock 缺 `getDeviceCapabilities` 时能力门控项全部隐形

Proxy mock 对未定义方法返回 `async () => undefined`，`deviceCapabilities` 为 undefined，
`caps?.canDelete / canRename / canArchive / canCopyFrom …` 全部 falsy——移到废纸篓、重新命名、
压缩、拷贝、剪切都不会渲染（旧菜单同样如此，非回归）。给 mock 补上全真
`getDeviceCapabilities` 后菜单才完整。写新用例前先 dump
`.context-menu > .context-menu-item > .menu-label` 的 `allInnerTexts()` 拿文本级 ground truth，
比截图喂视觉模型可靠得多（视觉模型对小字号菜单项的读取有随机丢项）。

## 其它记录

- **视口钳制/翻转移入组件**：菜单渲染后自测量并钳制，右侧空间 <200px 时所有层级子菜单统一
  向左弹（`.context-menu-flipped` 类挂在根上，一条后代选择器级联生效）。items 异步重建
  （「打开方式」应用列表回填触发 watch 重建）后会重置高亮并重新钳制。
- **跨窗格菜单互斥**：document click 只监听左键，跨窗格右键不会关掉旧菜单；FileList 模块级
  `_closeActiveContextMenu` 句柄显式互斥，同时避免两个菜单组件同时消费键盘拦截器。
- **键盘消费走 `useKeyInterceptor`**（捕获阶段 LIFO）：菜单打开时 ↑↓←→/Enter/Esc 优先于
  App/FileList 的 bubble 监听——旧实现里菜单开着按 Enter 会触发底部列表的「内联重命名」。
- **新增两个复用既有能力的菜单项**（无新功能逻辑）：快速查看 = 空格键同链路
  `previewStore.openQuickLook`；制作替身 = 同目录 `createSymlink("xxx 的替身")`（Finder 文案，
  实为符号链接）。共享…/彩色标签因无后端能力且「不改文件列表」约束而未做，见提交说明。
- **并行会话占用 4173**：playwright webServer `reuseExistingServer:false` 会硬报错；临时以
  `playwright.alt.config.ts`（E2E_PORT=4174，locale zh-CN 等配置原样复制）跑同一套 e2e，
  跑完即删，不动共享的 playwright.config.ts。

## 验证

`npm run typecheck` 干净；受影响 12 个 spec：改前基线 51 过 4 挂（quick-look×2、
symlink-chmod×2，均为会话前既有失败），改后 55 过 4 挂（+4 为新增 context-menu.spec.ts，
挂的 4 个与基线逐字节一致——零新增回归）。亮/暗两主题的 computed 样式与截图均核对：
`rgba(250,250,252,.8)` / `rgba(44,44,48,.72)` + `blur(28px) saturate(1.8)`。

## 后续修订（2026-08-18 当日）：「快速操作」二级收纳 = 用户感知功能丢失

用户反馈右键菜单「丢失了一些功能，比如收藏」。逐层排查结论：**action 处理链一行未丢**
（全历史扫描 action 字符串，697b331 只增未删），运行时探针（右键目录 dump 全菜单）证实
「添加到收藏夹」等 7 项都在——只是被收进了「快速操作 ▸」子菜单，顶层不可见。教学：
**把已有顶层直达功能埋进二级子菜单，用户侧等价于功能删除**；IA 收纳必须与功能可见性
分开评估。处理：不回滚重设计（NSMenu 组件/样式/键盘导航/替身/快速查看全保留），仅将
7 项（在 Finder 中显示/在终端中打开/以十六进制查看/校验和/比较目录/添加到收藏夹/拷贝路径▸）
回迁顶层，门控条件与 697b331^ 完全一致；「快速操作」子菜单随之取消（词表键与图标表
条目保留无害）。

e2e 同步三处坑：

- `context-menu.spec.ts` 顶层清单 11→15 项、分隔线数恰好不变（4 条，位置变了）；
  键盘步进到「拷贝路径」从 10 步变 14 步。
- `hasText: '拷贝'` 子串匹配在「拷贝」与「拷贝路径」同为顶层后必然 strict-mode 双命中，
  且 `/^拷贝$/` 锚定在整行 item 上会连带快捷键文本——正解
  `:has(.menu-label:text-is("拷贝"))` 锚 label 子元素。
- `copy-path`/`hex-preview` 去掉先悬停「快速操作」的中转步，直接定位顶层项；
  嵌套子菜单选择器从 `.context-submenu .context-submenu` 退一层。

改后 51 过 2 挂（symlink-chmod×2，既有基线），typecheck 干净。
