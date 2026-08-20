#!/usr/bin/env bash
#
# fetch-7zz.sh — 下载 7-Zip 官方 macOS 二进制并投放至 build/tools/7zz/7zz
# （7z/rar 解压与 7z 创建的本地引擎；npm run dist:mac 会经 extraResources 捆绑进 DMG）。
#
# 用法:
#   bash scripts/fetch-7zz.sh             # 最新版（ip7z/7zip 官方 release）
#   bash scripts/fetch-7zz.sh 26.02       # 指定版本
#
# 说明:
#   - mac 资产（7z<版本去点>-mac.tar.xz）是 universal 二进制（x86_64 + arm64），
#     无需按本机架构选择。
#   - release 不附带 .sha256 校验文件（与 ripgrep 不同）：能取到则校验，取不到
#     打告警跳过（与 fetch-rg.sh 同语义）。
#   - macOS 自带 tar 可解 .tar.xz（libarchive 内建 xz）。
#
# 已投放时跳过（可用 --force 强制重下）。

set -euo pipefail
cd "$(dirname "$0")/.."

# API 限流/离线时回退到固定已知版本（mac universal 资产，2026-06 验证可用）
PINNED_VERSION="26.02"
if [[ -n "${1:-}" ]]; then
  SEVENZIP_VERSION="$1"
else
  SEVENZIP_VERSION="$(curl -fsSL https://api.github.com/repos/ip7z/7zip/releases/latest \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' || true)"
  [[ -n "$SEVENZIP_VERSION" ]] || { echo "==> GitHub API 不可用，回退固定版本 ${PINNED_VERSION}"; SEVENZIP_VERSION="$PINNED_VERSION"; }
fi
DEST_DIR="build/tools/7zz"
DEST="$DEST_DIR/7zz"

if [[ -f "$DEST" && "${2:-}" != "--force" ]]; then
  echo "==> 7zz already present: $DEST ($("$DEST" i | grep -m1 '7-Zip'))"
  echo "    re-run with: bash scripts/fetch-7zz.sh ${SEVENZIP_VERSION} --force"
  exit 0
fi

echo "==> 7-Zip ${SEVENZIP_VERSION} (mac universal)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TARBALL="7z${SEVENZIP_VERSION//.}-mac.tar.xz"
BASE_URL="https://github.com/ip7z/7zip/releases/download/${SEVENZIP_VERSION}"

curl -fsSL -o "$TMP/$TARBALL" "$BASE_URL/$TARBALL"

# 校验:release 不一定附带 .sha256 —— 取不到则告警跳过（与 fetch-rg.sh 同语义）
echo "==> Verifying SHA256…"
if curl -fsSL -o "$TMP/$TARBALL.sha256" "$BASE_URL/$TARBALL.sha256"; then
  EXPECTED="$(awk '{print $1}' "$TMP/$TARBALL.sha256")"
  ACTUAL="$(shasum -a 256 "$TMP/$TARBALL" | awk '{print $1}')"
  [[ "$ACTUAL" == "$EXPECTED" ]] || { echo "    CHECKSUM MISMATCH (want $EXPECTED got $ACTUAL)" >&2; exit 1; }
  echo "    ok"
else
  echo "    WARNING: $TARBALL.sha256 unavailable — skipping verification" >&2
fi

mkdir -p "$DEST_DIR"
tar -xJf "$TMP/$TARBALL" -C "$TMP" 7zz
mv "$TMP/7zz" "$DEST"
chmod +x "$DEST"

echo "==> Placed $DEST"
"$DEST" i | grep -m1 '7-Zip'
echo "==> Done. 打包(npm run dist:mac)将把它放到 Contents/Resources/7zz/7zz,"
echo "    运行时由 ToolPathResolver 解析(SevenZipService 引擎;未捆绑时回退"
echo '    $PATH/brew 的 7zz,再缺失则 7z/rar 能力不可用)。'
