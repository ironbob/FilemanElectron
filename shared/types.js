/**
 * 跨进程域类型单一事实源（Shared Kernel）
 *
 * main / preload / renderer 三侧此前各自手抄一份同名接口（preload.ts、
 * src/env.d.ts、electron/src/services/DeviceManager.ts、src/types/*、
 * src/stores/devices.ts），已发生过字段漂移（如 Device.rootPath 可选性
 * 不一致）。本文件是唯一声明处，三侧一律 `import type` 消费：
 * - main 侧：`import type { ... } from '@shared/types'`
 * - renderer 侧：同上（编译期擦除，不引入运行时跨进程依赖）
 * - env.d.ts（全局脚本文件）：用 `import('@shared/types').X` 类型导入形态
 *
 * 正典形状以主进程版本为准：Device.rootPath 必填、config 可选。
 */
export {};
