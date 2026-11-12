#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成「去注释」的打包资源副本。

游戏页注入的脚本、H5 页面、原生 raw 脚本都带大量中文注释：
这些注释运行时毫无用处，只会撑大 APK、拖慢 readRaw / eval。
这里把它们复制一份到 build/strip/ 并剥掉注释，源码本身保持可维护。

安全网：每个 .js 剥完都用 node --check 复查，语法不过就退回原文件。
"""
import io
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_ASSETS = os.path.join(ROOT, 'app', 'assets')
SRC_RAW = os.path.join(ROOT, 'app', 'res', 'raw')
SRC_MANIFEST = os.path.join(ROOT, 'app', 'AndroidManifest.xml')
OUT = os.path.join(ROOT, 'build', 'strip')

JS_EXT = ('.js', '.mjs')
HTML_EXT = ('.html', '.htm')
CSS_EXT = ('.css',)

CSS_TOKEN = re.compile(
    r'/\*.*?\*/'
    r'|"(?:[^"\\\n]|\\.)*"'
    r"|'(?:[^'\\\n]|\\.)*'",
    re.S,
)

IDCH = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$')


def _comment_to_space(m):
    t = m.group(0)
    if t.startswith('//') or t.startswith('/*'):
        # 保留换行数量，行号/堆栈不至于乱跳
        return ' ' + '\n' * t.count('\n')
    return t


def _regex_allowed(prev):
    """根据前面最后一个有效字符判断 / 是正则开头还是除号。"""
    if not prev:
        return True
    if prev in IDCH:
        return False
    if prev in ')]}\'"`':
        return False
    return True


# userscript 头是「声明」不是注释：@version 被原生拿去显示小抄版本、
# @connect/@grant 也描述权限，删了会让版本页变空白，必须原样保留。
US_HEAD = re.compile(
    r'\A(?:[ \t]*\r?\n)*'          # 允许开头空行
    r'//[ \t]*==UserScript==[^\n]*\n'
    r'.*?'
    r'//[ \t]*==/UserScript==[^\n]*(?:\n|\Z)',
    re.S,
)


def strip_js(s):
    """词法扫描去注释；userscript 元数据头先摘出来，最后原样拼回。"""
    head = ''
    m = US_HEAD.match(s)
    if m:
        head = m.group(0)
        s = s[m.end():]
    return head + _strip_js_body(s)


def _strip_js_body(s):
    """
    真·词法扫描去注释：把字符串 / 模板 / 正则字面量整体跳过，
    只删注释。模板里的 ${...} 表达式按代码处理，注释照删。
    """
    out = []
    i = 0
    n = len(s)
    mode = 'code'          # code | sq | dq | tpl | line | block | regex | regexcls
    prev = ''              # 上一个有效字符（判断正则/除号）
    tpl = []               # 模板 ${} 内部的花括号深度栈
    while i < n:
        c = s[i]
        nxt = s[i + 1] if i + 1 < n else ''
        if mode == 'code':
            if c == '/' and nxt == '/':
                mode = 'line'
                i += 2
                continue
            if c == '/' and nxt == '*':
                mode = 'block'
                i += 2
                continue
            if c == '"' or c == "'":
                mode = 'dq' if c == '"' else 'sq'
                out.append(c)
                prev = c
                i += 1
                continue
            if c == '`':
                mode = 'tpl'
                out.append(c)
                prev = c
                i += 1
                continue
            if c == '/':
                out.append(c)
                mode = 'regex' if _regex_allowed(prev) else 'code'
                prev = '' if mode == 'regex' else '/'
                i += 1
                continue
            if c == '{':
                # 模板 ${...} 里只数花括号；括号不参与，否则 join('') 这种会把深度算错
                if tpl:
                    tpl[-1] += 1
                out.append(c)
                prev = c
                i += 1
                continue
            if c == '[' or c == '(':
                out.append(c)
                prev = c
                i += 1
                continue
            if c == '}':
                if tpl and tpl[-1] == 0:
                    # 模板表达式的收尾 }，回到模板文本
                    tpl.pop()
                    mode = 'tpl'
                    out.append(c)
                    i += 1
                    continue
                if tpl:
                    tpl[-1] -= 1
                out.append(c)
                prev = c
                i += 1
                continue
            if not c.isspace():
                prev = c
            out.append(c)
            i += 1
            continue

        if mode == 'line':
            if c == '\n':
                out.append(c)
                mode = 'code'
            i += 1
            continue

        if mode == 'block':
            if c == '*' and nxt == '/':
                out.append(' ')
                mode = 'code'
                i += 2
                continue
            if c == '\n':
                out.append('\n')
            i += 1
            continue

        if mode == 'sq' or mode == 'dq':
            endq = "'" if mode == 'sq' else '"'
            if c == '\\' and i + 1 < n:
                out.append(s[i:i + 2])
                i += 2
                continue
            out.append(c)
            i += 1
            if c == endq or c == '\n':
                mode = 'code'
                prev = endq
            continue

        if mode == 'tpl':
            if c == '\\' and i + 1 < n:
                out.append(s[i:i + 2])
                i += 2
                continue
            if c == '`':
                out.append(c)
                mode = 'code'
                prev = '`'
                i += 1
                continue
            if c == '$' and nxt == '{':
                out.append('${')
                tpl.append(0)
                mode = 'code'
                prev = '{'
                i += 2
                continue
            out.append(c)
            i += 1
            continue

        # regex / regexcls
        if mode == 'regex' or mode == 'regexcls':
            if c == '\\' and i + 1 < n:
                out.append(s[i:i + 2])
                i += 2
                continue
            out.append(c)
            i += 1
            if mode == 'regex' and c == '[':
                mode = 'regexcls'
                continue
            if mode == 'regexcls':
                if c == ']':
                    mode = 'regex'
                continue
            if c == '/':
                mode = 'code'
                prev = '/'
            elif c == '\n':
                # 未闭合的正则，防跑飞
                mode = 'code'
                prev = ''
            continue

    return ''.join(out)


def strip_css(s):
    return CSS_TOKEN.sub(_comment_to_space, s)


def strip_html(s):
    s = re.sub(r'<!--(?!\[if).*?-->', '', s, flags=re.S)
    s = re.sub(r'(<script\b[^>]*>)(.*?)(</script\s*>)',
               lambda m: m.group(1) + strip_js(m.group(2)) + m.group(3),
               s, flags=re.S | re.I)
    s = re.sub(r'(<style\b[^>]*>)(.*?)(</style\s*>)',
               lambda m: m.group(1) + strip_css(m.group(2)) + m.group(3),
               s, flags=re.S | re.I)
    return s


def node_ok(path):
    try:
        r = subprocess.run(['node', '--check', path], capture_output=True)
        return r.returncode == 0
    except Exception:
        return False


def process(src, dst, label):
    ext = os.path.splitext(src)[1].lower()
    if ext not in JS_EXT + HTML_EXT + CSS_EXT:
        shutil.copy2(src, dst)
        return 0, 0
    raw = io.open(src, encoding='utf-8', errors='surrogateescape').read()
    if ext in JS_EXT:
        out = strip_js(raw)
    elif ext in CSS_EXT:
        out = strip_css(raw)
    else:
        out = strip_html(raw)
    if label:
        out = out.replace('2.9.5 Beta', label).replace('2.9.5 Alpha', label)
    io.open(dst, 'w', encoding='utf-8', errors='surrogateescape', newline='\n').write(out)
    if ext in JS_EXT and not node_ok(dst):
        # 兜底：剥坏了就整份用原文，宁可大一点也不让脚本挂
        shutil.copy2(src, dst)
        if label:
            txt = io.open(dst, encoding='utf-8', errors='surrogateescape').read()
            txt = txt.replace('2.9.5 Beta', label).replace('2.9.5 Alpha', label)
            io.open(dst, 'w', encoding='utf-8', errors='surrogateescape', newline='\n').write(txt)
        print('  [fallback] %s 语法校验失败，保留原文件' % os.path.basename(src))
        return 0, len(raw)
    return len(raw) - len(out), len(raw)


def copytree_strip(src_dir, dst_dir, label):
    saved = total = 0
    count = 0
    for base, _dirs, files in os.walk(src_dir):
        rel = os.path.relpath(base, src_dir)
        target = dst_dir if rel == '.' else os.path.join(dst_dir, rel)
        if not os.path.isdir(target):
            os.makedirs(target)
        for name in sorted(files):
            p = os.path.join(base, name)
            d = os.path.join(target, name)
            a, b = process(p, d, label)
            saved += a
            total += b
            count += 1
    print('  %-6s %2d 个文件，省 %d / %d 字节' % (
        os.path.basename(dst_dir), count, saved, total))


def write_manifest(label, code):
    s = io.open(SRC_MANIFEST, encoding='utf-8').read()
    s = re.sub(r'android:versionName="[^"]*"',
               'android:versionName="%s"' % label, s)
    s = re.sub(r'android:versionCode="\d+"',
               'android:versionCode="%d"' % code, s)
    p = os.path.join(ROOT, 'build', 'AndroidManifest.xml')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    return p


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else '2.9.5 Beta'
    code = int(sys.argv[2]) if len(sys.argv) > 2 else 23
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'assets'))
    os.makedirs(os.path.join(OUT, 'raw'))
    print('== 去注释（%s）==' % label)
    copytree_strip(SRC_ASSETS, os.path.join(OUT, 'assets'), label)
    copytree_strip(SRC_RAW, os.path.join(OUT, 'raw'), label)
    write_manifest(label, code)
    print('  manifest: versionName=%s versionCode=%d' % (label, code))


if __name__ == '__main__':
    main()
