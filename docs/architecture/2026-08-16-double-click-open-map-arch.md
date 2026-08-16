# 双击打开方式全类型映射（穷举）— 2026-08-16

> 状态：**已实施（2026-08-16）**，配套契约 `2026-08-16-double-click-open-map-design-contract.json`。
> 目标：穷举所有文件类型，为每种类型确定"最适合的双击默认打开方式"，
> 并消灭 `Cannot preview this file type` 占位符。
> 触发案例：`*.cmake` 双击无法预览。
> 实施落地：单一注册表 `shared/fileKinds.ts`（§8.1）+ 嗅探兜底（§4）+ sips 接线（§8.3）
> + `shell:openDefault`（§6 决策④）+ 媒体/文本尺寸守卫（§7）。§6 五个决策点均按推荐落地。

---

## 1. 问题复现与根因

### 1.1 cmake 案例

- `CMakeLists.txt` → `path.extname()` = `.txt` → 走文本预览 ✅（但无语法高亮，Monaco 0.44 无 cmake tokenizer）
- `xxx.cmake` → ext = `cmake` → `getPreviewType()` 的 `textExts` **不含 `cmake`** → `'unknown'`
  → `PreviewContentRouter.vue` 兜底分支 → **"Cannot preview this file type"** ❌

### 1.2 根因：扩展名清单分裂（10 处，互不同步）

| # | 位置 | 职责 | 备注 |
|---|------|------|------|
| 1 | `src/utils/fileTypes.ts:1-24` `extensionCategories` | 分类（图标/FileInfo/FileDiffView isTextFile） | 最全，**有** cmake |
| 2 | `src/utils/fileTypes.ts:26-135` `extensionIconMap` | 图标 | 有 cmake 图标 |
| 3 | `src/utils/fileTypes.ts:173-175` `NATIVE_DECODE_EXTS` | sips 解码判定（仅 FileInfoDialog 用） | 无 tiff/psd |
| 4 | `src/types/preview.ts:53-84` `getPreviewType` 内部 5 个 Set | **双击/QuickLook/内联预览的路由**（唯一真正的决策点） | 最窄，**无** cmake/cs/ips/mk… |
| 5 | `src/types/preview.ts:126-145` `getTextFileType` | 文本渲染模式 | **无外部消费者（死代码）** |
| 6 | `src/types/preview.ts:152-214` `getLanguageFromExtension` | Monaco 语言 | **无外部消费者（死代码）** |
| 7 | `src/utils/media.ts:112-153` `isTextFile/isImageFile/...` | InlinePreview/InlineMediaInfo | 又一套窄清单 |
| 8 | `src/components/preview/PreviewTextContent.vue:~600-686` `EXTENSION_LANGUAGE_MAP` + `detectLanguage` | Monaco 语言（实际在用） | 有 cmake→plaintext；名称特判 Dockerfile/Makefile/.gitignore 是**死代码**（路由根本到不了） |
| 9 | `src/components/compare/FileDiffView.vue:411` `detectLanguage` | diff 侧语言 | 第 4 份语言映射 |
| 10 | `electron/src/services/ThumbnailService.ts:30-37` | 主进程缩略图格式 | 需与 #3 对齐（代码注释已声明此约束） |

### 1.3 路由链路（唯一咽喉，改造点集中）

```
双击 FileList.handleDoubleClick ─┬─ 目录        → navigate
                                 ├─ .zip        → navigate 进 ZIP 虚拟目录（"::" 约定）
                                 └─ 其他        → previewStore.openPreview()
                                                    → getPreviewType(file)   ← 【决策点，改造此处】
PreviewContentRouter（tab / QuickLook / Inline 三处共用）
```

---

## 2. 现有"打开方式"能力清单（渲染真实能力，非路由声明）

| 打开方式 | 实现 | 真实能力边界 |
|---|---|---|
| NAV_DIR | 进入目录 | 含 `.app` 等 bundle（是目录） |
| NAV_ZIP | 双击进入 zip 虚拟目录 | 仅 fflate zip |
| TAB_TEXT | Monaco（source/rendered/CSV 表格≤2000 行/日志分析） | 整读 base64；markdown 默认 source |
| TAB_IMAGE | 整读 → Blob → `<img>` | **仅 Chromium 可解格式**；HEIC/TIFF/RAW/PSD 路由到 image 但**渲染失败**（`decodeNativeImage`/sips 服务已存在但只有 FileInfoDialog 接线） |
| TAB_VIDEO | 整读 → Blob → `<video>` | 仅 Chromium 可解容器+编码；avi/wmv/flv/rmvb/mpeg2 必失败 |
| TAB_AUDIO | 整读 → Blob → `<audio>` | 同上 |
| TAB_PDF | pdfjs | ✅ 分页懒加载 |
| TAB_ZIP | PreviewZipContent 懒解压浏览 | 仅 zip 结构 |
| TAB_HEX | 分块 readRange | ✅ 任意文件 |
| UNKNOWN | 占位符 | ❌ 待消灭 |
| SYS_OPEN | `shell.openPath` | **不存在**，仅有 `showItemInFolder`；且系统打开只适用于本地文件 |

视频/音频/图片均为**整读**（无流式），大文件策略见 §7。

---

## 3. 穷举映射总表

> 现状图例：✅ 正常 ｜ ⚠️ 路由到了但渲染失败 ｜ ❌ 落入 unknown 占位符 ｜ 🐛 路由错误 ｜ ➕ 建议新增/修复

### 3.1 文本 → TAB_TEXT（Monaco source；标注 ◎ 的默认进 rendered/表格模式）

#### A1 源代码 — 现已支持 ✅
```
txt md◎ markdown◎ json◎ xml◎ yaml yml log csv◎ js jsx ts(🐛见 §5) tsx vue
html◎ htm◎ css scss sass py go rs java c cpp cc cxx h hpp
sh bash zsh bat cmd ps1 sql php rb swift kt kts scala lua
ini conf cfg toml env(⚠️仅非点文件可达,见 A9) gitignore(⚠️同左) dockerfile(⚠️同左)
m mm pl pm asm s dart fs hs ml erl
```

#### A2 源代码 — 现为 ❌，建议补入
```
cs                          ← C#（图标集有、路由集无，明显缺口）
less hrl r jl rmd nim zig v vsh cr
ex exs eex leex heex edn    ← Elixir/Erlang
clj cljs cljc clojure elm purs rkt racket scm ss lisp el elisp
vb vbs bas ahk applescript  ← scpt(编译版)除外→hex
coffee litcoffee pug hbs handlebars ejs twig liquid mustache haml slim erb
sol tcl gd move coq wat
sv svh verilog vlog         ← Monaco 有 systemverilog
glsl vert frag comp geom tesc tese hlsl fx shader cg
cu cuh cl metal             ← CUDA/OpenCL/Metal（Monaco 无专用高亮→plaintext）
xhtml svelte astro
```

#### A3 构建/工程 — 现为 ❌，建议补入
```
cmake cmake.in              ← 本案痛点
mk mak makefile
gradle gradle.kts groovy gvy gy
pom bazel bzl ninja meson just
ac am in                    ← configure.ac / Makefile.am / Foo.in（低置信，靠嗅探复核）
名称: WORKSPACE BUILD BUILD.bazel MODULE.bazel Makefile.* configure → 见 A9
```

#### A4 配置/清单 — 现为 ❌，建议补入
```
properties cnf editorconfig gitattributes gitmodules dockerignore
npmrc yarnrc nvmrc node-version python-version tool-versions
babelrc eslintrc prettierrc browserslistrc
plist entitlements mobileconfig xcconfig xcscheme xctestplan pbxproj
sln csproj vbproj fsproj props targets resx appxmanifest wxs wxi
desktop service socket timer target mount policy rules
tf hcl tfvars nix
名称: .gitconfig .curlrc .wgetrc config(ssh) → 见 A9
```

#### A5 数据/序列化 — 现为 ❌，建议补入
```
jsonc json5 jsonl ndjson tsv har geojson ipynb◎ avsc feature proto graphql gql mcmeta
ips                         ← macOS 崩溃日志（图标集已有，路由缺失）
logcat
```

#### A6 文档/标记 — md/markdown 已支持；现为 ❌ 的补充
```
mdx rst adoc asciidoc asc tex latex ltx sty cls bib org rtf eps ps
名称: README* CHANGELOG* LICENSE* LICENCE* COPYING* NOTICE AUTHORS CONTRIBUTING INSTALL TODO VERSION NEWS → 见 A9
```

#### A7 补丁/备份
```
diff patch ➕text  rej ➕text  orig bak swp swo ➕嗅探(可能二进制)
```

#### A8 证书/密钥（PEM 类是文本！）
```
pem crt cer key pub asc ➕text
der p12 pfx jks keystore mobileprovision ➕hex
名称: id_rsa id_ed25519 authorized_keys known_hosts ➕text
```

#### A9 名称匹配表（无扩展名/点文件，`path.extname` 全部返回 `''`，**现状全部 ❌**）
```
精确名: Makefile makefile GNUmakefile Dockerfile dockerfile Rakefile Gemfile
        Vagrantfile Justfile justfile Kbuild Procfile configure
前缀:   CMakeLists.(txt 已走 .txt)  .gitignore .gitattributes .gitmodules
        .dockerignore .editorconfig .npmrc .yarnrc .nvmrc .babelrc .eslintrc*
        .prettierrc* .env .env.* .zshrc .bashrc .bash_profile .profile
        .vimrc .gvimrc .gitconfig .curlrc .wgetrc
README/CHANGELOG/LICENSE/… (大小写不敏感,可带扩展名)
```
> `detectLanguage()` 里 Dockerfile/Makefile/.gitignore 的名称特判（PreviewTextContent.vue:682-684）
> 证明此意图早已存在，但路由层永远送不进来——纯死代码。

#### A10 播放列表（文本，不是音频！）
```
m3u m3u8 pls asx xspf ➕text   ← m3u 现被 fileTypes.audio 误配(§5)
```

#### A11 字幕
```
srt ass ssa vtt ➕text   sub ➕嗅探(idx 为二进制)
```

#### A12 邮件/其他文本
```
eml url webloc desktop ➕text   torrent ➕嗅探(优先 text)
msg ➕hex
```

### 3.2 图片 → TAB_IMAGE

| 组 | 扩展名 | 现状 | 建议 |
|---|---|---|---|
| Chromium 原生可解 | jpg jpeg png gif webp avif bmp svg ico | ✅ | 维持 |
| 需 sips 解码（`ImageDecodeService` 已有，**预览未接线**） | heic heif tiff **tif**(❌ 连路由都没有) psd tga sgi jp2 pict qtif icns | ⚠️/❌ | ➕接 `decodeNativeImage`；`NATIVE_DECODE_EXTS` 同步扩 |
| 相机 RAW（同上走 sips/ImageIO） | dng cr2 cr3(待验证) nef arw orf raf sr2 raw srw pef rw2 3fr erf iiq kdc dcr | ⚠️ | ➕同上；cr3/jxl 需实测 macOS 版本支持 |
| 无任何解码器 | xcf exr hdr pbm pgm ppm pam | ⚠️(路由 image 必失败) | ➕改路由 hex |
| 尺寸上限 | — | 50MB（`IMAGE_PREVIEW_SIZE_LIMIT`） | 维持 |

### 3.3 视频 → TAB_VIDEO（Chromium 122 能力）

| 组 | 扩展名 | 现状 | 建议 |
|---|---|---|---|
| 大概率可播 | mp4 m4v mov webm mkv(取决于编码) | ✅ | 维持 |
| 部分可播 | 3gp 3g2（H.263 不支持/H.264 支持）；mp4/mov 内 HEVC（硬解依机型） | ⚠️ | 维持，失败时给出明确错误 |
| **容器即不可解** | avi wmv asf flv f4v rmvb rm mpg mpeg mpe vob ts mts m2ts ogv ogm divx dv amv roq mxf qt | ⚠️(路由 video 必失败) | ➕决策点②：保持进播放器+明确报错+一键 hex/系统打开（推荐），或直接路由 hex |
| `.ts` 特例 | ts | 🐛 被当 MPEG-TS，**TypeScript 源码双击进播放器** | ➕决策点③（§5） |

### 3.4 音频 → TAB_AUDIO

| 组 | 扩展名 | 现状 | 建议 |
|---|---|---|---|
| 可播 | mp3 flac wav ogg oga opus m4a m4b aac aiff aif | ✅ | 维持（m4b/aiff 需实测） |
| 不可播 | wma alac ape amr pcm ac3 eac3 caf mka | ⚠️ | 同视频决策点② |

### 3.5 PDF → TAB_PDF
```
pdf ✅
```

### 3.6 ZIP 族 → NAV_ZIP（`.zip` 双击进入）/ TAB_ZIP（其余）
```
✅ 已有: zip(NAV) jar war ear apk ipa docx xlsx pptx odt ods odp epub cbz
➕ 建议新增: docm xlsm pptm pages numbers key(iWork 均为 zip) whl vsix xpi
   nupkg sar kmz
说明: docx/pptx 等进 zip 后看到的是原始 XML——能用但体验一般；
     远期可做 Office 渲染，不在本轮。
```

### 3.7 压缩（非 zip）→ TAB_HEX（现状 ❌；远期可接系统 tar/unar 只读浏览）
```
rar 7z tar gz tgz bz2 tbz xz txz zst lz4 lz z br xar pkg
```

### 3.8 磁盘镜像 → TAB_HEX
```
✅ iso img 已在 hexExts
➕ dmg sparseimage sparsebundle vmdk vhd vhdx qcow2 vdi wim
```

### 3.9 二进制/库/编译产物 → TAB_HEX
```
✅ 已有: bin iso img dylib so exe dll dat o a class wasm
➕ lib pdb obj node pyc pyo elc mo dSYM(bundle 为目录)
```

### 3.10 字体 → TAB_HEX（远期可做字形预览面板）
```
ttf otf ttc woff woff2 eot fon
```

### 3.11 数据库 → TAB_HEX（远期可做 sqlite 只读浏览）
```
db sqlite sqlite3 db3 mdb accdb mdf
```

### 3.12 Office 二进制（OLE）→ TAB_HEX（本地文件可在右键"系统打开"，见决策点④）
```
doc dot xls xlt ppt pps msi
```

### 3.13 杂项
```
ds_store ➕hex   swf ➕hex   lnk ➕hex(远期可解析)   bplist(二进制 plist,同名.plist) ➕嗅探定 text/hex
```

---

## 4. 兜底管线（"收集所有类型 → 找到最适合"的算法）

```
P0 目录(.app 等 bundle)              → NAV_DIR
P1 ext == zip                        → NAV_ZIP
P2 文件名精确/前缀表 (§3.1 A9)        → TAB_TEXT
P3 扩展名统一注册表 (合并 10 处清单)   → 对应 TAB_*
P4 冲突裁决 (§5)                     → 按裁决规则
P5 内容嗅探 (ext 为空/unknown/低置信)  → 魔数表定 image/video/audio/pdf/zip/hex/text
P6 终极兜底                          → TAB_HEX（本地文件附"系统打开"按钮）
                                      —— 消灭 "Cannot preview this file type"
```

### 4.1 魔数嗅探表（读前 8KB，复用现有 `readRange` IPC，全部 adapter 可用）

| 特征 | 判定 |
|---|---|
| 前 8KB 含 `0x00`（BOM/魔数未命中时） | binary → hex |
| `%PDF-` | pdf |
| `PK\x03\x04` / `PK\x05\x06` / `PK\x07\x08` | zip（进 TAB_ZIP） |
| `Rar!\x1a\x07` / `7z\xBC\xAF'\x1C` / `\x1F\x8B` / `BZh` / `\xFD7zXZ` / `ustar`@257 | 压缩 → hex |
| `\x89PNG` / `\xFF\xD8\xFF` / `GIF8` / `BM` / `RIFF…WEBP` | image |
| `RIFF…WAVE` / `fLaC` / `ID3` / `OggS(\x80theora→video)` / `ftyp…`@4 | audio / video |
| `SQLite format 3\x00` | hex |
| `MZ` / `\x7FELF` / `\xCA\xFE\xBA\xBE` / `\xFE\xED\xFA\xCE` / `\xCE\xFA\xED\xFE` | hex |
| `II*\x00` / `MM\x00*` | image（tiff 系，走 sips） |
| `ftypheic`@4 / `8BPS`(psd) / `icns` | image（sips） |
| `\xD0\xCF\x11\xE0`（OLE） | hex（doc/xls/ppt/msi） |
| `wOFF`/`wOF2`/`OTTO`/`ttcf`/`\x00\x01\x00\x00` | 字体 → hex |
| `bplist00` | hex（二进制 plist） |
| `{`+合法 UTF-8 / `<?xml` / `#!` / `-----BEGIN` / `%!PS` / `{\rtf` / `d…:`(bencode) | text |
| UTF-16 BOM（`\xFF\xFE`/`\xFE\xFF`） | text（按 BOM 解码） |
| 其余以可打印字符为主 | text（编码检测：BOM → UTF-8 校验 → GBK 回退，中文日志场景常见） |

---

## 5. 扩展名冲突裁决

| 扩展名 | 冲突 | 现状 | 建议裁决 |
|---|---|---|---|
| `ts` | TypeScript vs MPEG-TS | 🐛 video 先判 → 源码进播放器（router 注释已自知，仅 grep 入口修了） | **TypeScript 优先**（程序员工作台定位；MPEG-TS 仍可用右键/open-with 播放）或嗅探 |
| `m` | ObjC vs MATLAB vs Mathematica | ✅ text | 无需改 |
| `v` | Verilog vs V lang | ➕text | 无冲突 |
| `wav` | 🐛 在 `extensionCategories.video`（fileTypes.ts:11），分类/图标判成视频 | 图标映射侥幸正确，分类错 | ➕移入 audio |
| `m3u` | 🐛 在 audio 分类集，但预览集没有 → unknown | ❌ | ➕text（A10） |
| `dat` | 通用数据 | ✅ hex | 嗅探可翻案成 text |
| `jar/apk/ipa/docx` | zip 包 | ✅ TAB_ZIP | 维持 |
| `1..9`（man page，如 `ls.1`） | 数字扩展名 | ❌ | 嗅探 → 多为 roff 文本 |
| `sub` | 字幕文本 vs 图形字幕 | ❌ | 嗅探 |

---

## 6. 双击决策点（需拍板）

| # | 问题 | 推荐 |
|---|---|---|
| ① | 未注册类型的终极兜底 | **hex**（永不出现"无法预览"；右键已具备"以十六进制查看"通道可复用为默认） |
| ② | 不可解码的视频/音频容器（avi/wmv/flv/wma/ape…） | **仍进播放器**：明确报"容器/编码不支持"，面板内提供一键"以十六进制查看"（未来接 ffmpeg-static 转码） |
| ③ | `.ts` 冲突 | **TypeScript 优先** |
| ④ | 是否本轮新增"用系统默认应用打开"（`shell.openPath`，右键 + 兜底按钮，仅本地设备） | **加**：office/字体/dmg 等没有应用内渲染器的类型尤其需要；远程设备该菜单项隐藏 |
| ⑤ | Markdown 双击默认视图 | 维持 source（QuickLook 场景可考虑默认 rendered，本轮不动） |

---

## 7. 尺寸与设备约束（预览前检查，超限走降级链）

| 类型 | 约束 | 超限行为 |
|---|---|---|
| image | 50MB `IMAGE_PREVIEW_SIZE_LIMIT` | 已有；sips 解码加 maxDim |
| text | 整读 base64；建议新增 8MB 阈值 | >8MB：提示 + 载入前 N KB 截断（或引导 hex/日志分析）；主进程非流式设备另有 32MB 硬守卫 |
| video/audio | **整读**（无流式） | 建议 >200MB 拒载提示（远程设备尤其危险） |
| pdf | 分页 | — |
| zip | 懒解压 | — |
| hex | readRange 分块 | — |
| 设备 | iOS 只读路径、`DeviceCapabilities.maxFileSize`、SYS_OPEN 仅 local | 菜单按能力显隐（沿用 caps 门控惯例） |

---

## 8. 落地方案（下一轮实施，不属本文档范围）

1. **单一注册表**：新建 `src/utils/fileKind.ts`（或扩展 fileTypes.ts）为唯一事实源：
   `Record<ext, { preview: PreviewType; lang?: string; sips?: boolean; sniff?: 'low-confidence' }>`
   + 名称匹配表 + 魔数表。`getPreviewType`/图标分类/两处 detectLanguage/media.ts 全部改为读它；
   删除死代码（preview.ts 的 getTextFileType/getLanguageFromExtension）。
2. 主进程 `ThumbnailService.SUPPORTED_IMAGE_FORMATS` 与 `NATIVE_DECODE_EXTS` 从同一份清单
   生成（可放 `shared/`，主/渲染两侧共用，模式同 shared/types.ts）。
3. `PreviewImageContent` 接 `decodeNativeImage`（服务已在，仅 FileInfoDialog 在用）。
4. `getPreviewType` 支持 FileInfo 级嗅探缓存（8KB 头，按 path+mtime 记忆）。
5. 文档配套：`docs/architecture/2026-08-16-double-click-open-map-design-contract.json`。
