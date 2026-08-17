#!/usr/bin/env bash
#
# fetch-adb.sh — 投放 macOS adb 二进制至 build/tools/adb(Android 手机连接引擎)。
# npm run dist:mac 经 extraResources 把它捆进 DMG(Contents/Resources/adb),运行时由
# ToolPathResolver 解析。打包态 GUI 应用(Finder/Dock 启动)的 $PATH 不含用户安装位
# (SDK/brew),不捆绑则 Android 设备扫描全部失效 —— 这是 2026-08-17 修复的
# “打包后手机连接不可用”问题的核心。(OHOS/鸿蒙不走 adb,走 hdc —— 见 fetch-hdc.sh。)
#
# 来源优先级:
#   1. 本机 Android SDK(ANDROID_HOME / ANDROID_SDK_ROOT / ~/Library/Android/sdk)——
#      与日常开发同源,且 macOS platform-tools 的 adb 是 universal(x86_64+arm64)。
#   2. Google platform-tools 官方 zip(dl.google.com;指定版本走 platform-tools_r<V>)。
#
# 用法:
#   bash scripts/fetch-adb.sh              # SDK 优先,无 SDK 则下载最新版
#   bash scripts/fetch-adb.sh 35.0.2       # 指定 platform-tools 版本(强制走下载)
#   bash scripts/fetch-adb.sh --force      # 已投放时强制重取(取自 SDK)
#
# 校验:Google 不为该 zip 发布独立 SHA 清单,故以可执行性自校验 ——
# `file` 须为 Mach-O,且 `adb version` 能跑出 "Android Debug Bridge"(打印 SHA256 备查)。

set -euo pipefail
cd "$(dirname "$0")/.."

DEST_DIR="build/tools"
DEST="$DEST_DIR/adb"

ARG_VERSION=""
ARG_FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) ARG_FORCE=1 ;;
    *) [[ "$arg" =~ ^[0-9][0-9.]*$ ]] && ARG_VERSION="$arg" || { echo "unknown arg: $arg" >&2; exit 2; } ;;
  esac
done

if [[ -f "$DEST" && "$ARG_FORCE" -eq 0 ]]; then
  echo "==> adb already present: $DEST ($("$DEST" version | head -1))"
  echo "    re-run with: bash scripts/fetch-adb.sh --force"
  exit 0
fi

# 投放并自校验(来源无关):Mach-O + 能执行。
place_adb() {
  local src="$1"
  mkdir -p "$DEST_DIR"
  cp "$src" "$DEST"
  chmod +x "$DEST"
  # 下载/拷贝来的二进制可能带 quarantine(Safari 下载的 zip 等),best-effort 清除。
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true

  file -b "$DEST" | grep -q 'Mach-O' || { echo "    not a Mach-O binary: $DEST" >&2; exit 1; }
  "$DEST" version | head -1 || { echo "    adb 无法执行: $DEST" >&2; exit 1; }

  echo "==> Placed $DEST"
  "$DEST" version | head -2
  echo "    SHA256: $(shasum -a 256 "$DEST" | awk '{print $1}')"
}

# ── 1. 本机 SDK ───────────────────────────────────────────────────────────────
if [[ -z "$ARG_VERSION" ]]; then
  for cand in \
    "${ANDROID_HOME:-/nonexistent}/platform-tools/adb" \
    "${ANDROID_SDK_ROOT:-/nonexistent}/platform-tools/adb" \
    "$HOME/Library/Android/sdk/platform-tools/adb"; do
    if [[ -x "$cand" ]]; then
      echo "==> Using local SDK adb: $cand"
      place_adb "$cand"
      echo "==> Done. 打包(npm run dist:mac)将把它放到 Contents/Resources/adb,"
      echo "    运行时由 ToolPathResolver 解析(MobileDeviceScanner/AndroidAdapter)。"
      exit 0
    fi
  done
  echo "==> 本机未找到 Android SDK,回退官方下载(也可显式指定版本: bash scripts/fetch-adb.sh 35.0.2)"
fi

# ── 2. 官方 platform-tools zip ────────────────────────────────────────────────
VERSION="${ARG_VERSION:-latest}"
if [[ "$VERSION" == "latest" ]]; then
  ZIP_NAME="platform-tools-latest-darwin.zip"
else
  ZIP_NAME="platform-tools_r${VERSION}-darwin.zip"
fi
URL="https://dl.google.com/android/repository/${ZIP_NAME}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Downloading $URL"
curl -fSL -o "$TMP/$ZIP_NAME" "$URL"
unzip -o -j "$TMP/$ZIP_NAME" 'platform-tools/adb' -d "$DEST_DIR"

place_adb "$DEST"
echo "==> Done. 打包(npm run dist:mac)将把它放到 Contents/Resources/adb,"
echo "    运行时由 ToolPathResolver 解析(MobileDeviceScanner/AndroidAdapter)。"
