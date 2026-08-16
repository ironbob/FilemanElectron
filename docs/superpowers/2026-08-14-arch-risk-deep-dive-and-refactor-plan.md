# 架构风险深挖与重构方案（承接 2026-08-14 架构总览）

> 本文是 `docs/arch-overview/2026-08-14-fileman-electron-overview.md` 中 5 个风险点的深挖与重构方案。
> 深挖发现了总览时未实锤的新事实（域类型 6 处重复且已发生漂移、3 个死 IPC 通道），严重度据此上调。
> 每条给：新证据 → 严重度/成本 → 重构方案（步骤、兼容性约束、验收）。
> 全程遵守仓库约定：`npm run typecheck` 为唯一静态门禁；主进程需另跑 `tsc -p tsconfig.node.json`；无测试基建（仅 1 个 e2e spec）。

---

## RISK-01 IPC 契约与域类型多处平行声明 —— 严重度：高（总览时"中"，因新证据上调）

### 深挖新证据

1. **通道数已不一致**：main.ts 注册 58 个 `ipcMain.handle/on`，preload.ts 只有 54 个 `ipcRenderer.invoke`。
   差集分析：
   - `drag:startNative` —— 合法差异（`ipcRenderer.send` 单向发送，preload.ts:246 有对应）；
   - **`mobile:getAutoConnectDevices` / `mobile:getDetectedDevices` / `mobile:getDeviceInfo` —— 3 个死通道**：main.ts 有 handler（main.ts:432/440/444），preload 无对应方法、renderer 全仓无调用。渲染层实际经 `mobile:devicesChanged` 推送 + `device:list` 获取状态。
2. **域类型不是三处重复，是六处**，且**已发生实际漂移**：

   | 位置 | Device.rootPath |
   |---|---|
   | `electron/src/services/DeviceManager.ts:17-41` | `string`（必填，含 config） |
   | `electron/preload.ts:4-33` | 平行声明一份 |
   | `src/env.d.ts:81-113` | 平行声明一份 |
   | `src/types/index.ts:12` | **`rootPath?: string`（可选，且无 config 字段）** |
   | `src/stores/devices.ts:5` | `string`（必填，无 config） |

   同名接口在不同层已是不同形状——总览担心的"漂移在运行期才暴露"不是未来时，是现在进行时（靠手抄对齐掩盖）。

### 重构方案（分三阶段，每阶段独立可交付）

**Phase A：域类型单一事实源（纯机械移动，收益最大、风险最低）**

1. 新建 `shared/types.ts`（仓库根 `shared/` 目录）：收编 `Device` / `DeviceConfig` / `Credentials` / `FileInfo` / `FileStats` / `SearchQuery` / `DeviceCapabilities` / `DetectedDevice` / `FileOperationTask` / `CreateTaskParams` / `DetectedMobileDevice` / `DetectedVolume` / `ContentVerification*`。
2. 两份 tsconfig 增加 include `shared/**/*.ts`；两份 vite 配置各加 alias `@shared → resolve(__dirname, 'shared')`（main 与 renderer 各自打包，type-only 消费在 renderer 侧编译期擦除，不违反 contextIsolation）。
3. 六处声明改为 `import type { ... } from '@shared/types'` 后删除本地副本。`src/types/index.ts` 与 `src/stores/devices.ts` 以**主进程版本为准**（`rootPath: string` 必填 + `config?`），修复现有漂移。
4. 验收：`npm run typecheck` + `tsc -p tsconfig.node.json` 双绿；`grep -rn "interface DeviceConfig" electron src` 只剩 `shared/types.ts` 一处。

**Phase B：通道名常量表（typo 变编译错误）**

1. 新建 `electron/src/ipc/channels.ts`：`export const CH = { systemGetHomeDir: 'system:getHomeDir', ... } as const`，附每通道的参数/返回类型映射。
2. preload.ts 的 54 个 `invoke('...')` 字符串与 main.ts 的 58 个 `ipcMain.handle('...')` 全部改用 `CH.*`。
3. 顺带删除 3 个死通道（`mobile:getAutoConnectDevices/getDetectedDevices/getDeviceInfo`）及其 main.ts handler —— 若近期有使用计划则保留 handler 但在 channels.ts 标注 `// no preload binding (intentional)`。

**Phase C（可选，收益递减）：从表生成 filemanAPI**
将 `filemanAPI` 改为由通道元数据表驱动生成，env.d.ts 用 `typeof` 推导。仅当 Phase B 后仍出现同步事故再做。

**成本**：A ≈ 半天（机械）；B ≈ 半天 + 删死代码；C 不排期。

---

## RISK-02 ZIP 虚拟路径约定跨层散落 —— 严重度：中

### 深挖新证据

`'<zip>::<inner>'` 的解析原语现在有 **3 份手写实现**（不含 ZipService 内部）：

| 位置 | 用途 |
|---|---|
| `electron/main.ts:37-47` | `ZIP_PATH_SEP` / `isZipVirtualPath` / `parseZipVirtualPath`，被 `fs:stat`(177) 与 `fs:readFile`(214) 特判消费 |
| `src/stores/tabs.ts:235-252` | `goUp` 的 ZIP 上级导航解析 |
| `src/components/FilePane.vue:382-389` | 面包屑 segments 的 ZIP 解析 |

三处各自 `path.includes('::')` + `indexOf` + `slice`——同一字符串协议已有三个方言实现点，任何一处对边界（`::` 在文件名本身、结尾 `/`）处理不一致即产生跨层 bug。且 main.ts 的 `fs:stat` 特判还内联构造 FileInfo（main.ts:183-191），属入口层业务逻辑。

### 重构方案

1. 新建 `shared/zipPath.ts`（运行时纯函数，两进程共同打包）：
   - `ZIP_PATH_SEP`、`isZipVirtualPath(p)`、`parseZipVirtualPath(p)`、`joinZipPath(zip, inner)`、`zipVirtualParent(p)`（统一 tabs.goUp 的上级导航语义）。
   - 补齐边界约定：innerPath 结尾 `/` 归一化（对齐 main.ts:181 已有的 `replace(/\/$/, '')` 特判）。
2. main.ts 的 `fs:stat` / `fs:readFile` ZIP 分支抽为 `electron/src/services/ZipVirtualFsService.ts`（stat 转换 + readEntry 委托），handler 回到一行转发。
3. `tabs.ts:goUp` 与 `FilePane.vue` segments 改调 `shared/zipPath.ts`。
4. 验收：`grep -rn "includes('::')" electron src` 只剩 shared/zipPath.ts；`fs:stat`/`fs:readFile` handler 无 ZIP 分支。

**成本**：约半天。注意：`utils/path.ts` 已存在 renderer 侧路径工具，zipPath 属跨进程协议，放 `shared/` 而非 `src/utils/`。

---

## RISK-03 DeviceManager 职责汇聚 —— 严重度：中

### 深挖确认

- 703 行内五类职责：设备注册表+config 持久化（206-329）、连接生命周期+去重（333-404, 514-524）、移动发现代理（627-702）、能力兜底（569-611，其中 589-609 是一段**与 capabilities.ts 平行的手写默认能力对象**，本应住在 capabilities.ts）、11 个文件操作代理方法（526-564）。
- 构造函数副作用：`mobileDeviceScanner.start()`（DeviceManager.ts:88）——与 `volumeScanner.start()` 在 main.ts:537 的显式启动模式不一致。

### 重构方案（门面保持、内部拆分，main.ts 调用面零改动）

1. **先做两步零风险移动**：
   - DeviceManager.ts:589-609 的默认能力对象移为 `capabilities.ts` 的 `DEFAULT_REMOTE_CAPABILITIES(deviceType)`；
   - 扫描器启动移出构造函数：删 DeviceManager.ts:88，main.ts `app.whenReady` 里 `deviceManager.startMobileDeviceScan()`（与 volumeScanner.start() 并排，启动语义集中）。
2. **拆 `MobileDiscoveryService`**：把 627-702 的移动发现代理 + autoConnectDevices 持久化整体移入，DeviceManager 持有其引用并保留同名方法转发（门面）。
3. **拆 `AdapterConnectionManager`**：adapters Map + connectionAttempts + connect/disconnect/getReadyAdapter。11 个文件操作代理方法保留在 DeviceManager（它们本质是"取 adapter 然后调"，一行委托，不算职责）。
4. 触发点：~~下次需要给 DeviceManager 加第 7 种设备类型或网络发现时执行~~ **已于 2026-08-15 完成完整拆分**：`MobileDiscoveryService`（发现+自动连接偏好，108 行）与 `AdapterConnectionManager`（连接协议+adapters 注册表+并发去重，124 行）已拆出，DeviceManager 转门面（公共 API 签名不变，main.ts 调用面零改动），验证零新增类型错误。

**成本**：第 1 步 1 小时；完整拆分 1-1.5 天。~~建议只排第 1 步，完整拆分等触发点~~ 已全部完成。

---

## RISK-04 巨型单文件组件 —— 严重度：中低（认知负担为主，无功能缺陷）

### 深挖确认

FileList.vue 1545 行（script ~1290 行起于 257）聚合：虚拟滚动、Finder 式多选/框选（rAF 节流 + `[data-file-path]` 约定，性能约定见《FileList.vue-Finder式多选与性能优化踩坑》）、typeahead、拖拽载荷、双击预览、排序描述符。PreviewTextContent.vue 1372 行聚合 Monaco 生命周期（shallowRef、`?worker&inline`、dispose 顺序——约定见《monaco-editor-electron29-接入注意事项》）。

### 重构方案（渐进式 composable 抽取，绝不一次性重写）

1. **Monaco 侧先做**（收益/风险比最好）：抽 `src/components/preview/composables/useMonacoEditor.ts`，把 worker inline 引入、`MonacoEnvironment` 设置、shallowRef 持有、model→editor dispose 顺序固化为**一个**正确实现——这些约定目前以文档形式存在，代码化后不可能再踩。PreviewTextContent 瘦身为「取数据 + 配语言 + diff 装配」。
2. **FileList 侧按交互轴抽**（一次一个，每次独立验收）：
   - `useRubberBandSelection`（框选：rAF 节流 + mounted-items 查询原样搬运）；
   - `useFileListSorting`（排序描述符纯逻辑，可先抽纯函数）；
   - 拖拽载荷构造（`InternalFileDragPayload` 相关）抽纯函数到 utils。
3. **硬约束**：不动 `RecycleScroller` 结构、不动 debounce 持久化模式（tabs store 的 selectedFiles 剥离）、不改 CSS 作用域约定（参考《全局CSS与scoped样式冲突》）。
4. 每抽一个 composable，在 `疑难问题解决记录/` 记一篇（延续团队惯例）；有条件的话为纯逻辑 composable 引入 vitest（可选，repo 无测试基建，不强推）。

**成本**：Monaco 封装半天；FileList 每个交互轴 2-4 小时。**按需触发**：改到哪个抽哪个，不专项排期。

---

## RISK-05 可选依赖加载策略不一致 —— 严重度：低

### 深挖确认

- SSH：`connect()` 内 `await import('ssh2')`（SSHAdapter.ts:38）——失败被 connect 错误路径捕获；
- Android：模块顶层 `createRequire(import.meta.url)('@devicefarmer/adbkit')`（AndroidAdapter.ts:26）——**顶层同步加载，缺依赖时模块导入即抛**，与"缺依赖禁用该设备类型"的约定不符（当前因依赖都在 dependencies 且随 DMG 打包而未暴露）；
- iOS：`require(c)` 候选路径循环（iOSAdapter.ts:42）；
- SMB：顶层静态 `import SMB2 from '@marsaud/smb2'`（SMBAdapter.ts:2）——同 Android，缺依赖时 main 进程启动即崩。

四种加载点、两种失效模式（启动崩溃 vs connect 失败），真正按约定实现的只有 SSH。

### 重构方案

1. 新建 `electron/src/adapters/optionalDeps.ts`：
   ```ts
   export async function loadOptional<T>(id: string, load: () => Promise<T> | T): Promise<T> {
     try { return await load() } catch (e) {
       throw new Error(`可选依赖 ${id} 不可用，对应设备类型已禁用（原始错误：${String(e)}）`)
     }
   }
   ```
2. SMBAdapter：顶层 import 改为 `connect()` 内 `const SMB2 = (await loadOptional('@marsaud/smb2', () => import('@marsaud/smb2'))).default`，类字段持有；类型用 `typeof import('@marsaud/smb2')`（type-only，不引入运行时依赖）。vite externalized 配置不变。
3. AndroidAdapter：顶层 createRequire 移入 `connect()`（或模块级 lazy getter），同样经 loadOptional。
4. iOSAdapter 的候选路径 require 也收敛进 loadOptional 的错误包装。
5. 验收：临时 rename node_modules 里的 @marsaud/smb2 验证 main 进程可启动且 SMB 设备连接时报"已禁用"而非崩溃（验完还原）。

**成本**：2-3 小时。可与 RISK-03 第 1 步合并为一次"主进程小整理"提交。

---

## 优先级与排期建议

| 序 | 项 | 严重度 | 成本 | 理由 |
|---|---|---|---|---|
| 1 | RISK-01 Phase A（域类型单一源） | 高 | 0.5 天 | 已发生实际类型漂移；纯机械移动零行为风险 |
| 2 | RISK-01 Phase B（通道常量 + 删死通道） | 高 | 0.5 天 | 与 A 同日完成，typo 变编译错误 |
| 3 | RISK-02（shared/zipPath.ts） | 中 | 0.5 天 | 3 份方言实现是活跃 bug 面 |
| 4 | RISK-03 第 1 步 + RISK-05 | 中/低 | 0.5 天 | 合并为一次主进程小整理 |
| 5 | RISK-04 useMonacoEditor | 中低 | 0.5 天 | 把文档约定代码化，收益稳定 |
| 6 | RISK-03 完整拆分 / RISK-04 FileList 抽取 / RISK-01 Phase C | — | — | **触发式**：第 7 种设备类型 / 改到对应交互轴 / 再次同步事故时再做 |

每步验收统一为：`npm run typecheck` + `tsc -p tsconfig.node.json` 双绿；涉及 UI 行为的（RISK-04）另跑 `npm run dev` 手测 + 现有 e2e。

> 共同前置：以上全部改动先落独立分支，分阶段提交（Phase A/B、zipPath、主进程小整理各一个 PR 粒度），避免一次性大 diff。
