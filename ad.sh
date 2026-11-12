#!/bin/sh
# 每次调用都要重建 adb 连接：沙箱会在命令间杀掉 adbd 客户端
ADB="/c/Program Files/Netease/MuMu/nx_main/adb.exe"
"$ADB" start-server >/dev/null 2>&1
"$ADB" connect 127.0.0.1:7555 >/dev/null 2>&1
exec "$ADB" -s 127.0.0.1:7555 "$@"
