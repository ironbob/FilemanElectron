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
# Optional bundled tools (extraResources, 缺省不阻塞打包):
#   - build/tools/rg/rg    — ripgrep macOS 二进制（grep 内容搜索本地引擎）。
#     一键投放（自动按本机架构取最新版 + SHA256 校验）：
#     bash scripts/fetch-rg.sh          # 或指定版本: bash scripts/fetch-rg.sh 14.1.1
#     缺省时运行时回退 $PATH 的 rg，再退化为流式扫描。

set -euo pipefail
cd "$(dirname "$0")/.."

DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> [1/3] Build app (electron-vite build)"
if [[ "$DO_BUILD" -eq 1 ]]; then
  npm run build
else
  echo "    skipped (--no-build); reusing out/"
  [[ -f out/main/index.js ]] || { echo "    out/ is missing — run without --no-build first." >&2; exit 1; }
fi

echo "==> [2/4] Ensure app icon (build/icon.icns)"
if [[ -f build/icon.icns ]]; then
  echo "    exists; keeping it (delete it to regenerate the placeholder)"
else
  node scripts/generate-icon.mjs
fi

echo "==> [3/4] Bundle iOS native addon + libimobiledevice dylib chain (optional)"
# iOS 是可选阶段2;addon 未构建时跳过(打一个空 build/ios-native 占位,electron-builder 不会因此失败)。
ADDON_NODE="native/iosafc/build/Release/iosafc.node"
if [[ -f "$ADDON_NODE" ]]; then
  bash scripts/bundle-ios-dylibs.sh
else
  echo "    iOS addon 未构建($ADDON_NODE 不存在)→ 本次 DMG 不含 iOS 支持。"
  echo "    如需 iOS:先 scripts/install-ios-deps.sh,再 npm run build:native,然后重新 dist:mac。"
  mkdir -p build/ios-native
fi

echo "==> [4/4] Package DMG (electron-builder --mac)"
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
