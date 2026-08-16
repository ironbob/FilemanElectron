import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 命令注册表（命令面板的数据源）。
 *
 * 设计依据：
 *  - 开闭原则 —— 功能模块（App 内置动作、M3 的 grep/dupes、M4 的 space…）
 *    在自己挂载时 registerCommands，卸载时 unregister；面板只消费清单，
 *    不知道任何具体命令。
 *  - 与 logAnalysis store 同款「全局库在 store、会话在组件」的分层。
 *
 * Command ctx：执行时传入当前上下文（活动面板/标签），命令据此决定
 * 行为；面板不负责解释命令语义。
 */

export interface CommandContext {
  /** 当前活动面板（可能为空——活动标签是工具视图时）。 */
  activePane?: { paneId: string; deviceId: string; path: string }
  /** 打开目录跳转的回调（面板自己知道怎么导航）。 */
  navigate?: (deviceId: string, path: string) => void
}

export interface AppCommand {
  /** 稳定 ID（去重键）。 */
  id: string
  /** 展示标题（中文，供模糊匹配）。 */
  title: string
  /** 分组（面板分组展示）。 */
  group: string
  shortcut?: string
  /** 附加关键词（匹配用，如英文别名）。 */
  keywords?: string[]
  /** 执行；返回 false 表示当前上下文不可用（面板可提示）。 */
  run: (ctx: CommandContext) => boolean | void | Promise<boolean | void>
}

export const useCommandRegistryStore = defineStore('commandRegistry', () => {
  /** id → command；用 Map 保持注册顺序（平分时稳定排序）。 */
  const commands = ref(new Map<string, AppCommand>())

  function registerCommands(items: AppCommand[]): void {
    for (const item of items) commands.value.set(item.id, item)
  }

  function unregisterCommands(ids: string[]): void {
    for (const id of ids) commands.value.delete(id)
  }

  const allCommands = computed<AppCommand[]>(() => Array.from(commands.value.values()))

  return { commands, allCommands, registerCommands, unregisterCommands }
})
