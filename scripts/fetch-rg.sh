#!/usr/bin/env bash
#
# fetch-rg.sh — 下载 ripgrep macOS 二进制并投放至 build/tools/rg/rg
# （grep 内容搜索的本地引擎；npm run dist:mac 会经 extraResources 捆绑进 DMG）。
#
# 用法:
#   bash scripts/fetch-rg.sh              # 最新版,按本机架构
#   bash scripts/fetch-rg.sh 14.1.1       # 指定版本
#   RG_ARCH=x86_64-apple-darwin bash scripts/fetch-rg.sh   # 交叉投放
#
# 已投放时跳过（可用 --force 强制重下）。

set -euo pipefail
cd "$(dirname "$0")/.."

RG_VERSION="${1:-$(curl -fsSL https://api.github.com/repos/BurntSushi/ripgrep/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')}"
RG_ARCH="${RG_ARCH:-$(uname -m | sed 's/^arm64$/aarch64/; s/^x86_64$/x86_64/')}-apple-darwin"
DEST_DIR="build/tools/rg"
DEST="$DEST_DIR/rg"

if [[ -f "$DEST" && "${2:-}" != "--force" ]]; then
  echo "==> rg already present: $DEST ($("$DEST" --version | head -1))"
  echo "    re-run with: bash scripts/fetch-rg.sh ${RG_VERSION} --force"
  exit 0
fi

echo "==> ripgrep ${RG_VERSION} (${RG_ARCH})"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TARBALL="ripgrep-${RG_VERSION}-${RG_ARCH}.tar.gz"
BASE_URL="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}"

curl -fsSL -o "$TMP/$TARBALL" "$BASE_URL/$TARBALL"

# 校验:release 为每个资产附带独立的 <asset>.sha256（无汇总 SHA256SUMS 文件）
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
tar -xzf "$TMP/$TARBALL" -C "$TMP" "ripgrep-${RG_VERSION}-${RG_ARCH}/rg"
mv "$TMP/ripgrep-${RG_VERSION}-${RG_ARCH}/rg" "$DEST"
chmod +x "$DEST"

echo "==> Placed $DEST"
"$DEST" --version | head -1
echo "==> Done. 打包(npm run dist:mac)将把它放到 Contents/Resources/rg/rg,"
echo "    运行时由 ToolPathResolver 解析(GrepService 本地引擎)。"
