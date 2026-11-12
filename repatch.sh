#!/usr/bin/env bash
# 上机闭环：装应用 → 恢复目标原版 → 面板触发植入 → 导出 → 拉回本地
# 用法：bash repatch.sh <pkg> <原版apk> <输出apk>
set -euo pipefail
PKG="${1:?pkg}"
ORIG="${2:?orig apk}"
OUT="${3:?out apk}"
cd /d/sgs/mobile

echo "== 1. 装应用 =="
bash ad.sh install -r "D:/sgs/mobile/三国杀手机助手.apk" >/dev/null 2>&1 || bash ad.sh install -r "D:/sgs/mobile/三国杀手机助手.apk" 2>&1 | tail -2

echo "== 2. 恢复目标原版 =="
bash ad.sh uninstall "$PKG" >/dev/null 2>&1 || true
bash ad.sh install -r "$ORIG" 2>&1 | tail -1

echo "== 3. 打开面板页 =="
bash ad.sh shell am force-stop com.jinnang.mobile
bash ad.sh shell am start -n com.jinnang.mobile/.MainActivity >/dev/null 2>&1
sleep 4
bash cdp.sh cdp.js --eval "HomeBridge.launch('official'); 'ok'" >/dev/null 2>&1
sleep 4

echo "== 4. 触发植入 =="
bash cdp.sh cdp.js --eval "window.SgsMobileBridge.injStart('$PKG')" 2>&1 | tail -1
for i in $(seq 1 30); do
  sleep 3
  S=$(bash cdp.sh cdp.js --eval "window.SgsMobileBridge.injState()" 2>/dev/null | tail -1)
  case "$S" in
    *'"running\\":true'*) echo "   ... $i" ;;
    *) echo "   $S"; break ;;
  esac
done

echo "== 5. 导出 =="
APK=$(bash cdp.sh cdp.js --eval "JSON.parse(window.SgsMobileBridge.injState()).apk" 2>/dev/null | tail -1 | sed 's/^RES //; s/^"//; s/"$//')
echo "   $APK"
bash cdp.sh cdp.js --eval "window.SgsMobileBridge.injExport('$APK')" 2>&1 | tail -1
sleep 2

echo "== 6. 拉回本地 =="
F=$(bash ad.sh shell ls -t "//sdcard/Download/SGS植入包/" 2>/dev/null | head -1 | tr -d '\r')
echo "   最新: $F"
bash ad.sh pull "//sdcard/Download/SGS植入包/$F" "D:/sgs/mobile/$OUT" 2>&1 | tail -1

echo "== 7. 装植入包 =="
bash ad.sh uninstall "$PKG" >/dev/null 2>&1 || true
bash ad.sh install -r "D:/sgs/mobile/$OUT" 2>&1 | tail -1
