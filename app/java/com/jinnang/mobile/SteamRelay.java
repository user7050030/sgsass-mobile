package com.jinnang.mobile;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Steam 专用的小隧道（只服务本 App 自己发出的请求，不碰 WebView）。
 *
 * 为什么需要它：
 *   国内访问 steamcommunity.com，系统 DNS 给的地址基本是污染的。我们手上虽然有 DoH 选出来的
 *   真实 IP，但 Java 的 HttpURLConnection 不支持「连 A 这个 IP，却把 Host / SNI 写成 B 域名」——
 *   手工 setRequestProperty("Host", ...) 在 Android 上不生效，请求就这样打到了别人的服务器上，
 *   对方回一个 403，看起来像「Steam 拒绝登录」，其实是打错门了。
 *
 * 解法：
 *   在 127.0.0.1 起一个只做 CONNECT 的转发口。HttpURLConnection 用普通 HTTP 代理的方式连它，
 *   URL 里仍然是真域名（Host / SNI / 证书校验全都正常），隧道这一端负责把连接钉到真实 IP 上。
 *   对上层完全透明，重定向、cookie、gzip 那些逻辑一行都不用重写。
 */
public final class SteamRelay {

    private static final String TAG = "JND-RELAY";

    private static ServerSocket server;
    private static volatile int port = 0;
    private static ExecutorService pool;
    private static final java.util.concurrent.atomic.AtomicLong ROT =
            new java.util.concurrent.atomic.AtomicLong();

    private SteamRelay() {}

    public static int port() { return port; }

    /** 起隧道（幂等）；失败返回 0，调用方就退回直连 */
    public static synchronized int start() {
        if (port > 0 && server != null && !server.isClosed()) return port;
        try {
            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 32);
            server = ss;
            pool = Executors.newCachedThreadPool();
            port = ss.getLocalPort();
            Thread t = new Thread(SteamRelay::acceptLoop, "jnd-relay");
            t.setDaemon(true);
            t.start();
            Log.i(TAG, "listen 127.0.0.1:" + port);
            return port;
        } catch (Throwable e) {
            Log.w(TAG, "start fail " + e);
            port = 0;
            return 0;
        }
    }

    private static void acceptLoop() {
        while (true) {
            try {
                final Socket c = server.accept();
                ExecutorService p = pool;
                if (p == null) { close(c); break; }
                p.execute(() -> handle(c));
            } catch (Throwable e) {
                if (server == null || server.isClosed()) break;
                Log.w(TAG, "accept " + e);
                try { Thread.sleep(120); } catch (InterruptedException ignored) {}
            }
        }
    }

    private static void handle(Socket c) {
        Socket up = null;
        try {
            c.setSoTimeout(20000);
            c.setTcpNoDelay(true);
            String head = readHead(c.getInputStream());
            if (head == null) { close(c); return; }

            String first = head.split("\r\n")[0];
            String[] p = first.split(" ");
            if (p.length < 2 || !"CONNECT".equalsIgnoreCase(p[0])) {
                // 只会收到 CONNECT；别的一律拒掉，免得被当成通用代理
                reply(c, "HTTP/1.1 405 Method Not Allowed\r\n\r\n");
                return;
            }
            String target = p[1];
            int i = target.lastIndexOf(':');
            String host = i > 0 ? target.substring(0, i) : target;
            int destPort;
            try { destPort = i > 0 ? Integer.parseInt(target.substring(i + 1)) : 443; }
            catch (Exception e) { destPort = 443; }

            up = dial(host, destPort);
            if (up == null) {
                Log.i(TAG, "dial fail " + host + ":" + destPort);
                reply(c, "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
                return;
            }
            reply(c, "HTTP/1.1 200 Connection Established\r\n\r\n");
            c.setSoTimeout(0);
            pipe(c, up);
        } catch (Throwable e) {
            Log.d(TAG, "handle " + e);
            close(up);
            close(c);
        }
    }

    /** 钉到已验证的真实 IP；一条都不通再退回普通解析 */
    private static Socket dial(String host, int destPort) {
        if (host == null || host.isEmpty()) return null;
        String h = host.toLowerCase(Locale.ROOT);

        List<String> ips = new ArrayList<>();
        if (Accel.isSteam("https://" + h + "/")) {
            Accel.Node n = Accel.best(h);
            if (n != null && n.ip != null && !n.ip.isEmpty()) ips.add(n.ip);
            for (String s : Accel.resolve(h)) if (!ips.contains(s)) ips.add(s);
        }
        if (ips.isEmpty()) {
            try {
                for (InetAddress a : InetAddress.getAllByName(h)) {
                    String ip = a.getHostAddress();
                    if (ip != null && !ips.contains(ip)) ips.add(ip);
                }
            } catch (Exception ignored) {}
        }

        // 轮转起点：同一个域名的候选 IP 每次 dial 从不同位置起，
        // 某台边缘节点一直回 403 时，下一次尝试就自动换一家。
        int n = Math.min(ips.size(), 4);
        int start = ips.size() > 1 ? (int) (ROT.getAndIncrement() % n) : 0;
        for (int k = 0; k < n; k++) {
            int idx = (start + k) % n;
            Socket s = new Socket();
            try {
                Log.i(TAG, "dial " + host + " -> " + ips.get(idx) + ":" + destPort
                        + (k > 0 ? " (rotated " + start + ")" : ""));
                s.connect(new InetSocketAddress(ips.get(idx), destPort), 5000);
                s.setTcpNoDelay(true);
                return s;
            } catch (Exception e) {
                close(s);
            }
        }
        return null;
    }

    private static String readHead(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream(512);
        byte[] buf = new byte[1024];
        while (bo.size() < 8192) {
            int n = in.read(buf);
            if (n < 0) break;
            bo.write(buf, 0, n);
            String s = bo.toString("ISO-8859-1");
            if (s.contains("\r\n\r\n")) return s;
        }
        return null;
    }

    private static void reply(Socket c, String msg) throws Exception {
        OutputStream o = c.getOutputStream();
        o.write(msg.getBytes("ISO-8859-1"));
        o.flush();
    }

    private static void pipe(final Socket a, final Socket b) {
        Thread t1 = pump(a, b);
        Thread t2 = pump(b, a);
        try { t1.join(); } catch (InterruptedException ignored) {}
        try { t2.join(); } catch (InterruptedException ignored) {}
        close(a);
        close(b);
    }

    private static Thread pump(final Socket from, final Socket to) {
        Thread t = new Thread(() -> {
            byte[] buf = new byte[32768];
            try {
                InputStream in = from.getInputStream();
                OutputStream out = to.getOutputStream();
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    out.flush();
                }
            } catch (Exception ignored) {
            } finally {
                try { to.shutdownOutput(); } catch (Exception ignored) {}
            }
        });
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static void close(Socket s) {
        if (s == null) return;
        try { s.close(); } catch (Exception ignored) {}
    }
}
