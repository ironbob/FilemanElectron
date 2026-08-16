---
feature: file-semantics
title: 文件语义增强（符号链接 + 权限编辑, M5） — 架构文档
stack: Electron29+Vue3
design_profile: standard
analyzed_at: 2026-08-15
roles_count: 4
process_steps: 3
verdict: go
open_questions: 1
---

# 文件语义增强（符号链接 + 权限编辑, M5） — 架构文档

> 需求来源：`prd/2026-08-15-file-semantics-requirements.md`（随总体规划批准）。
> 契约源：`docs/architecture/2026-08-15-file-semantics-design-contract.json`（本文档为其人读渲染，两者一致）。

## 零、用户确认记录

等级选择 standard（随总体规划批准）；方案版本 1；方案确认同规划批准记录。

## 一、模块结构图

```mermaid
flowchart TD
  subgraph View 层
    FL[FileList 链接徽标×3 视图 + 菜单]
    FID[FileInfoDialog 目标行 + chmod 编辑器]
    SD[SymlinkDialog]
    FP[FilePane 弹窗宿主]
  end
  subgraph Domain
    PERM[permissions parse/serialize]
  end
  subgraph Infrastructure（main + adapters）
    RC[fs:symlink/readlink/chmod/chown handlers]
    RC2[递归 chmod 编排 = DirectoryWalker]
    LA[LocalAdapter symlink/readlink/chmod/chown]
    SA[SSHAdapter sftp 四方法]
    AA[AndroidAdapter runShell chmod]
  end
  FL --> FID & FP
  FP --> SD --> RC
  FID --> PERM & RC
  RC --> LA & SA & AA
```

## 二、业务流程图

列表 → isSymlink 渲染 ↷ 徽标（title=原始目标）；属性 → 目标行 + [编辑…] → rwx 格/八进制 → fs:chmod(mode, recursive) → main（Walker 递归）→ adapter 单路径应用 → 重取 stats 刷新。空白右键 → 新建符号链接… → (target, name) → fs:symlink → 当前目录 linkPath。

## 三、角色职责清单

| 角色 | 类型 | 层 | 职责 | 隐藏秘密 | 依赖 | 设计原则 |
|---|---|---|---|---|---|---|
| adapter 四方法 | class 方法 | infra | symlink/readlink/chmod/chown | fs-extra promises / sftp 回调包装 / runShell 八进制串 | capabilities 门控 | ISP 可选方法 |
| fs 语义 handlers | handler | infra(main) | 能力校验 + 递归编排 | Walker onFile/onDirectory 双回调 chmod | DirectoryWalker | 编排在 main |
| permissions 纯函数 | 纯函数 | domain | mode↔rwx↔octal | 9 位掩码边界 | — | 往返可测 |
| chmod 编辑器 | 组件片段 | view | rwx 格 + 八进制联动 + 递归 | 能力未知按支持处理；错误就地 | PERM/fs:chmod | 增量修改 |
| SymlinkDialog | 组件 | view | 目标+名称收集 | 当前目录拼接 linkPath | fs:symlink | RenameDialog 形态 |

## 四、质量属性与方案取舍

| # | 质量属性 | 优先级 | 验收 |
|---|---|---|---|
| QA-1 | 防环 | P0 | Walker 不跟随链接目录（M1 已内置，M5 复用） |
| QA-2 | 掩码边界 | P0 | setuid 位被编辑器掩掉（单测） |
| QA-3 | 能力门控 | P0 | 无 canSymlink/canChmod 设备入口隐藏 |

候选：ALT-1（选定）可选 adapter 方法 + main 编排递归。ALT-2：全部 main 进程直调 fs（绕过 adapter）——否决，远程设备无路径。ALT-3：递归交 shell `chmod -R`——否决，SSH 需 exec 且不可控（部分权限失败无逐项反馈）。

## 五、设计依据

- chmod 递归在 main 编排（Walker 逐项 + 单路径 adapter 应用）：跨设备统一（Android 无 exec 也可递归）、失败逐项可控、复用防环。
- 八进制串仅 Android 需要（runShell）；Local/SSH 走数值 mode 原生语义。
- FileInfo.isSymlink 为可选字段——旧 IPC 载荷（远程 adapter 未填）自动按 false 语义处理。

## 六、关键接口契约（P0）

- IFC-1 fs:symlink / fs:readlink：`(deviceId, targetPath, linkPath)` / `(deviceId, linkPath)`；canSymlink 门控，违反抛错。
- IFC-2 fs:chmod：`(deviceId, path, mode, recursive)`；recursive=true 时先应用根再 Walker 全树（含目录）；任何单项失败抛首个错误（已应用项不回滚——chmod 语义天然如此）。
- IFC-3 fs:chown：`(deviceId, path, uid, gid)`；canChown 门控。
- IFC-4 permissions 纯函数：parsePermissions/parseOctalPermissions/toOctalPermissions/rwxToOctal；非法输入 null 不抛异常；toOctalPermissions 掩 0o777。

## 七、验证证据

| 命令 | 结果 |
|---|---|
| npm run typecheck / tsc -p tsconfig.node.json | 0 / 16=基线 |
| npm run test:permissions | ✓ 往返全过 |
| npx playwright test e2e/symlink-chmod.spec.ts | 4 passed |

## 八、已知缺口 / 未决

- SSH 列表条目未标 isSymlink（sftp longname 'l' 前缀可判，未实现）——本地完整，远程列为后续。
- chown 编辑 UI 未做（通道就绪）。
- 递归 chmod 的逐项进度未推送（大目录静默较久）——必要时套用长任务三通道。
