/**
 * 可选原生依赖统一加载器（OptionalDeps）
 *
 * 此前四个可选依赖有四种加载点、两种失效模式：SSH 在 connect() 内动态
 * import（缺依赖 → 连接失败，设备类型禁用），而 SMB 顶层静态 import、
 * Android 顶层 createRequire（缺依赖 → 模块导入即抛，main 进程启动崩溃）
 * ——与「缺依赖只禁用对应设备类型」的项目约定不符。
 *
 * 统一约定（IFC-4 契约）：
 * - 加载点必须在设备 connect() 路径内；
 * - 失败必抛含依赖 id 与『设备类型已禁用』语义的错误，不吞错；
 * - 模块缓存由调用方持有（连接生命周期内复用）。
 */

import { t } from '../i18n'

const log = console

export async function loadOptional<T>(id: string, loader: () => T | Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    log.error(`[OptionalDeps] 可选依赖 ${id} 加载失败：`, error)
    throw new Error(t('errors.main.optionalDepUnavailable', {
      name: id,
      message: error instanceof Error ? error.message : String(error)
    }))
  }
}
