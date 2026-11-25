import assert from 'node:assert/strict'
import {
  copyOnDeviceCommand,
  installFailureKey,
  parsePmInstallOutput,
  pickInstallTargets,
  pmInstallCommand,
  remoteTempPath
} from '../electron/src/services/support/apkInstall'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

// ============ remoteTempPath ============

test('remoteTempPath：/data/local/tmp/fileman-<随机串>.apk，不同随机串互不覆盖', () => {
  assert.equal(remoteTempPath('abc123'), '/data/local/tmp/fileman-abc123.apk')
  assert.notEqual(remoteTempPath('abc123'), remoteTempPath('abc124'))
  assert.ok(remoteTempPath('x').startsWith('/data/local/tmp/fileman-'))
  assert.ok(remoteTempPath('x').endsWith('.apk'))
})

// ============ pmInstallCommand ============

test('pmInstallCommand：固定 -r -t，路径经 POSIX 单引号转义（空格 / 引号 / 特殊字符不被拆词）', () => {
  assert.equal(pmInstallCommand('/data/local/tmp/fileman-1.apk'), `pm install -r -t '/data/local/tmp/fileman-1.apk'`)
  assert.equal(pmInstallCommand('/sdcard/Download/my app (1).apk'), `pm install -r -t '/sdcard/Download/my app (1).apk'`)
  assert.equal(pmInstallCommand("/sdcard/Download/it's.apk"), `pm install -r -t '/sdcard/Download/it'\\''s.apk'`)
  assert.equal(pmInstallCommand('/sdcard/Download/a;rm -rf x.apk'), `pm install -r -t '/sdcard/Download/a;rm -rf x.apk'`)
})

// ============ parsePmInstallOutput ============

test('parsePmInstallOutput：Success → ok', () => {
  assert.deepEqual(parsePmInstallOutput('Success\n'), { ok: true })
  assert.deepEqual(parsePmInstallOutput('\r\nSuccess\r\n'), { ok: true })
  assert.deepEqual(parsePmInstallOutput('Performing Streamed Install\nSuccess\n'), { ok: true })
})

test('parsePmInstallOutput：Failure [CODE] → 带码失败', () => {
  assert.deepEqual(parsePmInstallOutput('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]\n'), { ok: false, code: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' })
  assert.deepEqual(parsePmInstallOutput('Failure [INSTALL_PARSE_FAILED_NO_CERTIFICATES]'), { ok: false, code: 'INSTALL_PARSE_FAILED_NO_CERTIFICATES' })
  assert.deepEqual(parsePmInstallOutput('java.lang.IllegalStateException\nFailure [INSTALL_FAILED_VERSION_DOWNGRADE]'), { ok: false, code: 'INSTALL_FAILED_VERSION_DOWNGRADE' })
})

test('parsePmInstallOutput：真机失败行带说明 Failure [CODE: detail] → 取码并保留说明', () => {
  const out = 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.fileman.apkinstalltest signatures do not match previously installed version]'
  assert.deepEqual(parsePmInstallOutput(out), {
    ok: false,
    code: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE',
    detail: 'Package com.fileman.apkinstalltest signatures do not match previously installed version'
  })
  const scanning = 'Failure [INSTALL_FAILED_INVALID_APK: Scanning Failed.: Package /data/app/~~a==/base.apk code is missing]'
  assert.equal(parsePmInstallOutput(scanning).code, 'INSTALL_FAILED_INVALID_APK')
  // 只有码、没有说明时不带 detail 键
  assert.ok(!('detail' in parsePmInstallOutput('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]')))
})

test('copyOnDeviceCommand：设备内 cp，路径经单引号转义', () => {
  assert.equal(
    copyOnDeviceCommand("/sdcard/Download/my app's (1).apk", '/data/local/tmp/fileman-abc.apk'),
    `cp '/sdcard/Download/my app'\\''s (1).apk' '/data/local/tmp/fileman-abc.apk'`
  )
})

test('parsePmInstallOutput：异常输出（无 Success / Failure）取首个非空行；空输出为 UNKNOWN', () => {
  assert.deepEqual(parsePmInstallOutput('Error: Could not access the Package Manager.  Is the system running?\n'), { ok: false, code: 'Error: Could not access the Package Manager.  Is the system running?' })
  assert.deepEqual(parsePmInstallOutput('\n\n  /system/bin/sh: pm: not found\n'), { ok: false, code: '/system/bin/sh: pm: not found' })
  assert.deepEqual(parsePmInstallOutput(''), { ok: false, code: 'UNKNOWN' })
  assert.deepEqual(parsePmInstallOutput('   \n'), { ok: false, code: 'UNKNOWN' })
  const long = 'x'.repeat(300)
  const { code } = parsePmInstallOutput(long)
  assert.equal(code.length, 120)
  assert.ok(code.endsWith('…'))
})

test('parsePmInstallOutput：包管理器抛「Failed to parse APK file」→ 归为解析失败（真机输出）', () => {
  const out = [
    '',
    "Exception occurred while executing 'install':",
    'java.lang.IllegalArgumentException: Error: Failed to parse APK file: /data/local/tmp/fileman-54915424d801.apk: Failed to parse /data/local/tmp/fileman-54915424d801.apk',
    '\tat com.android.server.pm.PackageManagerShellCommand.setParamsSize(PackageManagerShellCommand.java:542)',
    'Caused by: java.io.IOException: Failed to load asset path /data/local/tmp/fileman-54915424d801.apk from fd 571',
    ''
  ].join('\n')
  assert.deepEqual(parsePmInstallOutput(out), { ok: false, code: 'INSTALL_PARSE_FAILED_EXCEPTION' })
  assert.equal(installFailureKey('INSTALL_PARSE_FAILED_EXCEPTION').key, 'errors.main.apkInstallInvalid')
})

test('parsePmInstallOutput：其它异常跳过标题与堆栈，取首条有信息量的行', () => {
  const out = "Exception occurred while executing 'install':\njava.lang.SecurityException: no permission\n\tat com.android.Foo.bar(Foo.java:1)"
  assert.deepEqual(parsePmInstallOutput(out), { ok: false, code: 'java.lang.SecurityException: no permission' })
  assert.deepEqual(parsePmInstallOutput("Exception occurred while executing 'install':\n\tat a.b.C(c.java:1)"), { ok: false, code: 'UNKNOWN' })
})

// ============ installFailureKey ============

test('installFailureKey：全部映射码 → 对应 i18n 键（无参数）', () => {
  const cases: Array<[string, string]> = [
    ['INSTALL_FAILED_UPDATE_INCOMPATIBLE', 'errors.main.apkInstallSignatureMismatch'],
    ['INSTALL_FAILED_VERSION_DOWNGRADE', 'errors.main.apkInstallDowngrade'],
    ['INSTALL_FAILED_INSUFFICIENT_STORAGE', 'errors.main.apkInstallStorage'],
    ['INSTALL_FAILED_NO_MATCHING_ABIS', 'errors.main.apkInstallAbi'],
    ['INSTALL_FAILED_OLDER_SDK', 'errors.main.apkInstallOlderSdk'],
    ['INSTALL_FAILED_MIN_SDK', 'errors.main.apkInstallNewerSdk'],
    ['INSTALL_FAILED_NEWER_SDK', 'errors.main.apkInstallNewerSdk'],
    ['INSTALL_FAILED_INVALID_APK', 'errors.main.apkInstallInvalid'],
    ['INSTALL_FAILED_TEST_ONLY', 'errors.main.apkInstallTestOnly']
  ]
  for (const [code, key] of cases) {
    assert.deepEqual(installFailureKey(code), { key }, code)
  }
})

test('installFailureKey：INSTALL_PARSE_FAILED_* 一律 → 无效安装包', () => {
  assert.deepEqual(installFailureKey('INSTALL_PARSE_FAILED_UNEXPECTED_EXCEPTION'), { key: 'errors.main.apkInstallInvalid' })
  assert.deepEqual(installFailureKey('INSTALL_PARSE_FAILED_NO_CERTIFICATES'), { key: 'errors.main.apkInstallInvalid' })
})

test('installFailureKey：未知码 / 异常输出 → apkInstallFailed 且原样附带 code', () => {
  assert.deepEqual(installFailureKey('INSTALL_FAILED_DUPLICATE_PACKAGE'), { key: 'errors.main.apkInstallFailed', params: { code: 'INSTALL_FAILED_DUPLICATE_PACKAGE' } })
  assert.deepEqual(installFailureKey('UNKNOWN'), { key: 'errors.main.apkInstallFailed', params: { code: 'UNKNOWN' } })
  assert.deepEqual(installFailureKey('something odd'), { key: 'errors.main.apkInstallFailed', params: { code: 'something odd' } })
})

// ============ pickInstallTargets ============

test('pickInstallTargets：只收 device 与 unauthorized，其余状态不进列表', () => {
  assert.deepEqual(pickInstallTargets([
    { id: 'a', type: 'device' },
    { id: 'b', type: 'unauthorized' },
    { id: 'c', type: 'offline' },
    { id: 'd', type: 'recovery' },
    { id: 'e', type: 'device' }
  ]), ['a', 'b', 'e'])
  assert.deepEqual(pickInstallTargets([]), [])
  assert.deepEqual(pickInstallTargets([{ id: 'c', type: 'offline' }]), [])
})

console.log(`\napkInstall: ${passed} tests passed`)
