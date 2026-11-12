// GM API 桥：把 Tampermonkey 的 GM_* 换成「页面 → 原生 App」的调用。
// 存储走 SharedPreferences，跨域请求走原生 HTTP（WebView 里 XHR 会被 CORS 挡，原生不受限）。
(function () {
  'use strict';
  if (window.__JND_GM__) return;
  window.__JND_GM__ = true;

  var bridge = window.SgsMobileBridge || null;
  var store = {};
  try {
    var raw = bridge && bridge.gmDump ? bridge.gmDump() : '{}';
    store = JSON.parse(raw || '{}') || {};
  } catch (e) { store = {}; }

  function clone(v) {
    try { return v == null ? v : JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  window.GM_getValue = function (key, fallback) {
    var k = String(key);
    return Object.prototype.hasOwnProperty.call(store, k) ? clone(store[k]) : fallback;
  };
  window.GM_setValue = function (key, value) {
    var k = String(key);
    store[k] = value === undefined ? null : clone(value);
    try { if (bridge) bridge.gmSet(k, JSON.stringify(store[k])); } catch (e) {}
  };
  window.GM_deleteValue = function (key) {
    var k = String(key);
    delete store[k];
    try { if (bridge) bridge.gmDel(k); } catch (e) {}
  };
  window.GM_listValues = function () { return Object.keys(store); };

  var seq = 0;
  var pending = {};

  window.GM_xmlhttpRequest = function (details) {
    if (!details || !details.url) throw new Error('GM_xmlhttpRequest 缺少 url');
    var id = 'gm' + (++seq) + 'x' + Date.now();
    pending[id] = details;
    var headers = details.headers || {};
    // 统一登录器自己维护着一份 Cookie 罐（GM 参数 details.cookie），以前这里直接丢了，
    // 原生层只能拿到 WebView 的 CookieManager —— Steam 认证链上的 cookie 就这样断在半路。
    if (details.cookie) {
      var hasCookie = Object.keys(headers).some(function (k) { return k.toLowerCase() === 'cookie'; });
      if (!hasCookie) {
        headers = Object.assign({}, headers);
        headers.Cookie = String(details.cookie);
      }
    }
    var data = details.data == null ? '' : String(details.data);
    if (!bridge) {
      setTimeout(function () { if (details.onerror) details.onerror({ status: 0, error: 'no-bridge' }); }, 0);
      return { abort: function () {} };
    }
    try {
      bridge.gmHttp(id, String(details.url), String(details.method || 'GET'),
        JSON.stringify(headers), data, String(details.responseType || ''), Number(details.timeout || 0),
        String(details.redirect || ''), details.anonymous === true);
    } catch (e) {
      setTimeout(function () {
        delete pending[id];
        if (details.onerror) details.onerror({ status: 0, error: String(e) });
      }, 0);
    }
    return {
      abort: function () {
        var d = pending[id];
        delete pending[id];
        try { bridge.gmAbort(id); } catch (e) {}
        if (d && d.onabort) d.onabort({ status: 0, error: 'abort' });
      }
    };
  };

  function b64ToArrayBuffer(b64) {
    try {
      var bin = atob(b64 || '');
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    } catch (e) { return new ArrayBuffer(0); }
  }

  // 原生回调入口
  window.__gmResolve = function (id, json) {
    var d = pending[id];
    if (!d) {
      // 面板自己发起的原生任务（下载插件更新 / 安装 APK）走这里
      var extra = window.__jndNative && window.__jndNative[id];
      if (extra) {
        delete window.__jndNative[id];
        var r0;
        try { r0 = JSON.parse(json); } catch (e) { r0 = { ok: false, error: 'bad-json' }; }
        try { extra(r0); } catch (e) {}
      }
      return;
    }
    delete pending[id];
    var r;
    try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: 'bad-json' }; }
    var resp = {
      status: Number(r.status || 0),
      statusText: String(r.statusText || ''),
      responseHeaders: String(r.headers || ''),
      finalUrl: String(r.url || d.url),
      readyState: 4,
      context: d.context
    };
    if (r.ok) {
      if (d.responseType === 'arraybuffer') {
        resp.response = b64ToArrayBuffer(r.bodyB64);
      } else {
        resp.responseText = String(r.body == null ? '' : r.body);
        resp.response = resp.responseText;
      }
      if (typeof d.onreadystatechange === 'function') { try { d.onreadystatechange(resp); } catch (e) {} }
      if (typeof d.onload === 'function') { try { d.onload(resp); } catch (e) {} }
    } else {
      resp.error = String(r.error || 'network');
      if (typeof d.onerror === 'function') { try { d.onerror(resp); } catch (e) {} }
    }
  };

  window.GM_info = {
    scriptHandler: 'JinnangMobile',
    version: '2.1.0',
    script: { name: '统一登录器', version: '' }
  };

  // userscript 里的 unsafeWindow 在 WebView 里就是页面自己的 window
  try { if (!window.unsafeWindow) window.unsafeWindow = window; } catch (e) {}

  // 告诉统一登录器：当前是「微端」宿主 —— 它会隐藏页面浮动按钮，把二维码投影给宿主画
  try {
    if (!window.__JND_HOST) window.__JND_HOST = { kind: 'micro', version: '2.1.0' };
  } catch (e) {}

  console.log('[JND] gm shim ready keys=' + Object.keys(store).length);
})();
