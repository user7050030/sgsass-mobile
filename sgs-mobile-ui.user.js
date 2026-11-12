// ==UserScript==
// @name         锦囊妙计·手机适配层
// @namespace    https://github.com/user7050030/sgs-synthesize-plugin
// @version      0.1.1
// @description  手机端适配：面板全屏化、触控加大、悬浮球安全区、/sound 全屏、相册保存截图（showDirectoryPicker 桥）、模拟快捷键截图按钮。
// @author       Tihaon7050030
// @match        *://*.sanguosha.com/10/*
// @match        *://*.sanguosha.com/x/*
// @match        *://*.sanguosha.com/10th/*
// @match        https://web.sanguosha.com/login/*
// @match        https://game.4399iw2.com/yxxsgs/*
// @match        *://h5.7k7k.com/*
// @match        *://qqgame.qq.com/webappframe/*
// @match        *://*.qqopenapp.com/pc/qqLobby_index.php*
// @match        *://kuaiwan.com/*
// @match        *://sgsszn.wan.360.cn/*
// @exclude      *://*.sanguosha.com/220/*
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  if (window.__SGS_MOBILE_UI__) return;
  window.__SGS_MOBILE_UI__ = true;

  const MOBILE_CSS_ID = 'sgs-mobile-css';
  const STORE_KEY = 'sgs-synthesize:settings:v2';
  const bridge = window.SgsMobileBridge || null;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isNarrow = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 720;
  const IS_MOBILE = Boolean(bridge) || isTouch || isNarrow;
  window.__SGS_MOBILE__ = { bridge: Boolean(bridge), touch: isTouch, narrow: isNarrow };

  /* ---------- 手机端：无锦囊袋时强制独立面板，避免并进不存在的页签 ---------- */
  (function forceStandalonePanel() {
    if (window.__JND) return;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      if (!raw) { obj.panelMode = 'standalone'; localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }
      else if (obj.panelMode === 'integrated') { obj.panelMode = 'standalone'; localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }
    } catch (_) {}
  })();

  /* ---------- PC 游戏页固定布局宽 1280，靠 WebView 整体缩放 ---------- */
  (function fixViewport() {
    if (!IS_MOBILE) return;
    const apply = () => {
      const head = document.head || document.querySelector('head');
      if (!head) return false;
      const host = String(location.hostname || '');
      const isPcGame = /(^|\.)sanguosha\.com$/i.test(host) && /\/(?:x|10|10th)(?:\/|$)/i.test(location.pathname);
      if (!isPcGame) return true;
      let meta = head.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=1280, shrink-to-fit=no');
      return true;
    };
    if (!apply()) {
      const timer = setInterval(() => { if (apply()) clearInterval(timer); }, 60);
      setTimeout(() => clearInterval(timer), 12000);
    }
  })();

  /* ---------- 手机样式覆盖层 ---------- */
  const MOBILE_CSS = `
    html.sgs-m { -webkit-text-size-adjust: 100%; }
    /* 独立面板：全屏底部抽屉 */
    html.sgs-m #sgs-syn-standalone {
      left: 0 !important; right: 0 !important; bottom: 0 !important; top: auto !important;
      width: 100vw !important; max-height: 84vh !important;
      border-radius: 16px 16px 0 0 !important;
      border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, .55) !important;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    html.sgs-m .sgs-syn-standalone-head { padding: 14px 16px 12px; }
    html.sgs-m .sgs-syn-standalone-title { font-size: 21px !important; }
    html.sgs-m .sgs-syn-standalone-close { width: 44px !important; height: 44px !important; font-size: 24px !important; }
    html.sgs-m .sgs-syn-standalone-body { padding: 10px 14px calc(14px + env(safe-area-inset-bottom, 0px)) !important; }
    /* 开关行加大 */
    html.sgs-m #sgs-syn-standalone .jnd-opt { padding: 9px 0; min-height: 44px; }
    html.sgs-m #sgs-syn-standalone .jnd-opt-name { font-size: 16px !important; }
    html.sgs-m #sgs-syn-standalone .jnd-opt-desc { font-size: 13px !important; }
    html.sgs-m #sgs-syn-standalone .jnd-cm-hit { width: 64px !important; height: 32px !important; }
    /* 分段按钮 / 预设 / 输入 */
    html.sgs-m .sgs-syn-seg button { height: 40px !important; font-size: 15px !important; }
    html.sgs-m .sgs-syn-preset-btn, html.sgs-m .sgs-syn-preset-toggle {
      height: 40px !important; min-width: 60px !important; padding: 0 14px !important;
      font-size: 14px !important; border-radius: 20px !important;
    }
    html.sgs-m .sgs-syn-hotkey-btn, html.sgs-m .sgs-syn-hotkey-clear { height: 40px !important; font-size: 14px !important; min-width: 100px; }
    html.sgs-m .sgs-syn-input, html.sgs-m .sgs-syn-btn { height: 44px !important; font-size: 16px !important; }
    html.sgs-m .sgs-syn-mode-label, html.sgs-m .sgs-syn-count, html.sgs-m .sgs-syn-channel { font-size: 13px !important; }
    html.sgs-m .sgs-syn-shot-info { font-size: 13px !important; }
    /* 台词结果行 */
    html.sgs-m .sgs-syn-phrase-avatar { width: 58px !important; height: 58px !important; }
    html.sgs-m .sgs-syn-phrase-text { font-size: 16px !important; }
    html.sgs-m .sgs-syn-phrase-meta { font-size: 12px !important; }
    html.sgs-m .sgs-syn-play { min-width: 48px !important; min-height: 44px !important; font-size: 18px !important; }
    html.sgs-m .sgs-syn-empty { font-size: 14px !important; padding: 20px 8px !important; }
    /* /sound 弹窗全屏 */
    html.sgs-m .sgs-syn-modal-card {
      width: 100vw !important; max-height: 100vh !important; height: 100%;
      border-radius: 0 !important; border: 0 !important;
    }
    html.sgs-m .sgs-syn-modal-head { padding: 16px 16px 12px; }
    html.sgs-m .sgs-syn-modal-title { font-size: 22px !important; }
    html.sgs-m .sgs-syn-modal-close { width: 44px !important; height: 44px !important; font-size: 24px !important; }
    html.sgs-m .sgs-syn-modal-body { padding: 12px 16px !important; }
    html.sgs-m .sgs-syn-modal-body .sgs-syn-input, html.sgs-m .sgs-syn-modal-body .sgs-syn-btn { height: 46px !important; font-size: 16px !important; }
    html.sgs-m .sgs-syn-modal-foot { font-size: 12px !important; padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px)); }
    /* 悬浮球 / 白点 / toast */
    html.sgs-m #sgs-syn-ball {
      width: 58px !important; height: 58px !important; font-size: 24px !important;
      right: 14px !important; bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important;
    }
    html.sgs-m #sgs-syn-white-dot {
      width: 42px !important; height: 42px !important;
      left: 14px !important; bottom: calc(24px + env(safe-area-inset-bottom, 0px)) !important;
    }
    html.sgs-m #sgs-syn-toast {
      max-width: 86vw !important; font-size: 15px !important;
      bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important;
      padding: 11px 18px !important; border-radius: 10px !important;
    }
    /* 手机截图按钮 */
    html.sgs-m .sgs-m-shot-btn {
      height: 40px; padding: 0 18px; margin-left: 8px; border-radius: 20px; cursor: pointer;
      border: 1px solid rgba(238, 205, 128, .8);
      background: linear-gradient(180deg, rgba(112, 83, 42, .92), rgba(68, 50, 28, .92));
      color: #ffe9b8; font: 14px "Microsoft YaHei", sans-serif; flex: none;
    }
    html.sgs-m .sgs-m-shot-btn:active { filter: brightness(1.2); }
  `;

  function installCss() {
    if (document.getElementById(MOBILE_CSS_ID)) return true;
    const target = document.head || document.documentElement;
    if (!target) return false;
    const style = document.createElement('style');
    style.id = MOBILE_CSS_ID;
    style.textContent = MOBILE_CSS;
    target.appendChild(style);
    if (document.documentElement) document.documentElement.classList.add('sgs-m');
    else document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('sgs-m'), { once: true });
    return true;
  }
  if (!installCss()) {
    const cssTimer = setInterval(() => { if (installCss()) clearInterval(cssTimer); }, 30);
    setTimeout(() => clearInterval(cssTimer), 20000);
  }

  /* ---------- 简易 toast ---------- */
  function toast(msg) {
    const old = document.getElementById('sgs-mobile-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'sgs-mobile-toast';
    el.textContent = String(msg || '');
    el.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:2147483900;'
      + 'max-width:86vw;padding:11px 18px;border-radius:10px;background:rgba(20,16,10,.95);color:#f5e3b8;'
      + 'font:15px "Microsoft YaHei",sans-serif;border:1px solid rgba(214,173,78,.6);box-shadow:0 8px 24px rgba(0,0,0,.5);';
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
  }

  /* ---------- 相册保存：File System Access 桥 ---------- */
  function saveBlobToGallery(blob, name) {
    if (!bridge || typeof bridge.saveImage !== 'function') {
      toast('保存失败：手机桥未就绪');
      return Promise.resolve();
    }
    return blobToBase64(blob).then(b64 => {
      const saved = bridge.saveImage(b64, name);
      toast(`截图已保存：${saved || name}`);
    }).catch(error => toast(`保存失败：${error && error.message || error}`));
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('读取截图数据失败'));
      reader.readAsDataURL(blob);
    });
  }

  function installDirectoryPickerPolyfill() {
    if (typeof window.showDirectoryPicker === 'function') return;
    const makeFileHandle = name => ({
      kind: 'file', name,
      createWritable() {
        const chunks = [];
        return Promise.resolve({
          write(data) { chunks.push(data); return Promise.resolve(); },
          close() {
            const blob = new Blob(chunks, { type: 'image/png' });
            return saveBlobToGallery(blob, name);
          },
        });
      },
    });
    const dirHandle = {
      kind: 'directory', name: '手机相册',
      queryPermission() { return Promise.resolve(bridge ? 'granted' : 'denied'); },
      requestPermission() { return Promise.resolve(bridge ? 'granted' : 'denied'); },
      getFileHandle(name) { return Promise.resolve(makeFileHandle(String(name))); },
    };
    window.showDirectoryPicker = () => {
      if (!bridge) { toast('当前环境不支持固定保存目录'); return Promise.reject(new Error('AbortError')); }
      toast('手机端截图将保存到「Pictures/SGS截图」');
      return Promise.resolve(dirHandle);
    };
  }
  installDirectoryPickerPolyfill();

  /* ---------- 面板内追加「截图」按钮（合成快捷键触发插件自身的截图逻辑） ---------- */
  function keyToCode(key) {
    const k = String(key || '');
    if (/^[a-zA-Z]$/.test(k)) return 'Key' + k.toUpperCase();
    if (/^[0-9]$/.test(k)) return 'Digit' + k;
    if (/^F\d{1,2}$/i.test(k)) return k.toUpperCase();
    if (/^Arrow/.test(k)) return k;
    return 'Unidentified';
  }

  function triggerShotHotkey() {
    let shotKey = '';
    try { shotKey = String((JSON.parse(localStorage.getItem(STORE_KEY) || '{}').shotKey) || ''); } catch (_) {}
    if (!shotKey) { toast('请先在面板里设置一个截图快捷键（例如 P）'); return; }
    const main = shotKey.split('+').pop().trim();
    const isSingleChar = main.length === 1;
    const init = {
      key: main,
      code: keyToCode(main),
      bubbles: true, cancelable: true, composed: true,
      ctrlKey: /ctrl/i.test(shotKey), altKey: /alt/i.test(shotKey),
      shiftKey: /shift/i.test(shotKey), metaKey: /meta|win/i.test(shotKey),
    };
    if (isSingleChar && /^[A-Z]$/.test(main)) init.key = main.toLowerCase();
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', init)), 60);
    toast('已触发截图');
  }

  function injectShotButton(row) {
    if (!row || row.querySelector('.sgs-m-shot-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sgs-m-shot-btn';
    btn.textContent = '📷 立即截图';
    btn.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); triggerShotHotkey(); });
    row.appendChild(btn);
  }

  const shotRowObserver = new MutationObserver(() => {
    const rows = document.querySelectorAll('.sgs-syn-hotkey-row');
    for (const row of rows) injectShotButton(row);
  });
  function observeShotRows() {
    if (!document.documentElement) return false;
    shotRowObserver.observe(document.documentElement, { childList: true, subtree: true });
    return true;
  }
  if (!observeShotRows()) {
    const obsTimer = setInterval(() => { if (observeShotRows()) clearInterval(obsTimer); }, 30);
    setTimeout(() => clearInterval(obsTimer), 20000);
  }

  /* ---------- 双击悬浮球：诊断信息 ---------- */
  window.addEventListener('dblclick', event => {
    const ball = document.getElementById('sgs-syn-ball');
    if (!ball || !ball.contains(event.target)) return;
    let text = '诊断不可用';
    try {
      const diag = window.__SGS_SYN_DIAG__ ? window.__SGS_SYN_DIAG__() : null;
      text = diag ? `插件 v${diag.version}｜通道: ${diag.channel || diag.channelMethod || '未知'}` : '插件未加载';
    } catch (_) {}
    toast(text);
  });

  /* ---------- 给壳的加载提示回调 ---------- */
  window.__SGS_MOBILE_NOTIFY__ = msg => toast(msg);

  /* ---------- 触摸探针（仅手机桥环境） ---------- */
  if (bridge) {
    for (const type of ['pointerdown', 'touchstart', 'mousedown', 'click']) {
      window.addEventListener(type, event => {
        try {
          const x = event.clientX == null ? '?' : Math.round(event.clientX);
          const y = event.clientY == null ? '?' : Math.round(event.clientY);
          const t = event.target && event.target.id ? '#' + event.target.id : (event.target && event.target.tagName || '?');
          console.log(`SGSMTouch ${type} ${x},${y} ${t} detail=${event.detail}`);
        } catch (_) {}
      }, true);
    }
  }
})();
