# 三国杀手机助手

把网页版《三国杀》装进一个 Android 壳里，并保留桌面端那套脚本生态。

> 非官方项目，与游卡桌游无任何关联。仅供学习与个人使用，详见文末[免责声明](#免责声明)。

最低系统：Android 7.0（API 24）· 编译目标：API 34

---

## 这是什么

网页版三国杀（`web.sanguosha.com`）是一套完整的 H5 游戏，但在手机上用浏览器打开体验很差：
没有返回键、地址栏挤占屏幕、没法注入脚本、切后台就掉线。

这个项目是一个**原生 WebView 壳**：全屏跑游戏页，把桌面端「锦囊妙计」的渠道入口、登录链路和
脚本注入搬过来，并补上移动端才需要的东西（悬浮球、扫码浮层、网页账密登录、APK 自更新）。

它不是外挂：不读内存、不改协议、不伪造对局数据。所有功能都建立在**页面里已有的脚本能力**
和**正常登录流程**之上。

## 功能

| 分组 | 能力 |
|---|---|
| 渠道 | 官方、Steam、WeGame QQ、4399、哔哩哔哩、OPPO、vivo、华为、小米、荣耀 |
| 扫码登录 | 渠道二维码浮层，扫码成功自动「进入游戏」，失败自动收起不挡操作 |
| 网页登录 | 二维码页左下「网页登入」→ 原生全屏弹层，手动输账号密码；拦 `auth://`、`oauthcallback` 等回调后把凭据交回登录器 |
| 登录态 | 统一登录器用一次性 grant 交付游戏页；一键「移除登录令牌」清掉所有渠道的 Cookie、localStorage 自动登录票、登录器会话 |
| 脚本 | 锦囊妙计运行时（锦囊袋）、体验优化综合插件、打小抄；`GM_*` 兼容层让 userscript 直接跑 |
| 运行时屏蔽 | 不改第三方脚本文件，用 CSS + MutationObserver 隐藏重复入口（频道页签、版本页签、快捷指令合集、面板形态切换），并锁死综合面板为 integrated |
| 桌面助手 | 可拖动悬浮球 + 五页面板（显示／控制／插件／杂项／版本）；锦囊袋开关（开=显示、关=整个隐藏但功能照跑）；截图存图；检查更新（App／锦囊袋／小抄三源） |
| 原生 | APK 热更新（PackageInstaller 会话安装 + SHA-256 校验）、渠道 Cookie 罐、Steam 登录中继与线路轮转、局域网二维码投屏 |

## 架构

```
MainActivity
├── WebView（游戏页）
│   ├── shouldInterceptRequest ──► localAsset：/__jnd/jinnangdai.js 走本地或热更缓存
│   ├── onPageStarted ──────────► 注入统一登录器（带期望 provider）、面板、屏蔽器
│   └── JavascriptInterface ────► HomeBridge（首页）/ ShellBridge（面板）
├── 原生弹层 WebView（网页账密登录）
│   └── shouldOverrideUrlLoading ► 识别回调域名 → window.__JND_WEB_LOGIN__ → UL.webFinish
└── 悬浮球（WindowManager 叠层，位置持久化）
```

几个关键设计：

- **注入而不是改造**：9.9 MB 的第三方运行时不落进代码库，构建时按需打包；运行时从 `localAsset`
  拦截出的虚拟地址取，支持热更覆盖（`filesDir/jinnangdai.runtime.js`）。
- **凭据只走一次性通道**：登录器把 grant 交给游戏页后即失效；渠道入口不依赖浏览器会话，
  所以不会出现「点 Steam 进了上次的 QQ 号」。
- **屏蔽在运行时做**：`jnd_shield.js` 只加 CSS 和观察器，第三方脚本升级不会被覆盖。

## 构建

不是 Gradle 工程，`build.sh` 直接调 `aapt2` → `javac` → `d8` → `zipalign` → `apksigner`，
产物是一个 5 MB 左右的 APK。

### 依赖

| 工具 | 版本 | 说明 |
|---|---|---|
| JDK | 17 | `javac` / `java`（d8、apksigner） |
| Android SDK Build-Tools | 34.0.0 | `aapt2`、`zipalign`、`apksigner.jar`、`lib/d8.jar` |
| Android Platform | android-34 | `android.jar` |
| Python | 3.8+ | dex 入包、语法闸门 |
| Node.js | 18+ | 仅用于 `node --check` 语法校验 |

### 命令

```bash
# 默认 Beta（2.9.5 Beta / versionCode 23）
bash build.sh

# 指定变体
bash build.sh beta
bash build.sh alpha
```

产物：`三国杀手机助手-v2.9.5-Beta.apk`（同时覆盖 `三国杀手机助手.apk`）。

工具链路径通过环境变量覆盖，默认取仓库同级目录：

```bash
SDK=/opt/android-sdk JDK=/usr/lib/jvm/jdk-17 bash build.sh
```

### 构建时做了什么

1. **汇总资源**：`app/assets` 的页面/脚本复制到 `app/res/raw`，外部依赖按 `THIRD_PARTY.md`
   的路径取（缺失会告警，不中断）。
2. **去注释**（`strip_src.py`）：把资源复制到 `build/strip` 后剥注释，源码保持可维护。
   JS 用词法扫描（字符串、模板、正则字面量整体跳过），每个文件剥完跑 `node --check`，
   语法不过自动回退原文；userscript 的 `==UserScript==` 元数据块原样保留（版本页要读 `@version`）。
3. **语法闸门**（`check_js.py`）：把 Java 里拼出来的注入脚本还原成 JS 再校验一遍。
4. **编译打包**：`aapt2 compile/link` → `javac` → `d8` → `inject_dex.py` 把 `classes.dex` 塞进包
   → `zipalign` → `apksigner`。
5. **生成清单**：`build/AndroidManifest.xml` 由脚本按变体写入版本名与 `versionCode`。

签名默认用仓库里的 `debug.keystore`（口令 `android`）。**发布前请换成你自己的密钥**，
否则任何人都能用公开的调试密钥给你的包签名。

## 目录

```
mobile/
├── app/
│   ├── AndroidManifest.xml
│   ├── java/com/jinnang/mobile/
│   │   ├── MainActivity.java    壳、WebView、注入、原生桥、更新
│   │   ├── Accel.java           加速与线路选择
│   │   ├── SteamRelay.java      Steam 登录中继
│   │   └── LanQr.java           局域网二维码投屏
│   ├── assets/
│   │   ├── home.html            首页：渠道选择、协议入口
│   │   ├── start.html           启动页
│   │   ├── agreement.html       用户协议
│   │   ├── panel.js             悬浮球与面板（约 120 KB）
│   │   ├── jinnang.js           锦囊袋装配
│   │   ├── jnd_shield.js        运行时屏蔽
│   │   ├── gm-shim.js           GM_* 兼容层
│   │   └── fonts/               得意黑 + OFL
│   └── res/raw/                 构建期生成，勿手改
├── build.sh                     构建入口（beta / alpha）
├── strip_src.py                 打包期去注释
├── check_js.py                  注入脚本语法闸门
├── inject_dex.py                classes.dex 入包
├── THIRD_PARTY.md               第三方组件与条款
├── licenses/                    第三方许可证副本（随分发附带）
├── CONTRIBUTING.md              参与方式
└── NOTICE / LICENSE
```

## 第三方组件

仓库**不含**锦囊袋运行时、打小抄和游戏本体——它们各有作者与条款，需要自行准备。
综合插件（MIT）可以随仓库分发，其版权与许可声明见
[licenses/sgs-synthesize-plugin.LICENSE](licenses/sgs-synthesize-plugin.LICENSE)。
完整清单、期望路径与注意事项见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 许可证

本项目以 **Apache License 2.0** 发布。

## 免责声明

- 本项目**与游卡桌游无关**，未获其授权、认可或赞助。“三国杀”及相关名称、图形、游戏资源
  的权利归游卡桌游所有。
- 仅用于**学习 Android WebView、userscript 注入与登录流程**等技术目的。使用本项目可能违反
  游戏的用户协议，导致账号被限制或封禁，**风险由使用者自行承担**。
- 项目不提供账号、不代练、不修改对局数据、不绕过付费。第三方脚本的行为由其作者负责。
- 软件按「现状」提供，不附带任何明示或暗示的担保。详见 Apache-2.0 第 7、8 条。
- 如果你是权利人并认为本项目侵犯了你的权益，请提 issue，我会在核实后移除相关内容。
