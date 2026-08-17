#!/usr/bin/env bash
#
# fetch-hdc.sh — 投放 macOS hdc(HarmonyOS Device Connector)至 build/tools/hdc/
# (鸿蒙手机连接引擎:设备发现/文件适配/截图)。
# npm run dist:mac 经 extraResources 把整个目录捆进 DMG(Contents/Resources/hdc/),
# 运行时由 ToolPathResolver 解析(hdc/hdc)。打包态 GUI 应用无用户 $PATH,不捆绑则
# OHOS 设备扫描静默失效 —— 与 adb 同因(2026-08-17)。
#
# hdc 非自包含单文件:依赖 @rpath/libusb_shared.dylib(rpath=@loader_path/.),
# 必须连同 dylib 一起投放并保持同目录布局。
#
# 来源优先级(hdc 无公开直链下载,不尝试网络获取,只认本机安装):
#   1. ~/Library/OpenHarmony/Sdk/<ver>/toolchains —— DevEco Studio 默认 SDK 落点(版本大者优先)
#   2. /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains
#   3. /Applications/DevEco-Studio.app/Contents/sdk/<ver>/openharmony/toolchains
#
# 找不到时 exit 1 —— build-dmg.sh 降级为告警不阻塞打包(该 DMG 的 OHOS 连接退化为
# 运行时 SDK 目录探测兜底)。
#
# 用法:
#   bash scripts/fetch-hdc.sh            # 投放;已投放时提示
#   bash scripts/fetch-hdc.sh --force    # 强制重取
#
# 校验:Mach-O + `hdc -v` 能执行(与 fetch-adb.sh 同语义,自校验与来源无关)。

set -euo pipefail
cd "$(dirname "$0")/.."

DEST_DIR="build/tools/hdc"
DEST="$DEST_DIR/hdc"

ARG_FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) ARG_FORCE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ -f "$DEST" && "$ARG_FORCE" -eq 0 ]]; then
  echo "==> hdc already present: $DEST ($("$DEST" -v 2>&1 | head -1))"
  echo "    re-run with: bash scripts/fetch-hdc.sh --force"
  exit 0
fi

# 投放并自校验:hdc + libusb_shared.dylib 同目录(rpath=@loader_path/.)
place_hdc() {
  local src_dir="$1"
  mkdir -p "$DEST_DIR"
  cp "$src_dir/hdc" "$DEST"
  chmod +x "$DEST"
  if [[ -f "$src_dir/libusb_shared.dylib" ]]; then
    cp "$src_dir/libusb_shared.dylib" "$DEST_DIR/"
  else
    echo "    ⚠ ${src_dir}/libusb_shared.dylib 缺失,hdc 运行时可能加载失败" >&2
  fi
  # 拷贝来的二进制可能带 quarantine,best-effort 清除(同 fetch-adb.sh)
  xattr -dr com.apple.quarantine "$DEST_DIR" 2>/dev/null || true

  file -b "$DEST" | grep -q 'Mach-O' || { echo "    not a Mach-O binary: $DEST" >&2; exit 1; }
  "$DEST" -v >/dev/null 2>&1 || { echo "    hdc 无法执行: $DEST" >&2; exit 1; }

  echo "==> Placed $DEST"
  "$DEST" -v 2>&1 | head -1
  echo "    SHA256: $(shasum -a 256 "$DEST" | awk '{print $1}')"
  echo "==> Done. 打包(npm run dist:mac)将把它放到 Contents/Resources/hdc/,"
  echo "    运行时由 ToolPathResolver 解析(MobileDeviceScanner/OhosAdapter/MobileScreenshotService)。"
}

# ── 候选目录(版本大者优先;default DevEco 路径恒在,保证数组非空) ────────────
CANDIDATES=()
if [[ -d "$HOME/Library/OpenHarmony/Sdk" ]]; then
  while IFS= read -r ver; do
    CANDIDATES+=("$HOME/Library/OpenHarmony/Sdk/$ver/toolchains")
  done < <(ls "$HOME/Library/OpenHarmony/Sdk" | grep -E '^[0-9]+(\.[0-9]+)*$' | sort -t. -k1,1n -k2,2n -k3,3n -r)
fi
CANDIDATES+=("/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains")
if [[ -d "/Applications/DevEco-Studio.app/Contents/sdk" ]]; then
  while IFS= read -r ver; do
    [[ "$ver" == "default" ]] && continue
    CANDIDATES+=("/Applications/DevEco-Studio.app/Contents/sdk/$ver/openharmony/toolchains")
  done < <(ls "/Applications/DevEco-Studio.app/Contents/sdk" | grep -E '^[0-9]+(\.[0-9]+)*$' | sort -t. -k1,1n -k2,2n -k3,3n -r)
fi

for cand in "${CANDIDATES[@]}"; do
  if [[ -x "$cand/hdc" ]]; then
    echo "==> Using local hdc: $cand/hdc"
    place_hdc "$cand"
    exit 0
  fi
done

echo "==> ⚠ 本机未找到 hdc(已找 ~/Library/OpenHarmony/Sdk/*/toolchains 与 DevEco Studio SDK)。" >&2
echo "    hdc 无公开直链;安装 DevEco Studio 或 OpenHarmony SDK 后重试:" >&2
echo "      bash scripts/fetch-hdc.sh && npm run dist:mac:fast" >&2
exit 1
