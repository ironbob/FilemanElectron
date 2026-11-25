# APK 安装与包信息展示功能需求文档

> 日期：2026-11-24 ｜ 状态：已实现（2026-11-25 真机验证通过；双击语义与首期范围已确认）
> 产出模式：特殊扩展名便捷功能首期（APK）。HAP 安装、安装后启动等后续候选见 §11。

## 1. 一句话目标

双击本机或手机存储里的 APK，选一台已连接的 Android 设备即可完成安装；「显示简介」直接展示包名、版本等安装包信息，不必先装上或另开工具。

## 2. 背景与成功标准

- 当前问题：本地 `.apk` 属 zip 族，双击交系统默认应用（[FileList.vue:1640](../src/components/FileList.vue)），而 macOS 没有 .apk 的默认应用，是条死路；手机上的 APK 双击进 ZIP 预览（整包读入内存）；应用内没有任何安装入口，也看不到包信息。
- 成功标准：① 双击 APK → Sheet 展示应用名/版本与设备列表 → 点安装 → 任务抽屉显示进度 → 完成后设备上应用已是新版本；② 失败给出可读原因（签名不一致 / 版本降级 / 空间不足 / 未授权）；③ 选中 APK 按 ⌘I，出现「安装包」区块；④ **绝不装到用户未选择的设备**。
- 产品阶段：既有能力增强。复用任务队列（进度/取消/历史）、BaseSheet、文件类型注册表与 IPC 四处同步规约。

## 3. 用户与角色

| 角色 | 关键特征 / 目标 | 可以做 | 明确不能做 |
|---|---|---|---|
| Android 开发者（主用户） | 构建产物多，频繁给测试机装包，常有多台设备在线 | 安装 debug / testOnly 包、多设备间选目标、批量安装、查看包信息 | 无线免授权安装、静默安装、卸载、降级安装 |
| 普通用户 | 手里有一个 APK 想装到自己的手机 | 按指引开启 USB 调试并授权后安装 | 同上 |

## 4. 核心场景

- 场景 1（单设备）：双击 `app-debug.apk` → Sheet 显示「示例应用 1.2.3 (1024)」与唯一在线设备（已选中）→ 安装 → 抽屉进度条推进 → toast「已安装到 Pixel 8」。
- 场景 2（多设备）：两台在线 → Sheet 列出两台，默认选中上次使用的那台 → 选另一台安装。
- 场景 3（手机上的 APK）：浏览某台 Android 设备的 `Download/`，双击 `foo.apk` → Sheet 不列设备，只确认「安装到 <该设备>」→ 安装。
- 场景 4（失败）：与已安装版本签名不一致 → 任务标红，原因「与已安装版本签名不一致，请先卸载旧版」。
- 场景 5（无设备）：本机双击 APK 且无在线 Android 设备 → 退回「浏览内容」（与右键「浏览」同一行为）。
- 场景 6（批量）：多选 3 个 APK → 右键「安装到 Android 设备…」→ Sheet 按钮「安装 3 个」→ 队列逐个执行，单个失败不影响其余。
- 场景 7（看信息）：选中 APK 按 ⌘I →「安装包」区块显示应用名称、包名、版本、最低/目标 Android 版本，取得到时显示图标。

## 5. 业务对象与术语

| 术语 / 对象 | 业务定义 | 与其他对象的关系 |
|---|---|---|
| app-install 任务 | `FileOperationType` 新成员，参数为 `AppInstallSpec`；`targetDeviceId` 即目标设备 | 与 image-convert / video-convert 并列，共用队列、抽屉与历史 |
| 目标设备 serial | 由目标 `deviceId` 剥去 `android:` 前缀得到的 adb 序列号 | 所有 adb 操作显式按 serial 定位，不做任何回退 |
| 推送阶段 | 本机 APK 经 adb push 写入设备临时路径 | 进度 = 已推送字节 / APK 大小 |
| 设备端安装阶段 | 设备上执行 `pm install -r -t <临时路径>` | 无字节进度，副行显示「正在设备上安装」 |
| ApkInfo | 从 APK 的二进制 Manifest 解析出的只读信息 | 「显示简介」区块与安装 Sheet 共用；仅本地 APK |
| 在线设备 | `adb listDevices` 中状态为 `device` 的条目 | 独立于文件适配器的连接状态，Sheet 打开时实时拉取 |

## 6. 业务规则与状态

### 6.1 关键规则

- R1（目标唯一）：目标设备由用户所选 `deviceId` 剥前缀得到 serial 并显式匹配；该设备不在线即失败，**不得回退到第一台**。同步修正 `AndroidAdapter` 的既有匹配缺陷（§7 模块 A）。
- R2（安装即替换）：固定 `pm install -r -t`——覆盖旧版本并保留应用数据，允许 testOnly 包；不做降级（`-d`）、不做权限预授予（`-g`）。
- R3（进度口径）：推送阶段进度 = 已推送字节 / APK 大小；设备端安装阶段进度条保持满格，副行提示设备端安装中；手机上的 APK 无推送阶段。
- R4（临时文件）：推送目标 `/data/local/tmp/fileman-<随机串>.apk`（adbkit 自带安装用固定文件名，同名并发会互相覆盖，故不直接用其 `install()`）；成功 / 失败 / 取消后一律删除。
- R5（失败可读）：常见 `INSTALL_FAILED_*` / `INSTALL_*_FAILED` 码映射为中文原因与建议，未知码原样附带。
- R6（失败隔离）：批量逐个执行，单个失败记录后继续；取消则停止后续。
- R7（原文件只读）：本机 APK 与手机上的 APK 均不被修改或删除。
- R8（包信息范围）：仅解析本地 APK；手机上的 APK 不为解析而拉取整包，Sheet 只显示文件名与大小。
- R9（双击路由）：`.apk` 专用分支插在「本地 zip 族 → 系统打开」之前；本机无在线设备时退回浏览内容；Android 设备上的 APK 进入安装确认；其他远程设备（SMB/SSH/iOS/OHOS）维持 ZIP 预览。
- R10（串行）：队列一次只执行一个安装任务。

### 6.2 生命周期 / 状态

| 对象 | 当前状态 | 触发事件 | 下一状态 | 不允许时的业务结果 |
|---|---|---|---|---|
| 在线设备 | 未授权（unauthorized） | 手机上允许 USB 调试 | 在线 | Sheet 中列出但不可选，附引导文案 |
| app-install 任务 | pending | 队列派发 | running | — |
| 单个安装 | 推送中 | 推送完成 | 设备端安装中 | 推送失败 → failed，清理临时文件 |
| 单个安装 | 设备端安装中 | `Success` | success | `Failure [CODE]` → failed（R5），清理临时文件 |
| 任务 | running | 用户取消（推送中） | cancelled | 终止推送并清理临时文件 |
| 任务 | running | 用户取消（设备端安装中） | 设备端返回后结束 | 设备端安装不可中断；若已装成则如实记 success |

## 7. 功能清单

#### 模块 A：前置修复——Android 目标设备解析

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | 按裸 serial 匹配 | `AndroidAdapter` 用 `deviceId` 剥 `android:` 前缀后的 serial 定位设备；指定设备不在线时报「设备未连接」，不再回退到第一台 | 纯函数单测覆盖：带前缀 / 不带前缀 / 未找到 / unauthorized / offline；两台设备在线时各自条目连到各自设备（实机） |

#### 模块 B：入口与安装 Sheet

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | 双击 | 本机 `.apk`：有在线 Android 设备 → 打开安装 Sheet；无 → 退回浏览内容。Android 设备上的 `.apk` → 打开确认 Sheet（目标固定为该设备） | ① 死路消失；② 无设备时进入 ZIP 虚拟目录；③ SMB/SSH 上的 apk 仍走 ZIP 预览 |
| P0 | 右键「安装到 Android 设备…」 | 本机 APK、存在在线 Android 设备时出现，单选 / 多选均可；与「浏览/解压」并列 | 混选 APK 与其他文件不出现；无在线设备不出现 |
| P0 | 安装 Sheet | 标题「安装应用」；本地 APK 显示应用名、版本、大小与图标（解析不到则显示文件名）；设备单选列表（名称 + 型号，默认选中上次使用或唯一设备），未授权设备置灰并提示；按钮「安装」/「取消」 | 以 `VideoConvertDialog` 为结构范本；文案走 i18n |
| P0 | 在线设备列表 | Sheet 打开时经 IPC 实时取 `adb listDevices`，名称取设备注册表，缺失则用 serial | 未授权设备出现在列表中且不可选 |
| P0 | 架构文档同步 | 更新双击决策表中 apk 一行与 §6 决策记录 | 文档与实现一致 |

#### 模块 C：安装执行链路

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | app-install 任务 | `FileOperationManager` 新执行器 `ApkInstallService`（组合根注入）；串行、失败隔离、取消 | 批量 3 个 APK 逐个完成，单个损坏不影响其余 |
| P0 | 本机 APK | 推送到唯一临时路径（带进度）→ `pm install -r -t` → 删除临时文件 | 进度条随推送连续推进；装完 `/data/local/tmp` 无残留 |
| P0 | 手机上的 APK | 先在设备内拷到 `/data/local/tmp`（Android 11+ 的 system_server 无权读取 FUSE 存储，直接 `pm install /sdcard/…` 会被 SELinux 拒绝），再 `pm install -r -t`，用后删除 | 不经过本机中转；`/sdcard/Download` 下的 APK 可装 |
| P0 | 失败映射 | 常见失败码 → 中文原因（§8） | 每个映射码有单测 |
| P0 | 结果反馈 | 完成 toast「已安装 <应用名> 到 <设备名>」；抽屉历史可重试 | 失败任务可点「重试」 |

#### 模块 D：包信息

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | 「显示简介」安装包区块 | 单选本地 `.apk` 时显示：应用名称、包名、版本（versionName (versionCode)）、最低 Android 版本、目标版本；图标取得到则显示 | 门控与媒体信息区块一致（本机、单选、非 ZIP 条目）；解析失败显示「无法解析安装包信息」，不报错弹窗 |
| P0 | 解析服务 | `ApkInfoService.inspect(localPath, locale)`：只读 zip 中央目录、Manifest 与 resources.arsc，不整包读入。真实 APK 的应用名 / 图标多为资源引用，由自写的精简资源表解析器还原（应用名按界面语言取值并逐级回退；图标取密度最高的 PNG / WebP，自适应图标 XML 跳过） | 真实 APK 与 `aapt dump badging` 对照一致；百兆级 APK 解析耗时在百毫秒量级 |

## 8. 关键异常与失败结果

| 场景 | 异常 / 边界条件 | 期望业务结果 |
|---|---|---|
| 设备授权 | `adb listDevices` 为 unauthorized | Sheet 中该设备置灰 + 「请在手机上允许 USB 调试」；任务执行时报未授权 |
| 设备连接 | 安装中途拔线 / 设备离线 | 该项 failed「设备已断开」，清理本机侧状态；抽屉可重试 |
| 签名 | `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 「与已安装版本签名不一致，请先卸载旧版」 |
| 降级 | `INSTALL_FAILED_VERSION_DOWNGRADE` | 「版本低于已安装版本，不支持降级安装」 |
| 空间 | `INSTALL_FAILED_INSUFFICIENT_STORAGE` | 「设备存储空间不足」 |
| 架构 | `INSTALL_FAILED_NO_MATCHING_ABIS` | 「安装包不包含该设备 CPU 架构的库」 |
| 系统版本 | `INSTALL_FAILED_OLDER_SDK` / `INSTALL_FAILED_MIN_SDK` | 「设备系统版本过低」/「设备系统版本高于安装包支持范围」 |
| 文件无效 | `INSTALL_PARSE_FAILED_*` / `INSTALL_FAILED_INVALID_APK` | 「不是有效的 APK 安装包」 |
| 包信息 | 加固 / 资源混淆导致 Manifest 解析失败 | 简介显示「无法解析」；Sheet 退回显示文件名；**不阻塞安装** |
| 图标 | 自适应图标或资源表取不到 | 不显示图标，用通用 APK 图标 |
| 手机确认 | 部分厂商 ROM 的 `pm install` 需在手机上二次确认 | **未实现专门提示**：设备端安装期间界面保持满格与「即将完成」，直到 `pm install` 返回；验证用的 OnePlus 无二次确认行为，该场景未验证，提示文案留待有对应 ROM 时再做 |
| 手机上的 APK | Android 11+ 直接 `pm install /sdcard/…` 被 SELinux 拒绝（`avc: denied … fuse`） | 设备内先拷到 `/data/local/tmp` 再安装，结束后删除 |
| 取消时机 | 取消落在最后一个文件的设备端安装期间且它已装成 | 设备端安装不可中断，设备状态确已改变：任务如实记为完成，不显示「已取消」 |
| 失败输出 | 真机的失败行可能带说明（`Failure [CODE: detail]`），无效包则直接抛 Java 异常 | 按码给出专属文案；未知码把设备原话一并带上 |

## 9. 非功能与领域约束

| 类别 | 约束 / 要求 | 状态 | 依据 / 风险 |
|---|---|---|---|
| 依赖 | 新增 1 个纯 JS 包 `@devicefarmer/adbkit-apkreader`（Apache-2.0，约 60KB，依赖 debug 与 yauzl，yauzl 已在依赖树）读取 Manifest；资源表由自写的精简解析器处理，不依赖 Android SDK 的 aapt | 已确认（2026-11-24） | 最终用户机器不一定装了 SDK；`apk-parser` 无许可证声明，不引入 |
| 安全 | adb 命令一律参数数组，不经 shell 拼接；APK 路径含空格 / 特殊字符正确处理 | 已确认 | HostShellService「无引号地狱」原则 |
| 性能 | 包信息解析只读中央目录与 Manifest；安装串行 | 已确认 | 不整包读入内存 |
| 隐私 | 全部本地操作，不联网、不上传 | 已确认 | — |
| 兼容 | 不新增设备能力位（渲染层按设备类型门控） | 已确认 | 减少三处能力表改动 |
| i18n | Sheet / 右键 / 简介 / 失败文案 zh-CN 与 en-US 键对齐 | 已确认 | `tests/i18nCatalog.test.ts` 校验 |

## 10. 外部依赖

- `@devicefarmer/adbkit`（已捆绑）：`push()` 的 `progress` 事件与 `cancel()`、`shell()`、`listDevices()`；不使用其 `install()`（固定临时名、无进度、不支持 `-t`）。
- `@devicefarmer/adbkit-apkreader`（新增）：`readManifest()` 取包名 / 版本 / SDK，`getIcon()` 尽力而为。
- `FileOperationManager` / `TransferTask` / 任务抽屉：队列、进度、取消、历史、重试全部复用。
- `BaseSheet` + `VideoConvertDialog.vue`：安装 Sheet 的结构范本。
- `FileInfoDialog.vue`：在媒体信息区块旁新增安装包区块，沿用 `getMediaInfo` 的 IPC 接法。
- IPC 四处同步规约与 `@shared/types` 单一事实源。
- `docs/architecture/2026-08-16-double-click-open-map-arch.md`：双击决策表需同步修订（当前决策为「apk 维持 TAB_ZIP」）。

## 11. 明确不做（Out of scope）

- HAP / HSP 安装到 HarmonyOS（P1 候选，同一任务类型预留 `AppInstallSpec.kind`）。
- IPA 安装到 iOS：AFC 无安装能力，仅开发签名包可行，不做。
- 卸载、安装后自动启动应用、安装完成后打开应用入口。
- 降级安装（`-d`）、权限预授予（`-g`）。
- 拆分包（`.apkm` / `.xapk`）与 AAB 安装。
- 手机上 APK 的包信息解析、把一台设备上的 APK 装到另一台设备。
- 非 Android 远程设备上的 APK 特殊处理。

## 12. 假设、风险与未决问题

- 假设 1：`@devicefarmer/adbkit-apkreader` 4.0.0 的模块格式可在 Electron 主进程加载（CJS / ESM 加载方式在实现期验证，不成立则退回固定 3.x 版本）。
- 假设 2：`pm install -r -t` 在主流 ROM 上行为一致；个别 ROM 的二次确认以提示文案兜底（§8）。
- 风险（既有缺陷外溢）：模块 A 修复后，「多设备时所有条目都显示第一台」的行为变为按真实设备显示。这是修正而非回归，但需要实机回归多设备浏览。
- 风险（模块 A 的验证范围）：缺陷结论先来自代码走查，后用真实 `listDevices()` 输出验证了旧逻辑匹配失败、新逻辑命中正确设备；手头只有一台 Android 设备，「两台实物在线时各条目连错」的场景未实际复现，多设备浏览仍需实机回归。
- 已知限制：adbkit 的推送进度事件成批到达，推送过程中进度条呈阶梯式推进；推送结束时强制推送满格，设备端安装阶段保持满格。
- 已知限制：只含自适应图标（XML）的 APK 不显示图标；应用名按「语言+国家 → 仅语言 → 默认 → 其它」回退。
- 已知限制：zip 条目极多的 APK（如 Flutter 包）包信息解析约 0.5 秒，安装 Sheet 先显示文件名、解析完成后更新。
- 实测记录（2026-11-25，OnePlus 7T / Android 11）：安装、覆盖、降级、签名不一致、无效包、testOnly 包、推送中取消、200MB 完整安装、手机上的 APK 就地安装、设备不在线与跨设备拒绝均通过；真实应用 UI 全流程 15 项通过；设备上的测试包与临时文件已全部清理。
- 未决：安装完成后 toast 是否提供「打开应用」——需解析启动 Activity，P1 再议。

## 13. 验收命令

- `npm run typecheck`、`npm run test:i18n`、`npm run test:task-display`
- 新增 `tests/apkInstall.test.ts`：目标设备解析纯函数、失败码映射、进度换算
- `npx playwright test e2e/apkInstall.spec.ts`：双击与右键门控、Sheet 内容、无设备退回浏览、简介区块（mock IPC）
- 实机：真机安装 debug 包与 testOnly 包、批量、取消、失败码各一例；多设备各条目浏览各自的文件
