{
  "targets": [
    {
      "target_name": "iosafc",
      "sources": ["iosafc.cpp"],
      # 不在 gyp 里调 pkg-config(其 <!@() 展开不稳)。
      # 头文件/库目录由 scripts/build-ios-addon.cjs 经 pkg-config 解析后,以 CPATH / LIBRARY_PATH
      # 环境变量传入(clang/ld 直接识别);这里只列 -l 名(gyp 自动加 -l 前缀)。
      "include_dirs": [
        "<(module_root_dir)/../../node_modules/node-addon-api"
      ],
      "libraries": [
        "-limobiledevice-1.0",
        "-lplist-2.0",
        "-lusbmuxd-2.0"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
