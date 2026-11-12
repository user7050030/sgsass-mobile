package com.jinnang.mobile;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 把当前二维码用浏览器「投」给另一块屏幕看的小服务。
 *
 * 为什么需要它：
 *   有些登录入口只认摄像头取景框（Steam 手机版就是，扫码器不给「从相册选」），
 *   而 Android 上第三方应用没法把画面写进摄像头流——摄像头由 cameraserver + HAL 独占，
 *   普通应用只能读不能写。所以改成让真实摄像头「有东西可扫」：
 *   手机在局域网里起一个只读页面，电脑或另一台手机用浏览器打开，
 *   目标 App 的摄像头对着那块屏幕扫——对扫码方来说这就是一次真实扫描。
 *
 * 安全边界：
 *   · 只监听局域网，只回三样东西：页面、当前这张码的 PNG、状态 JSON
 *   · 不读手机任何文件、不接受上传、不落盘，码只在内存里
 *   · 停止即关端口；应用退出时也会停
 */
public final class LanQr {

    private static final String TAG = "JND-LANQR";
    private static final int PREFERRED_PORT = 8722;

    private static ServerSocket server;
    private static volatile int port = 0;
    private static ExecutorService pool;
    private static volatile byte[] png = null;
    private static volatile String title = "";
    private static volatile String sub = "";
    private static volatile long version = 0;

    private LanQr() {}

    public static int port() { return port; }

    public static boolean running() {
        return port > 0 && server != null && !server.isClosed();
    }

    /** 起服务（幂等）；失败返回 0 */
    public static synchronized int start() {
        if (running()) return port;
        ServerSocket ss = bind(PREFERRED_PORT);
        if (ss == null) ss = bind(0);
        if (ss == null) return 0;
        server = ss;
        pool = Executors.newCachedThreadPool();
        port = ss.getLocalPort();
        Thread t = new Thread(LanQr::acceptLoop, "jnd-lanqr");
        t.setDaemon(true);
        t.start();
        Log.i(TAG, "listen " + port);
        return port;
    }

    private static ServerSocket bind(int p) {
        try {
            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(InetAddress.getByName("0.0.0.0"), p), 16);
            return ss;
        } catch (Throwable e) {
            return null;
        }
    }

    public static synchronized void stop() {
        try { if (server != null) server.close(); } catch (Throwable ignored) {}
        server = null;
        port = 0;
        png = null;
        version = 0;
        Log.i(TAG, "stopped");
    }

    /** 换码：网页轮询到版本变了就换图 */
    public static void setQr(String dataUrl, String ttl, String subText) {
        byte[] b = null;
        try {
            int p = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (p > 0 && dataUrl.startsWith("data:image")) {
                b = android.util.Base64.decode(dataUrl.substring(p + 1), android.util.Base64.DEFAULT);
            }
        } catch (Throwable ignored) {}
        if (b != null) png = b;
        title = ttl == null ? "" : ttl;
        sub = subText == null ? "" : subText;
        version = System.currentTimeMillis();
    }

    /** 手机当前在局域网里的地址；取不到返回空串 */
    public static String lanIp() {
        try {
            List<NetworkInterface> all = Collections.list(NetworkInterface.getNetworkInterfaces());
            String fallback = "";
            for (NetworkInterface ni : all) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName() == null ? "" : ni.getName().toLowerCase();
                // 跳过蜂窝与虚拟网卡，尽量给能互通的地址
                if (n.startsWith("rmnet") || n.startsWith("tun") || n.startsWith("dummy")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    if (ip == null || ip.startsWith("169.254")) continue;
                    if (n.startsWith("wlan") || n.startsWith("ap") || n.startsWith("eth")) return ip;
                    if (fallback.isEmpty()) fallback = ip;
                }
            }
            return fallback;
        } catch (Throwable ignored) {}
        return "";
    }

    public static String url() {
        String ip = lanIp();
        if (ip.isEmpty() || !running()) return "";
        return "http://" + ip + ":" + port + "/";
    }

    private static void acceptLoop() {
        while (true) {
            try {
                final Socket c = server.accept();
                ExecutorService p = pool;
                if (p == null) { c.close(); return; }
                p.execute(() -> handle(c));
            } catch (Throwable e) {
                if (server == null || server.isClosed()) return;
            }
        }
    }

    private static void handle(Socket c) {
        try {
            c.setSoTimeout(4000);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            // 必须读到空行（\r\n\r\n 或 \n\n）为止：只读到第一个 \r\n 就返回的话，
            // 后面的头部还压在接收缓冲里，关闭连接时内核会回 RST，浏览器那边就是一个空响应。
            byte[] tail = new byte[4];
            int tn = 0, cur;
            while ((cur = in.read()) != -1) {
                head.write(cur);
                tail[tn & 3] = (byte) cur;
                tn++;
                if (tn >= 2 && tail[(tn - 1) & 3] == '\n') {
                    if (tail[(tn - 2) & 3] == '\n') break;                       // \n\n
                    if (tn >= 4 && tail[(tn - 4) & 3] == '\r'
                            && tail[(tn - 3) & 3] == '\n'
                            && tail[(tn - 2) & 3] == '\r') break;                 // \r\n\r\n
                }
                if (head.size() > 4096) break;
            }
            String req = head.toString("UTF-8");
            int sp1 = req.indexOf(' ');
            int sp2 = sp1 < 0 ? -1 : req.indexOf(' ', sp1 + 1);
            String path = (sp1 > 0 && sp2 > sp1) ? req.substring(sp1 + 1, sp2) : "/";
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);

            OutputStream out = c.getOutputStream();
            if (path.equals("/qr.png")) {
                byte[] b = png;
                if (b == null) {
                    write(out, 404, "text/plain; charset=utf-8", "no qr".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n"
                        + "Cache-Control: no-store\r\nContent-Length: " + b.length + "\r\n"
                        + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(b);
                out.flush();
                return;
            }
            if (path.equals("/state")) {
                String json = "{\"v\":" + version + ",\"title\":" + js(title) + ",\"sub\":" + js(sub)
                        + ",\"has\":" + (png != null) + "}";
                write(out, 200, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8));
                return;
            }
            write(out, 200, "text/html; charset=utf-8", page().getBytes(StandardCharsets.UTF_8));
        } catch (Throwable ignored) {
        } finally {
            try { c.close(); } catch (Throwable ignored) {}
        }
    }

    private static void write(OutputStream out, int code, String type, byte[] body) throws Exception {
        String h = "HTTP/1.1 " + code + (code == 200 ? " OK" : " Not Found") + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String js(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20) b.append(' ');
            else b.append(ch);
        }
        return b.append('"').toString();
    }

    private static String page() {
        StringBuilder s = new StringBuilder();
        s.append("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">")
         .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
         .append("<title>扫码 · 三国杀手机助手</title>")
         .append("<style>")
         .append("html,body{margin:0;min-height:100%;background:#f3efe5;color:#1b1610;")
         .append("font-family:-apple-system,'PingFang SC','Noto Sans SC',system-ui,sans-serif}")
         .append(".w{min-height:100vh;display:flex;flex-direction:column;align-items:center;")
         .append("justify-content:center;gap:16px;padding:24px;box-sizing:border-box}")
         .append("h1{font-size:19px;font-weight:600;letter-spacing:1px;margin:0;text-align:center}")
         .append(".box{background:#fff;border-radius:20px;padding:14px;box-shadow:0 12px 44px rgba(60,40,10,.18)}")
         .append("img{display:block;width:min(74vw,440px);height:min(74vw,440px)}")
         .append(".sub{font-size:14px;color:#6b6152;text-align:center;max-width:540px;line-height:1.65;margin:0}")
         .append(".ft{font-size:12px;color:#9a8f7c;letter-spacing:.5px}")
         .append(".off{font-size:13px;color:#a2453a;text-align:center}")
         .append("</style></head><body><div class=\"w\">")
         .append("<h1 id=\"t\">正在取码…</h1>")
         .append("<div class=\"box\"><img id=\"q\" alt=\"二维码\" src=\"/qr.png\"></div>")
         .append("<p class=\"sub\" id=\"s\">把另一台设备上的扫码器对着这块屏幕</p>")
         .append("<p class=\"ft\">三国杀手机助手 · 仅局域网可访问，手机上停止后立即失效</p>")
         .append("</div><script>")
         .append("var v=-1,bad=0,t0=0;")
         .append("function tick(){fetch('/state',{cache:'no-store'}).then(function(r){return r.json()})")
         .append(".then(function(d){bad=0;t0=0;")
         .append("document.getElementById('t').textContent=d.title||'扫码';")
         .append("document.getElementById('s').textContent=d.sub||'';")
         .append("if(d.v!==v){v=d.v;if(d.has){document.getElementById('q').src='/qr.png?t='+d.v;}}})")
         .append(".catch(function(){bad++;if(bad>3&&!t0){t0=1;")
         .append("document.getElementById('s').innerHTML=")
         .append("'<span class=\"off\">连不上手机了 · 检查是否同一 WiFi、手机上是否已停止</span>';}});}")
         .append("setInterval(tick,2000);tick();")
         .append("</script></body></html>");
        return s.toString();
    }
}
