#!/usr/bin/env bash
#
# build-dmg.sh — build the macOS .app and package it into a DMG (dist/).
#
#   npm run dist:mac         # build icon + app + dmg
#   bash scripts/build-dmg.sh --no-build   # skip electron-vite build, reuse out/
#
# Requires: npm install (electron-builder + sharp are dev/runtime deps).
# Output:   dist/Fileman-<version>-<arch>.dmg  (unsigned — see note below)
#
# Bundled tools (extraResources):
#   - build/tools/adb     — adb macOS 二进制（Android/OHOS 手机连接引擎）。
#     缺失时本脚本自动投放：优先本机 Android SDK，回退 Google platform-tools 下载
#     （scripts/fetch-adb.sh；SKIP_ADB_FETCH=1 可跳过）。投放失败不阻塞打包，
#     但该 DMG 的 Android/OHOS 设备连接将不可用（打包态 GUI 应用无用户 $PATH）。
#   - build/tools/rg/rg   — ripgrep macOS 二进制（grep 内容搜索本地引擎）。
#     一键投放（自动按本机架构取最新版 + SHA256 校验）：
#     bash scripts/fetch-rg.sh          # 或指定版本: bash scripts/fetch-rg.sh 14.1.1
#     缺省时运行时回退 $PATH 的 rg，再退化为流式扫描。
#   - build/ios-native    — iOS addon + dylib 链 + libimobiledevice CLI（见步骤 4/5）。

set -euo pipefail
cd "$(dirname "$0")/.."

DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> [1/5] Build app (electron-vite build)"
if [[ "$DO_BUILD" -eq 1 ]]; then
  npm run build
else
  echo "    skipped (--no-build); reusing out/"
  [[ -f out/main/index.js ]] || { echo "    out/ is missing — run without --no-build first." >&2; exit 1; }
fi

echo "==> [2/5] Ensure app icon (build/icon.icns)"
if [[ -f build/icon.icns ]]; then
  echo "    exists; keeping it (delete it to regenerate the placeholder)"
else
  node scripts/generate-icon.mjs
fi

echo "==> [3/5] Ensure bundled adb (build/tools/adb)"
if [[ "${SKIP_ADB_FETCH:-}" == "1" ]]; then
  echo "    skipped (SKIP_ADB_FETCH=1)"
elif [[ -f build/tools/adb ]]; then
  echo "    exists: build/tools/adb ($(build/tools/adb version | head -1))"
else
  if bash scripts/fetch-adb.sh; then
    echo "    ok"
  else
    echo "    ⚠ adb 投放失败 —— 本次 DMG 不含 Android/OHOS 手机连接。" >&2
    echo "      补救: bash scripts/fetch-adb.sh && npm run dist:mac:fast" >&2
  fi
fi

echo "==> [4/5] Bundle iOS native addon + libimobiledevice dylib chain + iOS CLI (optional)"
# iOS 是可选阶段2;addon 未构建时跳过(打一个空 build/ios-native 占位,electron-builder 不会因此失败)。
ADDON_NODE="native/iosafc/build/Release/iosafc.node"
if [[ -f "$ADDON_NODE" ]]; then
  bash scripts/bundle-ios-dylibs.sh
else
  echo "    iOS addon 未构建($ADDON_NODE 不存在)→ 本次 DMG 不含 iOS 支持。"
  echo "    如需 iOS:先 scripts/install-ios-deps.sh,再 npm run build:native,然后重新 dist:mac。"
  mkdir -p build/ios-native
fi

echo "==> [5/5] Package DMG (electron-builder --mac)"
# Default to an UNSIGNED build. electron-builder otherwise auto-discovers a
# signing identity; on this machine the "Apple Development" cert is duplicated
# in the keychain (ambiguous) and can't notarize for general distribution
# anyway (needs a Developer ID). To sign instead:
#   CSC_IDENTITY_AUTO_DISCOVERY=true npm run dist:mac
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"
npx electron-builder --mac

echo
echo "==> Done. DMG artifact(s):"
ls -lh dist/*.dmg 2>/dev/null || echo "    (no .dmg in dist/ — check output above)"
echo
echo "NOTE: the DMG is unsigned. To open on another Mac, right-click the app →"
echo "      Open, or:  xattr -dr com.apple.quarantine '/Applications/Fileman.app'"
echo "      (该命令同时清除捆绑的 adb/libimobiledevice CLI 的 quarantine ——"
echo "       否则 Gatekeeper 会拦截对它们的 execve;app 启动时也会 best-effort 自清一次)"
