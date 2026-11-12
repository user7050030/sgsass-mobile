import sys
import zipfile

apk, dex = sys.argv[1], sys.argv[2]
with open(dex, "rb") as f:
    data = f.read()

# 以追加模式重写：先读出现有全部条目，再写回并塞入 classes.dex
src = zipfile.ZipFile(apk, "r")
items = [(i, src.read(i.filename)) for i in src.infolist()]
src.close()

with zipfile.ZipFile(apk, "w", zipfile.ZIP_DEFLATED) as out:
    for info, blob in items:
        if info.filename == "classes.dex":
            continue
        zinfo = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zinfo.compress_type = info.compress_type   # 保留原压缩方式（resources.arsc 必须 STORED）
        zinfo.external_attr = info.external_attr
        out.writestr(zinfo, blob)
    zinfo = zipfile.ZipInfo("classes.dex", date_time=(2026, 11, 8, 12, 0, 0))
    zinfo.compress_type = zipfile.ZIP_DEFLATED
    zinfo.external_attr = 0o644 << 16
    out.writestr(zinfo, data)

print("inject ok:", len(data), "bytes")
