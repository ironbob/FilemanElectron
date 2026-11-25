#!/usr/bin/env bash
# 重新生成 tests/fixtures/apk-resources/*.arsc（resources.arsc 二进制夹具，供 tests/arscResources.test.ts）。
# 依赖 Android SDK 的 aapt / aapt2（build-tools）与 android.jar（platforms）。在仓库根目录运行：
#   bash tests/fixtures/apk-resources/generate.sh [build-tools 版本，默认 35.0.0] [platform，默认 android-35]
#
#   default-only  aapt   仅 values/：app_name = "Default App"，app_name_alias = @string/app_name（TYPE_REFERENCE）
#   zh-rCN        aapt   values（Locale App）/ values-zh-rCN（区域应用）/ values-en（English App）
#   icons         aapt   mipmap-mdpi/hdpi/xhdpi 各一张 PNG + mipmap-anydpi-v26 自适应图标 XML + string-array（复杂条目）
#   sparse        aapt2  40 条默认字符串、values-en 只覆盖 2 条；aapt（v1）与 aapt2 link 都不会生成 SPARSE 表，
#                       须用 `aapt2 optimize --force-sparse-encoding`（字符串池为 UTF-8，与 aapt 的 UTF-16 互补）
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
BUILD_TOOLS="${1:-35.0.0}"
PLATFORM="${2:-android-35}"
AAPT="$SDK/build-tools/$BUILD_TOOLS/aapt"
AAPT2="$SDK/build-tools/$BUILD_TOOLS/aapt2"
ANDROID_JAR="$SDK/platforms/$PLATFORM/android.jar"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for tool in "$AAPT" "$AAPT2" "$ANDROID_JAR"; do
  [ -e "$tool" ] || { echo "not found: $tool" >&2; exit 1; }
done

# manifest <项目目录> <包名> <application 属性> [manifest 子元素]
manifest() {
  cat > "$1/AndroidManifest.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$2" android:versionCode="1" android:versionName="1.0">
  $4
  <application android:label="@string/app_name" $3 />
</manifest>
EOF
}

# 1x1 PNG（指定 RGB）
png() {
  node -e '
    const zlib = require("zlib")
    const [r, g, b] = process.argv.slice(1).map(Number)
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2
    process.stdout.write(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.from([0, r, g, b]))), chunk("IEND", Buffer.alloc(0))]))
  ' "$1" "$2" "$3"
}

aapt_package() { # aapt_package <项目目录>
  (cd "$1" && "$AAPT" package -f --no-crunch -M AndroidManifest.xml -S res -I "$ANDROID_JAR" -F out.apk)
}

# extract <项目目录> <apk 文件名>
extract() {
  local name
  name="$(basename "$1")"
  unzip -p "$1/$2" resources.arsc > "$OUT_DIR/$name.arsc"
  printf '  %-16s %6d bytes\n' "$name.arsc" "$(wc -c < "$OUT_DIR/$name.arsc" | tr -d ' ')"
}

# ── default-only ───────────────────────────────────────────────────────────
mkdir -p "$WORK/default-only/res/values"
cat > "$WORK/default-only/res/values/strings.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Default App</string>
  <string name="app_name_alias">@string/app_name</string>
</resources>
EOF
manifest "$WORK/default-only" com.fileman.arsc.defaultonly '' ''
aapt_package "$WORK/default-only"

# ── zh-rCN ─────────────────────────────────────────────────────────────────
mkdir -p "$WORK/zh-rCN/res/values" "$WORK/zh-rCN/res/values-zh-rCN" "$WORK/zh-rCN/res/values-en"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">Locale App</string>\n</resources>\n' > "$WORK/zh-rCN/res/values/strings.xml"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">区域应用</string>\n</resources>\n' > "$WORK/zh-rCN/res/values-zh-rCN/strings.xml"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">English App</string>\n</resources>\n' > "$WORK/zh-rCN/res/values-en/strings.xml"
manifest "$WORK/zh-rCN" com.fileman.arsc.zhrcn '' ''
aapt_package "$WORK/zh-rCN"

# ── icons ──────────────────────────────────────────────────────────────────
ICONS="$WORK/icons"
mkdir -p "$ICONS/res/mipmap-mdpi" "$ICONS/res/mipmap-hdpi" "$ICONS/res/mipmap-xhdpi" "$ICONS/res/mipmap-anydpi-v26" "$ICONS/res/drawable" "$ICONS/res/values"
png 255 0 0 > "$ICONS/res/mipmap-mdpi/ic_launcher.png"
png 0 255 0 > "$ICONS/res/mipmap-hdpi/ic_launcher.png"
png 0 0 255 > "$ICONS/res/mipmap-xhdpi/ic_launcher.png"
png 1 2 3 > "$ICONS/res/drawable/ic_launcher_background.png"
png 4 5 6 > "$ICONS/res/drawable/ic_launcher_foreground.png"
cat > "$ICONS/res/mipmap-anydpi-v26/ic_launcher.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
EOF
cat > "$ICONS/res/values/strings.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Icon App</string>
</resources>
EOF
cat > "$ICONS/res/values/arrays.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string-array name="icon_hints">
    <item>@mipmap/ic_launcher</item>
    <item>res/not-a-real-file.png</item>
  </string-array>
</resources>
EOF
manifest "$ICONS" com.fileman.arsc.icons 'android:icon="@mipmap/ic_launcher"' ''
aapt_package "$ICONS"

# ── sparse（aapt2 link + optimize --force-sparse-encoding）──────────────────
SPARSE="$WORK/sparse"
mkdir -p "$SPARSE/res/values" "$SPARSE/res/values-en"
{
  printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">Sparse App</string>\n'
  for i in $(seq 0 39); do printf '  <string name="str_%d">Default %d</string>\n' "$i" "$i"; done
  printf '</resources>\n'
} > "$SPARSE/res/values/strings.xml"
cat > "$SPARSE/res/values-en/strings.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="str_7">English 7</string>
  <string name="str_39">English 39</string>
</resources>
EOF
manifest "$SPARSE" com.fileman.arsc.sparse '' '<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35" />'
(cd "$SPARSE" && "$AAPT2" compile --dir res -o flat.zip && "$AAPT2" link -o linked.apk flat.zip --manifest AndroidManifest.xml -I "$ANDROID_JAR" && "$AAPT2" optimize --force-sparse-encoding -o sparse.apk linked.apk)

for dir in "$WORK"/*; do
  if [ "$(basename "$dir")" = sparse ]; then extract "$dir" sparse.apk; else extract "$dir" out.apk; fi
done
