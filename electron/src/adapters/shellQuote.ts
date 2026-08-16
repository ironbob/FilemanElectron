/**
 * POSIX shell 单词转义(单引号包裹,内部 ' -> '\'')。
 *
 * 从 AndroidAdapter 移出为公共模块:GrepService 构造远程(SSH/adb shell)
 * grep 命令时同样需要;与 HostShellService 的双层转义第一步同源。
 */
export function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}
