package com.jinnang.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 轻量加速器（随应用启动自动开启）。
 *
 * 三段能力：
 *   1) DoH 解析       —— 绕开本地 DNS 污染，拿到真实 A 记录；
 *   2) 线路竞速/预热  —— 对每个域名的多个 IP 做 TCP 443 竞速，取最快的一条并缓存，
 *                        启动时就把登录域名全部预热一遍，点进渠道不再等握手；
 *   3) 本机代理接管   —— 自动探测本机代理端口（Clash/V2Ray/UU 等常见端口），
 *                        探测到就把渠道与 Steam 的请求整体走代理，
 *                        也可以在界面上手填 host:port。
 *
 * 本类不做任何数据改写，只负责选路与连接。
 */
public final class Accel {

    private static final String TAG = "JND-ACCEL";
    private static final String PREFS = "jinnang-accel";
    private static final String K_ON = "on";
    private static final String K_PROXY = "manualProxy";

    /**
     * DoH 解析服务。
     * doh.pub（腾讯）对 Steam 域名的结果最干净；阿里 DoH 常常把被污染过的缓存结果吐回来
     * （实测 steamcommunity.com 在 dns.alidns.com 上返回的是 Facebook 的 31.13.x.x），
     * 所以顺位放后面，最后再靠「TLS 握手 + 证书必须匹配域名」把假 IP 全剔掉。
     */
    private static final String[] DOH = {
            "https://doh.pub/dns-query?type=A&name=",
            "https://dns.alidns.com/resolve?type=A&name="
    };

    /** 走加速（代理接管 / 线路优选）的域名后缀 */
    private static final String[] SUFFIX = {
            "steampowered.com", "steamcommunity.com", "steamstatic.com", "steamcontent.com",
            "sanguosha.com", "4399.com", "4399iw2.com", "qq.com", "baidu.com",
            "360.cn", "7k7k.com", "bilibili.com", "oppomobile.com", "xiaomi.com",
            "vivo.com", "huawei.com", "hihonor.com"
    };

    /** 只对 Steam 做请求级接管（其它站点交给 WebView 原生栈，避免拖慢牌局） */
    private static final String[] STEAM = {
            "steampowered.com", "steamcommunity.com", "steamstatic.com", "steamcontent.com"
    };

    /** 启动预热的域名：登录与牌局都压在这几个域上 */
    private static final String[] WARM = {
            "web.sanguosha.com", "api.steampowered.com", "login.steampowered.com",
            "steamcommunity.com", "my.4399.com", "qqgame.qq.com"
    };

    /** 常见本机代理端口（Clash / V2Ray / 迅游 / UU / 公司代理） */
    private static final int[] PORTS = {7890, 7891, 10809, 10808, 1080, 8889, 2080, 1087, 8080, 8888};

    private static Context ctx;
    private static SharedPreferences sp;

    private static volatile boolean on = true;
    private static volatile String manual = "";
    private static volatile String autoProxy = "";
    private static volatile long proxyTs = 0L;

    private static final ExecutorService pool = Executors.newFixedThreadPool(3);
    private static final Map<String, Node> nodes = new ConcurrentHashMap<>();
    private static volatile long warmTs = 0L;

    private Accel() {}

    public static final class Node {
        public String host;
        public String ip;
        public int ms;
        public long ts;

        JSONObject json() {
            JSONObject o = new JSONObject();
            try {
                o.put("host", host);
                o.put("ip", ip == null ? "" : ip);
                o.put("ms", ms);
            } catch (Exception ignored) {}
            return o;
        }
    }

    /* ============================== 生命周期 ============================== */

    public static void init(Context c) {
        if (ctx != null) return;
        ctx = c.getApplicationContext();
        sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        on = sp.getBoolean(K_ON, true);
        manual = sp.getString(K_PROXY, "");
        Log.i(TAG, "init on=" + on + " manual=" + manual);
        pool.execute(Accel::prewarm);
    }

    public static boolean enabled() { return on; }

    public static void setEnabled(boolean v) {
        on = v;
        if (sp != null) sp.edit().putBoolean(K_ON, v).apply();
        Log.i(TAG, "setEnabled " + v);
        if (v) pool.execute(Accel::prewarm);
    }

    public static String manualProxy() { return manual == null ? "" : manual; }

    public static void setManualProxy(String v) {
        manual = v == null ? "" : v.trim();
        if (sp != null) sp.edit().putString(K_PROXY, manual).apply();
        proxyTs = 0L;
        Log.i(TAG, "manual proxy=" + manual);
    }

    /* ============================== 选路 ============================== */

    public static boolean isSteam(String url) { return match(url, STEAM); }

    public static boolean shouldAccel(String url) { return match(url, SUFFIX); }

    private static boolean match(String url, String[] list) {
        if (url == null) return false;
        String h;
        try { h = new URL(url).getHost(); } catch (Exception e) { return false; }
        if (h == null) return false;
        h = h.toLowerCase(Locale.ROOT);
        for (String s : list) {
            if (h.equals(s) || h.endsWith("." + s)) return true;
        }
        return false;
    }

    /** 当前生效的代理；没有就是 null */
    public static Proxy proxy() {
        String addr = effectiveProxy();
        if (addr.isEmpty()) return null;
        int i = addr.lastIndexOf(':');
        if (i <= 0) return null;
        try {
            String h = addr.substring(0, i);
            int p = Integer.parseInt(addr.substring(i + 1));
            return new Proxy(Proxy.Type.HTTP, new InetSocketAddress(h, p));
        } catch (Exception e) {
            return null;
        }
    }

    public static boolean hasProxy() { return effectiveProxy().length() > 0; }

    public static String effectiveProxy() {
        // 注意：这里不再看总开关。总开关只管「要不要做线路优选」，
        // 已经配好的代理（手填或自动探测）始终生效——不然用户填了代理却发现没用。
        if (manual != null && !manual.isEmpty()) return manual;
        long now = System.currentTimeMillis();
        if (now - proxyTs < 20000L) return autoProxy;
        autoProxy = detect();
        proxyTs = now;
        return autoProxy;
    }

    /** 扫一遍常见本机端口 */
    private static String detect() {
        for (int p : PORTS) {
            if (ping("127.0.0.1", p, 130)) {
                String a = "127.0.0.1:" + p;
                Log.i(TAG, "auto proxy " + a);
                return a;
            }
        }
        return "";
    }

    private static boolean ping(String host, int port, int timeout) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), timeout);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try { s.close(); } catch (Exception ignored) {}
        }
    }

    /** 统一的连接构造：代理存在就走代理，否则直连 */
    public static HttpURLConnection open(String url, int timeoutMs) throws Exception {
        URL u = new URL(url);
        Proxy p = proxy();
        HttpURLConnection c = (HttpURLConnection) (p == null
                ? u.openConnection(Proxy.NO_PROXY)
                : u.openConnection(p));
        int t = timeoutMs > 0 ? timeoutMs : 15000;
        c.setConnectTimeout(t);
        c.setReadTimeout(Math.max(t, 20000));
        c.setRequestProperty("Accept-Encoding", "identity");

        // 走 TLS1.2：本机网络对 Java 默认的 TLS1.3 ClientHello 会直接 RST，
        // 但系统的 curl（TLS1.2）能正常握手 —— 这就是「浏览器能开、应用里连不上」的根因。
        if ("https".equalsIgnoreCase(u.getProtocol()) && c instanceof javax.net.ssl.HttpsURLConnection) {
            try {
                ((javax.net.ssl.HttpsURLConnection) c)
                        .setSSLSocketFactory(new SniFactory(u.getHost(), true));
            } catch (Exception ignored) {}
        }
        return c;
    }

    /**
     * 系统级 VPN（UU / 迅游 / Clash TUN 等）**正在当默认出口**：路由与 DNS 已被接管，别再自作聪明改 IP。
     *
     * 注意只能看「当前默认网络」，不能遍历所有网络：模拟器里常有一条挂着的 VPN 接口
     * （安装过加速器就会留下），但流量根本不走它。以前那样判断，整条加速逻辑会被这一点直接跳过，
     * 请求绕回被污染的 DNS，最后拿到一个莫名其妙的 403。
     */
    public static boolean vpnActive() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager)
                    ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            android.net.Network n = cm.getActiveNetwork();
            if (n == null) return false;
            android.net.NetworkCapabilities c = cm.getNetworkCapabilities(n);
            return c != null && c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN);
        } catch (Exception ignored) {}
        return false;
    }

    /**
     * 智能选路：
     *   系统 VPN 在跑 → 直接交给系统（它已经把路由与 DNS 接管了）；
     *   有本机代理    → 走代理（Steam 这类被整段掐断的域名只有这条能通）；
     *   都没有        → 用 DoH 测出的最快 IP 直连，同时把 SNI/Host 修正回真实域名，
     *                   绕开本地 DNS 污染。
     */
    public static HttpURLConnection openSmart(String url, int timeoutMs) throws Exception {
        URL u = new URL(url);
        String host = u.getHost();
        if (host == null || host.isEmpty()) return open(url, timeoutMs);

        // Steam 一律走本机隧道：URL 保持真域名，连接钉到 DoH 选出的真实 IP 上。
        // 这条判断必须放在 vpn / proxy 之前——模拟器里经常挂着一条并不承载流量的 VPN 接口，
        // 按「有 VPN 就直连」处理的话，请求会绕回被污染的 DNS，换回一个 403。
        if (isSteam(url)) {
            // 配了代理就交给代理，它自己会解析域名，比我们钉 IP 更省事
            if (proxy() != null) return open(url, timeoutMs);
            Log.i(TAG, "openSmart steam relay vpn=" + vpnActive() + " " + url);
            try {
                return openViaRelay(url, timeoutMs);
            } catch (Exception e) {
                Log.d(TAG, "relay miss " + host + " " + e.getMessage());
            }
            if (blocked(host)) {
                throw new java.io.IOException("blocked: " + host + " (TLS 握手被打断，需要代理)");
            }
            return open(url, timeoutMs);
        }

        // 系统 VPN 在跑：路由与 DNS 都被它接管了，交给它比自己折腾更稳
        if (vpnActive()) return open(url, timeoutMs);

        Proxy p = proxy();
        if (p != null) return open(url, timeoutMs);

        if (badHost(host)) {
            Node n = best(host);
            if (n != null && n.ms >= 0 && n.ip != null && !n.ip.isEmpty()) {
                Log.d(TAG, "smart " + host + " via relay " + n.ip);
                return openViaRelay(url, timeoutMs);
            }
        }
        return open(url, timeoutMs);
    }

    /** 某个域名直连失败过，之后优先用探测出来的线路 */
    private static final Map<String, Long> BAD = new ConcurrentHashMap<>();

    /** 探测到「TCP 通、TLS 全被打断」的域名（SNI 阻断的典型症状） */
    private static final Map<String, Long> BLOCKED = new ConcurrentHashMap<>();

    static boolean badHost(String host) {
        if (host == null) return false;
        Long ts = BAD.get(host.toLowerCase(Locale.ROOT));
        if (ts == null) return false;
        if (System.currentTimeMillis() - ts > 10 * 60 * 1000L) { BAD.remove(host); return false; }
        return true;
    }

    /** 清掉标记：兜底也失败时说明坏的是 IP，回到直连 */
    public static void clearBad(String url) {
        try {
            String h = new URL(url).getHost();
            if (h != null) BAD.remove(h.toLowerCase(Locale.ROOT));
        } catch (Exception ignored) {}
    }

    /** 记录一次直连失败；下一次同域名自动改用 DoH 线路 */
    public static void markBad(String url) {
        try {
            String h = new URL(url).getHost();
            if (h == null) return;
            h = h.toLowerCase(Locale.ROOT);
            Long old = BAD.get(h);
            if (old == null || System.currentTimeMillis() - old > 60000L) {
                BAD.put(h, System.currentTimeMillis());
                Log.i(TAG, "mark bad host " + h + " -> will use DoH ip next time");
            }
        } catch (Exception ignored) {}
    }

    /**
     * 用探测出来的可用线路直连，SNI / Host 修正回真实域名。
     * 由 openSmart 内部调用，也可以由调用方在失败后主动重试一次。
     */
    public static HttpURLConnection openBypass(String url, int timeoutMs) throws Exception {
        String host = new URL(url).getHost();
        if (isSteam(url)) {
            if (proxy() != null) return open(url, timeoutMs);
            return openViaRelay(url, timeoutMs);
        }
        Node n = host == null ? null : best(host);
        if (n == null || n.ms < 0 || n.ip == null || n.ip.isEmpty()) {
            if (host != null && blocked(host)) {
                throw new java.io.IOException("blocked: " + host + " (TLS 握手被打断，需要代理)");
            }
            return open(url, timeoutMs);
        }
        return openViaRelay(url, timeoutMs);
    }

    /**
     * 这个域名是不是「TCP 能连、TLS 握手被整段打断」——国内访问 Steam 社区就是这个症状。
     * 用来在选路时及时止损，而不是退回污染 DNS 去换一个 403。
     */
    public static boolean blocked(String host) {
        if (host == null) return false;
        Long ts = BLOCKED.get(host.toLowerCase(Locale.ROOT));
        if (ts == null) return false;
        if (System.currentTimeMillis() - ts > 5 * 60 * 1000L) { BLOCKED.remove(host); return false; }
        return true;
    }

    /**
     * 走本机隧道发请求：URL 里仍然是真域名，所以 Host / SNI / 证书校验全都正常，
     * 隧道那一端负责把连接钉到已验证的真实 IP 上。
     * （以前用 openIp 把 URL 换成 IP + 手工写 Host，Android 的 HttpURLConnection 不认这个 Host，
     *   请求就打到别人的服务器上换回一个 403 —— 看着像 Steam 拒绝登录，其实是敲错门。）
     */
    public static HttpURLConnection openViaRelay(String url, int timeoutMs) throws Exception {
        int rp = SteamRelay.start();
        if (rp <= 0) throw new java.io.IOException("relay unavailable");
        URL u = new URL(url);
        HttpURLConnection c = (HttpURLConnection) u.openConnection(
                new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", rp)));
        int t = timeoutMs > 0 ? timeoutMs : 15000;
        c.setConnectTimeout(Math.min(t, 9000));
        c.setReadTimeout(Math.max(t, 20000));
        c.setRequestProperty("Accept-Encoding", "identity");
        if ("https".equalsIgnoreCase(u.getProtocol()) && c instanceof javax.net.ssl.HttpsURLConnection) {
            try {
                ((javax.net.ssl.HttpsURLConnection) c)
                        .setSSLSocketFactory(new SniFactory(u.getHost(), true));
            } catch (Exception ignored) {}
        }
        return c;
    }

    /** 直连指定 IP，但 Host / SNI 仍然是真实域名，TLS 固定 1.2 */
    public static HttpURLConnection openIp(String url, String ip, int timeoutMs) throws Exception {
        URL u = new URL(url);
        String host = u.getHost();
        String scheme = u.getProtocol();
        boolean https = "https".equalsIgnoreCase(scheme);
        int port = u.getPort() > 0 ? u.getPort() : (https ? 443 : 80);
        String file = u.getFile();
        if (file == null || file.isEmpty()) file = "/";

        URL direct = new URL(scheme, ip, port, file);
        HttpURLConnection c = (HttpURLConnection) direct.openConnection(Proxy.NO_PROXY);
        int t = timeoutMs > 0 ? timeoutMs : 15000;
        c.setConnectTimeout(Math.min(t, 6000));
        c.setReadTimeout(Math.max(t, 20000));
        c.setRequestProperty("Host", host);
        c.setRequestProperty("Accept-Encoding", "identity");
        if (https) {
            javax.net.ssl.HttpsURLConnection h = (javax.net.ssl.HttpsURLConnection) c;
            h.setSSLSocketFactory(new SniFactory(host, true));
            // 连的是 IP，但证书必须仍然是真实域名的：否则一个被污染的 IP 也能混过去
            final String realHost = host;
            h.setHostnameVerifier((h2, s2) -> {
                try {
                    return javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier()
                            .verify(realHost, s2);
                } catch (Exception e) {
                    return false;
                }
            });
        }
        return c;
    }

    /** 把 SNI 固定成真实域名（URL 里是 IP，默认 SNI 会变成 IP，握手会被拒） */
    private static final class SniFactory extends javax.net.ssl.SSLSocketFactory {
        private final javax.net.ssl.SSLSocketFactory base;
        private final String host;
        private final boolean tls12;

        SniFactory(String host) throws Exception { this(host, false); }

        SniFactory(String host, boolean tls12Only) throws Exception {
            javax.net.ssl.SSLContext ctx = javax.net.ssl.SSLContext.getInstance("TLS");
            ctx.init(null, null, null);
            this.base = ctx.getSocketFactory();
            this.host = host;
            this.tls12 = tls12Only;
        }

        private java.net.Socket wrap(java.net.Socket s) {
            if (s instanceof javax.net.ssl.SSLSocket) {
                try {
                    javax.net.ssl.SSLSocket ss = (javax.net.ssl.SSLSocket) s;
                    javax.net.ssl.SSLParameters pr = ss.getSSLParameters();
                    pr.setServerNames(java.util.Collections.singletonList(
                            new javax.net.ssl.SNIHostName(host)));
                    ss.setSSLParameters(pr);
                    if (tls12) ss.setEnabledProtocols(new String[]{"TLSv1.2"});
                } catch (Exception ignored) {}
            }
            return s;
        }

        @Override public String[] getDefaultCipherSuites() { return base.getDefaultCipherSuites(); }

        @Override public String[] getSupportedCipherSuites() { return base.getSupportedCipherSuites(); }

        @Override public java.net.Socket createSocket(java.net.Socket s, String h, int p, boolean auto)
                throws java.io.IOException {
            return wrap(base.createSocket(s, h, p, auto));
        }

        @Override public java.net.Socket createSocket(String h, int p) throws java.io.IOException {
            return wrap(base.createSocket(nvl(h), p));
        }

        @Override public java.net.Socket createSocket(String h, int p, java.net.InetAddress la, int lp)
                throws java.io.IOException {
            return wrap(base.createSocket(nvl(h), p, la, lp));
        }

        @Override public java.net.Socket createSocket(java.net.InetAddress a, int p) throws java.io.IOException {
            return wrap(base.createSocket(a, p));
        }

        @Override public java.net.Socket createSocket(java.net.InetAddress a, int p,
                                                      java.net.InetAddress la, int lp) throws java.io.IOException {
            return wrap(base.createSocket(a, p, la, lp));
        }

        private String nvl(String h) { return h == null ? host : h; }
    }

    /* ============================== DoH + 竞速 ============================== */

    /** DoH 解析域名，失败返回空表 */
    public static List<String> resolve(String host) {
        final List<String> out = new ArrayList<>();
        if (host == null || host.isEmpty()) return out;
        // 多个解析器同时问、结果取并集：污染答案和真答案往往来自不同解析器，
        // 以前「谁先回用谁」，于是经常整段被一个带污染的解析器带偏。
        final List<String> hit = java.util.Collections.synchronizedList(new ArrayList<String>());
        final Object lock = new Object();
        for (String ep : DOH) {
            final String url = ep + host;
            Thread t = new Thread(() -> {
                try {
                    List<String> ips = dohQuery(url);
                    if (ips.isEmpty()) return;
                    synchronized (lock) {
                        for (String ip : ips) if (!hit.contains(ip)) hit.add(ip);
                        lock.notifyAll();
                    }
                } catch (Exception ignored) {}
            });
            t.setDaemon(true);
            t.start();
        }
        // 有答案就再等 1.2 秒收其它解析器的，最迟 2.6 秒收摊
        long t0 = System.currentTimeMillis();
        synchronized (lock) {
            while (true) {
                long el = System.currentTimeMillis() - t0;
                if (el >= 2600L) break;
                if (!hit.isEmpty() && el >= 1200L) break;
                try { lock.wait(120); } catch (InterruptedException ignored) {}
            }
        }
        out.addAll(hit);
        if (out.isEmpty()) {
            // DoH 全挂时退回系统解析，至少给出结果（可能是污染答案，后面还会被证书校验筛掉）
            try {
                for (InetAddress a : InetAddress.getAllByName(host)) {
                    String ip = a.getHostAddress();
                    if (ip != null && !out.contains(ip)) out.add(ip);
                }
            } catch (Exception ignored) {}
        }
        return out;
    }

    private static List<String> dohQuery(String url) {
        List<String> ips = new ArrayList<>();
        HttpURLConnection c = null;
        try {
            URL u = new URL(url);
            // 用 open() 而不是裸连接：它会把 ClientHello 固定成 TLS1.2。
            // 这套网络对 Java 默认的 TLS1.3 ClientHello 是直接不应的（能连上、没有回包、最后读超时）。
            c = open(url, 5000);
            c.setReadTimeout(4500);
            c.setRequestProperty("Accept", "application/dns-json");
            c.setRequestProperty("User-Agent", "JinnangMobile/2.3");
            // 必须主动要求短连接：doh.pub 走 keep-alive 时不发 EOF，
            // 原来一直 read 到流结束，就永远等在那儿，最后按「读超时」记一笔失败。
            c.setRequestProperty("Connection", "close");
            if (c.getResponseCode() != 200) return ips;
            InputStream is = c.getInputStream();
            int len = c.getContentLength();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (len > 0 && bo.size() >= len) break;
            }
            is.close();
            JSONObject o = new JSONObject(new String(bo.toByteArray(), "UTF-8"));
            JSONArray ans = o.optJSONArray("Answer");
            if (ans == null) return ips;
            for (int i = 0; i < ans.length(); i++) {
                JSONObject a = ans.optJSONObject(i);
                if (a == null) continue;
                if (a.optInt("type", 0) != 1) continue;
                String d = a.optString("data", "");
                if (d.matches("\\d{1,3}(\\.\\d{1,3}){3}") && !ips.contains(d)) ips.add(d);
            }
        } catch (Exception e) {
            Log.d(TAG, "doh fail " + e.getMessage() + " <- " + url);
        } finally {
            if (c != null) c.disconnect();
        }
        return ips;
    }

    /** 域名 → 最快线路（带 10 分钟缓存） */
    public static Node best(String host) {
        if (host == null) return null;
        Node n = nodes.get(host);
        long now = System.currentTimeMillis();
        if (n != null && now - n.ts < 600000L) return n;
        return probe(host);
    }

    /**
     * 线路探测。以前只测 TCP 443 通不通，结果挑出来的 IP 经常「TCP 通、握手就被 RST」，
     * Steam 二维码一直转圈就是这么来的。现在分两步：
     *   1) 系统 DNS + DoH 两边的 A 记录一起收集，TCP 443 并行竞速；
     *   2) 对最快的几个真正做一次 TLS 握手（带 SNI），只有握手成功才算能用。
     */
    public static Node probe(String host) {
        // DoH 优先。系统 DNS 在这类域名上基本都是被污染的答案，
        // 把它混进来只会让假 IP 抢到「最快」那个位置——之前那个 HTTP_403 就是它回敬的。
        List<String> ips = new ArrayList<>(resolve(host));
        if (ips.isEmpty()) {
            try {
                for (InetAddress a : InetAddress.getAllByName(host)) {
                    if (a instanceof java.net.Inet4Address) {
                        String ip = a.getHostAddress();
                        if (!ips.contains(ip)) ips.add(ip);
                    }
                }
            } catch (Exception ignored) {}
        }

        Node best = new Node();
        best.host = host;
        best.ip = "";
        best.ms = -1;
        best.ts = System.currentTimeMillis();
        if (ips.isEmpty()) {
            nodes.put(host, best);
            return best;
        }

        // 第一阶段：TCP 443 竞速
        final Map<String, Integer> tcp = new ConcurrentHashMap<>();
        List<Thread> th1 = new ArrayList<>();
        for (String ip : ips) {
            Thread t = new Thread(() -> {
                long t0 = System.nanoTime();
                if (ping(ip, 443, 1200)) {
                    tcp.put(ip, (int) ((System.nanoTime() - t0) / 1000000L));
                }
            });
            t.setDaemon(true);
            t.start();
            th1.add(t);
        }
        for (Thread t : th1) {
            try { t.join(1400); } catch (InterruptedException ignored) {}
        }

        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(tcp.entrySet());
        sorted.sort((a, b) -> Integer.compare(a.getValue(), b.getValue()));
        int limit = Math.min(3, sorted.size());

        // 第二阶段：对最快的几个做真握手，谁能握手谁才上
        final Map<String, Integer> tls = new ConcurrentHashMap<>();
        List<Thread> th2 = new ArrayList<>();
        for (int i = 0; i < limit; i++) {
            final String ip = sorted.get(i).getKey();
            Thread t = new Thread(() -> {
                int ms = tlsProbe(ip, host);
                if (ms >= 0) tls.put(ip, ms);
            });
            t.setDaemon(true);
            t.start();
            th2.add(t);
        }
        for (Thread t : th2) {
            try { t.join(4200); } catch (InterruptedException ignored) {}
        }

        Map<String, Integer> pick = tls.isEmpty() ? tcp : tls;
        for (Map.Entry<String, Integer> e : pick.entrySet()) {
            if (best.ms < 0 || e.getValue() < best.ms) {
                best.ms = e.getValue();
                best.ip = e.getKey();
            }
        }
        nodes.put(host, best);
        if (!tcp.isEmpty() && tls.isEmpty()) {
            BLOCKED.put(host.toLowerCase(Locale.ROOT), System.currentTimeMillis());
        } else {
            BLOCKED.remove(host.toLowerCase(Locale.ROOT));
        }
        Log.i(TAG, "probe " + host + " -> " + best.ip + " " + best.ms + "ms (tcp=" + tcp.size()
                + " tls=" + tls.size() + " from " + ips.size() + ")"
                + (!tcp.isEmpty() && tls.isEmpty() ? " BLOCKED(握手全被打断，别在这条路上等)" : ""));
        return best;
    }

    /**
     * 对一个 IP 做真正的 TLS 握手（SNI = 真实域名，并且**证书必须匹配这个域名**），成功返回耗时，失败 -1。
     * 以前只握手不验域名，被污染到 Facebook 的 IP 也能「握手成功」并抢到最快线路，
     * 请求打过去对方回一个 403 —— 这就是那个莫名其妙的「二维码不可用 HTTP_403」。
     */
    private static int tlsProbe(String ip, String host) {
        long t0 = System.nanoTime();
        java.net.Socket raw = null;
        javax.net.ssl.SSLSocket ss = null;
        try {
            raw = new java.net.Socket();
            raw.connect(new java.net.InetSocketAddress(ip, 443), 1800);
            ss = (javax.net.ssl.SSLSocket) ((javax.net.ssl.SSLSocketFactory)
                    javax.net.ssl.SSLSocketFactory.getDefault())
                    .createSocket(raw, host, 443, true);
            ss.setSoTimeout(2600);
            javax.net.ssl.SSLParameters pr = ss.getSSLParameters();
            pr.setServerNames(java.util.Collections.singletonList(
                    new javax.net.ssl.SNIHostName(host)));
            pr.setEndpointIdentificationAlgorithm("HTTPS");   // 关键：证书得真是这个域名的
            ss.setSSLParameters(pr);
            ss.startHandshake();
            return (int) ((System.nanoTime() - t0) / 1000000L);
        } catch (Exception e) {
            return -1;
        } finally {
            try { if (ss != null) ss.close(); } catch (Exception ignored) {}
            try { if (raw != null) raw.close(); } catch (Exception ignored) {}
        }
    }

    /** 网络自检：DNS / TCP / TLS 三段打到 logcat，用来定位到底哪一层断了 */
    public static void diag() {
        pool.execute(() -> {
            String[] hosts = {"api.steampowered.com", "store.steampowered.com"};
            for (String host : hosts) {
                try {
                    long t0 = System.currentTimeMillis();
                    InetAddress[] all = InetAddress.getAllByName(host);
                    StringBuilder sb = new StringBuilder();
                    for (InetAddress a : all) sb.append(a.getHostAddress()).append(' ');
                    Log.i(TAG, "diag dns " + host + " -> " + sb
                            + (System.currentTimeMillis() - t0) + "ms");
                    for (InetAddress a : all) {
                        if (!(a instanceof java.net.Inet4Address)) continue;
                        long t1 = System.currentTimeMillis();
                        try {
                            Socket sk = new Socket();
                            sk.connect(new InetSocketAddress(a, 443), 4000);
                            sk.close();
                        } catch (Exception e) {
                            Log.i(TAG, "diag tcp " + host + " " + a.getHostAddress() + " fail "
                                    + (System.currentTimeMillis() - t1) + "ms");
                            continue;
                        }
                        int ms = tlsProbe(a.getHostAddress(), host);
                        Log.i(TAG, "diag tls " + host + " " + a.getHostAddress()
                                + (ms >= 0 ? " ok " + ms + "ms" : " FAIL"));
                    }
                } catch (Exception e) {
                    Log.i(TAG, "diag err " + host + " " + e);
                }
            }
            Log.i(TAG, "diag done");
        });
    }

    /** 启动预热：把所有登录域名跑一遍，结果留在缓存里 */
    public static void prewarm() {
        long now = System.currentTimeMillis();
        if (now - warmTs < 30000L) return;
        warmTs = now;
        for (String h : WARM) {
            try { probe(h); } catch (Exception ignored) {}
        }
        Log.i(TAG, "prewarm done, proxy=" + effectiveProxy());
    }

    /* ============================== 状态 / 请求 ============================== */

    public static String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("on", on);
            o.put("proxy", effectiveProxy());
            o.put("manual", manualProxy());
            o.put("auto", autoProxy);
            o.put("vpn", vpnActive());
            JSONArray arr = new JSONArray();
            for (String h : WARM) {
                Node n = nodes.get(h);
                if (n == null) continue;
                arr.put(n.json());
            }
            o.put("nodes", arr);
            int bestMs = -1;
            for (String h : WARM) {
                Node n = nodes.get(h);
                if (n != null && n.ms > 0 && (bestMs < 0 || n.ms < bestMs)) bestMs = n.ms;
            }
            o.put("ms", bestMs);
        } catch (Exception ignored) {}
        return o.toString();
    }

    /** 重新测速（异步），完成后回 status */
    public static void refresh() {
        warmTs = 0L;
        proxyTs = 0L;
        nodes.clear();
        pool.execute(Accel::prewarm);
    }

    public static final class Resp {
        public int code;
        public String url;
        public String mime;
        public Map<String, String> headers = new LinkedHashMap<>();
        public List<String> setCookies = new ArrayList<>();
        public byte[] body = new byte[0];
    }

    /**
     * 取一份完整响应（GET，内部跟随最多 5 次重定向）。
     * 给 WebView 的 Steam 资源接管用。
     */
    public static Resp fetch(String url, Map<String, String> reqHeaders, String cookie, int timeoutMs) throws Exception {
        return fetch(url, reqHeaders, cookie, timeoutMs, true);
    }

    /**
     * @param follow false 时把 3xx 原样交回去（Location 放在 headers 里）。
     *               主文档导航必须用 false：重定向在 Java 里被吃掉的话，
     *               WebView 的地址栏还停在原 URL 上，相对路径和 cookie 全跟着错。
     */
    public static Resp fetch(String url, Map<String, String> reqHeaders, String cookie,
                             int timeoutMs, boolean follow) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = openSmart(cur, timeoutMs);
            c.setInstanceFollowRedirects(false);
            if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
            if (reqHeaders != null) {
                for (Map.Entry<String, String> e : reqHeaders.entrySet()) {
                    String k = e.getKey();
                    if (k == null) continue;
                    String lk = k.toLowerCase(Locale.ROOT);
                    if (lk.equals("host") || lk.equals("cookie") || lk.equals("accept-encoding")
                            || lk.equals("connection") || lk.equals("content-length")) continue;
                    c.setRequestProperty(k, e.getValue());
                }
            }
            int code = c.getResponseCode();
            String loc = c.getHeaderField("Location");
            if (code >= 300 && code < 400 && loc != null) {
                String next = new URL(new URL(cur), loc).toString();
                if (!follow) {
                    Resp r = new Resp();
                    r.code = code;
                    r.url = cur;
                    r.mime = "text/html; charset=utf-8";
                    r.headers.put("Location", next);
                    c.disconnect();
                    return r;
                }
                cur = next;
                c.disconnect();
                continue;
            }
            Resp r = new Resp();
            r.code = code;
            r.url = cur;
            InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (is != null) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                is.close();
            }
            r.body = bo.toByteArray();
            List<String> sc = c.getHeaderFields().get("Set-Cookie");
            if (sc == null) sc = c.getHeaderFields().get("set-cookie");
            if (sc != null) r.setCookies.addAll(sc);
            for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                if (e.getKey() == null) continue;
                String k = e.getKey();
                if (k.equalsIgnoreCase("Content-Length") || k.equalsIgnoreCase("Transfer-Encoding")
                        || k.equalsIgnoreCase("Content-Encoding") || k.equalsIgnoreCase("Connection")) continue;
                StringBuilder sb = new StringBuilder();
                for (String v : e.getValue()) {
                    if (sb.length() > 0) sb.append(", ");
                    sb.append(v);
                }
                r.headers.put(k, sb.toString());
            }
            r.mime = c.getContentType();
            c.disconnect();
            return r;
        }
        throw new java.io.IOException("too many redirects");
    }

    /** 从 Content-Type 里拆 charset */
    public static String charsetOf(String contentType) {
        if (contentType == null) return "utf-8";
        int i = contentType.toLowerCase(Locale.ROOT).indexOf("charset=");
        if (i < 0) return "utf-8";
        String s = contentType.substring(i + 8).trim();
        int j = s.indexOf(';');
        if (j > 0) s = s.substring(0, j);
        s = s.trim().replace("\"", "");
        return s.isEmpty() ? "utf-8" : s;
    }
}
