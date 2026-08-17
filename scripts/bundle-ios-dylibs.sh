#!/usr/bin/env bash
#
# bundle-ios-dylibs.sh — 把 iosafc.node 依赖的 libimobiledevice dylib 链收集进打包目录,
# 改写 install name 为 @loader_path/<name>,使其能在未装 Homebrew 的机器上随 app 运行。
#
# 输入:native/iosafc/build/Release/iosafc.node  (npm run build:native 产物)
#       + brew libimobiledevice 的 CLI(idevice_id/ideviceinfo/idevicepair/idevicescreenshot,
#         设备发现/配对校验/截图用;未装 brew 包则跳过,退回 $PATH 语义)
# 输出:build/ios-native/iosafc.node + build/ios-native/*.dylib + CLI(扁平,同目录)
# 之后 electron-builder 的 extraResources 把 build/ios-native 放进 Contents/Resources/ios-native。
#
# 运行期:iOSAdapter 从 Resources/ios-native/iosafc.node 加载,@loader_path 解析同目录 dylib;
#        MobileDeviceScanner/MobileScreenshotService 经 ToolPathResolver 解析同目录 CLI。
#
# 工具:dylibbundler(brew install dylibbundler)—— 自动解析 @rpath/@loader_path 依赖链、
# 复制、改写。替代方案见文末注释(delocate 或手写 install_name_tool)。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_SRC="$ROOT/native/iosafc/build/Release/iosafc.node"
STAGE="$ROOT/build/ios-native"

if [[ ! -f "$NODE_SRC" ]]; then
  echo "错误:未找到 $NODE_SRC。" >&2
  echo "       先执行 scripts/install-ios-deps.sh,再 npm run build:native。" >&2
  exit 1
fi

if ! command -v dylibbundler >/dev/null 2>&1; then
  echo "错误:未安装 dylibbundler。运行:brew install dylibbundler" >&2
  exit 1
fi

echo "==> [1/3] 清理并准备 staging:$STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$NODE_SRC" "$STAGE/iosafc.node"

echo "==> [2/4] dylibbundler:收集 dylib 链 + 改写 install name(@loader_path,扁平)"
# 关键点:.node 与 dylib 扁平同目录,@loader_path 对二者都指向该目录,无需 rpath。
#   -x  待处理二进制(其依赖被收集)
#   -b  bundle:复制依赖文件到 -d 目录(仅 -x 只改写 install name、不复制!)
#   -d  依赖输出目录(此处 = staging 本身,扁平)
#   -p  改写后的 install name 前缀(@loader_path/ 相对 .node 自身目录)
#   -cd 创建输出目录(不擦除;脚本开头已 rm -rf 整个 staging,故每次都是干净的)
#      注意:勿用 -od,它会 rm -r 目标目录,而 -d . 时目标=cwd,会报 "may not be removed"。
cd "$STAGE"
#   -of 覆盖已存在的输出文件(下方 CLI 收集步骤会重复收集与 iosafc.node 重叠的 dylib,
#       同源同内容,覆盖无害;不加则 dylibbundler 以 "already exists" 报错退出)
dylibbundler -x iosafc.node -b -d . -p @loader_path/ -cd -of

# ── iOS CLI 工具(设备发现/配对校验/截图)─────────────────────────────────────
# 打包态 GUI 应用没有用户 $PATH,scanner 的 `which idevice_id` 会落空 → iOS 设备
# 永远发现不了(即使 iosafc.node 已捆好)。brew 装了 libimobiledevice 就把 CLI 一并
# 捆进同一扁平目录:dylibbundler 对每个 CLI 重跑一遍,依赖与 iosafc.node 同源同版本,
# 重复收集只是覆盖同内容文件,install name 均为 @loader_path/<name> 保持一致。
IOS_CLIS=(idevice_id ideviceinfo idevicepair idevicescreenshot)
BREW_BIN_DIR=""
if command -v brew >/dev/null 2>&1; then
  BREW_PREFIX="$(brew --prefix libimobiledevice 2>/dev/null || true)"
  [[ -n "$BREW_PREFIX" && -d "$BREW_PREFIX/bin" ]] && BREW_BIN_DIR="$BREW_PREFIX/bin"
fi
echo "==> [3/4] iOS CLI 工具(idevice_id/ideviceinfo/idevicepair/idevicescreenshot)"
if [[ -n "$BREW_BIN_DIR" ]]; then
  for cli in "${IOS_CLIS[@]}"; do
    src="$BREW_BIN_DIR/$cli"
    if [[ -f "$src" ]]; then
      cp "$src" "$STAGE/$cli"
      dylibbundler -x "$cli" -b -d . -p @loader_path/ -cd -of
      chmod +x "$STAGE/$cli"
      xattr -d com.apple.quarantine "$STAGE/$cli" 2>/dev/null || true
      echo "  + $cli"
    else
      echo "  ⚠ $src 不存在,跳过该 CLI"
    fi
  done
else
  echo "  ⚠ 未找到 brew libimobiledevice —— 本次 DMG 不含 iOS CLI。"
  echo "    打包态 iOS 设备发现/截图将不可用;补装后重跑:bash scripts/bundle-ios-dylibs.sh && npm run dist:mac:fast"
  echo "    (brew install libimobiledevice)"
fi

echo "==> [4/4] 校验:iosafc.node、CLI 及各 dylib 的依赖应全部指向 @loader_path/"
fail=0
while IFS= read -r f; do
  if otool -L "$f" | grep -E '/(opt/homebrew|usr/local)/'; then
    echo "  ⚠ $f 仍含系统(brew)路径依赖 —— dylibbundler 未完全改写,检查其输出。" >&2
    fail=1
  fi
done < <(find "$STAGE" -maxdepth 1 -type f \( -name '*.node' -o -name '*.dylib' -o -name 'idevice*' \))

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "诊断(各文件依赖):"
  find "$STAGE" -maxdepth 1 -type f \( -name '*.node' -o -name '*.dylib' -o -name 'idevice*' \) -exec sh -c 'echo "--- $1"; otool -L "$1"' _ {} \;
  exit 1
fi

echo "  OK —— 依赖已全部本地化。"
echo
echo "==> staging 内容:"
ls -1 "$STAGE"
echo
echo "==> iosafc.node 依赖链:"
otool -L "$STAGE/iosafc.node"
echo
echo "✅ 已生成 build/ios-native/。electron-builder 会经 extraResources 把它放进 Resources/ios-native。"
echo
echo "替代方案(若 dylibbundler 不可用):"
echo "  pip install delocate && delocate-path -L @loader_path build/ios-native"
echo "  或手写 otool + install_name_tool(-change/-id)逐条改写。"
