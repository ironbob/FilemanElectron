# Finder UI 设计规范（本仓库使用注记）

> **权威源已迁移**：完整规范（Token 双主题数值表 / 7 套材质配方 / 控件规格库与状态矩阵 /
> 窗口解剖·失活语义·反模式·Electron 工程坑 / 可拷贝 CSS 与演示页）位于
> `/Users/wtb/work_space/DesignSkills/skills/ui-design-app/`（corin plugin 的 `ui-design-app` skill，
> finder 风格包，v1.0）。
>
> - 规范文档：`references/styles/finder/{tokens,materials,components,patterns}.md`
> - 可拷贝 CSS：`assets/styles/finder/{tokens.css,finder-ui.css}`
> - 演示页（选型/评审肉眼参考）：`assets/styles/finder/demo.html`
> - 修改规范**只改 skill**，本文件只维护本仓库特有的映射与契约，不再复制规范正文。

## 本仓库组件 ↔ 规范映射

| 本仓库实现 | 对应规范章节 |
| --- | --- |
| `src/styles/finder-ui.css`（`.finder-shell` 全部变量与组件层） | tokens.md + materials.md + components.md |
| `src/style.css`（`:root` / `[data-theme=light]` 主题变量） | tokens.md §1（数值同源） |
| `FinderContextMenu.vue` + `FinderMenuNode.vue` | components.md §2.8（NSMenu 三列解剖）+ patterns.md §5 |
| `AppSidebar.vue` / `App.vue` sidebar-dock | materials.md §2 + patterns.md §1（浮层卡片） |
| `FinderToolbarGroup/Button/SearchField`（胶囊工具栏） | materials.md §3 + components.md §2.2 |
| `TabBar` / `TabItem` | components.md §2（标签栏节）+ patterns.md §1 |
| `FileList.vue`（RecycleScroller + 双底选中） | components.md §3（列表族）+ patterns.md §4 |
| `dialogs/` 共享 Sheet | patterns.md §6（浮层家族） |
| `QuickLookOverlay.vue` | patterns.md §6（QuickLook 几何与材质窗） |
| 任务抽屉 / 快速跳转面板 | patterns.md §6 |

## 文件右键菜单信息架构（业务专属，规范不含）

按 Finder 分组，分隔线区隔，顺序固定：

1. **打开类**：打开（ZIP 族为 ZIP ▸ 子菜单）；目录追加 新标签页 / 双面板 / 图片 ▸。
2. **危险操作**：移到废纸篓。
3. **文件管理**：显示简介、重新命名…、批量重命名…、压缩“{名称}”、解压、拷贝、剪切、制作替身、快速查看。
4. **扩展能力**（2026-08-18 修订：曾收纳进「快速操作 ▸」二级致入口被埋、用户感知
   「功能丢失」，当日回迁顶层直达——**勿再埋二级**）：校验和、对比目录、收藏、Finder 中显示、
   终端、十六进制、拷贝路径 ▸，门控条件不变。
5. **打开方式 ▸** 末尾子菜单；LaunchServices 动态列出、默认应用置顶标注。

文案用简体中文 macOS 术语（拷贝/剪切/显示简介/重新命名…/移到废纸篓/制作替身/快速查看），
动态项插值真实文件名或数量。空白菜单保持 新建/粘贴/收藏/显示隐藏/前往/工具页/终端/拷贝路径/打开方式 分组结构。

## 本仓库实现契约（e2e 依赖，勿破坏）

- 菜单：全局 `.context-menu*` 规则与 `suppressedAt` 状态机被 TabContextMenu 复用，勿删；
  e2e 依赖菜单类名契约。
- 侧边栏：窄窗 overlay 阈值 900px（与 panes 最小内容宽差 10px，勿加宽）；
  `sidebar-item` 勿加 `w-full`。
- 标签栏：关闭按钮常驻 DOM（仅视觉隐藏）；`⌘W` 菜单打开期间放行；标题栏 z-index:30 契约。
- 工具栏：e2e mock 必须提供 `volumes` 字段（缺省会毒化 onMounted）；
  视觉验证用 computed style，勿信视觉模型。
- QuickLook：文本窗几何 clamp(420px,70%,760px) / min(90%,1200px)；宽度勿用 vw。
- e2e 既有基线失败（quick-look 2 挂等）为历史基线，勿顺手修（详见记忆/会话记录）。

## 历史背景

2026-08-15 → 08-19 经约 15 轮 Finder 化重设计 + 三轮全应用审计收敛而成，
踩坑过程见 `疑难问题解决记录/`（Monaco、pdfjs、子组件键消费、全局 CSS 冲突、多选性能）
与各次会话记忆。规范提炼自实战代码，非纸上设计——这是它可跨 app 复用的原因。
