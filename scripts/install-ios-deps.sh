#!/usr/bin/env bash
#
# install-ios-deps.sh — 安装 iOS 原生 addon(native/iosafc)编译与打包所需的库(macOS)。
#
# 这里装的是"编译机"上的依赖:头文件 + dylib(供 node-gyp 链接)+ 工具。
# 终端用户的运行期依赖(libimobiledevice dylib 链)由 bundle-ios-dylibs.sh 收集进 app,
# 用户无需自行安装。
#
set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "错误:未检测到 Homebrew。请先安装:https://brew.sh" >&2
  exit 1
fi

echo "==> [1/2] 安装 libimobiledevice 开发库与依赖链(头文件 + dylib)"
# libimobiledevice 会自动带上 libplist / libusbmuxd / libimobiledevice-glue。
# 显式列出主要包,便于排错。
brew install libimobiledevice libplist libusbmuxd

echo "==> [2/2] 安装构建/打包工具"
brew install pkg-config     # binding.gyp 经它解析头文件与链接库路径
brew install dylibbundler   # bundle-ios-dylibs.sh 经它收集并改写 dylib 链

echo
echo "==> 校验 pkg-config 能定位 libimobiledevice 链"
if pkg-config --exists libimobiledevice-1.0 libplist-2.0 libusbmuxd-2.0; then
  echo "  libimobiledevice-1.0: $(pkg-config --modversion libimobiledevice-1.0)"
  echo "  libplist-2.0:         $(pkg-config --modversion libplist-2.0)"
  echo "  libusbmuxd-2.0:       $(pkg-config --modversion libusbmuxd-2.0)"
else
  echo "  ⚠ pkg-config 未找到三者之一。" >&2
  echo "    arm64 上需确保 PKG_CONFIG_PATH 含 /opt/homebrew/lib/pkgconfig:" >&2
  echo "      export PKG_CONFIG_PATH=\"\$PKG_CONFIG_PATH:/opt/homebrew/lib/pkgconfig\"" >&2
  exit 1
fi

cat <<EOF

✅ iOS 依赖就绪。后续:
   编译 addon(按 Electron ABI):  npm run build:native
   收集/改写 dylib 进打包目录:    bash scripts/bundle-ios-dylibs.sh
   打包 DMG(会自动调上面的脚本): npm run dist:mac
EOF
