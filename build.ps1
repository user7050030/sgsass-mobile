# 锦囊妙计·手机版 APK 构建脚本（手工 aapt2 + javac + d8 + apksigner）
$ErrorActionPreference = "Stop"

$ROOT    = "D:\sgs\mobile"
$TOOLS   = "D:\sgs\.buildtools"
$SDK     = "$TOOLS\sdk"
$BT      = "$SDK\build-tools\android-14"
$AJAR    = "$SDK\platforms\android-34\android.jar"
$JAVA_HM = "$TOOLS\jdk\jdk-17.0.20.1+1"

$env:JAVA_HOME = $JAVA_HM
$env:PATH = "$JAVA_HM\bin;$env:PATH"
$BUILD = "$ROOT\build"
if (Test-Path $BUILD) { Remove-Item -Recurse -Force $BUILD }
New-Item -ItemType Directory -Force -Path "$BUILD\gen","$BUILD\classes","$BUILD\dex" | Out-Null

# 0. 资源：首页 / 协议页 / 面板脚本 / 原版小抄 / 海报 统一落到 res/raw
#    （assets 在部分模拟器上读不到，raw 最稳；模板里的 __POSTER__ 由 Java 换成 base64）
New-Item -ItemType Directory -Force -Path "$ROOT\app\res\raw" | Out-Null
Get-ChildItem "$ROOT\app\res\raw" -Filter "start_page.html" -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item "$ROOT\app\assets\home.html"      "$ROOT\app\res\raw\home.html" -Force
Copy-Item "$ROOT\app\assets\agreement.html" "$ROOT\app\res\raw\agreement.html" -Force
Copy-Item "$ROOT\app\assets\panel.js"       "$ROOT\app\res\raw\panel.js" -Force
Copy-Item "$ROOT\app\assets\gm-shim.js"     "$ROOT\app\res\raw\gm_shim.js" -Force
Copy-Item "$ROOT\app\assets\poster.jpg"     "$ROOT\app\res\raw\poster.jpg" -Force
Copy-Item "D:\sgs\jinnangmiaoji-main\jinnangdai\payload\unified-login.user.js" "$ROOT\app\res\raw\unified_login.js" -Force
Copy-Item "$ROOT\_lk\daxiaochao.user.js"    "$ROOT\app\res\raw\daxiaochao.js" -Force
if (-not (Test-Path "$ROOT\app\res\raw\app_icon.png")) {
    Copy-Item "D:\sgs\jinnangmiaoji-main\_iconwork\preview_256.png" "$ROOT\app\res\raw\app_icon.png" -Force
}
Write-Host "res/raw:" (Get-ChildItem "$ROOT\app\res\raw" | ForEach-Object { $_.Name }) -Separator " "

Write-Host "== 1. aapt2 compile =="
& "$BT\aapt2.exe" compile --dir "$ROOT\app\res" -o "$BUILD\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "== 2. aapt2 link =="
& "$BT\aapt2.exe" link -o "$BUILD\base.apk" `
    -I $AJAR `
    --manifest "$ROOT\app\AndroidManifest.xml" `
    --min-sdk-version 24 --target-sdk-version 34 `
    -A "$ROOT\app\assets" `
    --java "$BUILD\gen" `
    --auto-add-overlay `
    "$BUILD\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "== 3. javac =="
$sources = @(Get-ChildItem "$ROOT\app\java" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
$sources += @(Get-ChildItem "$BUILD\gen" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
& "$JAVA_HM\bin\javac.exe" -encoding UTF-8 -source 17 -target 17 `
    -classpath $AJAR `
    -d "$BUILD\classes" `
    $sources
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "== 4. d8 =="
$classFiles = Get-ChildItem "$BUILD\classes" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& "$BT\d8.bat" --release --min-api 24 --lib $AJAR --output "$BUILD\dex" @($classFiles)
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }
if (-not (Test-Path "$BUILD\dex\classes.dex")) { throw "classes.dex missing" }

Write-Host "== 5. classes.dex 入包 =="
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk = [System.IO.Compression.ZipFile]::Open("$BUILD\base.apk", "Update")
try {
    $entry = $apk.CreateEntry("classes.dex", [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $stream.Write([System.IO.File]::ReadAllBytes("$BUILD\dex\classes.dex"), 0, [System.IO.File]::ReadAllBytes("$BUILD\dex\classes.dex").Length)
    $stream.Close()
} finally { $apk.Dispose() }

Write-Host "== 6. zipalign =="
& "$BT\zipalign.exe" -f 4 "$BUILD\base.apk" "$BUILD\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "== 7. keystore + sign =="
$KS = "$ROOT\debug.keystore"
if (-not (Test-Path $KS)) {
    & "$JAVA_HM\bin\keytool.exe" -genkeypair -v -keystore $KS -storepass android -keypass android `
        -alias jinnang -keyalg RSA -keysize 2048 -validity 10950 `
        -dname "CN=Jinnang Mobile, OU=Dev, O=Dev, L=CN, S=CN, C=CN" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
& "$BT\apksigner.bat" sign --ks $KS --ks-pass pass:android --key-pass pass:android `
    --out "$ROOT\锦囊妙计-手机版.apk" "$BUILD\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Write-Host "OK -> $ROOT\锦囊妙计-手机版.apk"
Get-Item "$ROOT\锦囊妙计-手机版.apk" | Select-Object Name, Length
