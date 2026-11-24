# 视频格式转换（MOV→MP4 为核心）功能需求文档

> 日期：2026-11-23 ｜ 状态：已实现（2026-11-24 实机验证通过；P0 仅视频转换，图片侧不动）
> 产出模式：多媒体便捷功能系列首期。图片格式转换已上线（`image-convert` 任务 + 右键「图片转换」+ 参数 Sheet），本文档补齐视频侧空白，全程复用既有任务队列与交互模式。

## 1. 一句话目标

在文件管理器内就地把手机录像 / 小众容器视频转成通用 MP4（H.264 + AAC），不离开应用、不装第三方工具，批量走既有任务队列。

## 2. 背景与成功标准

- 当前问题：iPhone 默认录像 MOV（HEVC）在微信 / Windows / 部分剪辑软件不兼容；mkv/avi 等容器应用内也无法播放（双击打开架构文档已将「ffmpeg-static 转码」列为远期项）。视频侧目前只有预览、缩略图抽帧、mediainfo 元数据，无任何转换能力，用户只能另开 HandBrake 或命令行。
- 成功标准：① 右键选中 MOV 两步内发起转换，默认参数产出微信 / Windows 可播的 MP4；② 批量转换在任务抽屉可见逐项状态与单文件百分比，可取消；③ 失败 / 取消不残留半成品，原文件始终不动。
- 产品阶段：既有能力增强——新增 `video-convert` 任务类型，门控、Sheet、队列、刷新全部对齐 `image-convert` 既有语义。

## 3. 用户与角色

| 角色 | 关键特征 / 目标 | 可以做 | 明确不能做 |
|---|---|---|---|
| macOS 主用户 | 手机导入素材后需分享 / 剪辑 / 归档 | 单选 / 多选视频发起转换、选质量与分辨率预设、指定输出目录、中途取消 | 覆盖原片（P0 只提供副本）；专业级码率 / 多轨 / ProRes 控制 |

- **不是**目标用户：专业剪辑师（需要精确码率控制与多轨输出，那是 NLE 的形态）。

## 4. 核心场景

- 场景 1（单文件兼容转换）：iPhone 导入的 `IMG_1234.MOV` 右键「视频转换」→ 默认 MP4 标准质量 → 同目录出现 `IMG_1234.mp4`，微信可发、Windows 可播。
- 场景 2（批量）：选中 20 个 MOV 一次发起 → 队列串行转完，抽屉逐项打勾；个别损坏文件标红不阻塞其余。
- 场景 3（压缩分享）：4K 录像选「1080p + 小体积」→ 产出体积显著缩小的 MP4。
- 场景 4（中途取消）：转到一半取消 → 当前半成品清理，已完成项保留，后续项不再执行。

## 5. 业务对象与术语

| 术语 / 对象 | 业务定义 | 与其他对象的关系 |
|---|---|---|
| video-convert 任务 | `FileOperationType` 新成员，参数为 `VideoConvertSpec` | 与 image-convert 并列，共用 TransferTask 生命周期与抽屉 UI |
| 质量预设 | 高 / 标准 / 小体积 → libx264 CRF 20 / 23 / 28 | 只暴露三档，不暴露 CRF 数值（MVP） |
| 分辨率预设 | 保持 / 1080p / 720p → 长边上限 原样 / 1920 / 1280 | 等比缩放、仅缩小不放大，与图片 maxEdge 同语义（竖拍横拍一致） |
| 输出副本 | 默认同目录、同名换扩展名（a.mov → a.mp4），冲突 -1 递增 | 与图片 copy 模式命名规则一致；可选文件名后缀 |
| 原子写 | 目标目录内临时文件 + rename | 与 StreamTransfer / ImageEditService 同语义；失败 / 取消清理临时文件 |
| VideoConvertService | 主进程转码执行器（ffmpeg-static） | 组合根注入 FileOperationManager，与 ImageEditService 同构 |

## 6. 业务规则与状态

### 6.1 关键规则

- R1（作用范围）：仅 local 设备、非 ZIP 虚拟路径；门控与 image-convert 完全同构（[FileList.vue:2576](../src/components/FileList.vue)）。
- R2（原片只读）：任何情况不覆盖、不删除源视频；P0 不提供 overwrite——转码有损且耗时，覆盖原片风险不可接受。
- R3（串行执行）：转码 CPU 密集，队列内一次一个文件（并发 = 1）；不与其它传输任务抢并发语义，沿用队列既有派发。
- R4（失败隔离）：单文件失败记录错误并继续下一个；取消则整任务停止（沿用 image-convert 逐项语义）。
- R5（半成品不残留）：临时文件 + rename 原子落盘；取消 / 失败删除临时文件。
- R6（元数据保留）：creation_time、rotation（displaymatrix）随流保留，手机竖拍方向不丢。
- R7（兼容优先）：输出恒为 H.264（libx264）+ AAC + faststart；不做 HEVC 输出（兼容性差，违背转换初衷）。
- R8（进度可知）：单文件百分比 = ffmpeg `-progress` 的 out_time / 总时长；总时长从 `ffmpeg -i` stderr 的 Duration 行解析（ffmpeg-static 不含 ffprobe，不新增依赖）。
- R9（门控可见性）：选中须全为视频扩展名（`VIDEO_EXTS` 派生，shared/fileKinds.ts 注册表已裁决 `.ts/.mts` = TypeScript，不会误入）。

### 6.2 生命周期 / 状态

| 对象 | 当前状态 | 触发事件 | 下一状态 | 不允许时的业务结果 |
|---|---|---|---|---|
| video-convert 任务 | pending | 队列派发 | running（逐文件） | — |
| 单文件转码 | running | ffmpeg 退出码 0 + rename 成功 | success（记录 targetPath / bytes） | — |
| 单文件转码 | running | ffmpeg 非 0 / 写失败 | failed（记录错误，继续下一个） | 临时文件清理 |
| 任务 | running | 用户取消 | cancelled（kill ffmpeg + 清理） | 已完成项保留 |
| 任务 | 全部项终态 | — | completed / failed | 触发目录刷新跟踪 |

## 7. 功能清单

#### 模块 A：入口与参数

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | 右键「视频转换」 | 选中全为视频时出现（local、非 ZIP）；单选 / 多选均可 | ① 混选图片 + 视频不出现；② 远程设备 / ZIP 内不出现；③ 菜单位置与「图片转换」并列 |
| P0 | 参数 Sheet | 质量三档（默认标准）、分辨率三档（默认保持）、输出目录（默认原目录，可改）、可选后缀；显示源文件数与总体积 | ① 默认参数一键可发起；② Sheet 遵循统一振动材质语言；③ 文案走 i18n 双语 |

#### 模块 B：执行链路

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | video-convert 任务 | FileOperationManager 新执行器 VideoConvertService（组合根注入）；串行逐文件 | 批量 20 个文件逐项产出正确 MP4，源文件不动 |
| P0 | 进度推送 | 复用任务抽屉：逐项状态 + 当前文件百分比 | 抽屉可见单文件百分比单调递增；完成后逐项打勾 |
| P0 | 取消 | kill ffmpeg 进程 + 清理临时文件，任务 cancelled | 取消后目标目录无半成品；已完成项保留 |
| P0 | 完成刷新 | 复用 trackDirectoryRefresh 既有链路 | 转换完成后所在目录自动出现新文件 |

#### 模块 C：输出

| 优先级 | 功能 | 业务行为 | 验收标准 |
|---|---|---|---|
| P0 | 命名与冲突 | a.mov → a.mp4；已存在则 a-1.mp4 递增；后缀可选 | 与图片转换命名测试同套断言风格 |
| P0 | 兼容与元数据 | H.264 + AAC + faststart；creation_time / rotation 保留 | ① 微信 / Windows 可播；② 竖拍视频方向正确；③ 创建时间不丢 |

## 8. 关键异常与失败结果

| 场景 | 异常 / 边界条件 | 期望业务结果 |
|---|---|---|
| 源损坏 / 非视频内容 | ffmpeg 解码报错 | 该项 failed 记录错误，继续下一个（R4） |
| 源无音轨 | 视频流独占 | 产出无音轨 MP4，不报错 |
| 磁盘满 / 目标不可写 | 临时文件写失败 | 清理临时文件，该项 failed |
| 用户取消 | 转码进行中 | kill 进程 + 清理，任务 cancelled（R5） |
| 应用崩溃 | 临时文件残留目标目录 | 可接受残留（隐藏名 .tmp）；下次同名转换覆盖，不阻塞 |
| 超大 / 超长视频 | 无体积上限 | 进度可见、可取消即可，不设硬上限 |
| 远程设备 / ZIP 内 | 无本机实体 | 菜单不出现（R1），不做先下载再转换 |

## 9. 非功能与领域约束

| 类别 | 约束 / 要求 | 状态 | 依据 / 风险 |
|---|---|---|---|
| 依赖 | 零新增 npm 依赖：ffmpeg-static 已捆绑且仅用于抽帧，实测含 libx264 / aac / libmp3lame / VideoToolbox 编码器 | 已验证 | ThumbnailService.ts:6；electron-builder.yml:26 已 asarUnpack |
| 性能 | libx264 preset=veryfast + CRF 三档；串行避免多路转码打满 CPU | 已确认 | M4 Pro 实测速度留待实现期校准 |
| 安全 | execFile 参数数组不经 shell；输出路径校验落在目标目录内 | 已确认 | HostShellService「无引号地狱」原则 |
| 兼容 | 输出 MP4 恒为 H.264 + AAC + faststart（微信 / Windows / 剪辑软件通吃） | 已确认 | R7 |
| i18n | 菜单 / Sheet / 错误文案走 t() 双语 | 已确认 | 既有 i18nCatalog 测试覆盖 |

## 10. 外部依赖

- `ffmpeg-static`（已捆绑、已 asarUnpack、编码器已实测）——转码与抽帧共用同一二进制。
- `FileOperationManager` / `TransferTask` / 任务抽屉——队列、进度、取消、历史全部复用。
- `ImageEditService` 组合根注入模式——VideoConvertService 同构接入（[FileOperationManager.ts:794](../electron/src/services/FileOperationManager.ts) executeImageConvert 为参照）。
- IPC 四处同步规约（channels.ts / main.ts / preload.ts / env.d.ts）与 `@shared/types` 单一事实源（VideoConvertSpec 新增于 [types.ts:590](../shared/types.ts) ImageConvertSpec 旁）。
- `VIDEO_EXTS`（[shared/fileKinds.ts:281](../shared/fileKinds.ts)）——门控扩展名事实源。
- `trackDirectoryRefresh`（FilePane.vue）——完成后目录刷新。

## 11. 明确不做（Out of scope）

- 图片侧任何改动（格式转换已上线；一键直达入口列 P1 另议）。
- 提取音频（MP4→M4A/MP3）、视频转 GIF、片段截取、HEVC 输出、图片→PDF——P1/P2 另议。
- overwrite 覆盖原片（R2）。
- 远程设备 / ZIP 内视频转换（需先落地临时文件，链路另议）。
- VideoToolbox 硬件加速预设（快但体积 / 质量控制弱，P1 评估）。
- remux 快速路径（源已是 H.264+AAC 时 `-c copy` 秒转；需探测编码，P1）。
- 输出体积预估（CRF 依赖内容，估不准；图片 estimate 模式不照搬）。
- 并发转码、码率自定义、两遍编码。

## 12. 假设、风险与未决问题

- 假设 1：`-progress out_time_ms` + `-i` Duration 解析足以驱动百分比；无需 ffprobe。
- 假设 2：CRF 20/23/28 三档为业界常用默认，样片实测后如需校准只调数值不改结构。
- 风险（分发合规）：ffmpeg-static 为 GPL 构建，随 DMG 分发需确认许可文本随包（COPYING）与源码获取途径声明——实现期打包前必须核实，不阻塞需求评审。
- 风险：崩溃残留 .tmp 文件（同卷原子写约束决定临时文件必须放目标目录）——可接受，下次转换覆盖。
- 未决：转换完成后是否自动选中新文件——现状图片转换仅刷新目录，P0 对齐现状，体验增强另议。

## 13. 验收命令

- `npm run typecheck`
- 新增 `tests/videoConvert*.test.ts`：命名冲突 / 参数映射（预设→ffmpeg  argv）/ 进度解析纯函数断言
- `npm run test:e2e`：右键门控、Sheet 发起、任务抽屉进度与取消（小样片夹具）