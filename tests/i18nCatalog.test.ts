/**
 * i18n 词表一致性 — 最小断言 harness（esbuild 打包、node 运行，见 package.json test:i18n）。
 *
 * 静态侧 en-US: MessageSchema 已在 typecheck 时保证键树形状；本测试是运行时补充：
 * 1. zh-CN / en-US 键集合完全一致（防 CI 跳过类型检查时漂移）
 * 2. 每条消息的 {param} 占位符名称两语言一致（类型系统不覆盖消息内部）
 * 3. 主进程 t()（electron/src/i18n.ts）插值 / 回退 / 非法语言拒绝
 */

import assert from 'node:assert/strict'
import zhCN from '../shared/locales/zh-CN'
import enUS from '../shared/locales/en-US'
import { catalogs, DEFAULT_LOCALE, isAppLocale } from '../shared/locales'
import { setMainLocale, t } from '../electron/src/i18n'

function collectKeys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix.slice(0, -1)]
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    collectKeys(v, `${prefix}${k}.`)
  )
}

/** 去重：en 复数消息（"a|b" 管道）中同名占位符合法出现多次。 */
function collectParams(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort()
}

// ── 1. 键集合一致 ─────────────────────────────────────────────
const zhKeys = collectKeys(zhCN).sort()
const enKeys = collectKeys(enUS).sort()
assert.deepEqual(
  zhKeys,
  enKeys,
  `zh-CN 与 en-US 键不一致\n仅 zh: ${zhKeys.filter(k => !enKeys.includes(k))}\n仅 en: ${enKeys.filter(k => !zhKeys.includes(k))}`
)

// ── 2. 占位符名称一致 ─────────────────────────────────────────
for (const key of zhKeys) {
  const zhMsg = lookup(zhCN, key)
  const enMsg = lookup(enUS, key)
  assert.deepEqual(
    collectParams(zhMsg),
    collectParams(enMsg),
    `key "${key}" 的 {param} 占位符两语言不一致: zh="${zhMsg}" en="${enMsg}"`
  )
}

function lookup(node: unknown, key: string): string {
  let cur: unknown = node
  for (const part of key.split('.')) {
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur as string
}

// ── 3. 主进程 t() 行为 ────────────────────────────────────────
// 默认语言 zh-CN
assert.equal(setMainLocale(undefined), undefined) // 非法值回落
assert.equal(t('devices.localName'), '本机')

// 切 en-US：插值 + 回退
setMainLocale('en-US')
assert.equal(t('devices.localName'), 'This Mac')
assert.equal(t('main.infoWindowTitle', { name: 'a.txt' }), 'About “a.txt”')

// 缺 key：先回退默认语言，再缺回退 key 本身
setMainLocale('en-US')
assert.equal(t('errors.main.fileInfoNoContext'), 'This window has no available info context')
assert.equal(t('no.such.key'), 'no.such.key')

// 参数缺失时占位符原样保留
setMainLocale('zh-CN')
assert.equal(t('main.infoWindowTitleMulti'), '{count} 个项目简介')

// isAppLocale / DEFAULT_LOCALE 契约
assert.equal(DEFAULT_LOCALE, 'zh-CN')
assert.ok(isAppLocale('en-US') && isAppLocale('zh-CN'))
assert.ok(!isAppLocale('en') && !isAppLocale(null) && !isAppLocale(undefined))

// catalogs 两语言齐备
assert.deepEqual(Object.keys(catalogs).sort(), ['en-US', 'zh-CN'])

console.log(`[i18nCatalog] ${zhKeys.length} keys OK — zh/en 键树、占位符、t() 行为全部通过`)
