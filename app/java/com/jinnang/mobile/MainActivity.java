package com.jinnang.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 三国杀手机助手 · 安卓版
 *
 * 结构：首页（本地 HTML，海报 + 三入口） → 游戏页（WebView，注入原版小抄 + 锦囊袋面板）。
 * 首次启动先过协议页（需手打确认语句，禁止粘贴）。
 * 全程免 root：注入等价于桌面客户端的 preload，原生桥等价于 GM 桥与 IPC。
 */
public class MainActivity extends Activity {

    private static final String TAG = "JinnangMobile";
    private static final String PREFS = "jinnang-mobile";
    private static final String KEY_LAST = "lastChannel";
    private static final String KEY_AGREED = "agreed";

    /** 官方与渠道入口：直达各自的完整站点 */
    private static final String[][] ENTRIES = {
            // id, 名称, 网址
            {"official", "官服", "https://web.sanguosha.com/login/x/index"},
            {"4399", "4399", "https://my.4399.com/yxsgs/"},
            {"qq", "QQ 大厅", "https://qqgame.qq.com/webappframe/?appid=10951"},
            {"baidu", "百度", "https://wan.baidu.com/gamedetail?gameId=19793616"},
            {"360", "360", "https://sgsszn.wan.360.cn/game_login.php"},
            {"7k7k", "7K7K", "https://h5.7k7k.com/game/960982bec2f555de44ea43ca8a7ef418"},
    };

    /**
     * 渠道服登录：九个渠道都由统一登录器（unified-login.user.js）发码，
     * 第二列是 provider 名（必须全小写，与脚本内 providers 一致）。
     */
    private static final String[][] LOGINS = {
            {"wegame_qq", "qq", "WeGame QQ"},
            {"wegame_wx", "wx", "WeGame 微信"},
            {"bilibili", "bilibili", "bilibili"},
            {"steam", "steam", "Steam"},
            {"oppo", "oppo", "OPPO"},
            {"xiaomi", "xiaomi", "小米"},
            {"vivo", "vivo", "vivo"},
            {"huawei", "huawei", "华为"},
            {"honor", "honor", "荣耀"},
    };

    private static final String OFFICIAL_LOGIN = "https://web.sanguosha.com/login/x/index";

    private FrameLayout root;
    private WebView shell;      // 首页 / 协议页
    private WebView web;        // 游戏页
    private TextView backBtn;
    private TextView floatBall; // 原生悬浮球
    private boolean ballMoved = false;

    private final java.util.concurrent.ExecutorService pool =
            java.util.concurrent.Executors.newFixedThreadPool(4);
    private final java.util.concurrent.ConcurrentHashMap<String, HttpURLConnection> running =
            new java.util.concurrent.ConcurrentHashMap<>();

    private void deliverGm(final String id, final String json) {
        if (web == null) return;
        web.post(() -> {
            if (web == null) return;
            web.evaluateJavascript("window.__gmResolve&&window.__gmResolve("
                    + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")", null);
        });
    }

    private String scriptPanel = "";
    private String scriptGm = "";
    private String scriptLogin = "";
    private String scriptDxc = "";          // 当前生效的小抄脚本
    private String scriptDxcBuiltin = "";   // 包内自带的那份（恢复内置时用）
    private String scriptSyn = "";          // 体验优化综合插件（红点/发言/特效/台词屏蔽都在里面）
    private String scriptShield = "";       // 锦囊袋入口屏蔽器（不改插件文件，只隐藏频道/快捷指令/面板形态切换）
    private static final String PREF_DXC_SRC = "dxcSrc";
    private String curChannelId = "";
    private String curProvider = "";
    private boolean isLoginChannel = false;

    private ValueCallback<Uri[]> pendingFileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        scriptPanel = readRaw(R.raw.panel);
        scriptGm = readRaw(R.raw.gm_shim);
        scriptLogin = readRaw(R.raw.unified_login);
        scriptDxcBuiltin = readRaw(R.raw.daxiaochao);
        scriptSyn = readRaw(R.raw.sgs_synthesize);
        scriptShield = readRaw(R.raw.jnd_shield);
        scriptDxc = scriptDxcBuiltin;
        loadCustomDxc();

        // 打开 WebView 远程调试：渠道页结构千变万化，没有 CDP 就只能瞎猜。
        // 只在调试时可开（连 USB + chrome://inspect 才能用），正式包也不影响普通用户。
        try { WebView.setWebContentsDebuggingEnabled(true); } catch (Throwable ignored) {}

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0A0D08);

        setContentView(root);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        enterImmersive();

        // 加速器随应用启动（用户可关），启动即预热登录线路。
        // 注意顺序：必须在 create 任何 WebView 之前起本机反代，否则 WebView 的代理已经定死了，
        // 后面的 POST（Steam 的 /oauth/auth）就还是走不到我们这条路上。
        Accel.init(this);

        showShell(!prefs().getBoolean(KEY_AGREED, false));

        // 通知权限：首启就要一次（Android 13+），不给也不影响使用，只是后台没有状态提示
        new android.os.Handler(getMainLooper()).postDelayed(this::ensureNotify, 900);

        Log.i(TAG, "onCreate panel=" + scriptPanel.length()
                + " dxc=" + scriptDxc.length() + " login=" + scriptLogin.length()
                + " accel=" + Accel.enabled());
    }

    /* ============================== 壳页（首页 / 协议） ============================== */

    /** 全屏沉浸：启动器不该有系统状态栏压在海报上 */
    private void enterImmersive() {
        Window w = getWindow();
        w.setStatusBarColor(0x00000000);
        w.setNavigationBarColor(0x00000000);
        applyUiFlags();
    }

    private void applyUiFlags() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyUiFlags();
    }

    /**
     * WebView 构造偶尔会抛（模拟器里注册输入设备监听会 RemoteException，
     * 之后 chromium 直接 FATAL 把进程带走）。同一台机器重试一两次基本就过了。
     */
    private WebView newWebViewSafe() {
        for (int i = 0; i < 3; i++) {
            try {
                return new WebView(this);
            } catch (Throwable t) {
                Log.w(TAG, "new WebView failed try=" + i + " " + t);
                try { Thread.sleep(120L * (i + 1)); } catch (InterruptedException ignored) {}
            }
        }
        return null;
    }

    /** WebView 起不来时的兜底界面：别让人看到白屏或闪退 */
    private void showBootRetry() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(0xFF0A0D08);
        TextView t = new TextView(MainActivity.this);
        t.setText("正在启动…");
        t.setTextColor(0xFFD9C79A);
        t.setTextSize(16);
        t.setGravity(Gravity.CENTER);
        box.addView(t);
        root.addView(box, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        TextView again = new TextView(MainActivity.this);
        again.setText("点这里手动重试");
        again.setTextColor(0xFF9C8A66);
        again.setTextSize(13);
        again.setPadding(0, 24, 0, 0);
        again.setGravity(Gravity.CENTER);
        again.setOnClickListener(v -> {
            root.removeAllViews();
            showShell(!prefs().getBoolean(KEY_AGREED, false));
        });
        box.addView(again);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void showShell(boolean agreement) {
        if (shell == null) {
            shell = newWebViewSafe();
            if (shell == null) {
                // 有些机器（尤其模拟器 / 刚插拔过触摸设备）创建 WebView 会抛
                // RemoteException: registerInputDevicesChangedListener，直接崩在 onCreate。
                // 崩掉对用户来说就是「打开就闪退」，这里退一步：先摆个重试页，稍后再来一次。
                Log.w(TAG, "shell WebView created failed, retry later");
                showBootRetry();
                root.postDelayed(() -> {
                    if (shell == null && !isFinishing()) {
                        root.removeAllViews();
                        showShell(!prefs().getBoolean(KEY_AGREED, false));
                    }
                }, 900);
                return;
            }
            WebSettings s = shell.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setSupportZoom(false);
            s.setBuiltInZoomControls(false);
            s.setTextZoom(100);
            s.setAllowFileAccess(false);
            s.setCacheMode(WebSettings.LOAD_NO_CACHE);
            shell.setBackgroundColor(0xFF0A0D08);
            shell.addJavascriptInterface(new HomeBridge(), "HomeBridge");
            shell.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage m) {
                    Log.i(TAG + "-Home", m.message() + " @" + m.lineNumber());
                    return true;
                }
            });
            shell.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    return true;
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                    try {
                        if (req != null && req.getUrl() != null) {
                            WebResourceResponse r = localAsset(req.getUrl().toString());
                            if (r != null) return r;
                        }
                    } catch (Throwable ignored) {}
                    return null;
                }
            });
            root.addView(shell, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        shell.setVisibility(View.VISIBLE);
        if (web != null) web.setVisibility(View.GONE);
        if (backBtn != null) backBtn.setVisibility(View.GONE);
        if (floatBall != null) floatBall.setVisibility(View.GONE);

        String html = agreement ? buildHtml(R.raw.agreement, false) : buildHtml(R.raw.home, true);
        shell.loadDataWithBaseURL("https://jinnang.local/", html, "text/html", "utf-8", null);
        Log.i(TAG, "showShell agreement=" + agreement + " len=" + html.length());
    }

    /**
     * 内嵌资源：字体等必须打进包里，装机即用，不依赖任何 CDN。
     * 页面用 https://jinnang.local/__jnd/font 取，这里直接吐 assets 里的字节。
     */
    private WebResourceResponse localAsset(String url) {
        if (url == null || url.indexOf("/__jnd/") < 0) return null;
        String name = url.substring(url.indexOf("/__jnd/") + 7);
        int q = name.indexOf('?');
        if (q > 0) name = name.substring(0, q);
        String path;
        String mime;
        if (name.startsWith("font")) { path = "fonts/SmileySans-Oblique.woff2"; mime = "font/woff2"; }
        // 锦囊袋 1.7.3（9.8MB）：这么大的脚本塞不进 evaluateJavascript，
        // 页面里 fetch 这个地址再 eval，走同一套拦截，不出网。
        // 版本页「检查更新」下过新版就存在私有目录，优先用它，没下过才回落到随包 assets。
        else if (name.startsWith("jinnangdai")) {
            File upd = new File(getFilesDir(), "jinnangdai.runtime.js");
            if (upd.isFile() && upd.length() > 1024 * 1024) {
                try {
                    InputStream is = new java.io.FileInputStream(upd);
                    Map<String, String> h = new HashMap<>();
                    h.put("Access-Control-Allow-Origin", "*");
                    h.put("Cache-Control", "no-store");
                    Log.i(TAG, "jinnangdai served from update cache " + upd.length());
                    return new WebResourceResponse("application/javascript", null, 200, "OK", h, is);
                } catch (Exception e) {
                    Log.w(TAG, "update cache open failed: " + e);
                }
            }
            path = "jinnangdai.user.js";
            mime = "application/javascript";
        }
        else return null;
        try {
            InputStream is = getAssets().open(path);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "public, max-age=31536000");
            return new WebResourceResponse(mime, null, 200, "OK", h, is);
        } catch (Exception e) {
            Log.w(TAG, "asset miss " + path);
            return null;
        }
    }

    /** 读模板并把海报换成内联 base64，避免 file:// 资源读不到 */
    private String buildHtml(int rawId, boolean withPoster) {
        String html = readRaw(rawId);
        if (!withPoster) return html;
        String poster = "";
        try {
            InputStream in = getResources().openRawResource(R.raw.poster);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            poster = "data:image/jpeg;base64,"
                    + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            Log.w(TAG, "poster read failed: " + e);
        }
        return html.replace("__POSTER__", poster);
    }

    /* ============================== 游戏页 ============================== */

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void launchChannel(String id) {
        String url = null;
        isLoginChannel = false;
        curProvider = "";

        for (String[] e : ENTRIES) {
            if (e[0].equals(id)) { url = e[2]; break; }
        }
        if (url == null) {
            for (String[] l : LOGINS) {
                if (l[0].equals(id)) {
                    curProvider = l[1];
                    url = OFFICIAL_LOGIN;
                    isLoginChannel = true;
                    break;
                }
            }
        }
        if (url == null) { toast("未知渠道：" + id); return; }

        curChannelId = id;
        lastFrameUrl = "";
        prefs().edit().putString(KEY_LAST, id).apply();

        if ("steam".equals(id) && !Accel.hasProxy() && !Accel.vpnActive()) {
            toast("Steam 走本机反代 + DoH 选路；还不通就在「加速」里填本机代理端口");
        }

        if (web == null) {
            web = createGameWebView();
            if (web == null) {
                toast("页面组件启动失败，请再点一次");
                return;
            }
            root.addView(web, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        web.setVisibility(View.VISIBLE);
        if (shell != null) shell.setVisibility(View.GONE);

        // 进了渠道就不再摆「‹ 首页」占位，回首页走锦囊袋面板头部
        if (backBtn != null) backBtn.setVisibility(View.GONE);
        ensureFloatBall();
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        // 渠道登录走统一登录器换 grant，不靠浏览器会话。这里先把官服/渠道
        // 残留的 sanguosha Cookie 清掉，否则官服号会跟着串进渠道服（Steam 登完变官服号）。
        if (isLoginChannel) {
            clearSgsCookies();
            // 官服登录页的「自动登录」ticket 藏在 localStorage / sessionStorage 里，
            // 光清 Cookie 拦不住它直接跳 x/pc/index.php?ticket=...&isAutoLogin=...
            // 清空时把助手自己的 jnd_ 配置原样放回去，别把用户的设置一起冲掉。
            clearPageStorages(web);
            final String target = url;
            web.postDelayed(() -> { if (web != null) web.loadUrl(target); }, 450);
        } else {
            web.loadUrl(url);
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private WebView createGameWebView() {
        WebView w = newWebViewSafe();
        if (w == null) return null;
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);   // PC 布局整页缩放到屏幕宽度
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);   // 渠道页大量用 window.open（Steam 授权就靠它）
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);

        w.addJavascriptInterface(new GameBridge(), "SgsMobileBridge");
        w.setBackgroundColor(Color.BLACK);

        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                Log.i(TAG, "onPageStarted: " + url);
                frameJsDone = false;   // 新一轮页面，帧内注入额度重置
                injectScripts(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                w.postDelayed(() -> {
                    if (isFinishing() || web == null) return;
                    web.evaluateJavascript("String(!!window.__JND_MOBILE__)", value -> {
                        if (isFinishing() || web == null) return;
                        boolean ok = value != null && value.contains("true");
                        Log.i(TAG, "inject check: panel=" + ok + " url=" + url);
                        if (!ok) injectScripts(url);
                    });
                    if (isLoginChannel && !curProvider.isEmpty() && isLoginFormPage(url)) kickLogin(0);
                    // 用户上次调过的屏幕宽度/缩放，重新载入页面后要接着生效
                    int w0 = prefs().getInt("viewW", 0), z0 = prefs().getInt("viewZoom", 100);
                    if (w0 > 0 || z0 != 100) applyView(w0, z0);
                    web.evaluateJavascript(
                            "(function(){try{var w=innerWidth,h=innerHeight,o=[],p=[[w/2,h/2],[w*0.62,h*0.4],[w/2,h*0.88]];"
                                    + "for(var i=0;i<p.length;i++){var e=document.elementFromPoint(p[i][0],p[i][1]);"
                                    + "o.push(e?(e.tagName+'#'+(e.id||'')+'|'+getComputedStyle(e).pointerEvents):'null');}"
                                    + "o.push('roots='+document.querySelectorAll('#jnd-root').length);"
                                    + "o.push('dxc='+(document.getElementById('createIframe')?1:0));"
                                    + "var fr=document.querySelectorAll('iframe');o.push('ifs='+fr.length);"
                                    + "for(var j=0;j<fr.length&&j<5;j++){var r=fr[j].getBoundingClientRect();"
                                    + "o.push('if'+j+'['+Math.round(r.width)+'x'+Math.round(r.height)+']='+String(fr[j].src||'').slice(0,140));}"
                                    + "return o.join(' ; ')}catch(err){return 'err:'+err}})()",
                            v -> Log.i(TAG, "hit-probe: " + v));
                }, 900);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            /**
             * WebView 的渲染进程被系统回收（内存吃紧、GPU 崩）时，不接管的话
             * 系统会把整个应用一起杀掉 —— 用户看到的就是「又崩了」。
             * 返回 true 表示已处理：拆掉这个 WebView，回到首页让用户重进。
             */
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                Log.w(TAG, "render process gone, crashed=" + (detail != null && detail.didCrash()));
                try { root.removeView(view); } catch (Exception ignored) {}
                try { view.destroy(); } catch (Exception ignored) {}
                if (web == view) web = null;
                panelOpen = false;
                toast("游戏页已重置，请重新进入渠道");
                backToHome();
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                if (scheme.equals("http") || scheme.equals("https")) return false;

                // 真正的登录唤端（微信 / 支付宝 / QQ）放行，其余一律拦下，
                // 否则渠道页的 intent:// market:// 会把人甩到应用商店，看着就像"点了没反应"。
                if (scheme.equals("weixin") || scheme.equals("weixinlite")
                        || scheme.equals("alipays") || scheme.equals("mqqapi")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                if (scheme.equals("intent")) {
                    try {
                        String fb = uri.getQueryParameter("S.browser_fallback_url");
                        if (fb != null && (fb.startsWith("http://") || fb.startsWith("https://"))) {
                            view.loadUrl(fb);
                            return true;
                        }
                        Intent it = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        String pkg = it.getPackage();
                        if (pkg != null && getPackageManager().getLaunchIntentForPackage(pkg) != null) {
                            startActivity(it);
                        } else {
                            toastShort("该界面要打开外部应用，已拦截");
                        }
                    } catch (Exception e) {
                        toastShort("该界面要打开外部应用，已拦截");
                    }
                    return true;
                }
                Log.i(TAG, "blocked scheme=" + scheme + " " + uri);
                toastShort("已拦截外部跳转");
                return true;
            }

            /**
             * 只在「开了代理 + Steam 域名 + GET」时才接管。
             * Steam 在部分网络是直接被掐断的，走代理由原生层代发才能拉起来；
             * 其它站点一律不拦，免得拖慢牌局。
             */
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                try {
                    if (req != null && req.getUrl() != null) {
                        WebResourceResponse local = localAsset(req.getUrl().toString());
                        if (local != null) return local;
                    }
                } catch (Throwable ignored) {}
                try {
                    // 渠道服把牌局装在自家页面的 iframe 里，帧内注入才能拿到 SGSMODULE
                    if (req != null && req.getUrl() != null && !req.isForMainFrame()
                            && "GET".equalsIgnoreCase(req.getMethod())) {
                        String fu = req.getUrl().toString();
                        if (isGameFrameJs(fu)) {
                            WebResourceResponse js = injectGameFrameJs(fu, req);
                            if (js != null) return js;
                        }
                        // 不要把整页 HTML 重发一遍：页面里是内联脚本 + 中文，
                        // 重新编码一次就会把内联脚本弄成乱码，游戏直接起不来
                        // （典型症状就是 gameFlag is not defined / Super expression must ...）。
                        // 帧内注入只走上面那条「挂到首个 bootstrap JS」的路。
                    }
                } catch (Throwable ignored) {}

                try {
                    if (req == null || req.getUrl() == null) return null;
                    String url = req.getUrl().toString();
                    // 以前这里还要求「必须先配好本机代理」才接管，结果国内直连时
                    // WebView 拿着被污染的 DNS 去连，落在黑洞 IP 上干等 25 秒，二维码永远转圈。
                    // 现在改成自己接管：DoH 取真实 A 记录 + 固定 SNI / TLS1.2，
                    // 通不通当场有结论，不再靠用户先开加速器才有一丝机会。
                    if (!Accel.enabled() || !Accel.isSteam(url)) return null;
                    if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
                    // 刚整条线失败过：60 秒内不再拦，让 WebView 立刻报错。
                    // 否则整页子请求每个都要干等 9 秒，登录页直接假死。
                    if (System.currentTimeMillis() - steamFailTs < 60000L) return null;

                    boolean main = req.isForMainFrame();

                    Map<String, String> hdrs = new HashMap<>();
                    try { hdrs.putAll(req.getRequestHeaders()); } catch (Exception ignored) {}
                    String cookie = null;
                    try { cookie = CookieManager.getInstance().getCookie(url); } catch (Exception ignored) {}

                    Accel.Resp r = Accel.fetch(url, hdrs, cookie, 9000, !main);

                    // 主文档的 3xx 不能交给 WebResourceResponse 的状态码（WebView 不认），
                    // 自己写一张 meta refresh 的页把它推过去，导航才留在我们的接管路径上
                    if (main && r.code >= 300 && r.code < 400) {
                        String loc = r.headers.get("Location");
                        if (loc != null && !loc.isEmpty()) return redirectPage(loc);
                    }

                    for (String s : r.setCookies) {
                        try { CookieManager.getInstance().setCookie(url, s); } catch (Exception ignored) {}
                    }
                    if (!r.setCookies.isEmpty()) {
                        try { CookieManager.getInstance().flush(); } catch (Exception ignored) {}
                    }

                    String ct = r.mime == null ? "" : r.mime;
                    String mime = ct.isEmpty() ? "text/html" : ct.split(";")[0].trim();
                    Map<String, String> out = new HashMap<>();
                    for (Map.Entry<String, String> e : r.headers.entrySet()) {
                        String k = e.getKey();
                        if (k.equalsIgnoreCase("Set-Cookie") || k.equalsIgnoreCase("Content-Type")
                                || k.equalsIgnoreCase("Content-Security-Policy")
                                || k.equalsIgnoreCase("X-Frame-Options")) continue;
                        out.put(k, e.getValue());
                    }
                    String cs = Accel.charsetOf(ct);
                    Log.i(TAG, "accel steam " + r.code + " " + (main ? "[main] " : "") + url);
                    return new WebResourceResponse(mime, cs, r.code,
                            r.code >= 400 ? "ERR" : "OK", out,
                            new java.io.ByteArrayInputStream(r.body));
                } catch (Exception e) {
                    steamFailTs = System.currentTimeMillis();
                    Log.i(TAG, "accel miss " + req.getUrl() + " " + e.getMessage());
                    return null;   // 交回 WebView 原生栈（系统 VPN 在跑时它自己就能通）
                }
            }
        });

        /* ================= 帧内注入：渠道服把牌局放在自家页面的 iframe 里 ================= */

        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                          Message resultMsg) {
                try {
                    WebView p = createPopup();
                    if (p == null) return false;
                    WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                    t.setWebView(p);
                    resultMsg.sendToTarget();
                    Log.i(TAG, "popup created");
                    return true;
                } catch (Exception e) {
                    Log.w(TAG, "popup fail " + e);
                    return false;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("audio/*");
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), 9001);
                    pendingFileCallback = cb;
                } catch (Exception e) {
                    cb.onReceiveValue(null);
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // 页面真的要开摄像头时给权限：相机接口是用 canvas 顶上来的，
                // 但页面自己还会再问一次，拒掉会让它直接报「无权限」而不是走我们的流。
                runOnUiThread(() -> {
                    try { request.grant(request.getResources()); } catch (Throwable ignored) {}
                });
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.i(TAG + "-Console", "[" + msg.messageLevel() + "] " + msg.message()
                        + " @" + (msg.sourceId() == null ? "?" : msg.sourceId() + ":" + msg.lineNumber()));
                return true;
            }
        });
        return w;
    }

    /* ============================== 弹窗（window.open） ============================== */

    private WebView popupWeb;
    private TextView popupClose;
    private boolean popupBounced = false;
    private boolean panelOpen = false;
    /** 上一次 Steam 线路整体失败的时间戳：60 秒内不再接管它的请求，免得整页干等 */
    private volatile long steamFailTs = 0L;
    /** 上一次从 iframe 里提上来的游戏页地址，防来回跳 */
    private String lastFrameUrl = "";

    /**
     * 主文档重定向的中转页。
     * WebResourceResponse 里给 302 + Location，WebView 不会自己跳（它只把这个响应当成普通内容），
     * 所以只能自己写一张 0 秒刷新页把浏览器推过去。
     */
    private WebResourceResponse redirectPage(String loc) {
        String esc = loc.replace("&", "&amp;").replace("\"", "&quot;")
                .replace("<", "&lt;").replace(">", "&gt;");
        String html = "<!doctype html><meta charset=\"utf-8\">"
                + "<meta http-equiv=\"refresh\" content=\"0;url=" + esc + "\">"
                + "<style>html,body{margin:0;background:#0b0f0a;color:#cfd8c5;"
                + "font:14px/1.7 system-ui,-apple-system,sans-serif}"
                + "div{padding:44px 26px}a{color:#8fd06a}</style>"
                + "<div>正在转到 Steam 认证页…<br><a href=\"" + esc + "\">没反应就点这里</a></div>";
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        Log.i(TAG, "steam redirect -> " + loc);
        return new WebResourceResponse("text/html", "utf-8", 200, "OK", h,
                new java.io.ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    /** 只有真正的授权页才值得单开一个窗口，其它一律搬回主窗口。 */    private boolean shouldStayInPopup(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        if (Accel.isSteam(u)) return true;
        String[] keep = {"passport.", "open.weixin", "oauth", "connect.qq", "graph.qq",
                "openapi.", "/auth", "login.qq", "weibo.com/oauth", "appleid.apple.com"};
        for (String k : keep) if (u.contains(k)) return true;
        return false;
    }

    /**
     * 渠道页（尤其 Steam 授权）普遍用 window.open 开新窗口。
     * 不支持多窗口时，用户看到的就是「点了没反应」，所以这里给一个真弹窗。
     */
    private WebView createPopup() {
        closePopup();
        WebView p = newWebViewSafe();
        if (p == null) return null;
        WebSettings s = p.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(p, true);
        p.setBackgroundColor(Color.WHITE);

        p.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                if (url == null || popupBounced) return;
                if (!url.startsWith("http://") && !url.startsWith("https://")) return;
                if (shouldStayInPopup(url)) return;

                // 渠道页常把「进游戏」写成 window.open(...)，真给它开个新窗口的话，
                // 游戏会跑在这个没有任何注入的空 WebView 里：没有小抄、没有面板、操作全落空。
                // 这种直接搬回主窗口。
                popupBounced = true;
                final String target = url;
                Log.i(TAG, "popup bounce to main: " + target);
                if (web != null) {
                    web.postDelayed(() -> {
                        closePopup();
                        popupBounced = false;
                        if (web != null) web.loadUrl(target);
                    }, 60);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri uri = req.getUrl();
                String sc = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                if (sc.equals("http") || sc.equals("https")) return false;
                if (sc.equals("weixin") || sc.equals("weixinlite") || sc.equals("alipays") || sc.equals("mqqapi")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }

            @Override
            public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                Log.i(TAG, "popup page: " + url);
            }
        });
        p.setWebChromeClient(new WebChromeClient());

        root.addView(p, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        popupWeb = p;

        TextView x = new TextView(MainActivity.this);
        x.setText("✕ 关闭");
        x.setTextSize(12f);
        x.setTextColor(0xFFF2E3C2);
        x.setBackgroundColor(0xE01B1510);
        x.setPadding(dp(12), dp(7), dp(12), dp(7));
        x.setOnClickListener(v -> closePopup());
        FrameLayout.LayoutParams xp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        xp.gravity = android.view.Gravity.END | android.view.Gravity.TOP;
        xp.topMargin = dp(10);
        xp.rightMargin = dp(12);
        root.addView(x, xp);
        popupClose = x;

        return p;
    }

    private void closePopup() {
        if (popupClose != null) { root.removeView(popupClose); popupClose = null; }
        if (popupWeb != null) {
            root.removeView(popupWeb);
            popupWeb.destroy();
            popupWeb = null;
        }
    }

    /* ========================= 帧内注入（渠道服 iframe 牌局） ========================= */

    /**
     * 4399 / 7K7K / 百度 / 360 / QQ 这些联运服，牌局不在顶层文档里：
     *   顶层（game.4399iw2.com） → my.4399.com/yxsgs/play → web.sanguosha.com/10/pc/xxx_index.php（真牌局）
     * evaluateJavascript 只能打到主帧，所以小抄以前永远拿不到牌局里的 SGSMODULE。
     * 这里在子帧的 HTML 响应里插入 <script>，等价于 document-start 注入。
     */
    private boolean isGameFrameUrl(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        if (!u.startsWith("http")) return false;

        // 只看文档，别把 /10/pc/libs/*.js 那些资源也代拉一遍
        String path = u;
        int q = path.indexOf('?');
        if (q > 0) path = path.substring(0, q);
        int slash = path.lastIndexOf('/');
        String last = slash >= 0 ? path.substring(slash + 1) : path;
        boolean doc = last.isEmpty() || last.contains(".php") || last.contains(".html") || last.contains(".htm");
        if (!doc) return false;

        return u.contains("sanguosha.com/10/pc/")
                || u.contains("sanguosha.com/10th/")
                || u.contains("sanguosha.com/x/")
                || u.contains("4399iw2.com/yxxsgs")
                || u.contains("qqopenapp.com/pc/");
    }

    private String framePayloadCache;

    /** 帧内要跑的 JS：定位代理 + 原版小抄，只跑一次 */
    private String frameCode() {
        if (framePayloadCache != null) return framePayloadCache;
        String dxc = scriptDxc.replace("</script", "<\\/script");
        framePayloadCache = "window.__JND_CHILD__=1;window.__JND_DXC_AGENT__=1;\n"
                + AGENT_JS + "\n"
                + "if(!window.__JND_DXC_ON__){window.__JND_DXC_ON__=1;\n"
                + "try{\n" + dxc + "\n}catch(e){try{console.log('DXCFRAME '+(e&&e.message));}catch(_){}}\n}\n";
        return framePayloadCache;
    }

    private String frameHtmlPayload() {
        return "<script>/*JND-FRAME*/\n" + frameCode() + "</script>";
    }

    /**
     * 4399 首帧的文档请求有时不经过 WebViewClient（页面自己 document.write / 从缓存直出），
     * 但它里面的 JS 一定走我们这层。于是把载荷挂在帧内第一个 bootstrap JS 上，
     * 这比拦截 HTML 稳，也不像「把 iframe 提成顶层」那样会把登录态搞丢。
     * 第 0 项是主锚点，每次加载都注（帧内换页/重登后还得有小抄）；
     * 其余只是主锚点缺席时的兜底，一轮页面只注一次，免得白扛几百 KB。
     */
    private static final String[] FRAME_JS_KEYS = {
            "/10/pc/libs/min/es-checker.js",
            "/10/pc/versionConf.js",
            "/10/pc/libs/min/first.min.js",
            "/10/pc/libs/min/channel.min.js"
    };

    private volatile boolean frameJsDone = false;

    /** 返回命中的锚点下标，-1 表示不是注入目标 */
    private int gameFrameJsKind(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        int q = u.indexOf('?');
        String path = q > 0 ? u.substring(0, q) : u;
        if (!path.endsWith(".js")) return -1;
        if (!(u.contains("sanguosha.com/") || u.contains("4399iw2.com/") || u.contains("qqopenapp.com/"))) {
            return -1;
        }
        for (int i = 0; i < FRAME_JS_KEYS.length; i++) {
            if (path.endsWith(FRAME_JS_KEYS[i])) return i;
        }
        return -1;
    }

    private boolean isGameFrameJs(String url) {
        return gameFrameJsKind(url) >= 0;
    }

    private WebResourceResponse injectGameFrameJs(String url, WebResourceRequest req) {
        int kind = gameFrameJsKind(url);
        if (kind < 0) return null;
        boolean primary = kind == 0;
        synchronized (MainActivity.this) {
            if (!primary && frameJsDone) return null;
            try {
                Map<String, String> hdrs = new HashMap<>();
                try { hdrs.putAll(req.getRequestHeaders()); } catch (Exception ignored) {}
                hdrs.remove("Accept-Encoding");
                String cookie = null;
                try { cookie = CookieManager.getInstance().getCookie(url); } catch (Exception ignored) {}

                Accel.Resp r = Accel.fetch(url, hdrs, cookie, 15000);
                if (r.code != 200 || r.body == null || r.body.length == 0
                        || r.body.length > 4 * 1024 * 1024) {
                    Log.i(TAG, "frame js pass " + r.code + " " + url);
                    return null;
                }
                String cs = Accel.charsetOf(r.mime);
                // 不要在字符串上做一次 decode→encode：源文件是 UTF-8、而响应头不带 charset 时，
                // 按 ISO-8859-1 解一次就把每个汉字拆成两字节，脚本里的中文全变乱码，
                // 严重点直接整份文件语法错误（表现就是 gameFlag is not defined、卡在「准备加载中」）。
                // 直接按字节把载荷接在原文后面，原文一个字节都不动。
                byte[] tail = ("\n;\n" + frameCode() + "\n").getBytes(cs);
                byte[] out = new byte[r.body.length + tail.length];
                System.arraycopy(r.body, 0, out, 0, r.body.length);
                System.arraycopy(tail, 0, out, r.body.length, tail.length);
                frameJsDone = true;
                Log.i(TAG, "frame js inject " + url + " -> " + out.length + " cs=" + cs);
                return new WebResourceResponse("application/javascript", cs, 200, "OK",
                        new HashMap<>(), new java.io.ByteArrayInputStream(out));
            } catch (Throwable t) {
                Log.w(TAG, "frame js fail " + url + " " + t);
                return null;
            }
        }
    }

    private WebResourceResponse injectGameFrame(String url, WebResourceRequest req) {
        try {
            Map<String, String> hdrs = new HashMap<>();
            try { hdrs.putAll(req.getRequestHeaders()); } catch (Exception ignored) {}
            hdrs.remove("Accept-Encoding");
            String cookie = null;
            try { cookie = CookieManager.getInstance().getCookie(url); } catch (Exception ignored) {}

            Accel.Resp r = Accel.fetch(url, hdrs, cookie, 15000);
            if (r.code != 200 || r.body == null || r.body.length == 0
                    || r.body.length > 6 * 1024 * 1024) {
                Log.i(TAG, "frame pass " + r.code + " " + url);
                return null;
            }
            String ct = r.mime == null ? "" : r.mime.toLowerCase(Locale.ROOT);
            if (!ct.contains("html")) return null;

            String cs = Accel.charsetOf(r.mime);
            String html = new String(r.body, cs);
            String low = html.toLowerCase(Locale.ROOT);
            if (low.contains("/*jnd-frame*/")) return null;      // 已经注过，别叠加

            int afterHead = -1;
            int hp = low.indexOf("<head");
            if (hp >= 0) {
                int gt = low.indexOf('>', hp);
                if (gt > 0) afterHead = gt + 1;
            }
            String out = afterHead > 0
                    ? html.substring(0, afterHead) + frameHtmlPayload() + html.substring(afterHead)
                    : frameHtmlPayload() + html;

            for (String s : r.setCookies) {
                try { CookieManager.getInstance().setCookie(url, s); } catch (Exception ignored) {}
            }
            Log.i(TAG, "frame inject " + url + " -> " + out.length());
            return new WebResourceResponse("text/html", cs, 200, "OK",
                    new HashMap<>(), new java.io.ByteArrayInputStream(out.getBytes(cs)));
        } catch (Throwable t) {
            Log.w(TAG, "frame inject fail " + url + " " + t);
            return null;
        }
    }

    /**
     * 帧内小抄的定位代理：缩放/贴边参数由顶层面板用 postMessage 下发，
     * 反过来把自己的牌局快照（阶段/可出杀/各家手牌数）回传给顶层。
     * 不走 CSS 继承，全部写在元素行内，游戏自己改样式也压得住。
     */
    private static final String AGENT_JS =
            "(function(){if(window.__JND_AGENT_ON__)return;window.__JND_AGENT_ON__=1;\n"
                    + "var NATIVE=230,cfg={open:true,ratio:0.44,side:'free',edge:'top',bigTouch:true},got=false,key='';\n"
                    + "function el(){return document.getElementById('createIframe');}\n"
                    // 视口一律按 visualViewport 算：渠道服的牌局页常常自己带一层缩放
                    // （固定 viewport 宽度 / body zoom），innerWidth 比真正看得见的宽度大一倍多，
                    // 拿它当基准小抄就被放大成一张盖满屏幕的半透明板。
                    + "function vp(){var v=window.visualViewport;\n"
                    + "if(v&&v.width>80&&v.height>80)return {w:v.width,h:v.height};\n"
                    + "return {w:document.documentElement.clientWidth||window.innerWidth||0,\n"
                    + "h:document.documentElement.clientHeight||window.innerHeight||0};}\n"
                    + "function num(v){v=Number(v);return isFinite(v)?v:0;}\n"
                    + "function put(s,k,v){s.setProperty(k,v,'important');}\n"
                    // 读出原版当前的位移和缩放，下面只替换缩放那一半
                    + "function mat(p){var x=0,y=0,s=1;try{var m=new DOMMatrix(getComputedStyle(p).transform);\n"
                    + "x=m.e||0;y=m.f||0;s=Math.sqrt(m.a*m.a+m.b*m.b)||1;}catch(_){}\n"
                    + "return {x:x,y:y,s:s};}\n"
                    // 原版小抄「收起」时只剩一条 34px 的标题栏，容器高度 auto。
                    // 这里如果照样铺满整屏，就是一张空白半透明板——看着像乱跳还挡牌。
                    + "function folded(){var c=document.getElementById('title-collapsed');\n"
                    + "if(!c)return false;try{return getComputedStyle(c).display!=='none'&&c.offsetHeight>0;}catch(_){return false;}}\n"
                    // 收起态保留原版自己的「小抄」条（用户认这个样子），只钉位置、顶实底、管拖动；
                    // 原版 #header 的拖动手势是「停靠侧栏」，收起条上不放行（一拖就被停靠到右边）。
                    + "var barDrag=null,barSwallow=function(ev){ev.preventDefault();ev.stopPropagation();};\n"
                    // 位置走样式表 !important：原版的拖拽/停靠会随时往行内写普通 transform，
                    // 同一槽位会把行内 !important 顶掉（乱跳/错位）；样式表 !important 压得住
                    + "var posEl=null;\n"
                    + "function posCss(rule){if(!posEl||!posEl.isConnected){posEl=document.getElementById('jnd-dxc-pos-css');\n"
                    + "if(!posEl){posEl=document.createElement('style');posEl.id='jnd-dxc-pos-css';(document.head||document.documentElement).appendChild(posEl);}}\n"
                    + "if(posEl.textContent!==rule)posEl.textContent=rule;}\n"
                    + "function posRule(mode,x,y,w){return '#createIframe{left:0!important;top:0!important;right:auto!important;bottom:auto!important;transform-origin:0 0!important;transform:translate('+Math.round(x)+'px,'+Math.round(y)+'px)!important;'+(mode==='bar'?'touch-action:none!important;':'')+(mode==='exp'?'width:'+Math.round(w)+'px!important;':'')+'}';}\n"
                    + "function bindBar(p){if(p.__jndBar)return;p.__jndBar=1;\n"
                    + "p.addEventListener('touchstart',function(e){if(cfg.open&&folded()){try{e.stopPropagation();}catch(_){}}},true);\n"
                    + "p.addEventListener('mousedown',function(e){if(cfg.open&&folded()){try{e.stopPropagation();}catch(_){}}},true);\n"
                    + "p.addEventListener('pointerdown',function(e){if(!cfg.open||!folded())return;if(e.pointerType==='mouse'&&e.button!==0)return;\n"
                    + "var r=p.getBoundingClientRect();barDrag={id:e.pointerId,x0:e.clientX,y0:e.clientY,px:p.__jndXY?p.__jndXY.x:0,py:p.__jndXY?p.__jndXY.y:0,w:Math.max(60,r.width||84),h:Math.max(28,r.height||34),moved:0,cap:0};},true);\n"
                    + "p.addEventListener('pointermove',function(e){if(!barDrag||e.pointerId!==barDrag.id)return;\n"
                    + "var dx=e.clientX-barDrag.x0,dy=e.clientY-barDrag.y0,mv=Math.abs(dx)+Math.abs(dy);if(mv>barDrag.moved)barDrag.moved=mv;\n"
                    + "if(barDrag.moved<6)return;if(!barDrag.cap){barDrag.cap=1;try{p.setPointerCapture(e.pointerId);}catch(_){}}\n"
                    + "try{e.preventDefault();}catch(_){}var v=vp();\n"
                    + "var nx=Math.max(0,Math.min(barDrag.px+dx,Math.max(0,v.w-barDrag.w))),ny=Math.max(0,Math.min(barDrag.py+dy,Math.max(0,v.h-barDrag.h)));\n"
                    + "p.__jndXY={x:nx,y:ny};posCss(posRule('bar',nx,ny,0));},true);\n"
                    + "function barEnd(e){if(!barDrag||(e&&e.pointerId!==barDrag.id))return;var d=barDrag;barDrag=null;\n"
                    + "if(d.cap){try{p.releasePointerCapture(d.id);}catch(_){}}\n"
                    // 收起条上任意一点都算「展开」：原版只有右端小箭头可点，用户会点整条；
                    // 等 60ms 避开 toggle-me 自己的 click，防「展开又被收回」
                    + "if(d.moved<6){setTimeout(function(){if(!cfg.open||!folded())return;\n"
                    + "var tm=document.getElementById('toggle-me');if(tm){try{tm.click();}catch(_){}}},60);return;}\n"
                    + "try{localStorage.setItem('jndBarPos',JSON.stringify({x:Math.round(p.__jndXY.x),y:Math.round(p.__jndXY.y)}));}catch(_){}\n"
                    + "try{document.addEventListener('click',barSwallow,true);setTimeout(function(){document.removeEventListener('click',barSwallow,true);},360);}catch(_){}}\n"
                    + "p.addEventListener('pointerup',barEnd,true);p.addEventListener('pointercancel',barEnd,true);}\n"
                    // 自由档展开态的自由拖动：原版 #header 的拖拽是受限手势——横向最多挪
                    // 155px、拖远就强制停靠成右侧栏（用户看到的「红线、跨不过去、错位」）。
                    // 自由档把它的手势按死，位置整个归我们：left/top 0 + translate。
                    + "var expDrag=null;\n"
                    + "function bindExpDrag(p){if(p.__jndExpDrag)return;p.__jndExpDrag=1;\n"
                    + "function free(){return cfg.open&&!folded()&&cfg.side!=='left'&&cfg.side!=='right';}\n"
                    + "function block(e){if(free()){try{e.stopPropagation();}catch(_){}}}\n"
                    + "p.addEventListener('touchstart',block,true);p.addEventListener('mousedown',block,true);\n"
                    + "p.addEventListener('pointerdown',function(e){if(!free())return;\n"
                    + "var hd=document.getElementById('header');if(!hd||!hd.contains(e.target))return;\n"
                    + "if(e.pointerType==='mouse'&&e.button!==0)return;\n"
                    + "expDrag={id:e.pointerId,x0:e.clientX,y0:e.clientY,px:p.__jndXY?p.__jndXY.x:0,py:p.__jndXY?p.__jndXY.y:0,w:Math.max(120,p.getBoundingClientRect().width||NATIVE),moved:0,cap:0};},true);\n"
                    + "p.addEventListener('pointermove',function(e){if(!expDrag||e.pointerId!==expDrag.id)return;\n"
                    + "var dx=e.clientX-expDrag.x0,dy=e.clientY-expDrag.y0,mv=Math.abs(dx)+Math.abs(dy);if(mv>expDrag.moved)expDrag.moved=mv;\n"
                    + "if(expDrag.moved<6)return;if(!expDrag.cap){expDrag.cap=1;try{p.setPointerCapture(e.pointerId);}catch(_){}}\n"
                    + "try{e.preventDefault();}catch(_){}var v=vp();\n"
                    + "var nx=Math.max(0,Math.min(expDrag.px+dx,Math.max(0,v.w-expDrag.w))),ny=Math.max(0,Math.min(expDrag.py+dy,Math.max(0,v.h-44)));\n"
                    + "p.__jndXY={x:nx,y:ny};posCss(posRule('exp',nx,ny,expDrag.w));},true);\n"
                    + "function expEnd(e){if(!expDrag||(e&&e.pointerId!==expDrag.id))return;var d=expDrag;expDrag=null;\n"
                    + "if(d.cap){try{p.releasePointerCapture(d.id);}catch(_){}}\n"
                    + "if(d.moved<6)return;\n"
                    + "try{localStorage.setItem('jndBarPos',JSON.stringify({x:Math.round(p.__jndXY.x),y:Math.round(p.__jndXY.y)}));}catch(_){}\n"
                    + "try{document.addEventListener('click',barSwallow,true);setTimeout(function(){document.removeEventListener('click',barSwallow,true);},360);}catch(_){}}\n"
                    + "p.addEventListener('pointerup',expEnd,true);p.addEventListener('pointercancel',expEnd,true);}\n"
                    + "function apply(){var p=el();if(!p)return false;var v=vp(),w=v.w,h=v.h;if(!w||!h)return false;\n"
                    + "var side=cfg.side==='left'?'left':(cfg.side==='right'?'right':'free'),edge=cfg.edge==='bottom'?'bottom':'top',ratio=num(cfg.ratio);\n"
                    // 基准取「短边」：横屏时若按宽度算，一条「小抄」能横到半屏；
                    // 150 是下限，再窄下去收起态那条标题栏只剩十几像素高，手指点不准。
                    + "var base=Math.min(w,h)||w||360;\n"
                    + "var target=ratio>0.02?Math.max(150,Math.round(base*ratio)):NATIVE,z=target/NATIVE,st=p.style;\n"
                    + "put(st,'position','fixed');\n"
                    + "put(st,'z-index','2147481000');\n"
                    + "put(st,'visibility',cfg.open?'visible':'hidden');\n"
                    + "put(st,'pointer-events',cfg.open?'auto':'none');\n"
                    + "if(!cfg.open){put(st,'visibility','hidden');put(st,'pointer-events','none');posCss('');return true;}\n"
                    + "if(folded()){\n"
                    + "(p.__jndWrote||[]).forEach(function(k){st.removeProperty(k);});\n"
                    + "var v2=vp(),pos=null;try{pos=JSON.parse(localStorage.getItem('jndBarPos')||'');}catch(_){}\n"
                    + "var r0=p.getBoundingClientRect(),bw=Math.max(60,r0.width||84),bh=Math.max(28,r0.height||34);\n"
                    + "var x=pos&&pos.x>=0?pos.x:Math.round(v2.w-96),y=pos&&pos.y>=0?pos.y:Math.round(v2.h*0.52);\n"
                    + "x=Math.max(0,Math.min(x,Math.max(0,v2.w-bw)));y=Math.max(0,Math.min(y,Math.max(0,v2.h-bh)));\n"
                    + "p.__jndXY={x:x,y:y};\n"
                    + "put(st,'visibility','visible');put(st,'pointer-events','auto');\n"
                    // 原版收起是 0.6 半透明，浅色牌桌上像「一块东西」；顶成实心才干净
                    + "put(st,'opacity','1');put(st,'background','rgba(56,44,34,.97)');put(st,'border-radius','9px');\n"
                    + "put(st,'box-shadow','0 0 0 1px rgba(226,196,138,.5) inset,0 5px 14px rgba(0,0,0,.4)');put(st,'overflow','hidden');\n"
                    // 位置走样式表（含 touch-action:none，浏览器不抢手势）
                    + "posCss(posRule('bar',x,y,0));\n"
                    + "p.__jndWrote=['opacity','background','border-radius','box-shadow','overflow'];\n"
                    + "bindToggle();bindBar(p);return true;}\n"
                    + "put(st,'opacity','1');put(st,'border-radius','0');\n"
                    + "put(st,'box-shadow','none');put(st,'background','transparent');\n"
                    + "if(side==='free'){\n"
                    // 「自由」：位置整个归我们（left/top 0 + translate 记下的位置）。
                    // 先清掉贴边/收起写过的行内属性（只清记过账的，不伤原版自己的）。
                    + "(p.__jndWrote||[]).forEach(function(k){st.removeProperty(k);});\n"
                    + "var ex=p.__jndXY?p.__jndXY.x:-1,ey=p.__jndXY?p.__jndXY.y:-1;\n"
                    + "if(!(ex>=0)||!(ey>=0)){ex=0;ey=Math.round(h*0.03);}\n"
                    + "var r0=p.getBoundingClientRect();\n"
                    + "ex=Math.max(0,Math.min(ex,Math.max(0,w-Math.max(120,r0.width||NATIVE))));\n"
                    + "ey=Math.max(0,Math.min(ey,Math.max(0,h-44)));\n"
                    + "p.__jndXY={x:ex,y:ey};\n"
                    // 位置走样式表（含宽度锁：原版自己的样式表在宽屏上会把面板铺到近八成屏宽）
                    + "posCss(posRule('exp',ex,ey,Math.round(NATIVE*z)));\n"
                    // 标题栏锁 touch-action：不锁的话浏览器接管手势去滚动，拖不到两下就断
                    + "var hd0=document.getElementById('header');if(hd0){hd0.style.setProperty('touch-action','none','important');}\n"
                    + "p.__jndWrote=[];\n"
                    + "bindExpDrag(p);\n"
                    + "}else{\n"
                    + "posCss('');\n"
                    // 留安全边距：贴死 0 时收起那条「小抄」会被游戏顶栏 / 底栏压掉一半
                    + "put(st,'top',edge==='top'?Math.round(h*0.055)+'px':'auto');\n"
                    + "put(st,'bottom',edge==='bottom'?Math.round(h*0.075)+'px':'auto');\n"
                    + "put(st,'left',side==='left'?'0':'auto');put(st,'right',side==='right'?'0':'auto');\n"
                    // 位置和缩放都由我们定：原版会用自己的 translate 把面板拖到屏幕中间/滑出屏幕，
                    // 谁写谁的就打架（用户看到的就是「乱跳、跑到中间」）。总开关开着就一直钉在边上。
                    + "put(st,'transform-origin',edge+' '+side);\n"
                    + "put(st,'transform','scale('+z.toFixed(4)+')');\n"
                    + "put(st,'width',NATIVE+'px');put(st,'height',Math.ceil(h/z)+'px');put(st,'max-height','none');\n"
                    // 记下这轮写了哪些行内属性，切回「自由」时只清这些，不伤原版自己的
                    + "p.__jndWrote=['top','bottom','left','right','transform','transform-origin','width','height','max-height'];\n"
                    + "}\n"
                    + "bindToggle();cz=z;fat();p.__jndOn=1;return true;}\n"
                    // 收起态就是那一条「小抄」横条。原版标题栏 24px 高，乘上缩放后点不中，
                    // 这里按「缩放后视觉高度 40px」反算原生高度（行内 important，压得过原版样式）。
                    + "var cz=1;\n"
                    + "function fat(){if(cfg.bigTouch===false)return;var z=cz>0?cz:1;\n"
                    + "var fh=Math.round(Math.min(78,40/z));\n"
                    + "var tc=document.getElementById('title-collapsed');\n"
                    + "if(tc){tc.style.setProperty('min-height',fh+'px','important');\n"
                    + "tc.style.setProperty('align-items','center','important');}\n"
                    + "var tm=document.getElementById('toggle-me');\n"
                    + "if(tm){tm.style.setProperty('min-height',fh+'px','important');\n"
                    + "tm.style.setProperty('position','relative','important');}\n"
                    + "var tx=document.getElementById('title-main');\n"
                    + "if(tx){tx.style.setProperty('font-size',Math.min(30,Math.max(19,Math.round(13/z)))+'px','important');}}\n"
                    // 展开态点「收起」失灵的兜底：laya 画布会在触摸序列里把 pointer 收走，
                    // 浏览器合成的 click 落点变成画布，按钮 onclick 收不到（实测复现）。
                    // pointerup 后 60ms 没等到按钮自己的 click 就手动补一次（程序 click 必达）。
                    + "var tmDx=0,tmDy=0,tmFired=false;\n"
                    + "function bindToggle(){var tm=document.getElementById('toggle-me');\n"
                    + "if(!tm||tm.__jndTap)return;tm.__jndTap=1;\n"
                    + "tm.addEventListener('pointerdown',function(e){tmDx=e.clientX;tmDy=e.clientY;tmFired=false;},true);\n"
                    + "tm.addEventListener('click',function(){tmFired=true;},true);\n"
                    + "tm.addEventListener('pointerup',function(e){\n"
                    + "if(Math.abs(e.clientX-tmDx)>14||Math.abs(e.clientY-tmDy)>14)return;\n"
                    + "setTimeout(function(){if(!tmFired){try{tm.click();}catch(_){}}},60);},true);}\n"
                    // 房间座位菜单是 hover 才弹的，触屏点不出来：按下画布瞬间合成一次
                    // 「鼠标挪到按下点」的 move，hover 效果先出现；点别处鼠标跟着挪走，菜单关。
                    + "function tapHover(){var cv=document.getElementById('layaCanvas')||document.querySelector('canvas');\n"
                    + "if(!cv||cv.__jndHover)return;cv.__jndHover=1;\n"
                    + "cv.addEventListener('pointerdown',function(e){\n"
                    + "try{var o={bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY,pointerId:1,isPrimary:true,pointerType:'mouse',button:0};\n"
                    + "cv.dispatchEvent(new PointerEvent('pointermove',o));\n"
                    + "cv.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY}));\n"
                    + "cv.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY}));\n"
                    + "}catch(_){}},true);}\n"
                    + "function diag(p){try{var r=p.getBoundingClientRect(),c=getComputedStyle(p);\n"
                    + "console.log('JNDDXC fold='+(folded()?1:0)+' vis='+c.visibility"
                    + "+' op='+c.opacity+' h='+p.style.height+' rect='+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+','+Math.round(r.height));}catch(_){}}\n"
                    + "function game(){var g={phrase:'',sha:'',seats:[]};\n"
                    + "var ph=document.getElementById('phrase'),sh=document.getElementById('sha');\n"
                    + "if(ph)g.phrase=(ph.textContent||'').trim().slice(0,80);\n"
                    + "if(sh)g.sha=(sh.textContent||'').trim().slice(0,40);\n"
                    + "for(var i=1;i<=8;i++){var b=document.getElementById(i);if(!b)continue;var n=0,nm='';\n"
                    + "try{n=b.querySelectorAll(':scope > .shoupai, :scope > .markedCard > .shoupai').length;}catch(_){}\n"
                    + "try{nm=b.style.getPropertyValue('--No-content')||'';}catch(_){}\n"
                    + "g.seats.push({i:i,n:n,name:nm?nm.replace(/\\|/g,' '):''});}return g;}\n"
                    + "function view(){var p=el(),r=p?p.getBoundingClientRect():null,v=vp();\n"
                    + "return {__jnd:'dxc',alive:!!p,got:got,open:!!cfg.open,vw:v.w,vh:v.h,\n"
                    + "rect:r?{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}:null,\n"
                    + "game:game()};}\n"
                    + "function up(){try{window.top.postMessage(view(),'*');}catch(_){}}\n"
                    + "function need(){try{window.top.postMessage({__jnd:'dxc-need'},'*');}catch(_){}}\n"
                    // 帧内也要吃得下「画面缩放」；输入框被点就请顶层把键盘抬起来
                    + "function applyView(k){try{var s=document.getElementById('jnd-view');\n"
                    + "if(!s){s=document.createElement('style');s.id='jnd-view';\n"
                    + "(document.head||document.documentElement).appendChild(s);}\n"
                    + "if(!k||Math.abs(k-1)<0.003){s.textContent='';return;}\n"
                    + "s.textContent='html{zoom:'+k.toFixed(4)+' !important}';\n"
                    + "}catch(_){}}\n"
                    + "document.addEventListener('focusin',function(e){var t=e.target;if(!t||!t.tagName)return;\n"
                    + "var g=t.tagName.toUpperCase();if(g!=='INPUT'&&g!=='TEXTAREA')return;\n"
                    + "try{window.top.postMessage({__jnd:'ime'},'*');}catch(_){}},true);\n"
                    + "window.addEventListener('message',function(ev){var d=ev.data;\n"
                    + "if(!d||!d.__jnd)return;\n"
                    + "if(d.__jnd==='view'){applyView(d.k);return;}\n"
                    + "if(d.__jnd!=='dxc-cfg')return;var c=d.cfg||{};\n"
                    + "cfg.open=!!c.open;cfg.ratio=num(c.ratio);cfg.side=(c.side==='left'||c.side==='right')?c.side:'free';\n"
                    + "cfg.edge=c.edge==='bottom'?'bottom':'top';cfg.bigTouch=c.bigTouch!==false;\n"
                    + "got=true;key='';apply();up();});\n"
                    // 只在参数或视口真的变了才重排。原来 1.5 秒无脑 apply 一次，
                    // 小抄自己也在改样式，两边一推一挡就抖成「乱跳」。
                    + "var n=0,off=0;\n"
                    + "function tick(){var p=el();if(!p){if(!got)need();return;}\n"
                    + "var v=vp(),k=v.w+'x'+v.h+'|'+cfg.side+'|'+cfg.edge+'|'+num(cfg.ratio).toFixed(3)+'|'+(cfg.open?'1':'0')+'|'+(cfg.bigTouch?'b':'-')+'|'+(folded()?'f':'e');\n"
                    + "if(k!==key){key=k;if(apply())up();diag(p);return;}\n"
                    // 小抄点标题会把自己滑出屏幕；总开关开着的话，滑走超过 2 拍就拉回来，
                    // 一来用户不会「点一下就不见了」，二来留了 1.4 秒缓冲，不跟它的收起动画抢。
                    + "var bad=false;try{var rr=p.getBoundingClientRect();bad=!!cfg.open&&cfg.side!=='free'&&(rr.bottom<12||rr.right<12);}catch(_){}\n"
                    + "if(bad){if(++off>=2){off=0;p.style.setProperty('transform','none','important');if(apply())up();}}else{off=0;}\n"
                    // 原版每次展开/收起都会重写标题栏的行内样式，把我们加的 44px 高度抹掉；
                    // 这里跟着 tick 补回去（写同样的值浏览器会短路，几乎不耗性能）。
                    + "tapHover();fat();if((++n%10)===0)diag(p);}\n"
                    + "function reflow(){key='';setTimeout(tick,60);}\n"
                    + "window.addEventListener('resize',reflow);\n"
                    + "window.addEventListener('orientationchange',reflow);\n"
                    + "if(window.visualViewport){window.visualViewport.addEventListener('resize',reflow);\n"
                    + "window.visualViewport.addEventListener('scroll',reflow);}\n"
                    + "setInterval(tick,700);\n"
                    + "setInterval(function(){if(el()&&got)up();},2000);\n"
                    + "setTimeout(function(){need();up();},300);\n"
                    + "setTimeout(function(){need();},1500);\n"
                    + "setTimeout(function(){need();},3500);})();";

    /**
     * 注入链：GM 桥 → 统一登录器（仅官服登录页）→ 原版小抄（仅游戏页）→ 锦囊袋面板。
     * onPageStarted 时页面上下文是新建的，正好等于 document-start。
     */
    private void injectScripts(String url) {
        if (web == null) return;
        String u = url == null ? "" : url;
        if (u.startsWith("about:")) return;   // 回首页时的空白页，不用再灌 700KB

        if (!scriptGm.isEmpty()) web.evaluateJavascript(scriptGm, null);

        // 统一登录器只服务渠道登录。官服入口挂上它，会被 remembered 的渠道会话
        // 自动恢复，点「官服」反而进了上次的 WeGame QQ 号。
        if (isLoginChannel && !curProvider.isEmpty() && isUnifiedLoginPage(u) && !scriptLogin.isEmpty()) {
            web.evaluateJavascript("window.__JND_EXPECT_PROVIDER__=" + JSONObject.quote(curProvider), null);
            web.evaluateJavascript(scriptLogin,
                    v -> Log.i(TAG, "unified-login injected ret=" + v));
        }
        if (isGamePage(u) && !scriptDxc.isEmpty()) {
            String wrapped = "try{\n" + scriptDxc
                    + "\n}catch(e){console.log('DXCERR '+(e&&e.message));}";
            web.evaluateJavascript(wrapped, v -> Log.i(TAG, "dxc injected page=" + u + " ret=" + v));
        }
        // 综合插件（原版用户脚本，未做逻辑修改）：红点清理、屏蔽对手发言、
        // 屏蔽皮肤特效、屏蔽武将台词等功能全部由它提供，自带游戏内设置面板
        if (isGamePage(u) && !scriptSyn.isEmpty()) {
            String wrapped = "try{\n" + scriptSyn
                    + "\n}catch(e){console.log('SYNERR '+(e&&e.message));}";
            web.evaluateJavascript(wrapped, v -> Log.i(TAG, "synthesize injected ret=" + v));
        }
        // 锦囊袋 1.7.3：武将技能提示 / 推荐用牌等，全部由它提供。
        // 9.8MB 的脚本用 evaluateJavascript 送不进去（JNI 字符串太大、还容易被系统直接掐掉），
        // 改成页面自己 fetch 本地拦截的资源再 eval —— 页面 CSP 里有 unsafe-eval，这条路是通的。
        if (isGamePage(u)) {
            web.evaluateJavascript(
                    "(function(){if(window.__JND_DAI_LOAD__)return;window.__JND_DAI_LOAD__=1;"
                            + "fetch('https://jinnang.local/__jnd/jinnangdai.js').then(function(r){return r.text();})"
                            + ".then(function(t){try{(0,eval)(t);console.log('[JND] jinnangdai loaded '+t.length);"
                            + "window.__JND_SHIELD__&&window.__JND_SHIELD__.sweep();}"
                            + "catch(e){console.log('DAIERR '+(e&&e.message));}})"
                            + ".catch(function(e){console.log('DAIFETCH '+e);});})();",
                    v -> Log.i(TAG, "jinnangdai loader ret=" + v));
        }
        // 入口屏蔽器：锦囊袋的「频道」「快捷指令」入口、综合插件的「面板形态」切换。
        // 只隐藏 DOM，不动插件本体，更新、插件市场等一切照旧。
        if (isGamePage(u) && !scriptShield.isEmpty()) {
            String wrapped = "try{\n" + scriptShield
                    + "\n}catch(e){console.log('SHIELDEERR '+(e&&e.message));}";
            web.evaluateJavascript(wrapped, v -> Log.i(TAG, "shield injected ret=" + v));
        }
        if (!scriptPanel.isEmpty()) {
            String wrapped = "try{\n" + scriptPanel
                    + "\n}catch(e){console.log('JNDERR '+(e&&e.message));}";
            web.evaluateJavascript(wrapped, v -> {
                Log.i(TAG, "injectScripts: panel=" + scriptPanel.length() + " ret=" + v);
                if (web == null) return;
                web.postDelayed(() -> {
                    if (web == null) return;
                    web.evaluateJavascript(
                            "String(!!window.__JND_MOBILE__)+'/dxc='+String(!!document.getElementById('createIframe'))"
                                    + "+'/ul='+String(!!window.__JND_UNIFIED_LOGIN)",
                            s -> Log.i(TAG, "post-inject state=" + s));
                }, 800);
            });
        }
    }

    private boolean isUnifiedLoginPage(String url) {
        if (url == null) return false;
        // 渠道牌局页也要注入：统一登录器在 document-start 把 openGame 落下的一次性
        // handoff 交给游戏 bootstrap，缺了这一步游戏判未登录，会一直踢回登录页。
        // 牌局入口会被游戏改写成 10/pc/index.php / steam_index.php / 10th/...，都要覆盖。
        return url.contains("web.sanguosha.com/login/")
                || url.contains("sanguosha.com/10/pc/")
                || url.contains("sanguosha.com/10th/")
                || url.contains("bilibiliWD_index.php");
    }

    /** 只认真正的登录选项页：牌局页（/10/pc/xxx_index.php）和 oauth 回调页都不踢码 */
    private boolean isLoginFormPage(String url) {
        return url != null && url.contains("web.sanguosha.com/login/");
    }

    /**
     * 清掉三国杀各站点残留的会话 Cookie。
     * 渠道服的登录态由统一登录器用 grant 直接交给游戏页，浏览器 Cookie 只会
     * 把上一个官服号带进来；官服入口（official）不走这里，会话照旧保留。
     */
    private void clearSgsCookies() {
        try {
            CookieManager cm = CookieManager.getInstance();
            String[] hosts = {
                    "https://web.sanguosha.com",
                    "https://login.sanguosha.com",
                    "https://10th-sdk-login.sanguosha.com",
                    "https://10th-ly-login.sanguosha.com"
            };
            for (String host : hosts) {
                String all = cm.getCookie(host);
                if (all == null || all.isEmpty()) continue;
                for (String kv : all.split(";")) {
                    int eq = kv.indexOf('=');
                    if (eq <= 0) continue;
                    String name = kv.substring(0, eq).trim();
                    if (name.isEmpty()) continue;
                    cm.setCookie(host, name + "=; Max-Age=0; Path=/");
                }
            }
            cm.flush();
            Log.i(TAG, "clearSgsCookies done");
        } catch (Exception e) {
            Log.w(TAG, "clearSgsCookies fail " + e);
        }
    }

    /** 清页面 localStorage / sessionStorage，保留助手自己的 jnd_ 配置键 */
    private void clearPageStorages(WebView wv) {
        if (wv == null) return;
        wv.evaluateJavascript(
                "(function(){try{var keep={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);" +
                "if(k&&k.indexOf('jnd_')===0)keep[k]=localStorage.getItem(k);}" +
                "localStorage.clear();for(var k in keep){try{localStorage.setItem(k,keep[k]);}catch(_){}}" +
                "try{sessionStorage.clear();}catch(_){}return 'ok'}catch(e){return 'err:'+e}})()",
                v -> Log.i(TAG, "clearPageStorages " + v));
    }

    /** 一键移除所有登录令牌：统一登录器的会话/handoff、官服 Cookie、页面存储 */
    private int clearAllLogins() {
        int n = 0;
        try {
            for (String k : new java.util.ArrayList<>(prefs().getAll().keySet())) {
                if (k.startsWith("gm_wegame") || k.startsWith("gm_unified")) {
                    prefs().edit().remove(k).apply();
                    n++;
                }
            }
        } catch (Exception ignored) {}
        clearSgsCookies();
        clearPageStorages(web);
        Log.i(TAG, "clearAllLogins removed=" + n);
        return n;
    }

    /**
     * 之前这里是按渠道写死的一串地址，结果只要某个渠道换了个域名或者多套了一层跳转，
     * 小抄就整个不注入——用户看到的就是「这个渠道没有小抄」。
     * 现在反过来：除登录 / 授权 / 支付这类明显不是牌局的页面，其余一律注入，
     * 小抄自己会判断有没有 SGSMODULE，没有就安静等着，不会乱弹东西。
     */
    private boolean isGamePage(String url) {
        if (url == null || url.isEmpty()) return false;
        String u = url.toLowerCase(Locale.ROOT);
        if (!u.startsWith("http")) return false;

        // 这些页面注入小抄没有意义，还会拖慢登录
        String[] skip = {
                "passport.", "ptlogin", "open.weixin", "connect.qq", "graph.qq",
                "oauth", "login.qq", "weibo.com/oauth", "appleid.apple.com",
                "pay.", "paycenter", "wallet", "/cashier", "order/pay",
                "/login/", "login.html", "signin", "/account/"
        };
        for (String k : skip) if (u.contains(k)) return false;
        return true;
    }

    private void kickLogin(final int attempt) {
        if (web == null || curProvider.isEmpty()) return;
        String js = "(function(){try{"
                + "if(window.__JND_START_LOGIN__)return window.__JND_START_LOGIN__(" + JSONObject.quote(curProvider) + ");"
                + "return 'no-panel';}catch(e){return 'err:'+e}})()";
        web.evaluateJavascript(js, v -> {
            Log.i(TAG, "kickLogin " + curProvider + " attempt=" + attempt + " -> " + v);
            if (v != null && v.contains("canceled")) return;
            boolean retry = v != null && (v.contains("no-panel") || v.contains("err"))
                    || (v != null && v.contains("pending"));
            if (retry && attempt < 8 && web != null) {
                web.postDelayed(() -> kickLogin(attempt + 1), 1500);
            }
        });
    }

    private void ensureBackButton() {
        if (backBtn != null) { backBtn.setVisibility(View.VISIBLE); return; }
        backBtn = new TextView(MainActivity.this);
        backBtn.setText("‹ 首页");
        backBtn.setTextColor(0xFFF0D79A);
        backBtn.setTextSize(11);
        backBtn.setGravity(android.view.Gravity.CENTER);
        backBtn.setBackgroundColor(0xAA20120C);
        backBtn.setPadding(dp(8), 0, dp(8), 0);
        backBtn.setOnClickListener(v -> backToHome());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(58), dp(28));
        lp.gravity = android.view.Gravity.START | android.view.Gravity.TOP;
        lp.leftMargin = dp(6);
        lp.topMargin = dp(6);
        root.addView(backBtn, lp);
    }

    /**
     * 悬浮球里的图标：一张「小抄」卡片（圆角框 + 三条横线）。
     * 以前这里是「囊」字，看着像游戏自己的活动按钮；换成图形后跟新名字也对得上。
     */
    private static final class NoteIcon extends android.graphics.drawable.Drawable {
        private final android.graphics.Paint pt =
                new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);

        NoteIcon(float strokePx, int color) {
            pt.setColor(color);
            pt.setStyle(android.graphics.Paint.Style.STROKE);
            pt.setStrokeWidth(strokePx);
            pt.setStrokeCap(android.graphics.Paint.Cap.ROUND);
            pt.setStrokeJoin(android.graphics.Paint.Join.ROUND);
        }

        @Override
        public void draw(android.graphics.Canvas c) {
            android.graphics.Rect b = getBounds();
            float s = Math.min(b.width(), b.height()) * 0.46f;
            float cx = b.exactCenterX(), cy = b.exactCenterY();
            android.graphics.RectF card = new android.graphics.RectF(
                    cx - s / 2f, cy - s * 0.58f, cx + s / 2f, cy + s * 0.58f);
            float r = s * 0.15f;
            c.drawRoundRect(card, r, r, pt);
            float x0 = card.left + s * 0.16f, x1 = card.right - s * 0.16f;
            for (int i = 0; i < 3; i++) {
                float y = card.top + card.height() * (0.30f + i * 0.20f);
                c.drawLine(x0, y, i == 2 ? x1 - s * 0.18f : x1, y, pt);
            }
        }

        @Override public void setAlpha(int a) { pt.setAlpha(a); invalidateSelf(); }
        @Override public void setColorFilter(android.graphics.ColorFilter cf) { pt.setColorFilter(cf); invalidateSelf(); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
    }

    /** 原生悬浮球：轻点开锦囊袋，长按切小抄 */
    private void ensureFloatBall() {
        if (floatBall != null) { floatBall.setVisibility(View.VISIBLE); return; }

        floatBall = new TextView(MainActivity.this);
        // 球面不再写字：原来那个「囊」字太像游戏内的活动按钮，用户以为是游戏自带的
        floatBall.setText("");
        floatBall.setGravity(android.view.Gravity.CENTER);
        floatBall.setSoundEffectsEnabled(true);

        // 官方按钮的样子：金色径向渐变底 + 亮金描边 + 外圈暗环
        android.graphics.drawable.GradientDrawable core =
                new android.graphics.drawable.GradientDrawable();
        core.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        core.setGradientType(android.graphics.drawable.GradientDrawable.RADIAL_GRADIENT);
        core.setGradientRadius(dp(34));
        core.setGradientCenter(0.36f, 0.3f);
        core.setColors(new int[]{0xFFE7C57E, 0xFFBE9450, 0xFF7A5622, 0xFF45300F});
        core.setStroke(dp(1), 0xFFFFE7B4);

        android.graphics.drawable.GradientDrawable ring =
                new android.graphics.drawable.GradientDrawable();
        ring.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        ring.setColor(0x00000000);
        ring.setStroke(dp(3), 0xFF2A1C0C);

        android.graphics.drawable.LayerDrawable layered =
                new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{
                        core, ring, new NoteIcon(dp(2), 0xFF2A1A08)});
        // 给内层留出 3dp 的内缩，ring 才会压在边缘形成「双层金框」
        layered.setLayerInset(0, dp(3), dp(3), dp(3), dp(3));
        // 视觉 52dp、可点 84dp：四周留透明边，手指点偏一点也算命中（透明区照样收点击）
        android.graphics.drawable.InsetDrawable hit =
                new android.graphics.drawable.InsetDrawable(layered, dp(16), dp(16), dp(16), dp(16));
        floatBall.setBackground(hit);
        // 不给 elevation：elevation 会在球外晕出一圈阴影，浅色牌桌/房间列表上
        // 就像「球后面还有一块东西」（实测复现）；立体感靠金渐变+双层描边就够了。

        final FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(84), dp(84));
        lp.gravity = android.view.Gravity.START | android.view.Gravity.TOP;

        floatBall.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startL, startT;
            long downAt;
            boolean moved, longDone;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startL = lp.leftMargin;
                        startT = lp.topMargin;
                        moved = false;
                        longDone = false;
                        downAt = System.currentTimeMillis();
                        v.animate().scaleX(0.9f).scaleY(0.9f).setDuration(90).start();
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getRawX() - downX;
                        float dy = e.getRawY() - downY;
                        if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) { moved = true; ballMoved = true; }
                        if (!moved && !longDone && System.currentTimeMillis() - downAt > 520) {
                            longDone = true;
                            toggleDxc();
                        }
                        int maxL = Math.max(0, root.getWidth() - v.getWidth());
                        int maxT = Math.max(0, root.getHeight() - v.getHeight());
                        lp.leftMargin = (int) Math.max(0, Math.min(startL + dx, maxL));
                        lp.topMargin = (int) Math.max(0, Math.min(startT + dy, maxT));
                        v.setLayoutParams(lp);
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.animate().scaleX(1f).scaleY(1f).setDuration(110).start();
                        if (moved) {
                            // 拖完就记住位置，下次进来不再回到默认点
                            prefs().edit().putInt("ballX", lp.leftMargin)
                                    .putInt("ballY", lp.topMargin).apply();
                        }
                        if (!moved && !longDone) {
                            if (System.currentTimeMillis() - downAt > 520) toggleDxc();
                            else togglePanel(0);
                        }
                        return true;
                }
                return false;
            }
        });

        root.addView(floatBall, lp);
        root.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int l, int t, int r, int b,
                                       int ol, int ot, int or, int ob) {
                // 正在拖（或本次已拖过）就别动它的位置，否则每次 setLayoutParams
                // 触发的 layout 都会把球弹回默认点，看起来就是「拖不动」
                if (ballMoved || r - l <= 0 || b - t <= 0) return;
                // 拖过就还原拖动位置；没拖过放左下 —— 右缘中部已经被锦囊袋
                // 自己的圆球占了，再摆那儿两个球就叠成一个了。
                int sx = prefs().getInt("ballX", -1), sy = prefs().getInt("ballY", -1);
                int nx, ny;
                if (sx >= 0 && sy >= 0) {
                    nx = Math.max(0, Math.min(sx, r - l - floatBall.getWidth()));
                    ny = Math.max(0, Math.min(sy, b - t - floatBall.getHeight()));
                } else {
                    nx = dp(14);
                    ny = Math.max(dp(14), (b - t) - floatBall.getHeight() - dp(120));
                }
                // 坐标没变就别再 setLayoutParams：它会再发一次 requestLayout，
                // 于是 layout → 回调 → 再 layout，转成死循环，页面会卡到被系统杀掉。
                if (lp.leftMargin == nx && lp.topMargin == ny) return;
                lp.leftMargin = nx;
                lp.topMargin = ny;
                floatBall.setLayoutParams(lp);
            }
        });
    }

    private void togglePanel(int attempt) {
        if (web == null) return;
        web.evaluateJavascript(
                "String(window.__JND_TOGGLE__ ? window.__JND_TOGGLE__() : 'no')",
                v -> {
                    Log.i(TAG, "toggle panel -> " + v + " attempt=" + attempt);
                    if (v != null && v.contains("no") && attempt < 2) {
                        injectScripts(web.getUrl());
                        web.postDelayed(() -> togglePanel(attempt + 1), 600);
                        return;
                    }
                    if (floatBall != null) {
                        boolean open = v != null && v.contains("true");
                        floatBall.setAlpha(open ? 0.55f : 1f);
                    }
                });
    }

    /** 长按球：切原版小抄 */
    private void toggleDxc() {
        if (web == null) return;
        web.evaluateJavascript(
                "String(window.__JND_QC__ ? window.__JND_QC__() : 'no')",
                v -> {
                    Log.i(TAG, "toggle dxc -> " + v);
                    toast(v != null && v.contains("true") ? "小抄已展开" : "小抄已收起");
                });
    }

    /** 彻底退出：不走 onDestroy 的重建路径，直接结束任务与进程 */
    private void hardExit() {
        Log.i(TAG, "hardExit");
        try { if (web != null) { web.stopLoading(); } } catch (Throwable ignored) {}
        try { if (shell != null) { shell.stopLoading(); } } catch (Throwable ignored) {}
        hideQrOverlay();
        try { finishAndRemoveTask(); } catch (Throwable ignored) { finish(); }
        try { android.os.Process.killProcess(android.os.Process.myPid()); } catch (Throwable ignored) {}
    }

    /** 点输入框要抬键盘：WebView 有时收不到焦点消息，这里显式要一次 */
    private void showIme(boolean show) {
        try {
            android.view.inputmethod.InputMethodManager im =
                    (android.view.inputmethod.InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (im == null) return;
            final View v = (shell != null && shell.getVisibility() == View.VISIBLE) ? shell : web;
            if (v == null) return;
            if (show) {
                if (!v.hasFocus()) v.requestFocus();
                // 焦点刚落上去时请求一次常常被吞掉，隔一拍再要一次
                im.showSoftInput(v, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
                v.postDelayed(() -> {
                    try { im.showSoftInput(v, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT); }
                    catch (Throwable ignored) {}
                }, 180);
            } else {
                im.hideSoftInputFromWindow(v.getWindowToken(), 0);
            }
        } catch (Throwable ignored) {}
    }

    /**
     * 画面缩放：屏幕宽度(px) + 浏览器缩放(%) 合成一个比例，
     * 画布按左上角等比放大/缩小；没有画布就退回整页缩放。
     * 子帧（渠道服牌局在 iframe 里）通过 postMessage 同步同一比例。
     */
    private void applyView(int widthPx, int zoomPct) {
        if (web == null) return;
        final int z = zoomPct <= 0 ? 100 : zoomPct;
        prefs().edit().putInt("viewW", widthPx).putInt("viewZoom", z).apply();
        String js = "(function(){var W=" + widthPx + ",Z=" + z + ";"
                + "function k(){var vw=(window.visualViewport?visualViewport.width:innerWidth)||1;"
                + "var f=(W>0?W/vw:1)*(Z/100);if(!isFinite(f)||f<=0)f=1;"
                + "if(f<0.4)f=0.4;if(f>3)f=3;return f;}"
                + "function paint(doc,f){try{var s=doc.getElementById('jnd-view');"
                + "if(!s){s=doc.createElement('style');s.id='jnd-view';(doc.head||doc.documentElement).appendChild(s);}"
                + "var css='';"
                + "if(Math.abs(f-1)>0.002){css='html{zoom:'+f.toFixed(4)+' !important}'"
                + "+'#jnd-root,#jnd-chip,#jnd-qr{zoom:'+(1/f).toFixed(4)+' !important}';}"
                + "s.textContent=css;}catch(e){}}"
                + "var f=k();paint(document,f);"
                + "var fs=document.querySelectorAll('iframe');"
                + "for(var i=0;i<fs.length;i++){try{fs[i].contentWindow.postMessage({__jnd:'view',k:f},'*')}catch(e){}}"
                + "return String(f);})()";
        web.evaluateJavascript(js, v -> Log.i(TAG, "view " + widthPx + "px zoom " + z + "% -> " + v));
    }

    /* ---------------- 二维码悬浮窗：把码摆到别的应用上面，用对应 App 去扫 ---------------- */

    private View qrOverlay;
    private WindowManager.LayoutParams qrLp;
    private String pipQr = null;                 // 画中画里正在显示的二维码（dataUrl）
    private android.widget.ImageView pipQrView;  // 画中画时铺满窗口的原生二维码层
    private boolean pipPrevShell = false;        // 进画中画之前壳页是不是可见
    private boolean pipPrevBack = false;         // 进画中画之前返回键是不是可见

    /** 悬浮窗权限：很多机型对「未知来源」装的应用直接把这一项锁死，能问，但系统不给 */
    private boolean hasOverlayPerm() {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            return android.provider.Settings.canDrawOverlays(this);
        } catch (Throwable t) {
            return false;
        }
    }

    private boolean hasNotifyPerm() {
        if (Build.VERSION.SDK_INT < 33) return true;
        try {
            return checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                    == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * 没有悬浮窗权限时的退路：把整个窗口缩成画中画。
     * 画中画属于系统窗口，不需要 SYSTEM_ALERT_WINDOW，被锁悬浮窗的机器也能浮在扫码 App 上面。
     */
    private boolean qrFloatByPip(String dataUrl) {
        if (Build.VERSION.SDK_INT < 26) return false;
        if (isInPictureInPictureMode()) {
            // 已经在画中画里：只换图，别再缩一次窗
            byte[] png2 = decodeDataUrl(dataUrl);
            Bitmap bm2 = png2 == null ? null
                    : android.graphics.BitmapFactory.decodeByteArray(png2, 0, png2.length);
            if (bm2 == null) return false;
            pipQr = dataUrl;
            showPipQrNative(bm2);
            return true;
        }
        String u = web == null ? null : web.getUrl();
        if (u == null || u.startsWith("about:")) {
            toast("先在游戏里打开扫码页，再用画中画");
            return false;
        }
        byte[] png = decodeDataUrl(dataUrl);
        Bitmap bm = png == null ? null
                : android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length);
        if (bm == null) {
            toast("二维码读取失败");
            return false;
        }
        pipQr = dataUrl;
        pipPrevShell = shell != null && shell.getVisibility() == View.VISIBLE;
        // 画中画缩的是整个窗口，先让游戏页铺满，二维码遮罩才盖得住首页
        if (web != null) web.setVisibility(View.VISIBLE);
        if (shell != null) shell.setVisibility(View.GONE);
        if (floatBall != null) floatBall.setVisibility(View.GONE);
        // 画中画里只该看见码：自家那几个悬浮控件都收起来，退出时还回去
        pipPrevBack = backBtn != null && backBtn.getVisibility() == View.VISIBLE;
        if (backBtn != null) backBtn.setVisibility(View.GONE);
        // 画中画缩的是整个窗口，所以在原生层盖一张全屏的码：
        // 网页里的遮罩会被页面自己的 zoom/视口算法折腾成半屏，原生 View 不会。
        showPipQrNative(bm);
        // 遮罩要等一帧真画出来再缩窗，否则画中画里是一块黑
        new android.os.Handler(getMainLooper()).postDelayed(() -> {
            try {
                android.app.PictureInPictureParams.Builder b =
                        new android.app.PictureInPictureParams.Builder();
                b.setAspectRatio(new android.util.Rational(1, 1));
                if (Build.VERSION.SDK_INT >= 31) b.setSeamlessResizeEnabled(false);
                enterPictureInPictureMode(b.build());
                Log.i(TAG, "pip qr enter");
            } catch (Throwable t) {
                Log.w(TAG, "pip enter fail " + t);
                restoreAfterPip();
                toast("画中画打不开，只能在本窗口里扫");
            }
        }, 420);
        return true;
    }

    private void injectPipJs(String js) {
        if (web == null) return;
        web.post(() -> {
            if (web == null) return;
            try {
                web.evaluateJavascript("try{" + js + "}catch(e){}", null);
            } catch (Throwable ignored) {}
        });
    }

    private void showPipQrNative(Bitmap bm) {
        hidePipQrNative();
        if (bm == null || root == null) return;
        android.widget.ImageView iv = new android.widget.ImageView(this);
        iv.setBackgroundColor(0xFF0B0906);
        iv.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        int pad = dp(16);
        iv.setPadding(pad, pad, pad, pad);
        iv.setImageBitmap(bm);
        root.addView(iv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        pipQrView = iv;
    }

    private void hidePipQrNative() {
        if (pipQrView == null) return;
        try { if (root != null) root.removeView(pipQrView); } catch (Throwable ignored) {}
        pipQrView = null;
    }

    /** 退出画中画：收掉遮罩，把壳页可见性还回去 */
    private void restoreAfterPip() {
        hidePipQrNative();
        injectPipJs("window.__JND_PIP_EXIT__&&window.__JND_PIP_EXIT__()");
        pipQr = null;
        if (shell != null) shell.setVisibility(pipPrevShell ? View.VISIBLE : View.GONE);
        if (backBtn != null) backBtn.setVisibility(pipPrevBack ? View.VISIBLE : View.GONE);
        if (floatBall != null) floatBall.setVisibility(View.VISIBLE);
        pipPrevShell = false;
        pipPrevBack = false;
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, android.content.res.Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        Log.i(TAG, "pip mode=" + inPip);
        if (inPip) {
            // 画中画里只留二维码：顺手把沉浸标志收掉，否则缩窗带一圈黑边
            if (web != null) web.setVisibility(View.VISIBLE);
        } else {
            restoreAfterPip();
        }
    }

    /* ---------------- 通知：首启要一次权限，之后挂一条常驻状态 ---------------- */

    private static final int REQ_NOTIFY = 3001;
    private static final String CH_RUN = "run";
    private static final String PREF_NOTIFY_ASKED = "notifyAsked";
    private static final String PREF_WELCOMED = "welcomed";
    private static final String PREF_WELCOME_SHOWN = "welcomeShown";
    private static final int NOTIFY_WELCOME = 1002;

    /** 真正把欢迎通知发出去，并记下已发，避免权限回调里重复弹。 */
    private void maybeWelcome() {
        if (!prefs().getBoolean(PREF_WELCOMED, false)) return;
        if (prefs().getBoolean(PREF_WELCOME_SHOWN, false)) return;
        if (!hasNotifyPerm()) return;
        prefs().edit().putBoolean(PREF_WELCOME_SHOWN, true).apply();
        postWelcomeNotify();
    }

    /** 首次同意协议后发一条欢迎通知；只发一次，装完应用第一次进首页时出现。 */
    private void postWelcomeNotify() {
        if (!hasNotifyPerm()) return;
        try {
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(this, CH_RUN)
                    : new android.app.Notification.Builder(this);
            b.setSmallIcon(getApplicationInfo().icon)
                    .setContentTitle("三国杀手机助手")
                    .setContentText("欢迎使用三国杀手机助手")
                    .setAutoCancel(true)
                    .setShowWhen(true);
            b.setPriority(android.app.Notification.PRIORITY_DEFAULT);
            android.app.NotificationManager nm = (android.app.NotificationManager)
                    getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFY_WELCOME, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "postWelcomeNotify fail " + t);
        }
    }

    private void ensureNotify() {
        // 通知功能整体下线：不申请 POST_NOTIFICATIONS（Manifest 里也移除了），
        // 也不挂常驻/欢迎通知，避免一进应用就弹权限框。
    }

    private void postRunNotify() {
        if (!hasNotifyPerm()) return;
        try {
            Intent it = new Intent(this, MainActivity.class);
            it.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int pi = Build.VERSION.SDK_INT >= 23
                    ? android.app.PendingIntent.FLAG_IMMUTABLE : 0;
            android.app.PendingIntent pend = android.app.PendingIntent.getActivity(this, 0, it, pi);
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(this, CH_RUN)
                    : new android.app.Notification.Builder(this);
            b.setSmallIcon(getApplicationInfo().icon)
                    .setContentTitle("三国杀手机助手")
                    .setContentText("正在运行 · 点按回到应用")
                    .setContentIntent(pend)
                    .setOngoing(true)
                    .setShowWhen(false);
            b.setPriority(android.app.Notification.PRIORITY_LOW);
            b.setDefaults(0);
            android.app.NotificationManager nm = (android.app.NotificationManager)
                    getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(1001, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "postRunNotify fail " + t);
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req != REQ_NOTIFY) return;
        boolean ok = res != null && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        Log.i(TAG, "notify granted=" + ok);
        if (ok) { postRunNotify(); maybeWelcome(); }
        else toast("没给通知权限，后台就看不到状态提示（可在系统设置里再开）");
    }

    private byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) return null;
        String d = dataUrl;
        int i = d.indexOf("base64,");
        if (i > 0) d = d.substring(i + 7);
        try {
            return Base64.decode(d, Base64.DEFAULT);
        } catch (Throwable t) {
            return null;
        }
    }

    private void hideQrOverlay() {
        if (qrOverlay == null) return;
        try {
            WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) wm.removeView(qrOverlay);
        } catch (Throwable ignored) {}
        qrOverlay = null;
        qrLp = null;
    }

    private void showQrOverlay(String dataUrl) {
        hideQrOverlay();
        byte[] png = decodeDataUrl(dataUrl);
        if (png == null) { toast("二维码读取失败"); return; }
        Bitmap bm = android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length);
        if (bm == null) { toast("二维码读取失败"); return; }

        if (Build.VERSION.SDK_INT >= 23) {
            try {
                if (!android.provider.Settings.canDrawOverlays(this)) {
                    // 系统不给悬浮窗（未知来源安装的应用常被锁）就走画中画，别再把人往设置页赶
                    if (qrFloatByPip(dataUrl)) return;
                    toast("允许「显示在其他应用上层」后再点一次");
                    startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName())));
                    return;
                }
            } catch (Throwable ignored) {}
        }

        int size = Math.min(dp(300), (int) (getResources().getDisplayMetrics().widthPixels * 0.62f));

        FrameLayout box = new FrameLayout(this);
        android.graphics.drawable.GradientDrawable bg =
                new android.graphics.drawable.GradientDrawable();
        bg.setColor(0xFFFFFFFF);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(2), 0xFFE2C283);
        box.setBackground(bg);
        box.setPadding(dp(10), dp(10), dp(10), dp(34));
        box.setElevation(dp(16));

        android.widget.ImageView iv = new android.widget.ImageView(this);
        iv.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        iv.setImageBitmap(bm);
        FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        ip.bottomMargin = dp(26);
        box.addView(iv, ip);

        TextView tip = new TextView(MainActivity.this);
        tip.setText("拖动可移动 · 点右上角关闭");
        tip.setTextSize(9.5f);
        tip.setTextColor(0xFF6B5A34);
        tip.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(20));
        tp.gravity = Gravity.BOTTOM;
        tp.bottomMargin = dp(2);
        box.addView(tip, tp);

        TextView x = new TextView(MainActivity.this);
        x.setText("✕");
        x.setTextSize(15);
        x.setTextColor(0xFFF6E3BA);
        x.setGravity(Gravity.CENTER);
        android.graphics.drawable.GradientDrawable xb = new android.graphics.drawable.GradientDrawable();
        xb.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        xb.setColor(0xCC2A1C0C);
        x.setBackground(xb);
        FrameLayout.LayoutParams xp = new FrameLayout.LayoutParams(dp(34), dp(34));
        xp.gravity = Gravity.TOP | Gravity.END;
        xp.topMargin = -dp(12);
        xp.rightMargin = -dp(12);
        box.addView(x, xp);
        x.setOnClickListener(v -> hideQrOverlay());

        qrLp = new WindowManager.LayoutParams();
        qrLp.width = size + dp(20);
        qrLp.height = size + dp(54);
        qrLp.format = android.graphics.PixelFormat.TRANSLUCENT;
        qrLp.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        qrLp.gravity = Gravity.TOP | Gravity.START;
        qrLp.x = Math.max(0, getResources().getDisplayMetrics().widthPixels - qrLp.width - dp(12));
        qrLp.y = dp(60);
        if (Build.VERSION.SDK_INT >= 26) qrLp.type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        else qrLp.type = WindowManager.LayoutParams.TYPE_PHONE;

        final float[] down = new float[2];
        final int[] org = new int[2];
        box.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    down[0] = e.getRawX(); down[1] = e.getRawY();
                    org[0] = qrLp.x; org[1] = qrLp.y;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    qrLp.x = (int) (org[0] + (e.getRawX() - down[0]));
                    qrLp.y = (int) (org[1] + (e.getRawY() - down[1]));
                    try {
                        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
                        if (wm != null && qrOverlay != null) wm.updateViewLayout(qrOverlay, qrLp);
                    } catch (Throwable ignored) {}
                    return true;
            }
            return false;
        });

        try {
            WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return;
            wm.addView(box, qrLp);
            qrOverlay = box;
            toast("二维码已浮在最上层，切到对应 App 去扫");
        } catch (Throwable t) {
            toast("悬浮窗打开失败：" + t.getMessage());
        }
    }

    private void backToHome() {
        panelOpen = false;
        if (web != null) {
            web.loadUrl("about:blank");
            web.setVisibility(View.GONE);
        }
        showShell(false);
        CookieManager.getInstance().flush();
    }

    /* ============================== 桥 ============================== */

    /** 首页 / 协议页的桥 */
    public class HomeBridge {
        @JavascriptInterface
        public void launch(String id) {
            runOnUiThread(() -> {
                if (!prefs().getBoolean(KEY_AGREED, false)) { toast("请先同意协议"); return; }
                try { launchChannel(id); }
                catch (Exception e) { toast("启动失败：" + e.getMessage()); }
            });
        }

        @JavascriptInterface
        public void openAgreement() {
            runOnUiThread(() -> showShell(true));
        }

        /** 渠道列表右上角「移除登录令牌」：所有渠道的记住会话、官服 Cookie、页面存储一起清 */
        @JavascriptInterface
        public void clearLogins() {
            runOnUiThread(() -> {
                try {
                    int n = clearAllLogins();
                    toast(n > 0 ? "已移除 " + n + " 条登录令牌，重新选渠道登录" : "已清理登录缓存，重新选渠道登录");
                } catch (Exception e) {
                    toast("清理失败：" + e.getMessage());
                }
            });
        }

        /** 已同意过的用户回看协议页：直接回首页，别让人误触成"退出应用" */
        @JavascriptInterface
        public void closeAgreement() {
            runOnUiThread(() -> {
                showIme(false);
                showShell(false);
            });
        }

        @JavascriptInterface
        public void agree() {
            runOnUiThread(() -> {
                try {
                    // commit 而不是 apply：协议状态要立刻落盘，进程被回收也不能丢
                    prefs().edit().putBoolean(KEY_AGREED, true).commit();
                    Log.i(TAG, "agreement accepted -> home");
                    showIme(false);
                    showShell(false);
                } catch (Throwable t) {
                    Log.w(TAG, "agree failed: " + t);
                    toast("进入失败，请重试");
                }
            });
        }

        @JavascriptInterface
        public void reject() {
            runOnUiThread(() -> {
                try {
                    new android.app.AlertDialog.Builder(MainActivity.this)
                            .setTitle("不同意协议")
                            .setMessage("退出后本应用不再运行。你可以随时从桌面卸载。")
                            .setPositiveButton("退出应用", (d, w) -> hardExit())
                            .setNegativeButton("返回", null)
                            .show();
                } catch (Throwable t) {
                    hardExit();
                }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::hardExit);
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception e) { toast("无法打开链接"); }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> MainActivity.this.toast(msg));
        }

        @JavascriptInterface
        public void ime(boolean show) { runOnUiThread(() -> showIme(show)); }

        @JavascriptInterface
        public String appVersion() { return MainActivity.this.appVersion(); }

        /** 协议已同意过就不再逼用户重新勾选（KEY_AGREED 由协议页写入） */
        @JavascriptInterface
        public boolean agreed() { return prefs().getBoolean(KEY_AGREED, false); }

        @JavascriptInterface
        public String lastChannel() {
            return prefs().getString(KEY_LAST, "");
        }

        /* ---------- 加速器 ---------- */

        @JavascriptInterface
        public String accelStatus() { return Accel.status(); }

        @JavascriptInterface
        public void accelSet(boolean v) { Accel.setEnabled(v); }

        @JavascriptInterface
        public void accelProxy(String addr) { Accel.setManualProxy(addr); }

        @JavascriptInterface
        public void accelRefresh() { Accel.refresh(); }
    }

    /** 游戏页的桥：截图、提示、重新注入、常亮、GM 代理 */
    public class GameBridge {

        @JavascriptInterface
        public void goHome() {
            runOnUiThread(MainActivity.this::backToHome);
        }

        @JavascriptInterface
        public void openGameFrame(String url) {
            if (url == null || url.length() < 8 || !url.startsWith("http")) return;
            // 同一个 iframe 只搬一次，避免容器页和游戏页互相来回跳
            if (url.equals(lastFrameUrl)) return;
            lastFrameUrl = url;
            Log.i(TAG, "lift game frame -> " + url);
            runOnUiThread(() -> { if (web != null) web.loadUrl(url); });
        }

        @JavascriptInterface
        public void ime(boolean show) { runOnUiThread(() -> showIme(show)); }

        @JavascriptInterface
        public void view(int widthPx, int zoomPct) {
            runOnUiThread(() -> applyView(widthPx, zoomPct));
        }

        @JavascriptInterface
        public void qrFloat(String dataUrl) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 26 && isInPictureInPictureMode()) {
                    qrFloatByPip(dataUrl);
                    return;
                }
                if (hasOverlayPerm()) { showQrOverlay(dataUrl); return; }
                // 悬浮窗被系统锁死时不报错，直接退到画中画
                if (qrFloatByPip(dataUrl)) return;
                toast("这台机器既不能悬浮也不能画中画，只能在本窗口扫");
            });
        }

        /** 手动去开悬浮窗权限（国产 ROM 有的要把应用从「未知来源」里放出来才行） */
        @JavascriptInterface
        public void qrPermOpen() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName())));
                    toast("打开「显示在其他应用上层」；开关是灰的说明这台机器锁了，用画中画");
                } catch (Throwable t) {
                    toast("这台机器没有这个开关，用画中画代替");
                }
            });
        }

        /** 直接试一次画中画（不需要任何权限），失败会 toast 原因 */
        @JavascriptInterface
        public void qrPipTry(String dataUrl) {
            runOnUiThread(() -> {
                if (!qrFloatByPip(dataUrl)) toast("画中画不可用（需 Android 8 以上且已进入游戏）");
            });
        }

        @JavascriptInterface
        public void qrFloatClose() {
            runOnUiThread(MainActivity.this::hideQrOverlay);
        }

        /* ---------- 投码到另一块屏幕：局域网页面 ---------- */

        /**
         * 起（或复用）局域网页面并把当前这张码塞进去，返回给用户看的地址。
         * 手机自己拍不到自己的屏幕，所以在手机浏览器里起一个只读页，
         * 让电脑 / 平板 / 另一台手机打开，扫码器对着那块屏幕扫。
         */
        @JavascriptInterface
        public String qrShare(String dataUrl, String title, String sub) {
            try {
                if (LanQr.start() == 0) return "";
                LanQr.setQr(dataUrl, title, sub);
                String u = LanQr.url();
                Log.i(TAG, "lan share " + u);
                return u;
            } catch (Throwable t) {
                Log.w(TAG, "qrShare fail " + t);
                return "";
            }
        }

        @JavascriptInterface
        public void qrShareStop() {
            try { LanQr.stop(); } catch (Throwable ignored) {}
        }

        @JavascriptInterface
        public String qrShareInfo() {
            JSONObject o = new JSONObject();
            try {
                o.put("on", LanQr.running());
                o.put("url", LanQr.url());
                o.put("port", LanQr.port());
                o.put("ip", LanQr.lanIp());
            } catch (Exception ignored) {}
            return o.toString();
        }

        /** 把这张码存成 PNG，可放进模拟器自带的摄像头图源，或者直接打印 */
        @JavascriptInterface
        public String qrSave(String dataUrl) {
            byte[] png = decodeDataUrl(dataUrl);
            if (png == null) return "";
            String name = "扫码_" + new java.text.SimpleDateFormat("yyyyMMdd_HHmmss",
                    java.util.Locale.US).format(new java.util.Date()) + ".png";
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                    v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    v.put(MediaStore.Images.Media.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES + "/SGS截图");
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(png);
                    os.flush();
                    os.close();
                    return "相册/Pictures/SGS截图/" + name;
                }
                java.io.File base = new java.io.File(getExternalFilesDir(
                        Environment.DIRECTORY_PICTURES), "SGS截图");
                if (!base.exists()) base.mkdirs();
                java.io.File f = new java.io.File(base, name);
                java.io.FileOutputStream os = new java.io.FileOutputStream(f);
                os.write(png);
                os.flush();
                os.close();
                return f.getAbsolutePath();
            } catch (Throwable t) {
                Log.w(TAG, "qrSave fail " + t);
                return "";
            }
        }

        @JavascriptInterface
        public void setPanelOpen(boolean open) {
            panelOpen = open;
            // 面板自己带关闭按钮，开面板时把悬浮球收起来，别顶在窗口边上
            runOnUiThread(() -> {
                if (floatBall == null) return;
                floatBall.setVisibility(open ? View.GONE : View.VISIBLE);
                if (!open) { floatBall.setAlpha(1f); }
            });
        }
        @JavascriptInterface
        public boolean ready() { return true; }

        @JavascriptInterface
        public String appVersion() { return MainActivity.this.appVersion(); }

        /* ---------- 小抄脚本源（在线换新版，不用重装） ---------- */

        @JavascriptInterface
        public String dxcInfo() {
            JSONObject o = new JSONObject();
            try {
                String src = prefs().getString(PREF_DXC_SRC, "");
                o.put("src", src == null ? "" : src);
                o.put("custom", src != null && !src.isEmpty());
                o.put("builtin", scriptVersion(scriptDxcBuiltin));
                o.put("ver", scriptVersion(scriptDxc));
                o.put("kb", Math.round(scriptDxc.length() / 1024.0));
                o.put("cache", dxcCacheFile().exists());
            } catch (Exception e) {
                Log.w(TAG, "dxcInfo fail " + e);
            }
            return o.toString();
        }

        /**
         * url 为空 = 恢复包内脚本；否则下载这份 userscript 存起来，下次启动也用它。
         * 只换脚本正文，不改任何一行代码——来源仍然是原作者发布的那份。
         */
        @JavascriptInterface
        public void dxcSetSrc(final String url) {
            final String u = url == null ? "" : url.trim();
            if (u.isEmpty()) {
                prefs().edit().remove(PREF_DXC_SRC).apply();
                dxcCacheFile().delete();
                runOnUiThread(() -> {
                    loadCustomDxc();
                    toast("已恢复内置小抄脚本");
                    if (web != null) web.reload();
                });
                return;
            }
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                runOnUiThread(() -> toast("只支持 http(s) 直链"));
                return;
            }
            pool.execute(() -> {
                HttpURLConnection c = null;
                try {
                    c = Accel.openSmart(u, 20000);
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 "
                                    + "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
                    c.setInstanceFollowRedirects(true);
                    int code = c.getResponseCode();
                    if (code / 100 != 2) throw new java.io.IOException("HTTP " + code);
                    java.io.InputStream in = c.getInputStream();
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 8 * 1024 * 1024) throw new java.io.IOException("脚本超过 8MB");
                        out.write(buf, 0, n);
                    }
                    in.close();
                    String js = out.toString("UTF-8");
                    if (js.length() < 2000 || !js.contains("createIframe"))
                        throw new java.io.IOException("这不像是小抄脚本");
                    try (java.io.FileOutputStream fo = new java.io.FileOutputStream(dxcCacheFile())) {
                        fo.write(js.getBytes("UTF-8"));
                    }
                    prefs().edit().putString(PREF_DXC_SRC, u).apply();
                    Log.i(TAG, "dxc updated " + js.length() + " bytes <- " + u);
                    runOnUiThread(() -> {
                        loadCustomDxc();
                        toast("小抄脚本已更新到 v" + scriptVersion(scriptDxc) + "，页面重载中");
                        if (web != null) web.reload();
                    });
                } catch (final Exception e) {
                    final String m = e.getMessage() == null ? e.toString() : e.getMessage();
                    Log.w(TAG, "dxc update fail " + m);
                    runOnUiThread(() -> toast("更新失败：" + m));
                } finally {
                    if (c != null) try { c.disconnect(); } catch (Throwable ignored) {}
                }
            });
        }

        /* ---------- 版本页：检查更新 ----------
         * 锦囊袋插件以前自己在版本页里查 sh-sgs.net 更新；那个页签在手机上被隐藏了，
         * 更新统一挪到这里：下载新版 runtime 存进私有目录，游戏页加载时优先用它。
         */

        /** 已经下过的锦囊袋版本，JSON：{"cached":true,"version":"1.7.4","bytes":123} */
        @JavascriptInterface
        public String daiUpdateState() {
            JSONObject o = new JSONObject();
            try {
                File f = new File(getFilesDir(), "jinnangdai.runtime.js");
                boolean cached = f.isFile() && f.length() > 1024 * 1024;
                o.put("cached", cached);
                o.put("version", prefs().getString("daiUpdVer", ""));
                o.put("bytes", cached ? f.length() : 0);
            } catch (Exception e) {
                Log.w(TAG, "daiUpdateState fail " + e);
            }
            return o.toString();
        }

        /** 回滚：删掉下载的版本，重新用随包内置的 1.7.3 */
        @JavascriptInterface
        public void daiRevert() {
            prefs().edit().remove("daiUpdVer").apply();
            new File(getFilesDir(), "jinnangdai.runtime.js").delete();
            runOnUiThread(() -> {
                toast("已回滚到随包的锦囊袋 1.7.3");
                if (web != null) web.reload();
            });
        }

        /** 下载锦囊袋新版；完成后回调 window.__gmResolve(id, json) */
        @JavascriptInterface
        public void daiUpdate(final String id, final String url, final String sha256, final String version) {
            final String u = url == null ? "" : url.trim();
            if (!u.startsWith("http")) {
                deliverGm(id, "{\"ok\":false,\"error\":\"下载地址无效\"}");
                return;
            }
            pool.execute(() -> {
                HttpURLConnection c = null;
                File tmp = new File(getFilesDir(), "jinnangdai.runtime.tmp");
                try {
                    c = Accel.openSmart(u, 30000);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 "
                                    + "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
                    c.setInstanceFollowRedirects(true);
                    int code = c.getResponseCode();
                    if (code / 100 != 2) throw new java.io.IOException("HTTP " + code);
                    java.io.InputStream in = c.getInputStream();
                    java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                    java.io.FileOutputStream fo = new java.io.FileOutputStream(tmp);
                    byte[] buf = new byte[65536];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) > 0) {
                        md.update(buf, 0, n);
                        fo.write(buf, 0, n);
                        total += n;
                        if (total > 64L * 1024 * 1024) throw new java.io.IOException("文件异常大");
                    }
                    fo.flush();
                    fo.close();
                    in.close();
                    StringBuilder hex = new StringBuilder();
                    for (byte b : md.digest()) hex.append(String.format("%02x", b & 0xff));
                    String got = hex.toString();
                    if (sha256 != null && sha256.length() > 10 && !sha256.equalsIgnoreCase(got)) {
                        tmp.delete();
                        throw new java.io.IOException("校验不通过（" + got.substring(0, 12) + "…）");
                    }
                    File dst = new File(getFilesDir(), "jinnangdai.runtime.js");
                    if (dst.exists() && !dst.delete()) throw new java.io.IOException("旧文件占用");
                    if (!tmp.renameTo(dst)) throw new java.io.IOException("写入失败");
                    prefs().edit().putString("daiUpdVer", version == null ? "" : version).apply();
                    Log.i(TAG, "dai update ok " + total + " bytes ver=" + version);
                    JSONObject o = new JSONObject();
                    o.put("ok", true);
                    o.put("version", version == null ? "" : version);
                    o.put("bytes", total);
                    deliverGm(id, o.toString());
                } catch (final Exception e) {
                    tmp.delete();
                    final String m = e.getMessage() == null ? e.toString() : e.getMessage();
                    Log.w(TAG, "dai update fail " + m);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("ok", false);
                        o.put("error", m);
                        deliverGm(id, o.toString());
                    } catch (Exception ignored) {}
                } finally {
                    if (c != null) try { c.disconnect(); } catch (Throwable ignored) {}
                }
            });
        }

        /**
         * 手机助手本体更新：下载 apk 后交给系统安装器（PackageInstaller）。
         * 不走 FileProvider，也不需要写公共目录，安装确认框由系统弹。
         */
        @JavascriptInterface
        public void installApk(final String id, final String url) {
            final String u = url == null ? "" : url.trim();
            if (!u.startsWith("http")) {
                deliverGm(id, "{\"ok\":false,\"error\":\"下载地址无效\"}");
                return;
            }
            pool.execute(() -> {
                HttpURLConnection c = null;
                try {
                    c = Accel.openSmart(u, 30000);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(120000);
                    c.setInstanceFollowRedirects(true);
                    int code = c.getResponseCode();
                    if (code / 100 != 2) throw new java.io.IOException("HTTP " + code);
                    File apk = new File(getCacheDir(), "update.apk");
                    java.io.InputStream in = c.getInputStream();
                    java.io.FileOutputStream fo = new java.io.FileOutputStream(apk);
                    byte[] buf = new byte[65536];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        total += n;
                        if (total > 200L * 1024 * 1024) throw new java.io.IOException("安装包异常大");
                    }
                    fo.flush();
                    fo.close();
                    in.close();
                    Log.i(TAG, "apk downloaded " + total + " bytes");
                    installPackage(apk, id);
                } catch (final Exception e) {
                    final String m = e.getMessage() == null ? e.toString() : e.getMessage();
                    Log.w(TAG, "apk download fail " + m);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("ok", false);
                        o.put("error", m);
                        deliverGm(id, o.toString());
                    } catch (Exception ignored) {}
                } finally {
                    if (c != null) try { c.disconnect(); } catch (Throwable ignored) {}
                }
            });
        }

        private void installPackage(File apk, String id) {
            try {
                android.content.pm.PackageInstaller pi = getPackageManager().getPackageInstaller();
                android.content.pm.PackageInstaller.SessionParams p =
                        new android.content.pm.PackageInstaller.SessionParams(
                                android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                p.setAppPackageName(getPackageName());
                int sid = pi.createSession(p);
                android.content.pm.PackageInstaller.Session s = pi.openSession(sid);
                java.io.OutputStream out = s.openWrite("base.apk", 0, apk.length());
                java.io.FileInputStream in = new java.io.FileInputStream(apk);
                byte[] buf = new byte[65536];
                int n;
                long total = 0;
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
                in.close();
                out.flush();
                s.fsync(out);
                out.close();
                android.content.Intent i = new android.content.Intent(
                        MainActivity.this, MainActivity.class);
                android.app.PendingIntent pi2 = android.app.PendingIntent.getActivity(
                        MainActivity.this, sid, i,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT
                                | android.app.PendingIntent.FLAG_IMMUTABLE);
                s.commit(pi2.getIntentSender());
                s.close();
                Log.i(TAG, "install session committed " + total);
                JSONObject o = new JSONObject();
                o.put("ok", true);
                o.put("bytes", total);
                deliverGm(id, o.toString());
            } catch (final Exception e) {
                final String m = e.getMessage() == null ? e.toString() : e.getMessage();
                Log.w(TAG, "install commit fail " + m);
                try {
                    JSONObject o = new JSONObject();
                    o.put("ok", false);
                    o.put("error", m);
                    deliverGm(id, o.toString());
                } catch (Exception ignored) {}
            }
        }

        /* ---------- 网页账密登录（同锦囊微端的网页协议） ----------
         * 统一登录器在页面里生成渠道 OAuth 账密页地址，这里用弹层 WebView 打开它；
         * 登录完成后页面会跳到回调地址（auth:// / hms:// / 中转页 / callback.html），
         * 拦下来交回页面里的 webFinish 直接完成登录，不用扫码。 */

        @JavascriptInterface
        public void webLogin(final String provider, final String url) {
            runOnUiThread(() -> showWebLoginOverlay(provider, url));
        }

        @JavascriptInterface
        public void webLoginClose() {
            runOnUiThread(this::closeWebLoginOverlay);
        }

    private FrameLayout loginOverlay = null;
    private WebView loginWeb = null;
    private String loginProvider = "";

    /** 登录完成的回调长什么样：非 http(s) 的一律算（auth:// hms:// com.huawei...:），
     *  http 的按渠道特征匹配中转页 / callback 页。 */
    private boolean isWebLoginDone(String provider, String url) {
        if (url == null) return false;
        if (!url.startsWith("http://") && !url.startsWith("https://")) return true;
        if (provider.equals("qq") && url.contains("imgcache.qq.com/open/connect/widget/mobile/login/proxy.htm")) return true;
        if (provider.equals("xiaomi") && url.contains("game.xiaomi.com") && url.contains("oauthcallback")) return true;
        if (provider.equals("steam") && url.contains("10th-ly-login.sanguosha.com/steam/oauth/callback.html")) return true;
        if (provider.equals("oppo") && url.contains("game-login.heytap.com")) return true;
        if (provider.equals("vivo") && url.contains("joint.vivo.com.cn")
                && (url.contains("openToken") || url.contains("subOpenId") || url.contains("open_token"))) return true;
        return false;
    }

    private void finishWebLogin(String provider, String url) {
        closeWebLoginOverlay();
        if (web == null) return;
        web.post(() -> {
            if (web == null) return;
            web.evaluateJavascript("window.__JND_WEB_LOGIN__&&window.__JND_WEB_LOGIN__("
                    + JSONObject.quote(provider) + "," + JSONObject.quote(url) + ")", null);
        });
    }

    private void closeWebLoginOverlay() {
        if (loginOverlay != null && loginOverlay.getParent() == root) root.removeView(loginOverlay);
        if (loginWeb != null) { loginWeb.stopLoading(); loginWeb.destroy(); }
        loginOverlay = null;
        loginWeb = null;
        loginProvider = "";
    }

    private void showWebLoginOverlay(String provider, String url) {
        closeWebLoginOverlay();
        if (root == null || web == null) { toast("当前页面不支持网页登录"); return; }
        loginProvider = provider == null ? "" : provider;

        loginOverlay = new FrameLayout(MainActivity.this);
        loginOverlay.setBackgroundColor(0xF2100D08);

        // 顶部条：标题 + 关闭
        android.widget.LinearLayout bar = new android.widget.LinearLayout(MainActivity.this);
        bar.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(8), dp(14), dp(8));
        bar.setBackgroundColor(0xEE2A1F15);
        android.widget.TextView title = new TextView(MainActivity.this);
        title.setText("账号登录（网页）");
        title.setTextColor(0xFFF4E2B8);
        title.setTextSize(15);
        android.widget.LinearLayout.LayoutParams tp = new android.widget.LinearLayout.LayoutParams(
                0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(title, tp);
        TextView x = new TextView(MainActivity.this);
        x.setText("✕");
        x.setTextColor(0xFFD9C8A4);
        x.setTextSize(16);
        x.setPadding(dp(18), dp(6), dp(6), dp(6));
        x.setOnClickListener(v -> closeWebLoginOverlay());
        bar.addView(x);
        loginOverlay.addView(bar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        loginWeb = newWebViewSafe();
        if (loginWeb == null) { toast("页面组件启动失败"); loginOverlay = null; return; }
        loginWeb.getSettings().setJavaScriptEnabled(true);
        loginWeb.getSettings().setDomStorageEnabled(true);
        loginWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String u) {
                Log.i(TAG, "webLogin nav " + u);
                if (u != null && !u.startsWith("http://") && !u.startsWith("https://")
                        && !u.startsWith("about:") && !u.startsWith("javascript:")) {
                    finishWebLogin(loginProvider, u);
                    return true;
                }
                return false;
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                                                    android.webkit.WebResourceRequest req) {
                String u = req == null || req.getUrl() == null ? "" : req.getUrl().toString();
                Log.i(TAG, "webLogin navR " + u);
                if (!u.startsWith("http://") && !u.startsWith("https://")
                        && !u.startsWith("about:") && !u.startsWith("javascript:")) {
                    finishWebLogin(loginProvider, u);
                    return true;
                }
                return false;
            }
            @Override
            public void doUpdateVisitedHistory(WebView view, String u, boolean isReload) {
                Log.i(TAG, "webLogin hist " + u);
                if (u != null && isWebLoginDone(loginProvider, u)) {
                    finishWebLogin(loginProvider, u);
                    return;
                }
                super.doUpdateVisitedHistory(view, u, isReload);
            }
        });
        FrameLayout.LayoutParams wp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        wp.topMargin = dp(40);
        loginOverlay.addView(loginWeb, wp);
        root.addView(loginOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loginWeb.loadUrl(url);
        loginWeb.requestFocus();
        Log.i(TAG, "webLogin open " + loginProvider + " " + url);
    }

    /* ---------- GM 存储 ---------- */

        @JavascriptInterface
        public String gmDump() {
            JSONObject out = new JSONObject();
            try {
                for (java.util.Map.Entry<String, ?> e : prefs().getAll().entrySet()) {
                    String k = e.getKey();
                    if (!k.startsWith("gm_")) continue;
                    try {
                        out.put(k.substring(3), new org.json.JSONTokener(String.valueOf(e.getValue())).nextValue());
                    } catch (Exception ignored) {}
                }
            } catch (Exception e) {
                Log.w(TAG, "gmDump fail " + e);
            }
            return out.toString();
        }

        @JavascriptInterface
        public void gmSet(String key, String jsonValue) {
            prefs().edit().putString("gm_" + key, jsonValue == null ? "null" : jsonValue).apply();
        }

        @JavascriptInterface
        public void gmDel(String key) {
            prefs().edit().remove("gm_" + key).apply();
        }

        /* ---------- GM 跨域请求 ---------- */

        @JavascriptInterface
        public void gmHttp(final String id, final String url, final String method,
                           final String headersJson, final String data,
                           final String responseType, final int timeout,
                           final String redirect, final boolean anonymous) {
            pool.execute(() -> {
                HttpURLConnection c = null;
                Exception last = null;
                // 统一登录器给的是 25s/60s 这种大超时。Steam 被墙时那只是让人干等：
                // 我们两趟（直连 + DoH 换 IP）加起来能等一分多钟，面板早就在 12 秒时判超时了。
                // 这里把连接卡到 9 秒、读卡到 12 秒，失败快一点，重试才有意义。
                int budget = timeout > 0 ? timeout : 15000;
                if (budget > 9000) budget = 9000;

                // 两趟：先按域名直连（系统 DNS + TLS，最稳）；
                // 连接阶段失败（DNS 污染 / 握手被打断）就记下来，第二趟换 DoH 选出的 IP + SNI 再试。
                JSONObject first403 = null;
                boolean noCookie = false;
                for (int attempt = 0; attempt < 2; attempt++) {
                    c = null;
                    try {
                        c = attempt == 0
                                ? Accel.openSmart(url, budget)
                                : Accel.openBypass(url, budget);
                        running.put(id, c);
                        c.setRequestMethod(method == null || method.isEmpty() ? "GET" : method.toUpperCase(Locale.ROOT));
                        c.setInstanceFollowRedirects(!"manual".equalsIgnoreCase(redirect));
                        c.setConnectTimeout(budget);
                        c.setReadTimeout(Math.max(budget, 12000));
                        c.setRequestProperty("User-Agent",
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                        + "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                        // login.steampowered.com 的 JWT 接口现在带任何 Cookie 头都回 403
                        // （2026-11 实测：同 IP 同参数，带 Cookie 403 / 不带 200，curl 与 Java 一致）。
                        // 这条域名的请求干脆不发 Cookie；其他 Steam 域名照旧，403 时还有无 Cookie 重试兜底。
                        boolean steamJwt = false;
                        try {
                            String hh = new URL(url).getHost();
                            steamJwt = hh != null && hh.equalsIgnoreCase("login.steampowered.com");
                        } catch (Exception ignored) {}
                        String cookie = (anonymous || noCookie || steamJwt) ? null : CookieManager.getInstance().getCookie(url);
                        if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
                        if (headersJson != null && !headersJson.isEmpty()) {
                            JSONObject h = new JSONObject(headersJson);
                            java.util.Iterator<String> it = h.keys();
                            while (it.hasNext()) {
                                String k = it.next();
                                String v = h.optString(k, "");
                                if (k.equalsIgnoreCase("cookie")) {
                                    if (!noCookie && !steamJwt && v != null && !v.isEmpty()) c.setRequestProperty("Cookie", v);
                                } else {
                                    c.setRequestProperty(k, v);
                                }
                            }
                        }
                        {
                            // 只记头名与 cookie 长度，不记值：403 时能一眼看出请求长什么样
                            StringBuilder names = new StringBuilder();
                            for (java.util.Map.Entry<String, java.util.List<String>> e : c.getRequestProperties().entrySet()) {
                                if (e.getKey() == null) continue;
                                if ("cookie".equalsIgnoreCase(e.getKey())) {
                                    int cl = 0;
                                    for (String v : e.getValue()) cl += v == null ? 0 : v.length();
                                    names.append("Cookie(len=").append(cl).append(") ");
                                } else {
                                    names.append(e.getKey()).append(' ');
                                }
                            }
                            Log.i(TAG, "gmHttp req a=" + attempt + (noCookie ? " [no-cookie]" : "")
                                    + " " + c.getRequestMethod() + " " + names);
                        }
                        if (data != null && !data.isEmpty()
                                && !"GET".equalsIgnoreCase(c.getRequestMethod())
                                && !"HEAD".equalsIgnoreCase(c.getRequestMethod())) {
                            c.setDoOutput(true);
                            OutputStream os = c.getOutputStream();
                            os.write(data.getBytes("UTF-8"));
                            os.flush();
                            os.close();
                        }
                        int code = c.getResponseCode();
                        // 403 到底是哪一跳回来的，必须能一眼看出来
                        Log.i(TAG, "gmHttp " + c.getRequestMethod() + " " + code + " " + url);
                        InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        if (is != null) {
                            byte[] buf = new byte[16384];
                            int n;
                            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                            is.close();
                        }
                        byte[] bytes = bo.toByteArray();
                        if (code >= 400 && bytes.length > 0) {
                            Log.i(TAG, "gmHttp body " + code + " " + url + " :: "
                                    + new String(bytes, 0, Math.min(bytes.length, 320), "UTF-8"));
                        }

                        StringBuilder hs = new StringBuilder();
                        for (java.util.Map.Entry<String, java.util.List<String>> e : c.getHeaderFields().entrySet()) {
                            if (e.getKey() == null) continue;
                            for (String v : e.getValue()) hs.append(e.getKey()).append(": ").append(v).append("\r\n");
                        }
                        java.util.List<String> setCookies = anonymous ? null : c.getHeaderFields().get("Set-Cookie");
                        if (setCookies != null) {
                            for (String sc : setCookies) {
                                try { CookieManager.getInstance().setCookie(url, sc); } catch (Exception ignored) {}
                            }
                            CookieManager.getInstance().flush();
                        }

                        JSONObject o = new JSONObject();
                        o.put("ok", true);
                        o.put("status", code);
                        o.put("statusText", c.getResponseMessage() == null ? "" : c.getResponseMessage());
                        o.put("headers", hs.toString());
                        o.put("url", c.getURL().toString());
                        if ("arraybuffer".equals(responseType)) {
                            o.put("bodyB64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                        } else {
                            o.put("body", new String(bytes, "UTF-8"));
                        }
                        running.remove(id);
                        // Steam 的 403 多半不是真拒绝：TLS 能握手成功说明门找对了，
                        // 但换一个出口 IP（relay 轮转）常常就通了。403 走不到异常重试，
                        // 这里记住第一趟结果，换路再试一次；两趟都 403 才把 403 交回去。
                        if (attempt == 0 && code == 403 && Accel.isSteam(url)) {
                            first403 = o;
                            Accel.markBad(url);
                            Log.i(TAG, "gmHttp 403 steam route -> retry once (no cookie): " + url);
                            try { c.disconnect(); } catch (Exception ignored) {}
                            noCookie = true;   // 第二趟剥掉 Cookie：排查是不是带了陈旧登录态被 Akamai 拒
                            continue;
                        }
                        deliverGm(id, o.toString());
                        return;
                    } catch (Exception e) {
                        last = e;
                        running.remove(id);
                        if (c != null) { try { c.disconnect(); } catch (Exception ignored) {} }
                        c = null;
                        if (attempt == 0) {
                            Accel.markBad(url);
                            Log.i(TAG, "gmHttp retry via DoH: " + url + " (" + e.getMessage() + ")");
                        } else {
                            // 连 DoH 换 IP 都不行，说明那条路更糟，下次还是直连
                            Accel.clearBad(url);
                        }
                    }
                }

                // 第一趟 403、第二趟也失败（异常）时，把第一趟的 403 交回去，别让 JS 空等
                if (first403 != null) {
                    try { deliverGm(id, first403.toString()); } catch (Exception ignored) {}
                    return;
                }

                try {
                    JSONObject o = new JSONObject();
                    o.put("ok", false);
                    o.put("error", last == null ? "network" : String.valueOf(last.getMessage()));
                    deliverGm(id, o.toString());
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void gmAbort(String id) {
            HttpURLConnection c = running.remove(id);
            if (c != null) {
                try { c.disconnect(); } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> toastShort(msg));
        }

        /* ---------- 加速器 ---------- */

        @JavascriptInterface
        public String accelStatus() { return Accel.status(); }

        @JavascriptInterface
        public void accelSet(boolean v) { Accel.setEnabled(v); }

        @JavascriptInterface
        public void accelProxy(String addr) { Accel.setManualProxy(addr); }

        @JavascriptInterface
        public void accelRefresh() { Accel.refresh(); }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception e) { toastShort("无法打开链接"); }
            });
        }

        @JavascriptInterface
        public void setKeepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setPanelState(final boolean open) {
            runOnUiThread(() -> {
                if (floatBall == null) return;
                floatBall.setVisibility(open ? View.GONE : View.VISIBLE);
                floatBall.setAlpha(1f);
            });
        }

        @JavascriptInterface
        public void reinject() {
            runOnUiThread(() -> injectScripts(web == null ? "" : web.getUrl()));
        }

        /** base64 PNG 存相册 Pictures/SGS截图 */
        @JavascriptInterface
        public String saveImage(String base64, final String name) {
            try {
                byte[] data = Base64.decode(base64, Base64.NO_WRAP | Base64.NO_PADDING);
                String safeName = (name == null || name.isEmpty() ? "sgs.png" : name)
                        .replaceAll("[\\\\/:*?\"<>|]", "_");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES + "/SGS截图");
                    Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return "";
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(data);
                    os.flush();
                    os.close();
                    return "相册/Pictures/SGS截图/" + safeName;
                }
                File base;
                if (checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE")
                        == PackageManager.PERMISSION_GRANTED) {
                    base = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_PICTURES), "SGS截图");
                } else {
                    base = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "SGS截图");
                }
                if (!base.exists()) base.mkdirs();
                File file = new File(base, safeName);
                FileOutputStream os = new FileOutputStream(file);
                os.write(data);
                os.flush();
                os.close();
                return file.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

    }

    private static byte[] readFile(File f) throws Exception {
        java.io.FileInputStream in = new java.io.FileInputStream(f);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    /* ============================== 通用 ============================== */

    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "2.2.0";
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void toast(String msg) { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show(); }

    private void toastShort(String msg) { toast(msg); }

    private String readRaw(int resId) {
        try {
            InputStream in = getResources().openRawResource(resId);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return out.toString("UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "readRaw " + resId + " failed: " + e);
            return "";
        }
    }

    /* ---------- 小抄脚本热更新：包内脚本可以被一份更新的 .user.js 顶替 ---------- */

    private java.io.File dxcCacheFile() { return new java.io.File(getFilesDir(), "dxc_custom.js"); }

    /** 有缓存就用缓存，没缓存用包内那份；任何异常都退回内置，绝不让小抄起不来 */
    private void loadCustomDxc() {
        String src = prefs().getString(PREF_DXC_SRC, "");
        scriptDxc = scriptDxcBuiltin;
        if (src == null || src.isEmpty()) return;
        String js = readTextFile(dxcCacheFile());
        if (js != null && js.length() > 2000 && js.contains("createIframe")) {
            scriptDxc = js;
            Log.i(TAG, "dxc custom loaded " + js.length() + " bytes from " + src);
        } else {
            Log.w(TAG, "dxc custom cache missing, fallback to builtin");
        }
    }

    private String readTextFile(java.io.File f) {
        if (f == null || !f.exists()) return null;
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "readTextFile fail " + e);
            return null;
        }
    }

    /** 从 userscript 头的 @version 取版本号，取不到就空串 */
    private String scriptVersion(String js) {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("@version\\s+([0-9][0-9A-Za-z.\\-]*)")
                    .matcher(js == null ? "" : js);
            return m.find() ? m.group(1) : "";
        } catch (Throwable t) {
            return "";
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 9001 && pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(
                    resultCode == RESULT_OK && data != null && data.getData() != null
                            ? new Uri[]{data.getData()} : null);
            pendingFileCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (popupWeb != null) {
                closePopup();
                return true;
            }
            if (panelOpen && web != null) {
                // 面板开着时按返回只关面板。以前这里直接 goBack，
                // 会退到 about:blank，整屏变黑只剩一个关闭按钮，看着就像崩了。
                web.evaluateJavascript("try{window.__JND_CLOSE__&&window.__JND_CLOSE__()}catch(e){}", null);
                panelOpen = false;
                if (floatBall != null) { floatBall.setAlpha(1f); }
                return true;
            }
            if (web != null && web.getVisibility() == View.VISIBLE) {
                String cur = web.getUrl();
                boolean blank = cur == null || cur.startsWith("about:");
                if (!blank && web.canGoBack()) {
                    web.goBack();
                    return true;
                }
                backToHome();
                return true;
            }
            moveTaskToBack(true);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        try { LanQr.stop(); } catch (Throwable ignored) {}
        if (web != null) { web.destroy(); web = null; }
        if (shell != null) { shell.destroy(); shell = null; }
        super.onDestroy();
    }
}
