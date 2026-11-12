#!/bin/sh
# 一次性把 adb forward + cdp 调用做完：沙箱会在命令之间掐掉 adb 连接
ADB="/c/Program Files/Netease/MuMu/nx_main/adb.exe"
"$ADB" connect 127.0.0.1:7555 >/dev/null 2>&1
SOCK=$("$ADB" -s 127.0.0.1:7555 shell cat /proc/net/unix 2>/dev/null | grep -o "webview_devtools_remote_[0-9]*" | head -1 | tr -d '\r')
[ -n "$SOCK" ] && "$ADB" -s 127.0.0.1:7555 forward tcp:9222 localabstract:$SOCK >/dev/null 2>&1
exec node cdp.js "$@"
