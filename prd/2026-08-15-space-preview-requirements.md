# 空间分析 + 预览增强（M4）功能需求文档

> 日期：2026-08-15 ｜ 状态：已确认（随「程序员工作台功能套件」总体规划批准）
> 产出模式：总体规划之 M4 套件（F7 空间 treemap + F9 Hex 查看器 + F10 CSV/JSON 增强）

## 1. 一句话目标

让「磁盘去哪了」一眼可见（squarified treemap 下钻），二进制文件可检视（hexdump 式只读视图），CSV/JSON 预览从「能看」升级到「能查」（列排序/分隔符自适应/路径查询/生成 TS 类型）。

## 2. 背景与成功标准

- 当前问题：`fs:dirStats` 只有总数没有构成；`.bin` 等二进制无法预览；CSV 表格只读不可排序，JSON 只能肉眼看树。
- 成功标准：① 右键目录出 treemap，点色块下钻子目录；② 双击 .bin 出 hex 视图（偏移/hex/ASCII 三列）；③ CSV 点表头排序，JSON 路径查询取值、一键复制 TS interface。

## 3. 业务规则

- R1（只读）：treemap/hex/JSON 查询与 TS 生成全部只读；「格式化」是唯一写动作且遵循预览既有编辑-保存语义。
- R2（载荷控制）：空间 entries 只随终态；hex 256KB 窗口按需读取 + 4 窗 LRU；treemap 最多 200 节点 + Others 聚合。
- R3（hex opt-in）：仅显式二进制扩展名进 hex 视图（.bin/.iso/.dylib/.so/.exe/.dat/.o/.a/.class/.wasm）；unknown 兜底不变。
- R4（非流式守卫）：readChunk 对非流式设备整读后 slice，>32MB 拒绝。
- R5（分隔符自适应）：CSV 首行引号外 , ; \t | 计数最高者胜。
- R6（排序语义）：CSV 列排序数值感知（全数字列按数值），三态（升→降→取消）。

## 4. 功能清单

| 模块 | 优先级 | 功能 | 验收 |
|---|---|---|---|
| F7 treemap | P0 | 顶层条目聚合 + squarified 布局 + 色调占比 | 面积守恒/无重叠（单测）；色块占比 >50% 断言（e2e） |
| F7 treemap | P0 | 点击下钻子目录 | 下钻开新工具页以子目录为根（e2e） |
| F9 hex | P0 | 三列行渲染 + 分块读取 + 滚动预取 | 偏移/hex/ASCII 渲染 + readChunk 参数正确（e2e） |
| F9 hex | P1 | readChunk 引擎 | 本地 fs 区间流 / canStream 远程前缀丢弃 / 非流式 slice 守卫 |
| F10 CSV | P0 | 列排序（数值感知三态） | 表头点击切换 ↑↓/取消 |
| F10 CSV | P1 | 分隔符自适应 | 首行计数自动选 , ; \t \| |
| F10 JSON | P0 | 路径查询（$.a.b/[0]/[*] 子集） | 查询结果面板；非法路径给错误（单测） |
| F10 JSON | P1 | 复制 TS interfaces | 样本合并（缺失 optional、并集类型、嵌套独立 interface）（单测） |
| F10 JSON | P1 | 格式化按钮 | 压缩 JSON 美化（编辑-保存语义内） |

## 5. 关键异常

| 场景 | 期望 |
|---|---|
| 空目录 treemap | 「目录为空」提示 |
| hex 读取失败 | 错误文案居中，不白屏 |
| readChunk 越界 | 钳制到 [0, fileSize]，空块返回 bytesRead=0 |
| JSON 非法 | 路径查询/TS 复制不可用（jsonStatus 已标红） |
| 超大 JSON 树 | 既有 tree 视图行为不变 |

## 6. 明确不做

- 不做 treemap 的多级嵌套展开（下钻代替）；不做 hex 编辑；不做 CSV 写回/导出；不做完整 JSONPath（filter/script 表达式）。

## 7. 假设与风险

- 假设：256KB hex 窗口 + 4 窗 LRU 满足滚动检查场景；不足再调窗口参数。
- 风险：远端 hex 的前缀丢弃在 offset 很大时有冗余传输（openReadStream 无区间语义）；本地不受影响，远端 hex 大偏移滚动偏慢可接受。
- 风险：PreviewTextContent（1300+ 行）三处增量修改的回归面——由既有预览 e2e（quick-look 等）+ typecheck 覆盖。
