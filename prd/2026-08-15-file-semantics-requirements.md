# 文件语义增强(符号链接 + 权限编辑)功能需求文档(M5)

> 日期:2026-08-15 ｜ 状态:已确认(随「程序员工作台功能套件」总体规划批准)
> 产出模式:总体规划之 M5 套件(F12 符号链接 + F11 chmod/属主编辑器)

## 1. 一句话目标

让符号链接在列表/属性里可见、可创建,让本地与远程的权限位可通过 rwx 复选格/八进制编辑(支持目录递归),补齐 Finder 都没做好的两块文件语义。

## 2. 业务规则

- R1(链接不跟随):所有遍历(grep/dupes/space)不跟随 symlink-to-dir(防环)——M1 Walker 已内置。
- R2(链接自身语义):列表条目展示链接自身(isSymlink + 原始目标字符串,不解析为绝对)。
- R3(能力门控):canSymlink(本地/SSH)门控创建入口;canChmod(本地/SSH/Android)门控编辑器;canChown(本地/SSH)通道就绪。
- R4(递归安全):chmod 递归由 main 编排 Walker(不跟随链接),adapter 只应用单路径;失败逐项呈现。
- R5(掩码边界):编辑器只管 9 位权限位(setuid 等高位掩掉),八进制输入 3-4 位校验。
- R6(创建路径):链接创建于当前目录,目标可为相对路径;重名/权限错误就地显示。

## 3. 功能清单

| 模块 | 优先级 | 功能 | 验收 |
|---|---|---|---|
| F12 | P0 | 列表三视图链接徽标(title 含目标) | e2e 断言徽标与 title |
| F12 | P0 | 属性弹窗「符号链接」行 | e2e |
| F12 | P1 | 新建符号链接弹窗(目标+名称) | e2e 断言 createSymlink 参数 |
| F11 | P0 | rwx 复选格 + 八进制联动 + 应用 | e2e 断言 fs:chmod mode 正确 |
| F11 | P1 | 目录递归复选 | 传递 recursive 标志(e2e 参数断言) |
| F11 | P1 | 权限往返纯函数 | mode↔rwx↔octal 单测 |

## 4. 明确不做

- 不做 chown 编辑 UI(通道已通,uid/gid 获取与校验留待需要时);不做 ACL/扩展属性;不做链接批量创建。

## 5. 假设与风险

- 假设:readdir(withFileTypes) 的 isSymbolicLink 跨 macOS 卷可靠(POSIX 语义)。
- 风险:SSH 列表的 isSymlink 未填(sftp readdir longname 首字符 'l' 可判,M5 未做——列为缺口);Android ln -s 受 SELinux 限制故 canSymlink=false。
