#!/usr/bin/env node
// build-ios-addon.js — 自动编译 iOS 原生 addon(native/iosafc),按 Electron ABI。
//
// 行为:
//  - 检测到 libimobiledevice 开发库(+ node-addon-api) → 自动 node-gyp 编译。
//  - 未检测到 → 优雅跳过(iOS 可选),仅打印一行提示,绝不失败。
//  - 编译失败:显式调用(FILEMAN_IOS_BUILD_REQUIRED=1)时退出非零;否则仅告警(不破坏 npm install)。
//
// 触发:
//  - npm install(postinstall,自动、非致命)
//  - npm run build:native(显式、致命)
//  - npm run build:ios(= build:native + 打包 dylib)
//
// 跳过开关:FILEMAN_SKIP_IOS_BUILD=1。

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const ADDON_DIR = path.join(ROOT, 'native', 'iosafc')
const NODE_FILE = path.join(ADDON_DIR, 'build', 'Release', 'iosafc.node')

// --- 1. 跳过条件 ---
if (process.env.FILEMAN_SKIP_IOS_BUILD === '1') {
  console.log('[ios-addon] skipped (FILEMAN_SKIP_IOS_BUILD=1)')
  process.exit(0)
}

// electron 版本从 package.json 读取,保持同步。
function electronVersion() {
  try {
    const dep = require('../package.json').devDependencies.electron // "^29.1.0"
    return dep.replace(/^[^0-9]+/, '')
  } catch {
    return '29.1.0'
  }
}

function hasLibimobiledevice() {
  // 首选 pkg-config;不可用则退回 brew 库文件存在性判断。
  const pc = spawnSync('pkg-config',
    ['--exists', 'libimobiledevice-1.0', 'libplist-2.0', 'libusbmuxd-2.0'])
  if (pc.status === 0) return true
  for (const lib of ['/opt/homebrew/lib', '/usr/local/lib']) {
    if (fs.existsSync(path.join(lib, 'libimobiledevice-1.0.dylib'))) return true
  }
  return false
}

function hasNodeAddonApi() {
  return fs.existsSync(path.join(ROOT, 'node_modules', 'node-addon-api'))
}

if (!hasLibimobiledevice()) {
  console.log('[ios-addon] libimobiledevice 未检测到 → 跳过 iOS addon 编译(可选;启用见 scripts/install-ios-deps.sh)')
  process.exit(0)
}
if (!hasNodeAddonApi()) {
  console.log('[ios-addon] node-addon-api 未装 → 跳过(完整 npm install 后再触发)')
  process.exit(0)
}

// --- 2. 解析 node-gyp 可执行(本地 .bin 优先,否则 npx 兜底) ---
const localGyp = path.join(ROOT, 'node_modules', '.bin', 'node-gyp')
const gypCmd = fs.existsSync(localGyp) ? localGyp : 'npx'
const gypArgs = fs.existsSync(localGyp)
  ? []
  : ['node-gyp']

// pkg-config 解析 libimobiledevice 的头文件/库目录,以 CPATH / LIBRARY_PATH 注入
// (clang/ld 直接识别这两个环境变量;比在 gyp 里 <!@() 调 pkg-config 稳)。
function pkgConfig(args) {
  const r = spawnSync('pkg-config', args, { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}
const PC_PKGS = ['libimobiledevice-1.0', 'libplist-2.0', 'libusbmuxd-2.0']
const incDirs = pkgConfig(['--cflags-only-I', ...PC_PKGS])
  .split(/\s+/).filter(Boolean).map(s => s.replace(/^-I/, ''))
const libDirs = pkgConfig(['--libs-only-L', ...PC_PKGS])
  .split(/\s+/).filter(Boolean).map(s => s.replace(/^-L/, ''))

const buildEnv = { ...process.env }
if (incDirs.length) {
  buildEnv.CPATH = [process.env.CPATH, ...incDirs].filter(Boolean).join(':')
}
if (libDirs.length) {
  buildEnv.LIBRARY_PATH = [process.env.LIBRARY_PATH, ...libDirs].filter(Boolean).join(':')
}

// --- 3. 编译(按 Electron ABI) ---
const target = electronVersion()
const arch = process.env.npm_config_arch || (process.arch === 'arm64' ? 'arm64' : 'x64')
const distUrl = 'https://electronjs.org/headers'

console.log(`[ios-addon] 编译 iOS addon(Electron ${target}, ${arch})…`)
if (incDirs.length) console.log(`[ios-addon] CPATH <- ${incDirs.length} 个 include 目录`)
if (libDirs.length) console.log(`[ios-addon] LIBRARY_PATH <- ${libDirs.length} 个 lib 目录`)
const r = spawnSync(gypCmd, [
  ...gypArgs,
  'configure', 'build',
  `--target=${target}`,
  `--arch=${arch}`,
  `--dist-url=${distUrl}`
], { cwd: ADDON_DIR, stdio: 'inherit', env: buildEnv })

if (r.status !== 0 || !fs.existsSync(NODE_FILE)) {
  const required = process.env.FILEMAN_IOS_BUILD_REQUIRED === '1'
  console.error(`[ios-addon] 编译失败(iOS 支持将不可用,其它功能不受影响)。${required ? '' : '(postinstall 非致命)'}`)
  process.exit(required ? 1 : 0)
}

console.log('[ios-addon] 完成 →', path.relative(ROOT, NODE_FILE))
