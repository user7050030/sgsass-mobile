#!/usr/bin/env bash
# 三国杀手机助手 构建脚本（bash 版，等价于 build.ps1）
# 用法：bash build.sh [beta|alpha]
# 打包时会自动剥掉脚本 / 页面里的注释（strip_src.py），源码本身不动。
#
# 工具链可用环境变量覆盖：
#   SDK=/path/to/android-sdk  JDK=/path/to/jdk-17  BUILDTOOLS=/path/to/.buildtools
# 外部依赖可用环境变量覆盖（缺失时告警，不中断）：
#   UNIFIED_LOGIN=...  SYNTH_PLUGIN=...  DXC_SCRIPT=...
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS="${BUILDTOOLS:-$ROOT/../.buildtools}"
SDK="${SDK:-$TOOLS/sdk}"
JH="${JDK:-$TOOLS/jdk/jdk-17.0.20.1+1}"
BT="$SDK/build-tools/android-14"
AJAR="$SDK/platforms/android-34/android.jar"
JAVA="$JH/bin/java"
JAVAC="$JH/bin/javac"
[ -x "$JAVA" ] || JAVA="$JH/bin/java.exe"
[ -x "$JAVAC" ] || JAVAC="$JH/bin/javac.exe"
export JAVA_HOME="$JH"
PY="${PYTHON:-python}"

VARIANT="$(echo "${1:-beta}" | tr 'A-Z' 'a-z')"
case "$VARIANT" in
  alpha) LABEL="2.9.5 Alpha"; VCODE=22 ;;
  *)     LABEL="2.9.5 Beta";  VCODE=23 ;;
esac
SLUG="${LABEL// /-}"
OUT_APK="$ROOT/三国杀手机助手-v${SLUG}.apk"

# Git Bash 下 javac/d8 需要 Windows 风格路径，把 /d/xxx 转成 D:/xxx
to_win() { sed -E 's|^/([A-Za-z])/|\1:/|'; }

BUILD="$ROOT/build"
if [ -d "$BUILD" ]; then rm -rf "$BUILD"; fi
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex"

echo "== 0. 资源落到 res/raw =="
cp -f "$ROOT/app/assets/home.html"      "$ROOT/app/res/raw/home.html"
cp -f "$ROOT/app/assets/agreement.html" "$ROOT/app/res/raw/agreement.html"
cp -f "$ROOT/app/assets/panel.js"       "$ROOT/app/res/raw/panel.js"
cp -f "$ROOT/app/assets/gm-shim.js"     "$ROOT/app/res/raw/gm_shim.js"
cp -f "$ROOT/app/assets/jnd_shield.js"  "$ROOT/app/res/raw/jnd_shield.js"
if [ -f "$ROOT/app/assets/poster.jpg" ]; then
  cp -f "$ROOT/app/assets/poster.jpg" "$ROOT/app/res/raw/poster.jpg"
fi

# 外部依赖：有就复制，没有就沿用旧副本，连副本都没有就写空壳（相关功能降级）
install_dep() {
  local src="$1" dst="$2" label="$3"
  if [ -f "$src" ]; then
    cp -f "$src" "$dst"; echo "   + $label"
  elif [ -s "$dst" ]; then
    echo "   ! $label 缺失，沿用已有副本：${dst#$ROOT/}"
  else
    printf '/* %s: 未提供，功能降级 */\n' "$label" > "$dst"
    echo "   ! $label 缺失，已写空壳：${dst#$ROOT/}"
  fi
}
install_dep "${UNIFIED_LOGIN:-$ROOT/../jinnangmiaoji-main/jinnangdai/payload/unified-login.user.js}" \
            "$ROOT/app/res/raw/unified_login.js" "统一登录器"
install_dep "${SYNTH_PLUGIN:-$ROOT/../plugins/sgs-synthesize-plugin.user.js}" \
            "$ROOT/app/res/raw/sgs_synthesize.js" "综合插件"
install_dep "${DXC_SCRIPT:-$ROOT/_lk/daxiaochao.user.js}" \
            "$ROOT/app/res/raw/daxiaochao.js" "打小抄"

if [ ! -f "$ROOT/app/res/raw/app_icon.png" ]; then
  if [ -f "$ROOT/../jinnangmiaoji-main/_iconwork/preview_256.png" ]; then
    cp -f "$ROOT/../jinnangmiaoji-main/_iconwork/preview_256.png" "$ROOT/app/res/raw/app_icon.png"
  else
    echo "   ! 缺少 app_icon.png，跳过（仅影响通知/图标）"
  fi
fi

echo "== 0.2 去注释（$LABEL / versionCode $VCODE）=="
"$PY" "$ROOT/strip_src.py" "$LABEL" "$VCODE"

# raw 用去注释版覆盖到 res 副本；assets 直接用 strip 目录
cp -r "$ROOT/app/res" "$BUILD/res"
cp -f "$BUILD/strip/raw/"* "$BUILD/res/raw/"

echo "== 0.5 JS 语法闸门 =="
"$PY" "$ROOT/check_js.py"

echo "== 1. aapt2 compile =="
"$BT/aapt2.exe" compile --dir "$BUILD/res" -o "$BUILD/res.zip"

echo "== 2. aapt2 link =="
"$BT/aapt2.exe" link -o "$BUILD/base.apk" \
  -I "$AJAR" \
  --manifest "$BUILD/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  -A "$BUILD/strip/assets" \
  --java "$BUILD/gen" \
  --auto-add-overlay \
  "$BUILD/res.zip"

echo "== 3. javac =="
find "$ROOT/app/java" "$BUILD/gen" -name "*.java" | to_win > "$BUILD/sources.txt"
"$JAVAC" -encoding UTF-8 -source 17 -target 17 -classpath "$AJAR" \
  -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "== 4. d8 =="
find "$BUILD/classes" -name "*.class" | to_win > "$BUILD/classes.txt"
tr '\n' ' ' < "$BUILD/classes.txt" > "$BUILD/classes.arg"
"$JAVA" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 \
  --lib "$AJAR" --output "$BUILD/dex" $(cat "$BUILD/classes.arg")
[ -f "$BUILD/dex/classes.dex" ] || { echo "classes.dex missing"; exit 1; }

echo "== 5. classes.dex 入包 =="
"$PY" "$ROOT/inject_dex.py" "$BUILD/base.apk" "$BUILD/dex/classes.dex"

echo "== 6. zipalign =="
"$BT/zipalign.exe" -f 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

echo "== 7. sign =="
# 正式发布请换成自己的密钥，不要用仓库里的调试密钥
KS="${KEYSTORE:-$ROOT/debug.keystore}"
KS_PASS="${KEYSTORE_PASS:-android}"
KEY_PASS="${KEY_PASS:-android}"
"$JAVA" -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KEY_PASS" --out "$OUT_APK" "$BUILD/aligned.apk"

cp -f "$OUT_APK" "$ROOT/三国杀手机助手.apk"
ls -l "$OUT_APK"
echo "OK $LABEL"
