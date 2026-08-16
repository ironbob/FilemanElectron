/**
 * 权限 mode ↔ rwx ↔ 八进制 往返 — 最小断言 harness（M5 验证）。
 */

import assert from 'node:assert/strict'
import { formatPermissions, parsePermissions, parseOctalPermissions, toOctalPermissions, rwxToOctal } from '../src/utils/permissions'

// ============ format（既有行为回归） ============

assert.equal(formatPermissions(0o755), 'rwxr-xr-x')
assert.equal(formatPermissions(0o644), 'rw-r--r--')
assert.equal(formatPermissions(0o600), 'rw-------')
assert.equal(formatPermissions(0o000), '---------')
assert.equal(formatPermissions(0o777), 'rwxrwxrwx')
assert.equal(formatPermissions(undefined), '—')

// ============ parse rwx ============

assert.equal(parsePermissions('rwxr-xr-x'), 0o755)
assert.equal(parsePermissions('rw-r--r--'), 0o644)
assert.equal(parsePermissions('---------'), 0)
assert.equal(parsePermissions('rwxrwxrwx'), 0o777)
assert.equal(parsePermissions('rwxr-xr'), null)   // 8 位非法
assert.equal(parsePermissions('rwxr-xr-z'), null) // 非法字符
assert.equal(parsePermissions(''), null)

// ============ 八进制 ============

assert.equal(parseOctalPermissions('755'), 0o755)
assert.equal(parseOctalPermissions('0644'), 0o644)
assert.equal(parseOctalPermissions('0o600'), 0o600)
assert.equal(parseOctalPermissions('778'), null)  // 8 非法
assert.equal(parseOctalPermissions('75'), null)   // 2 位非法
assert.equal(parseOctalPermissions('abc'), null)

assert.equal(toOctalPermissions(0o755), '755')
assert.equal(toOctalPermissions(0o644), '644')
assert.equal(toOctalPermissions(0), '000')
// setuid 位被掩掉（编辑器只管 9 位）
assert.equal(toOctalPermissions(0o4755), '755')

// ============ 往返 ============

for (const mode of [0o755, 0o644, 0o600, 0o777, 0o000, 0o700, 0o111]) {
  const rwx = formatPermissions(mode)
  assert.equal(parsePermissions(rwx), mode, `mode ${mode.toString(8)} ↔ ${rwx} 往返`)
  assert.equal(rwxToOctal(rwx), toOctalPermissions(mode))
}

console.log('✓ 权限 mode/rwx/八进制往返测试全部通过')
