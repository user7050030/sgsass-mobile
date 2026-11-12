#!/usr/bin/env python3
"""AXML 解析器：正确版的 string pool / resmap / 元素属性 dump。"""
import sys, zipfile, struct

NS_URI = 'http://schemas.android.com/apk/res/android'

def read_strings(d, o, hs, sz):
    cnt, styc, flags, strs, stys = struct.unpack_from('<IIIII', d, o + 8)
    base = o + strs
    out = []
    utf8 = bool(flags & 0x100)
    for i in range(cnt):
        off = struct.unpack_from('<I', d, o + hs + i * 4)[0]
        p = base + off
        if utf8:
            n1 = d[p]; p += 1
            if n1 & 0x80:
                n1 = ((n1 & 0x7f) << 8) | d[p]; p += 1
            n2 = d[p]; p += 1
            if n2 & 0x80:
                n2 = ((n2 & 0x7f) << 8) | d[p]; p += 1
            out.append(d[p:p + n2].decode('utf-8', 'replace'))
        else:
            n = struct.unpack_from('<H', d, p)[0]; p += 2
            out.append(d[p:p + n * 2].decode('utf-16-le', 'replace'))
    return out


def parse(d):
    o = 8
    chunks = []
    while o < len(d):
        typ, hs, sz = struct.unpack_from('<HHI', d, o)
        chunks.append((o, typ, hs, sz))
        if sz == 0:
            break
        o += sz
    strings, resmap = [], []
    for (o, typ, hs, sz) in chunks:
        if typ == 0x1:
            strings = read_strings(d, o, hs, sz)
        elif typ == 0x180:
            n = (sz - hs) // 4
            resmap = [struct.unpack_from('<I', d, o + hs + i * 4)[0] for i in range(n)]
    return chunks, strings, resmap


def dump(d):
    chunks, strings, resmap = parse(d)
    def sn(i):
        if i == 0xffffffff:
            return '-'
        if not (0 <= i < len(strings)):
            return '?%d' % i
        rid = resmap[i] if i < len(resmap) else 0
        return '%s%s' % (strings[i], ('[0x%08x]' % rid) if rid else '[noID]')
    print('# chunks:', len(chunks), 'strings:', len(strings), 'resmap:', len(resmap))
    depth = 0
    for (o, typ, hs, sz) in chunks:
        if typ == 0x100:
            p, u = struct.unpack_from('<II', d, o + hs)
            print('ns: prefix=%s uri=%s' % (sn(p), sn(u)))
        elif typ == 0x102:
            ns, name, ast, asz, ac = struct.unpack_from('<IIHHH', d, o + 16)
            print('  ' * depth + '<%s> attrs=%d' % (strings[name] if name < len(strings) else name, ac))
            for k in range(ac):
                ap = o + 16 + ast + k * asz
                ans, an, raw = struct.unpack_from('<III', d, ap)
                tsize, res0, ttype = struct.unpack_from('<HBB', d, ap + 12)
                tdata = struct.unpack_from('<I', d, ap + 16)[0]
                if ttype == 0x03:
                    val = sn(tdata)
                elif ttype == 0x12:
                    val = 'int 0x%x' % tdata
                elif ttype == 0x11:
                    val = 'bool %s' % bool(tdata)
                elif ttype == 0x01:
                    val = 'ref 0x%08x' % tdata
                else:
                    val = 'type0x%02x 0x%x' % (ttype, tdata)
                print('  ' * depth + '   ns=%-4s %-26s raw=%-30s = %s' % (
                    'and' if ans != 0xffffffff else '-', sn(an),
                    sn(raw) if raw != 0xffffffff else '-', val))
            depth += 1
        elif typ == 0x103:
            depth -= 1


if __name__ == '__main__':
    p = sys.argv[1]
    entry = sys.argv[2] if len(sys.argv) > 2 else 'AndroidManifest.xml'
    if p.endswith('.apk'):
        d = zipfile.ZipFile(p).read(entry)
    else:
        d = open(p, 'rb').read()
    dump(d)
