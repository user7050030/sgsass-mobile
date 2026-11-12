#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建期 JS 语法闸门。

帧内代理 AGENT_JS 是写在 Java 源码里的字符串拼接，少一个 +、少一个括号，
编译照样过，但注入到渠道服的 bootstrap 脚本末尾就会让整份文件语法错误
（症状：Supports is not defined -> gameFlag is not defined -> 卡「准备加载中」）。
所以每次打包前把 AGENT_JS 还原成 JS，跟 panel.js 一起过一遍 node --check。
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
JAVA = os.path.join(ROOT, 'app', 'java', 'com', 'jinnang', 'mobile', 'MainActivity.java')

ESC = {'n': '\n', 't': '\t', 'r': '\r', '"': '"', '\\': '\\', "'": "'"}


def unescape(s):
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i + 1]
            if n == 'u' and i + 5 < len(s):
                out.append(chr(int(s[i + 2:i + 6], 16)))
                i += 6
                continue
            out.append(ESC.get(n, n))
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def field_block(src, name):
    i = src.index('String %s =' % name)
    lines = src[i:].split('\n')
    buf = []
    for ln in lines:
        buf.append(ln)
        if ln.rstrip().endswith(';'):
            break
    return '\n'.join(buf)


def assemble(block):
    return ''.join(unescape(p) for p in re.findall(r'"((?:[^"\\]|\\.)*)"', block))


def check(path):
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    if r.returncode != 0:
        sys.stderr.write(r.stdout or '')
        sys.stderr.write(r.stderr or '')
        return False
    return True


def main():
    src = io.open(JAVA, encoding='utf-8').read()
    ok = True

    for name in ('AGENT_JS',):
        js = assemble(field_block(src, name))
        out = os.path.join(ROOT, '_build_%s.js' % name.lower())
        io.open(out, 'w', encoding='utf-8', newline='\n').write(js)
        print('== JS 语法检查 %s (%d bytes) ==' % (name, len(js)))
        if not check(out):
            print('!! %s 语法错误，注入后会整页脚本炸掉，终止打包' % name)
            ok = False
        os.remove(out)

    for rel in ('app/assets/panel.js', 'app/assets/gm-shim.js', 'app/assets/jnd_shield.js'):
        p = os.path.join(ROOT, rel)
        print('== JS 语法检查 %s ==' % rel)
        if not check(p):
            print('!! %s 语法错误' % rel)
            ok = False

    if not ok:
        sys.exit(1)
    print('JS 语法检查通过')


if __name__ == '__main__':
    main()
