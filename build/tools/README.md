# Bundled CLI tools

This directory holds external CLI binaries that are packaged into the DMG via
`electron-builder.yml` → `extraResources`, so end users don't install them.
**打包态的 GUI 应用($PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin)必须捆绑这些工具,
否则手机设备连接不可用** —— 运行时由 `ToolPathResolver`
(`electron/src/services/ToolPathResolver.ts`)按「捆绑 → $PATH → brew 常见前缀」解析。

## `adb` (Android / OHOS)

`build-dmg.sh` 在打包前自动投放(优先本机 Android SDK,回退 Google 官方下载):

```sh
bash scripts/fetch-adb.sh            # 手动投放/重取(--force 强制)
bash scripts/fetch-adb.sh 35.0.2     # 指定 platform-tools 版本
```

它落在本目录 `build/tools/adb`,打包后位于 `Contents/Resources/adb`,由
`MobileDeviceScanner`(设备扫描)与 `AndroidAdapter`(adbkit,`bin` 参数)使用。

### macOS Gatekeeper note

Bundled binaries may carry a quarantine attribute that blocks execution
(killed: 9)。`ToolPathResolver` 在打包态解析到捆绑二进制时会 best-effort 自清一次
(`xattr -d com.apple.quarantine`);App Translocation 等只读场景自清会失败,由用户
对整个 .app 执行下面命令兜底(fetch 脚本投放时也会清一次):

```sh
xattr -dr com.apple.quarantine /Applications/Fileman.app
```

## ripgrep (`rg/rg`)

grep 内容搜索本地引擎。一键投放(按本机架构取最新版 + SHA256 校验):

```sh
bash scripts/fetch-rg.sh             # 或指定版本: bash scripts/fetch-rg.sh 14.1.1
```

缺省时运行时回退 $PATH 的 rg,再退化为流式扫描(打包不阻塞)。

## libimobiledevice (iOS)

`iosafc.node` addon 及其 dylib 链、`idevice_id`/`ideviceinfo`/`idevicepair`/
`idevicescreenshot` CLI 由 `scripts/bundle-ios-dylibs.sh` 统一收进
`build/ios-native/` → `Contents/Resources/ios-native/`(CLI 从 brew
libimobiledevice 拷入并本地化 dylib;未装 brew 包时跳过,iOS 退回 $PATH 语义)。

前置(一次性):

```sh
brew install libimobiledevice dylibbundler
bash scripts/install-ios-deps.sh && npm run build:native
```
