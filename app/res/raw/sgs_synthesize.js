// ==UserScript==
// @name         三国杀·体验优化综合插件
// @namespace    https://github.com/user7050030/sgs-synthesize-plugin
// @version      1.2.3
// @description  设置展示搜索、立即去红点/新标、锦囊袋圆点入口、屏蔽对手发言/皮肤特效/武将台词。（手机端精简版：不含快捷键截图与 /sound 语音功能）
// @author       Tihaon7050030
// @updateURL    https://raw.githubusercontent.com/user7050030/sgs-synthesize-plugin/main/sgs-synthesize-plugin.user.js
// @downloadURL  https://raw.githubusercontent.com/user7050030/sgs-synthesize-plugin/main/sgs-synthesize-plugin.user.js
// @match        https://game.4399iw2.com/yxxsgs/*
// @match        *://*.sanguosha.com/10/*
// @match        *://*.sanguosha.com/x/*
// @match        *://*.sanguosha.com/10th/*
// @match        https://wan.baidu.com/*gameId=19793616*
// @match        *://h5.7k7k.com/web/H5GAMES.html?gid=960982bec2f555de44ea43ca8a7ef418/*
// @match        *://qqgame.qq.com/webappframe/?appid=10951
// @match        *://s118.app1107877410.qqopenapp.com/pc/qqLobby_index.php*
// @match        *://kuaiwan.com/game/main/9496000/*
// @match        *://kuaiwan.com/start/game.html*
// @match        *://sgsszn.wan.360.cn/*
// @exclude      *://*.sanguosha.com/220/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  if (window.__SGS_SYNTHESIZE__) return;
  window.__SGS_SYNTHESIZE__ = true;

  const VERSION = '1.2.3';
  const AUTHOR = 'Tihaon7050030';
  const STORE_KEY = 'sgs-synthesize:settings:v2';
  const CSS_ID = 'sgs-syn-css';
  const TAB_ID = 'sgs-syn-tab';
  const PANE_ID = 'sgs-syn-pane';
  const BALL_ID = 'sgs-syn-ball';
  const WHITE_DOT_ID = 'sgs-syn-white-dot';
  const STANDALONE_ID = 'sgs-syn-standalone';
  const MODAL_ID = 'sgs-syn-sound-modal';
  const FLOAT_ID = 'sgs-syn-float-modal';
  const TOAST_ID = 'sgs-syn-toast';

  const DEFAULTS = {
    showcaseSearch: false,
    redDotCleaner: false,
    jinnangDot: false,
    blockOpponentChat: false,
    blockOtherSkinEffects: false,
    blockOtherVoice: false,
    panelMode: 'integrated',
    hotkey: '',
    panelLimit: 10,
    modalLimit: 50,
    dotPos: null,
    panelPos: null,
    shotKey: '',
    shotSoundPreset: 'save',
  };

  const SEARCH_DEBOUNCE = 360;
  const SEARCH_COOLDOWN = 420;

  const uiState = {
    capturingHotkey: false,
    capturingShotKey: false,
    captureKeys: new Set(),
    standaloneOpen: false,
    soundDrawerOpen: false,
  };

  const safe = (fn, fallback) => {
    try {
      const v = fn();
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  };

  const settings = Object.assign({}, DEFAULTS, (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  })());

  function saveSettings() {
    safe(() => localStorage.setItem(STORE_KEY, JSON.stringify(settings)));
  }

  const HAD_SHOT_PRESET = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      return 'shotSoundPreset' in raw;
    } catch (_) {
      return false;
    }
  })();

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function classOf(node) {
    return safe(() => (node.constructor && (node.constructor.__class__ || node.constructor.name)) || '', '');
  }

  function stage() {
    const Laya = window.Laya;
    return Laya && Laya.stage && Laya.stage.numChildren != null ? Laya.stage : null;
  }

  function eachNode(root, fn) {
    if (!root) return;
    const walk = node => {
      if (!node) return;
      fn(node);
      const count = safe(() => node.numChildren, 0);
      for (let i = 0; i < count; i++) walk(safe(() => node.getChildAt(i), null));
    };
    walk(root);
  }

  function findNode(root, name) {
    let found = null;
    eachNode(root, node => {
      if (!found && classOf(node) === name) found = node;
    });
    return found;
  }

  function inGame() {
    const J = window.__JND;
    if (J && typeof J.inGame === 'function') return !!safe(() => J.inGame());
    return !!findNode(stage(), 'TableGameScene');
  }

  function findGameManager() {
    const J = window.__JND;
    if (J && typeof J.findGameManager === 'function') {
      const m = safe(() => J.findGameManager());
      if (m) return m;
    }
    const scene = findNode(stage(), 'TableGameScene');
    return scene ? safe(() => scene.manager || scene.gameManager, null) : null;
  }

  function isSelfSeat(seatID) {
    const J = window.__JND;
    if (J && typeof J.isSelfSeat === 'function') return !!safe(() => J.isSelfSeat(seatID));
    const mgr = findGameManager();
    return !!mgr && Number(seatID) === Number(safe(() => mgr.selfSeatIndex, -1));
  }

  function selfUserId() {
    try {
      const raw = localStorage.getItem('jnd:account-status:v1');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.selfUserId != null) return String(obj.selfUserId);
      }
    } catch (_) {}
    const mgr = findGameManager();
    const seat = mgr && safe(() => (typeof mgr.SelfSeat === 'function' ? mgr.SelfSeat() : mgr.seats && mgr.seats[mgr.selfSeatIndex]), null);
    const info = seat && safe(() => seat.playerInfo, null);
    const id = safe(() => seat.userID, null) != null ? safe(() => seat.userID, '')
      : safe(() => info && (info.userID || info.UserID || info.clientId || info.ClientId), '');
    return id == null ? '' : String(id);
  }

  function toast(message) {
    if (!document.body) return;
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      document.body.appendChild(el);
    }
    el.textContent = String(message || '');
    el.classList.add('is-show');
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.classList.remove('is-show'), 2400);
  }
  function installGlobalCss() {
    if (document.getElementById(CSS_ID)) return true;
    const host = document.head || document.documentElement;
    if (!host) return false;
    const css = document.createElement('style');
    css.id = CSS_ID;
    css.textContent = `
      #jnd-panel.jnd-mini-dot:not(.open) { pointer-events: none !important; }
      #jnd-panel.jnd-mini-dot:not(.open)::before { opacity: 0 !important; }
      #jnd-panel.jnd-mini-dot:not(.open) .jnd-face-front { opacity: 0 !important; }
      #jnd-panel.jnd-mini-dot:not(.open)::after { opacity: 0 !important; }
      #jnd-panel.jnd-mini-dot:not(.open) .jnd-panel-collapse { pointer-events: none !important; }
      #${PIPS_ID} {
        position: absolute; left: 18px; top: 18px; z-index: 9;
        width: 26px; height: 26px; box-sizing: border-box;
        display: none; align-items: center; justify-content: center; gap: 3px;
        border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 34% 28%, rgba(60, 49, 36, .98), rgba(18, 15, 11, .94) 74%);
        border: 1px solid rgba(214, 173, 78, .68);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, .34), 0 2px 8px rgba(0, 0, 0, .5), 0 0 10px rgba(214, 173, 78, .16);
        transition: border-color .16s ease, box-shadow .16s ease;
      }
      #jnd-panel.jnd-mini-dot:not(.open) #${PIPS_ID} { display: flex; pointer-events: auto; }
      #${PIPS_ID}:hover {
        border-color: rgba(238, 205, 128, .95);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, .34), 0 2px 8px rgba(0, 0, 0, .5), 0 0 14px rgba(230, 190, 100, .3);
      }
      #jnd-panel.jnd-mini-dot.jnd-dock-right:not(.open) #${PIPS_ID} {
        left: auto; right: calc(var(--jnd-entry-w, 200px) - 44px);
      }
      #${PIPS_ID} i {
        width: 3px; height: 3px; border-radius: 50%;
        background: #e6c37c; box-shadow: 0 0 4px rgba(230, 195, 124, .55);
      }
      #jnd-panel.jnd-mini-dot.jnd-dot-update:not(.open) #${PIPS_ID}::after {
        content: ""; position: absolute; right: -1px; top: -1px;
        width: 5px; height: 5px; border-radius: 50%;
        background: #e6c37c; box-shadow: 0 0 5px rgba(230, 195, 124, .8);
      }
      #sgs-syn-tab .jnd-tab-icon svg { width: 18px; height: 18px; }
      #${PANE_ID} { height: 100%; }
      #${PANE_ID} .jnd-pane-main { height: 100%; overflow: auto; padding-bottom: 18px; }
      #${PANE_ID} .sgs-syn-by {
        margin-left: auto; align-self: center; color: #9c7b4a;
        font: 12px "Segoe UI", "Microsoft YaHei", sans-serif; letter-spacing: .3px;
      }
      .sgs-syn-sec {
        display: flex; align-items: center; gap: 8px;
        margin: 15px 2px 7px; color: #d8b979;
        font: 15px "FZBW", "STKaiti", "KaiTi", serif; letter-spacing: 1px;
      }
      .sgs-syn-sec::after {
        content: ""; flex: 1 1 auto; height: 1px;
        background: linear-gradient(90deg, rgba(214, 173, 78, .38), rgba(214, 173, 78, 0));
      }
      .sgs-syn-search-row { display: flex; align-items: center; gap: 8px; }
      .sgs-syn-input {
        flex: 1 1 auto; min-width: 0; height: 34px; box-sizing: border-box;
        padding: 0 10px; border-radius: 6px;
        border: 1px solid rgba(214, 173, 78, .34);
        background: rgba(20, 16, 11, .62);
        color: #f0dfba; outline: none;
        font: 14px "Microsoft YaHei", "Segoe UI", sans-serif;
      }
      .sgs-syn-input::placeholder { color: #8c7858; }
      .sgs-syn-input:focus { border-color: rgba(238, 205, 128, .78); box-shadow: 0 0 0 2px rgba(214, 173, 78, .12); }
      .sgs-syn-btn {
        flex: 0 0 auto; height: 34px; padding: 0 14px; border-radius: 6px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .5);
        background: linear-gradient(180deg, rgba(72, 56, 33, .95), rgba(40, 31, 20, .95));
        color: #f1d79b; font: 14px "FZBW", "Microsoft YaHei", serif;
      }
      .sgs-syn-btn:hover { border-color: rgba(238, 205, 128, .95); color: #fff0cd; }
      .sgs-syn-hint { margin: 7px 2px 8px; color: #8f7b5b; font: 12px "Microsoft YaHei", sans-serif; line-height: 1.55; }
      .sgs-syn-hint b { color: #d8b979; font-weight: 600; }
      #jnd-panel.sgs-syn-credits-empty .credits { display: none !important; }
      .sgs-syn-limit-row {
        display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
        margin: 2px 2px 7px; color: #9c8762; font: 12px "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-limit-row b { color: #d9bb7e; font-weight: 600; }
      .sgs-syn-limit-input {
        width: 56px; height: 26px; box-sizing: border-box; padding: 0 6px;
        border-radius: 4px; border: 1px solid rgba(214, 173, 78, .34);
        background: rgba(20, 16, 11, .62); color: #f0dfba; text-align: center;
        font: 12px "Consolas", "Microsoft YaHei", monospace; outline: none;
      }
      .sgs-syn-limit-input:focus { border-color: rgba(238, 205, 128, .8); }
      .sgs-syn-results { display: flex; flex-direction: column; gap: 5px; }
      .sgs-syn-phrase {
        display: flex; align-items: center; gap: 10px;
        width: 100%; box-sizing: border-box; text-align: left; cursor: pointer;
        padding: 8px 10px; border-radius: 6px;
        border: 1px solid rgba(214, 173, 78, .16);
        background: rgba(255, 255, 255, .035);
        color: #eadbb9; font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      }
      .sgs-syn-phrase:hover {
        border-color: rgba(238, 205, 128, .62);
        background: rgba(214, 173, 78, .1);
      }
      .sgs-syn-phrase-main { flex: 1 1 auto; min-width: 0; }
      .sgs-syn-phrase:focus-visible { outline: 1px solid rgba(238, 205, 128, .85); outline-offset: 1px; }
      .sgs-syn-play {
        flex: 0 0 auto; width: 26px; height: 26px; padding: 0; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%; border: 1px solid rgba(214, 173, 78, .42);
        background: rgba(20, 16, 11, .55); color: #e8cf9a;
        font: 11px/1 "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-play:hover { border-color: rgba(238, 205, 128, .85); background: rgba(214, 173, 78, .22); color: #fff3d4; }
      .sgs-syn-play.is-playing { border-color: rgba(120, 214, 160, .8); color: #a8f0c4; }
      .sgs-syn-channel { display: flex; align-items: center; gap: 6px; margin: 4px 2px 0; color: #9c8762; font: 11px "Microsoft YaHei", sans-serif; }
      .sgs-syn-channel b { color: #d9bb7e; font-weight: 600; }
      .sgs-syn-channel.is-ready b { color: #8fae9a; }
      .sgs-syn-phrase-text { display: block; font-size: 14px; line-height: 1.45; }
      .sgs-syn-phrase-meta { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 4px; font-size: 11px; color: #9c8762; }
      .sgs-syn-phrase-avatar {
        flex: 0 0 auto; width: 46px; height: 46px; box-sizing: border-box;
        border-radius: 5px; border: 1px solid rgba(214, 173, 78, .58);
        background: rgba(0, 0, 0, .28); object-fit: cover;
        box-shadow: 0 2px 7px rgba(0, 0, 0, .32);
      }
      .sgs-syn-phrase-meta b { color: #d9bb7e; font-weight: 600; }
      .sgs-syn-phrase-meta i { font-style: normal; color: #a9946d; }
      .sgs-syn-phrase-meta em { font-style: normal; color: #8fae9a; }
      .sgs-syn-empty { padding: 16px 6px; color: #8c7858; font-size: 12px; text-align: center; }
      .sgs-syn-count { color: #9c8762; font-size: 11px; padding: 2px 2px 6px; }

      .sgs-syn-mode-label { margin: 2px 2px 6px; color: #cbb184; font: 12px "Microsoft YaHei", sans-serif; }
      .sgs-syn-seg {
        display: flex; width: 100%; box-sizing: border-box; padding: 3px;
        border-radius: 7px; border: 1px solid rgba(214, 173, 78, .22);
        background: rgba(0, 0, 0, .24);
      }
      .sgs-syn-seg button {
        flex: 1 1 50%; height: 28px; border: 0; border-radius: 5px; cursor: pointer;
        background: transparent; color: #9f8965;
        font: 13px "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-seg button.is-active {
        background: linear-gradient(180deg, rgba(112, 83, 42, .92), rgba(68, 50, 28, .92));
        color: #f3ddab; box-shadow: 0 1px 4px rgba(0, 0, 0, .35) inset;
      }
      .sgs-syn-hotkey-row {
        display: flex; align-items: center; gap: 8px; margin-top: 9px;
        color: #cbb184; font: 12px "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-hotkey-row > span { flex: 1 1 auto; }
      .sgs-syn-hotkey-btn {
        min-width: 92px; height: 28px; padding: 0 10px; border-radius: 5px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .38);
        background: rgba(22, 18, 12, .72); color: #edd39b;
        font: 12px "Consolas", "Microsoft YaHei", monospace;
      }
      .sgs-syn-hotkey-btn:hover { border-color: rgba(238, 205, 128, .9); }
      .sgs-syn-hotkey-btn.is-capturing { color: #ffe7ae; border-color: rgba(238, 205, 128, .95); }
      .sgs-syn-hotkey-clear {
        height: 28px; padding: 0 8px; border-radius: 5px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .18);
        background: transparent; color: #8f7b5b; font: 12px "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-hotkey-clear:hover { color: #d8b979; border-color: rgba(214, 173, 78, .55); }
      .sgs-syn-sound-row { flex-wrap: wrap; }
      .sgs-syn-preset { display: inline-flex; gap: 4px; }
      .sgs-syn-preset-btn {
        min-width: 46px; height: 26px; padding: 0 9px; border-radius: 13px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .30);
        background: rgba(22, 18, 12, .72); color: #a5906b;
        font: 12px "Microsoft YaHei", sans-serif;
        transition: color .12s, border-color .12s, background .12s;
      }
      .sgs-syn-preset-btn:hover { color: #e8cd94; border-color: rgba(238, 205, 128, .75); }
      .sgs-syn-preset-btn.is-active {
        color: #2a1f0c; border-color: #e8cd94;
        background: linear-gradient(180deg, #f0d79b, #d5b06a);
      }
      .sgs-syn-preset-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        height: 26px; padding: 0 10px; border-radius: 13px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .30);
        background: rgba(22, 18, 12, .72); color: #c9ab74;
        font: 12px "Microsoft YaHei", sans-serif;
        transition: color .12s, border-color .12s, background .12s;
      }
      .sgs-syn-preset-toggle:hover { color: #e8cd94; border-color: rgba(238, 205, 128, .75); }
      .sgs-syn-preset-toggle.is-open { color: #2a1f0c; border-color: #e8cd94; background: linear-gradient(180deg, #f0d79b, #d5b06a); }
      .sgs-syn-caret {
        width: 0; height: 0; display: inline-block;
        border-left: 4px solid transparent; border-right: 4px solid transparent;
        border-top: 5px solid currentColor;
        transition: transform .15s ease;
      }
      .sgs-syn-preset-toggle.is-open .sgs-syn-caret { transform: rotate(180deg); }
      .sgs-syn-drawer {
        margin-top: 6px; padding: 8px 10px; border-radius: 8px;
        border: 1px solid rgba(214, 173, 78, .22);
        background: rgba(22, 18, 12, .55);
        display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
      }
      .sgs-syn-drawer[hidden] { display: none; }
      .sgs-syn-drawer .sgs-syn-preset { flex-wrap: wrap; }
      .sgs-syn-shot-info {
        margin-top: 6px; color: #8f7b5b; line-height: 1.6; word-break: break-all;
        font: 11px "Microsoft YaHei", sans-serif;
      }
      .sgs-syn-shot-info b { color: #c9ab74; font-weight: 600; }

      #${WHITE_DOT_ID} {
        position: fixed; left: 18px; bottom: 122px; z-index: 2147483400;
        width: 26px; height: 26px; box-sizing: border-box; padding: 0;
        border-radius: 50%; cursor: grab; display: none; touch-action: none;
        border: 1px solid rgba(255, 255, 255, .85);
        background: radial-gradient(circle at 35% 28%, #ffffff, #d8d2c6 72%, #b8b0a0);
        box-shadow: 0 0 0 2px rgba(0, 0, 0, .22), 0 2px 8px rgba(0, 0, 0, .38);
        transition: box-shadow .14s ease;
      }
      #${WHITE_DOT_ID}:active { cursor: grabbing; }
      #${WHITE_DOT_ID}:hover {
        box-shadow: 0 0 0 2px rgba(0, 0, 0, .22), 0 0 12px rgba(255, 255, 255, .55);
      }
      #${WHITE_DOT_ID}.is-open { background: radial-gradient(circle at 35% 28%, #fff5d6, #e8c578 72%, #b78d42); }

      #${STANDALONE_ID} {
        position: fixed; left: 42px; bottom: 122px; z-index: 2147483500;
        width: min(380px, calc(100vw - 56px)); max-height: min(74vh, 690px);
        display: none; flex-direction: column; box-sizing: border-box;
        border-radius: 10px; border: 1px solid rgba(214, 173, 78, .55);
        background: linear-gradient(180deg, rgba(38, 31, 22, .985), rgba(18, 15, 11, .985));
        box-shadow: 0 18px 52px rgba(0, 0, 0, .6);
        color: #eadbb9; overflow: hidden;
      }
      #${STANDALONE_ID}.is-open { display: flex; }
      .sgs-syn-standalone-head {
        display: flex; align-items: center; gap: 8px; padding: 11px 12px 9px;
        border-bottom: 1px solid rgba(214, 173, 78, .16);
        cursor: grab; touch-action: none;
      }
      #${STANDALONE_ID}.is-dragging .sgs-syn-standalone-head { cursor: grabbing; }
      .sgs-syn-standalone-title { font: 18px "FZBW", "STKaiti", "KaiTi", serif; color: #f0d79a; letter-spacing: 1px; }
      .sgs-syn-standalone-sub { font: 10px "Segoe UI", "Microsoft YaHei", sans-serif; color: #9c7b4a; }
      .sgs-syn-standalone-close {
        margin-left: auto; width: 26px; height: 26px; border-radius: 5px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .26); background: transparent; color: #c7ae7c; font-size: 18px; line-height: 1;
      }
      .sgs-syn-standalone-close:hover { border-color: rgba(238, 205, 128, .8); color: #ffe9bb; }
      .sgs-syn-standalone-body { flex: 1 1 auto; padding: 8px 12px 12px; overflow: auto; min-height: 0; }
      #${STANDALONE_ID} .jnd-block { margin: 6px 0; }
      #${STANDALONE_ID} .jnd-opt {
        display: flex; align-items: center; gap: 10px; padding: 5px 0;
      }
      #${STANDALONE_ID} .jnd-opt-tx {
        flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px;
      }
      #${STANDALONE_ID} .jnd-opt-name {
        display: block; color: #e7d2a7; font: 14px "FZBW", "Microsoft YaHei", serif;
      }
      #${STANDALONE_ID} .jnd-opt-desc {
        display: block; color: #9f8965; font: 11px/1.5 "Microsoft YaHei", sans-serif;
      }
      #${STANDALONE_ID} .jnd-cm-hit {
        flex: 0 0 auto; position: relative; width: 62px; height: 26px;
      }
      #${STANDALONE_ID} .jnd-cm-input {
        position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
        opacity: 0; cursor: pointer; z-index: 2;
      }
      #${STANDALONE_ID} .jnd-cm-ctl {
        position: absolute; inset: 0; box-sizing: border-box; display: flex;
        align-items: center; justify-content: space-between; padding: 0 6px;
        border-radius: 5px; border: 1px solid rgba(214, 173, 78, .3);
        background: rgba(0, 0, 0, .28); color: #8f7b5b;
        font: 10px "Consolas", monospace;
      }
      #${STANDALONE_ID} .jnd-cm-input:checked + .jnd-cm-ctl {
        border-color: rgba(238, 205, 128, .78);
        background: linear-gradient(180deg, rgba(108, 82, 44, .92), rgba(64, 47, 27, .92));
        color: #ffe6ae;
      }
      #${STANDALONE_ID} .jnd-cm-key { opacity: .45; }
      #${STANDALONE_ID} .jnd-cm-input:checked + .jnd-cm-ctl .jnd-cm-on { opacity: 1; }
      #${STANDALONE_ID} .jnd-cm-input:not(:checked) + .jnd-cm-ctl .jnd-cm-off-label { opacity: 1; }

      .sgs-syn-modal { position: fixed; inset: 0; z-index: 2147483600; display: none; align-items: center; justify-content: center; }
      .sgs-syn-modal.is-open { display: flex; }
      .sgs-syn-modal-backdrop { position: absolute; inset: 0; background: rgba(6, 5, 4, .62); backdrop-filter: blur(2px); }
      .sgs-syn-modal-card {
        position: relative; width: min(660px, calc(100vw - 36px)); max-height: min(78vh, 720px);
        display: flex; flex-direction: column; box-sizing: border-box;
        border-radius: 10px; border: 1px solid rgba(214, 173, 78, .55);
        background: linear-gradient(180deg, rgba(38, 31, 22, .98), rgba(18, 15, 11, .98));
        box-shadow: 0 22px 60px rgba(0, 0, 0, .62), 0 0 0 1px rgba(0, 0, 0, .35) inset;
        color: #eadbb9; overflow: hidden;
      }
      .sgs-syn-modal-head {
        display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(214, 173, 78, .16);
      }
      .sgs-syn-modal-title { font: 20px "FZBW", "STKaiti", "KaiTi", serif; color: #f0d79a; letter-spacing: 1px; }
      .sgs-syn-modal-sub { font: 12px "Consolas", monospace; color: #a98d5d; }
      .sgs-syn-modal-close {
        margin-left: auto; width: 30px; height: 30px; border-radius: 5px; cursor: pointer;
        border: 1px solid rgba(214, 173, 78, .26); background: transparent; color: #c7ae7c; font-size: 20px; line-height: 1;
      }
      .sgs-syn-modal-close:hover { border-color: rgba(238, 205, 128, .8); color: #ffe9bb; }
      .sgs-syn-modal-body { padding: 12px 16px 14px; display: flex; flex-direction: column; min-height: 0; }
      .sgs-syn-modal-results { margin-top: 9px; overflow: auto; min-height: 60px; padding-right: 2px; }
      .sgs-syn-modal-foot { padding: 8px 16px 12px; border-top: 1px solid rgba(214, 173, 78, .14); color: #8f7b5b; font-size: 11px; }
      .sgs-syn-modal-body .sgs-syn-input { height: 38px; font-size: 15px; }
      .sgs-syn-modal-body .sgs-syn-btn { height: 38px; }

      #${BALL_ID} {
        position: fixed; right: 18px; bottom: 118px; z-index: 2147483400;
        width: 48px; height: 48px; border-radius: 50%; cursor: pointer;
        display: none; align-items: center; justify-content: center;
        border: 1px solid rgba(214, 173, 78, .72);
        background: radial-gradient(circle at 35% 28%, rgba(65, 53, 38, .98), rgba(18, 15, 11, .96) 74%);
        box-shadow: 0 4px 16px rgba(0, 0, 0, .55), 0 0 14px rgba(214, 173, 78, .18);
        color: #ecd08b; font: 20px "FZBW", "STKaiti", serif;
      }
      #${BALL_ID}:hover { border-color: rgba(238, 205, 128, .98); color: #fff0cd; box-shadow: 0 4px 18px rgba(0, 0, 0, .6), 0 0 20px rgba(230, 190, 100, .3); }
      #${TOAST_ID} {
        position: fixed; left: 50%; bottom: 92px; transform: translate(-50%, 8px);
        z-index: 2147483700; max-width: min(70vw, 520px); box-sizing: border-box;
        padding: 9px 16px; border-radius: 7px;
        border: 1px solid rgba(214, 173, 78, .55);
        background: rgba(22, 18, 12, .96); color: #f0dfba;
        font: 13px "Microsoft YaHei", sans-serif; text-align: center;
        opacity: 0; pointer-events: none; transition: opacity .16s ease, transform .16s ease;
      }
      #${TOAST_ID}.is-show { opacity: 1; transform: translate(-50%, 0); }
    `;
    host.appendChild(css);
    return true;
  }
  const showcase = {
    root: null,
    input: null,
    clear: null,
    win: null,
    lastView: null,
    lastVisible: false,
    term: '',
    viewHooked: new WeakSet(),
    winHooked: new WeakSet(),
    positioned: '',
  };

  function showcaseCssReady() {
    return !!document.getElementById(CSS_ID);
  }

  function findShowcaseWin(root) {
    if (!root) return null;
    let found = null;
    eachNode(root, node => {
      if (found) return;
      if (classOf(node) === 'NewStyleUserInfoDisplaySettingWindow' && safe(() => node.visible, false)) found = node;
    });
    return found;
  }

  function showcaseCurrentView(win) {
    return safe(() => win.viewStack.selectedChild, null) || null;
  }

  function showcaseTextOf(item, isSkin) {
    if (!item) return '';
    if (isSkin) {
      const skin = item.skinVO || {};
      const base = skin.skinBaseVO || {};
      const general = skin.generalInfo || {};
      return [base.ItemName, base.Searchkey, base.Desc, base.PvName, general.generalName, general.searchkey, general.ShortName, general.PvName]
        .filter(Boolean).join(' ').toLowerCase();
    }
    return [item.generalName, item.searchkey, item.ShortName, item.PvName, item.rolePoint]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function showcaseFilterView(view) {
    if (!settings.showcaseSearch) return;
    const panel = safe(() => view && view.panel, null);
    if (!panel) return;
    const term = showcase.term.trim().toLowerCase();
    if (!term) return;
    const data = safe(() => panel.DataProvider, null);
    if (!Array.isArray(data)) return;
    const isSkin = /SkinView/i.test(classOf(view)) || safe(() => Boolean(data[0] && data[0].skinVO), false);
    const tokens = term.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];
    if (!tokens.length) return;
    panel.DataProvider = data.filter(item => {
      const hay = showcaseTextOf(item, isSkin);
      return hay && tokens.every(token => hay.indexOf(token) !== -1);
    });
  }

  function showcaseHookView(view) {
    if (!view || showcase.viewHooked.has(view) || typeof view.UpdatePanel !== 'function') return;
    showcase.viewHooked.add(view);
    const original = view.UpdatePanel;
    view.UpdatePanel = function () {
      const result = original.apply(this, arguments);
      safe(() => showcaseFilterView(this));
      return result;
    };
  }

  function showcaseHookWin(win) {
    if (!win || showcase.winHooked.has(win)) return;
    showcase.winHooked.add(win);
    const original = win.onTabClick;
    if (typeof original === 'function') {
      win.onTabClick = function (index) {
        const result = original.apply(this, arguments);
        showcaseRefresh(120);
        return result;
      };
    }
  }

  function showcaseRefresh(delay) {
    if (!settings.showcaseSearch) return;
    const task = () => {
      const win = showcase.win || findShowcaseWin(stage());
      if (!win) return;
      const view = showcaseCurrentView(win);
      if (!view) return;
      showcaseHookView(view);
      safe(() => view.UpdatePanel());
    };
    if (delay) setTimeout(task, delay);
    else task();
  }

  function ensureShowcaseUi() {
    if (showcase.root || !document.body || !showcaseCssReady()) return;
    const root = document.createElement('div');
    root.id = 'sgs-syn-showcase-search';
    root.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="M15 15l5 5"></path></svg><input type="text" spellcheck="false" autocomplete="off" placeholder="搜索武将 / 皮肤 / 拼音"><button type="button" aria-label="清空搜索">×</button>';
    document.body.appendChild(root);
    showcase.root = root;
    showcase.input = root.querySelector('input');
    showcase.clear = root.querySelector('button');
    const style = document.createElement('style');
    style.textContent = `
      #sgs-syn-showcase-search {
        position: fixed; z-index: 2147483000; display: none; align-items: center;
        box-sizing: border-box; padding: 0 4px 0 6px; gap: 4px;
        background: linear-gradient(180deg, #f6ead0 0%, #e9d5ac 100%);
        border: 1px solid #8a683c; border-radius: 4px;
        box-shadow: inset 0 1px 3px rgba(120, 82, 32, .32), 0 1px 2px rgba(0, 0, 0, .35);
        font-family: "FZBW", "STKaiti", "KaiTi", "Microsoft YaHei", serif;
      }
      #sgs-syn-showcase-search svg {
        width: 14px; height: 14px; flex: 0 0 auto; fill: none;
        stroke: #7c5a2e; stroke-width: 2; stroke-linecap: round;
      }
      #sgs-syn-showcase-search input {
        flex: 1 1 auto; min-width: 0; height: 100%; margin: 0; padding: 0;
        border: 0; outline: 0; background: transparent;
        color: #4f3427; font: inherit; letter-spacing: .5px;
      }
      #sgs-syn-showcase-search input::placeholder { color: #8b7357; }
      #sgs-syn-showcase-search button {
        flex: 0 0 auto; display: none; width: 18px; height: 18px; margin: 0; padding: 0;
        border: 0; background: transparent; color: #7a5a32; cursor: pointer;
        font: inherit; font-size: 16px; line-height: 18px;
      }
      #sgs-syn-showcase-search button:hover { color: #3f2a16; }
    `;
    (document.head || document.documentElement).appendChild(style);
    const input = showcase.input;
    const stop = event => event.stopPropagation();
    for (const type of ['keydown', 'keypress', 'keyup', 'mousedown', 'pointerdown']) input.addEventListener(type, stop);
    root.addEventListener('mousedown', stop);
    root.addEventListener('pointerdown', stop);
    const apply = () => {
      showcase.term = input.value || '';
      showcase.clear.style.display = showcase.term ? 'block' : 'none';
      showcaseRefresh();
    };
    input.addEventListener('input', apply);
    input.addEventListener('compositionend', apply);
    showcase.clear.addEventListener('click', () => {
      input.value = '';
      apply();
      input.focus();
    });
  }

  function positionShowcase(win) {
    const canvas = document.getElementById('layaCanvas') || document.querySelector('canvas');
    const Laya = window.Laya;
    if (!canvas || !Laya || !Laya.stage || !showcase.root) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = rect.width / Laya.stage.width;
    const scaleY = rect.height / Laya.stage.height;
    const point = win.localToGlobal(new Laya.Point(700, 10));
    const left = rect.left + point.x * scaleX;
    const top = rect.top + point.y * scaleY;
    const width = 280 * scaleX;
    const height = 30 * scaleY;
    const key = [left, top, width, height].map(v => Math.round(v * 100) / 100).join('|');
    if (key === showcase.positioned) return;
    showcase.positioned = key;
    const style = showcase.root.style;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.width = `${width}px`;
    style.height = `${height}px`;
    style.fontSize = `${Math.max(12, Math.round(16 * scaleX * 10) / 10)}px`;
  }

  function showcaseTick() {
    if (!settings.showcaseSearch) {
      if (showcase.root) showcase.root.style.display = 'none';
      if (showcase.lastVisible) {
        showcase.lastVisible = false;
        showcase.term = '';
        showcase.lastView = null;
        if (showcase.input) showcase.input.value = '';
        if (showcase.clear) showcase.clear.style.display = 'none';
      }
      return;
    }
    const rootStage = stage();
    if (!rootStage) return;
    const win = findShowcaseWin(rootStage);
    showcase.win = win;
    if (!win) {
      if (showcase.root) showcase.root.style.display = 'none';
      if (showcase.lastVisible) {
        showcase.lastVisible = false;
        showcase.term = '';
        showcase.lastView = null;
        if (showcase.input) showcase.input.value = '';
        if (showcase.clear) showcase.clear.style.display = 'none';
      }
      return;
    }
    ensureShowcaseUi();
    if (!showcase.root) return;
    showcase.root.style.display = 'flex';
    positionShowcase(win);
    showcaseHookWin(win);
    const view = showcaseCurrentView(win);
    if (view) {
      showcaseHookView(view);
      if (!showcase.lastVisible || view !== showcase.lastView) {
        showcase.lastView = view;
        showcaseRefresh(60);
      }
    }
    if (!showcase.lastVisible) {
      showcase.lastVisible = true;
      showcaseRefresh(80);
    }
  }

  function restoreShowcase() {
    const win = findShowcaseWin(stage());
    const view = win && showcaseCurrentView(win);
    if (view) safe(() => view.UpdatePanel());
  }
  const RED = /red[_\-.]?point|redpoint|red[_\-.]?dot|reddot|topredpoint|newfunc_redpoint|generalskincollectredpoint/i;
  const NEW = /(?:newstylebasenew|newmodebtnnew|newmodesecondbtnnewtag|newmodeshuanneijianflg|nsskinnewflag|nsskinbagnewtag|generalskin[a-z]*new|generalwindownewflag|generalwindownewicon|newtag|newflag|newicon|newmark)\.(?:png|jpg|jpeg|webp)(?:\?|$)/i;
  const EMPTY_URLS = [
    'https://web.sanguosha.com/10/pc/baseUI/EmptyImg.png',
    'baseUI/EmptyImg.png',
  ];
  const SKIN_GENERAL_CONTEXT = /NewStyleUserInfoDisplay|NSSkin|NSGeneral|GeneralSkin|SkinCollect|GeneralWindow|NewStyleGeneral/i;

  const redDot = {
    trans: null,
    installed: false,
    sweepScheduled: false,
    origTextures: new WeakMap(),
    origCmds: new WeakMap(),
  };

  function textureUrl(tex) {
    if (!tex) return '';
    return safe(() => String(tex.url || tex._url || (tex.source && (tex.source.src || tex.source.url)) || ''), '');
  }

  function badgeKind(value) {
    if (!value) return null;
    const url = typeof value === 'string' ? value : textureUrl(value);
    if (!url) return null;
    if (NEW.test(url)) return 'new';
    if (RED.test(url)) return 'red';
    return null;
  }

  function transparentTexture() {
    if (redDot.trans) return redDot.trans;
    const Laya = window.Laya;
    for (const url of EMPTY_URLS) {
      const tex = safe(() => Laya.loader && Laya.loader.getRes(url), null);
      if (tex) {
        redDot.trans = tex;
        return tex;
      }
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      redDot.trans = new Laya.Texture(canvas);
      return redDot.trans;
    } catch (_) {}
    return null;
  }

  function inSkinGeneralContext(node) {
    let cur = node;
    for (let i = 0; i < 14 && cur; i++) {
      if (SKIN_GENERAL_CONTEXT.test(classOf(cur))) return true;
      cur = safe(() => cur._parent, null) || safe(() => cur.parent, null);
    }
    return false;
  }

  function blankNode(node, kind) {
    const trans = redDot.trans;
    if (!trans) return false;
    if (kind === 'new' && inSkinGeneralContext(node)) return false;
    const tex = safe(() => node.texture, null);
    if (!tex || !badgeKind(tex)) return false;
    if (!redDot.origTextures.has(node)) redDot.origTextures.set(node, tex);
    safe(() => { node.texture = trans; });
    return true;
  }

  function restoreNode(node) {
    const tex = redDot.origTextures.get(node);
    if (!tex) return false;
    safe(() => { node.texture = tex; });
    redDot.origTextures.delete(node);
    return true;
  }

  function blankCmd(cmd, node) {
    const trans = redDot.trans;
    if (!trans || !cmd) return false;
    let changed = false;
    const kind = badgeKind(cmd.texture);
    if (kind && !(kind === 'new' && inSkinGeneralContext(node))) {
      if (!redDot.origCmds.has(cmd)) redDot.origCmds.set(cmd, cmd.texture);
      cmd.texture = trans;
      changed = true;
    }
    if (Array.isArray(cmd.textures)) {
      for (let i = 0; i < cmd.textures.length; i++) {
        const k = badgeKind(cmd.textures[i]);
        if (k && !(k === 'new' && inSkinGeneralContext(node))) {
          if (!cmd.__sgsSynTexOrig) cmd.__sgsSynTexOrig = cmd.textures.slice();
          cmd.textures[i] = trans;
          changed = true;
        }
      }
    }
    return changed;
  }

  function restoreCmd(cmd) {
    if (!cmd) return false;
    let changed = false;
    if (redDot.origCmds.has(cmd)) {
      cmd.texture = redDot.origCmds.get(cmd);
      redDot.origCmds.delete(cmd);
      changed = true;
    }
    if (cmd.__sgsSynTexOrig) {
      cmd.textures = cmd.__sgsSynTexOrig;
      delete cmd.__sgsSynTexOrig;
      changed = true;
    }
    return changed;
  }

  function redDotSweep() {
    const Laya = window.Laya;
    if (!Laya || !Laya.stage) return;
    if (!redDot.trans) redDot.trans = transparentTexture();
    if (!redDot.trans) return;
    eachNode(Laya.stage, node => {
      const tex = safe(() => node.texture, null);
      if (tex && badgeKind(tex)) {
        if (settings.redDotCleaner) blankNode(node, badgeKind(tex));
        else restoreNode(node);
      } else if (!settings.redDotCleaner && redDot.origTextures.has(node)) {
        restoreNode(node);
      }
      const cmds = safe(() => node.graphics && node.graphics._cmds, null);
      if (Array.isArray(cmds)) {
        for (const cmd of cmds) {
          if (settings.redDotCleaner) blankCmd(cmd, node);
          else restoreCmd(cmd);
        }
      }
    });
  }

  function scheduleRedDotSweep() {
    if (redDot.sweepScheduled) return;
    redDot.sweepScheduled = true;
    setTimeout(() => {
      redDot.sweepScheduled = false;
      if (settings.redDotCleaner) redDotSweep();
    }, 60);
  }

  function hookRedDot() {
    const Laya = window.Laya;
    if (!Laya || redDot.installed) return;
    const S = Laya.Sprite && Laya.Sprite.prototype;
    if (!S) return;
    for (const name of ['addChild', 'addChildAt', 'addChildren']) {
      const original = safe(() => S[name], null);
      if (typeof original !== 'function' || original.__sgsSynWrapped) continue;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        scheduleRedDotSweep();
        return result;
      };
      wrapped.__sgsSynWrapped = true;
      S[name] = wrapped;
    }
    redDot.installed = true;
  }

  function redDotTick() {
    const Laya = window.Laya;
    if (!Laya || !Laya.stage) return;
    hookRedDot();
    if (!settings.redDotCleaner) return;
    if (!redDot.trans) redDot.trans = transparentTexture();
    if (redDot.trans) redDotSweep();
  }
  const PIPS_ID = 'sgs-syn-pips';

  function ensureDotStyle() {
    if (document.getElementById(CSS_ID)) return;
  }

  function ensurePips(panel) {
    let pips = document.getElementById(PIPS_ID);
    if (pips && pips.parentElement === panel) return;
    if (pips) pips.remove();
    pips = document.createElement('div');
    pips.id = PIPS_ID;
    pips.setAttribute('aria-hidden', 'true');
    pips.innerHTML = '<i></i><i></i><i></i>';
    panel.appendChild(pips);
  }

  function dotTick() {
    const panel = document.getElementById('jnd-panel');
    if (!panel) return;
    ensureDotStyle();
    if (settings.jinnangDot) {
      if (!panel.classList.contains('jnd-mini-dot')) panel.classList.add('jnd-mini-dot');
      ensurePips(panel);
    } else {
      panel.classList.remove('jnd-mini-dot');
      const pips = document.getElementById(PIPS_ID);
      if (pips) pips.remove();
    }
  }
  const BLOCK_CHAT_TYPES = new Set([1, 14, 21, 57]);
  const runtime = {
    chatPatched: false,
    chatManager: null,
    skinPatched: false,
    seatProtos: new WeakSet(),
    seatUiState: new WeakMap(),
    managerProtoState: new WeakMap(),
    effectProtos: new WeakSet(),
    manager: null,
    voiceMute: false,
    blockLog: [],
    chatScanAt: 0,
    sendChannel: '',
    channelMethod: '',
    phraseSender: null,
    channelCheckAt: 0,
    lastInGame: false,
  };

  function noteBlock(method, seat, kind) {
    try {
      runtime.blockLog.push({
        method,
        seat: seat && seat.Index != null ? seat.Index : null,
        kind,
        at: Date.now(),
      });
      if (runtime.blockLog.length > 300) runtime.blockLog.shift();
      window.__SGS_SYN_BLOCK_LOG__ = runtime.blockLog;
    } catch (_) {}
  }

  function managerSeats(mgr) {
    if (!mgr) return [];
    const seats = mgr.seats;
    if (Array.isArray(seats)) return seats.filter(Boolean);
    if (seats && typeof seats === 'object') {
      return Object.keys(seats).map(key => seats[key]).filter(Boolean);
    }
    return [];
  }

  function isSelfPlayerSeat(seat) {
    if (!seat) return false;
    if (seat.IsSelf === true) return true;
    const index = Number(seat.Index != null ? seat.Index : seat.index);
    return Number.isFinite(index) && index >= 0 && isSelfSeat(index);
  }

  function replaceBoundListener(dispatcher, original, replacement, caller) {
    if (!dispatcher || typeof original !== 'function' || typeof replacement !== 'function') return false;
    const events = safe(() => dispatcher._events, null);
    if (!events || typeof events !== 'object') return false;
    let changed = false;
    for (const type of Object.keys(events)) {
      const value = events[type];
      const list = Array.isArray(value)
        ? value
        : (value && typeof value === 'object' && (typeof value.method === 'function' || typeof value.listener === 'function') ? [value] : null);
      if (!list) continue;
      for (const entry of list) {
        if (!entry) continue;
        const bound = typeof entry.method === 'function' ? entry.method : entry.listener;
        if (bound !== original) continue;
        if (caller && entry.caller !== caller) continue;
        if (typeof entry.method === 'function') entry.method = replacement;
        else entry.listener = replacement;
        changed = true;
      }
    }
    return changed;
  }

  const layaProbe = {
    installed: false,
    seen: [],
    known: new WeakSet(),
  };

  function rememberLayaObject(obj) {
    if (!obj || typeof obj !== 'object' || layaProbe.known.has(obj)) return;
    layaProbe.known.add(obj);
    if (layaProbe.seen.length < 1600) layaProbe.seen.push(obj);
  }

  function installLayaProbe() {
    const Laya = window.Laya;
    const proto = safe(() => Laya && Laya.EventDispatcher && Laya.EventDispatcher.prototype, null);
    if (!proto) return false;
    if (layaProbe.installed) return true;
    for (const name of ['on', 'once']) {
      const original = proto[name];
      if (typeof original !== 'function' || original.__sgsSynProbe) continue;
      const wrapped = function () {
        rememberLayaObject(this);
        return original.apply(this, arguments);
      };
      wrapped.__sgsSynProbe = true;
      safe(() => { proto[name] = wrapped; }, null);
    }
    rememberLayaObject(safe(() => Laya.stage, null));
    layaProbe.installed = true;
    return true;
  }

  function methodNamesOf(obj) {
    const names = [];
    try { names.push.apply(names, Object.keys(obj)); } catch (_) {}
    let proto = safe(() => Object.getPrototypeOf(obj), null);
    for (let depth = 0; proto && depth < 3; depth++) {
      try { names.push.apply(names, Object.getOwnPropertyNames(proto)); } catch (_) {}
      proto = safe(() => Object.getPrototypeOf(proto), null);
    }
    return names;
  }

  function phraseMethodScore(name) {
    if (typeof name !== 'string' || !name || name.charAt(0) === '_') return 0;
    let score = 0;
    if (/skin\w*phrase/i.test(name)) score += 8;
    if (/send\w*phrase/i.test(name)) score += 6;
    if (/phrase/i.test(name)) score += 3;
    if (/send|chat|click|trigger/i.test(name)) score += 2;
    if (/^(on|set|get|has|is|update|refresh|init|clear|remove|add|show|hide|close|open|reset|check|log|debug|parse|create|build)/i.test(name)) score -= 4;
    return score > 0 ? score : 0;
  }

  function findPhraseSenderOn(obj) {
    if (!obj || typeof obj !== 'object') return null;
    let best = null;
    for (const name of methodNamesOf(obj)) {
      const score = phraseMethodScore(name);
      if (score < 5) continue;
      const fn = safe(() => obj[name], null);
      if (typeof fn !== 'function') continue;
      if (!best || score > best.score) best = { obj, name, fn, score };
      if (score >= 14) break;
    }
    return best;
  }

  function isChatManagerLike(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const cn = safe(() => obj.constructor && obj.constructor.name, '');
    if (/^ChatManager$/i.test(cn)) return true;
    return typeof safe(() => obj.parseChatMessage, null) === 'function';
  }

  function chatManagerFromEvents(events) {
    if (!events || typeof events !== 'object') return null;
    for (const type of Object.keys(events)) {
      const value = events[type];
      const list = Array.isArray(value) ? value : [value];
      for (const entry of list) {
        if (!entry) continue;
        const caller = entry.caller;
        if (!caller || typeof caller !== 'object') continue;
        const cn = safe(() => caller.constructor && caller.constructor.name, '');
        if (/chat/i.test(cn) || isChatManagerLike(caller) || findPhraseSenderOn(caller)) return caller;
      }
    }
    return null;
  }

  function scanForChatManager() {
    for (let i = layaProbe.seen.length - 1; i >= 0; i--) {
      const candidate = layaProbe.seen[i];
      if (isChatManagerLike(candidate)) return candidate;
      const manager = chatManagerFromEvents(safe(() => candidate._events, null));
      if (manager) return manager;
    }
    const roots = [];
    for (const key of ['__SGS', 'Sgs', 'SGSMODULE', 'Game', 'game', 'Main', 'main', 'App', 'app', 'WBProto', 'WBMgr', 'ChatManager', 'chatManager']) {
      const value = safe(() => window[key], null);
      if (value && typeof value === 'object') roots.push(value);
    }
    const J = window.__JND;
    if (J) roots.push(J);
    for (const root of roots) {
      const manager = chatManagerFromEvents(safe(() => root._events, null));
      if (manager) return manager;
    }
    const seen = new WeakSet();
    let found = null;
    let budget = 4000;
    const visit = (obj, depth) => {
      if (found || budget <= 0 || !obj || typeof obj !== 'object' || depth > 6 || seen.has(obj)) return;
      seen.add(obj);
      budget--;
      if (isChatManagerLike(obj)) {
        found = obj;
        return;
      }
      const manager = chatManagerFromEvents(safe(() => obj._events, null));
      if (manager) {
        found = manager;
        return;
      }
      let keys = [];
      try { keys = Object.keys(obj); } catch (_) { return; }
      for (const key of keys) {
        if (key === '_parent' || key === 'parent' || key === 'owner' || key === 'world') continue;
        let value;
        try { value = obj[key]; } catch (_) { continue; }
        if (value && typeof value === 'object') visit(value, depth + 1);
        if (found || budget <= 0) return;
      }
    };
    for (const root of roots) {
      visit(root, 0);
      if (found) return found;
    }
    const Laya = window.Laya;
    if (Laya) {
      visit(safe(() => Laya.stage, null), 0);
      if (found) return found;
      for (const key of ['Scene', 'Scene2D', 'Loader', 'SoundManager', 'Timer', 'EventDispatcher']) {
        const value = safe(() => Laya[key], null);
        if (value && typeof value === 'object') {
          visit(value, 1);
          if (found) return found;
        }
      }
    }
    return found;
  }

  function findChatManager(allowScan, force) {
    if (runtime.chatManager && !force) return runtime.chatManager;
    if (!allowScan) return null;
    const now = Date.now();
    if (!force && runtime.chatScanAt && now - runtime.chatScanAt < 2500) return null;
    runtime.chatScanAt = now;
    installLayaProbe();
    const manager = scanForChatManager();
    if (manager) runtime.chatManager = manager;
    return manager || runtime.chatManager;
  }

  function jinnangSoundAvailable() {
    const J = window.__JND;
    return !!(J && typeof J.sendOfficialSkinPhrase === 'function');
  }

  function resolvePhraseSender(force) {
    const cached = runtime.phraseSender;
    if (!force && cached && cached.obj && typeof safe(() => cached.obj[cached.name], null) === 'function') return cached;
    runtime.phraseSender = null;
    installLayaProbe();
    const probe = obj => {
      const sender = findPhraseSenderOn(obj);
      if (!sender) return null;
      runtime.phraseSender = sender;
      runtime.channelMethod = `${classOf(sender.obj) || '游戏对象'}.${sender.name}`;
      return sender;
    };
    for (let i = layaProbe.seen.length - 1; i >= 0; i--) {
      const sender = probe(layaProbe.seen[i]);
      if (sender) return sender;
    }
    const manager = findChatManager(true, force);
    if (manager) {
      const sender = probe(manager);
      if (sender) return sender;
    }
    const J = window.__JND;
    if (J) {
      for (const key of Object.keys(safe(() => J, {}) || {})) {
        const sender = probe(safe(() => J[key], null));
        if (sender) return sender;
      }
    }
    let found = null;
    eachNode(safe(() => window.Laya && window.Laya.stage, null), node => {
      if (!found) found = probe(node);
    });
    return found;
  }

  const CHANNEL_LABEL = {
    jinnang: '锦囊袋语音发送',
    game: '游戏原生语音发送',
    none: '未就绪',
  };

  function probeSendChannel(force) {
    const sender = resolvePhraseSender(!!force);
    if (sender) {
      runtime.sendChannel = 'game';
      runtime.channelCheckAt = Date.now();
      return runtime.sendChannel;
    }
    if (!sender) runtime.channelMethod = '';
    runtime.sendChannel = jinnangSoundAvailable() ? 'jinnang' : 'none';
    runtime.channelCheckAt = Date.now();
    return runtime.sendChannel;
  }

  function channelText() {
    const kind = runtime.sendChannel;
    if (!kind) return '发送通道：等待进入牌局';
    if (kind === 'none') return '发送通道：未就绪（进入牌局后自动检测）';
    const label = CHANNEL_LABEL[kind] || kind;
    const detail = kind === 'game' && runtime.channelMethod ? ` · ${runtime.channelMethod}` : '';
    return `发送通道：${label}（已就绪${detail}）`;
  }

  function syncChannelStatus() {
    const els = document.querySelectorAll('[data-sgs-syn-channel]');
    if (!els.length) return;
    const text = channelText();
    const ready = runtime.sendChannel === 'jinnang' || runtime.sendChannel === 'game';
    for (const el of els) {
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('is-ready', ready);
    }
  }

  function enterGameProbe() {
    if (!inGame()) {
      runtime.lastInGame = false;
      return;
    }
    const first = !runtime.lastInGame;
    runtime.lastInGame = true;
    if (runtime.sendChannel === 'jinnang' || runtime.sendChannel === 'game') {
      if (first) syncChannelStatus();
      return;
    }
    if (!first && Date.now() - (runtime.channelCheckAt || 0) < 15000) return;
    probeSendChannel(false);
    syncChannelStatus();
  }

  function isOtherChat(e) {
    if (!e) return false;
    if (e.isAllServerBroadcast) return false;
    const self = selfUserId();
    if (!self) return false;
    let uid = e.userID;
    if (uid == null) uid = safe(() => e.UserBrief && e.UserBrief.userID, null);
    if (uid == null) return false;
    const text = String(uid);
    if (text === '0' || text === '-1') return false;
    return text !== self;
  }

  function hookChatManager() {
    if (runtime.chatPatched) return;
    const allowScan = inGame() && (settings.blockOpponentChat || settings.blockOtherVoice);
    const cm = findChatManager(allowScan);
    if (!cm) return;
    const proto = safe(() => cm.constructor && cm.constructor.prototype, null);
    const original = safe(() => proto && proto.parseChatMessage, null);
    if (typeof original !== 'function' || original.__sgsSynWrapped) return;
    const wrapped = function (e, t) {
      try {
        if (!inGame()) return original.call(this, e, t);
        if (settings.blockOpponentChat && isOtherChat(e) && BLOCK_CHAT_TYPES.has(Number(e && e.msgType))) {
          noteBlock('parseChatMessage', null, 'chat');
          return undefined;
        }
        if (settings.blockOtherVoice && isOtherChat(e) && Number(e && e.msgType) === 52) {
          runtime.voiceMute = true;
          try {
            return original.call(this, e, t);
          } finally {
            runtime.voiceMute = false;
          }
        }
      } catch (_) {}
      return original.call(this, e, t);
    };
    wrapped.__sgsSynWrapped = true;
    proto.parseChatMessage = wrapped;
    runtime.chatPatched = true;
  }

  function hookSoundManager() {
    const Laya = window.Laya;
    const SM = Laya && Laya.SoundManager;
    if (!SM || typeof SM.playSound !== 'function' || SM.playSound.__sgsSynWrapped) return;
    const original = SM.playSound;
    const wrapped = function (url) {
      const value = String(url || '');
      if (runtime.voiceMute && /\/voice\//i.test(value) && !/\/voice\/effect\//i.test(value)) return;
      return original.apply(this, arguments);
    };
    wrapped.__sgsSynWrapped = true;
    SM.playSound = wrapped;
  }

  function patchSeatVoicePrototype(proto) {
    if (!proto || runtime.seatProtos.has(proto)) return;
    for (const name of ['PlaySkillSound', 'PlaySpellSoundByRes', 'PlayDeadSound', 'PlayFanJingSound']) {
      const original = safe(() => proto[name], null);
      if (typeof original !== 'function') continue;
      const wrapped = function () {
        if (settings.blockOtherVoice && !isSelfPlayerSeat(this)) {
          noteBlock(name, this, 'voice');
          return undefined;
        }
        return original.apply(this, arguments);
      };
      try {
        proto[name] = wrapped;
      } catch (_) {}
    }
    for (const name of ['PlayDebut', 'PlayEnterEffect', 'PlayTitleEffect', 'PlaySkinSuitEffect']) {
      const original = safe(() => proto[name], null);
      if (typeof original !== 'function') continue;
      const wrapped = function () {
        if (settings.blockOtherSkinEffects && !isSelfPlayerSeat(this)) {
          noteBlock(name, this, 'skin');
          return undefined;
        }
        return original.apply(this, arguments);
      };
      try {
        proto[name] = wrapped;
      } catch (_) {}
    }
    runtime.seatProtos.add(proto);
  }

  function patchSeatUiPrototype(proto) {
    if (!proto) return;
    let state = runtime.seatUiState.get(proto);
    if (!state) {
      state = { origDynamic: null, dynamicWrapper: null, origUseSkill: null, useSkillWrapper: null, extra: [] };
      runtime.seatUiState.set(proto, state);
    }

    if (!state.origDynamic) {
      const original = safe(() => proto.onPlayDynamicSkinEffect, null);
      if (typeof original === 'function') {
        const wrapped = function () {
          if (settings.blockOtherSkinEffects && !isSelfPlayerSeat(this.seat)) {
            noteBlock('onPlayDynamicSkinEffect', this.seat, 'skin');
            return undefined;
          }
          return original.apply(this, arguments);
        };
        try {
          proto.onPlayDynamicSkinEffect = wrapped;
          state.origDynamic = original;
          state.dynamicWrapper = wrapped;
        } catch (_) {}
      }
    }

    if (!state.origUseSkill) {
      const original = safe(() => proto.onUseSkill, null);
      if (typeof original === 'function') {
        const wrapped = function () {
          const result = original.apply(this, arguments);
          try {
            if (settings.blockOtherSkinEffects && !isSelfPlayerSeat(this.seat)) {
              const effect = this.specialSkinSkillEffect;
              if (effect) {
                noteBlock('onUseSkill', this.seat, 'skin');
                const effectProto = effect.constructor && effect.constructor.prototype;
                const playEffect = effectProto && effectProto.PlayEffect;
                if (typeof playEffect === 'function' && !runtime.effectProtos.has(effectProto)) {
                  const wrappedPlay = function (seat) {
                    if (settings.blockOtherSkinEffects && !isSelfPlayerSeat(seat)) return;
                    return playEffect.apply(this, arguments);
                  };
                  try {
                    effectProto.PlayEffect = wrappedPlay;
                    runtime.effectProtos.add(effectProto);
                  } catch (_) {}
                }
                safe(() => effect.clearLastEffect());
                safe(() => effect.destroy());
              }
              this.specialSkinSkillEffect = null;
            }
          } catch (_) {}
          return result;
        };
        try {
          proto.onUseSkill = wrapped;
          state.origUseSkill = original;
          state.useSkillWrapper = wrapped;
        } catch (_) {}
      }
    }

    for (const name of ['onPlayEnterEffect', 'PlayDebutEffect', 'PlayDebutEffect2', 'seat_Debut', 'playSpecialGeneralEffect', 'playJiaXuEffect']) {
      if (state.extra.some(pair => pair.name === name)) continue;
      const original = safe(() => proto[name], null);
      if (typeof original !== 'function') continue;
      const wrapped = function () {
        const self = isSelfPlayerSeat(this.seat);
        if (!self && settings.blockOtherSkinEffects) {
          noteBlock(name, this.seat, 'skin');
          return undefined;
        }
        if (!self && settings.blockOtherVoice) {
          runtime.voiceMute = true;
          try {
            return original.apply(this, arguments);
          } finally {
            runtime.voiceMute = false;
          }
        }
        return original.apply(this, arguments);
      };
      try {
        proto[name] = wrapped;
        state.extra.push({ name, original, wrapper: wrapped });
      } catch (_) {}
    }
  }

  function hookSkinEffect() {
    const mgr = findGameManager();
    if (!mgr) return;
    const managerProto = safe(() => mgr.constructor && mgr.constructor.prototype, null);
    let managerState = runtime.managerProtoState.get(managerProto);
    if (!managerState) {
      managerState = { original: null, wrapper: null };
      runtime.managerProtoState.set(managerProto, managerState);
    }
    if (!managerState.original) {
      const original = safe(() => managerProto && managerProto.onNotifyPlayDynamicSkinEffect, null);
      if (typeof original === 'function') {
        const wrapped = function (e) {
          try {
            if (settings.blockOtherSkinEffects) {
              const seatID = e && e.Protocol && e.Protocol.ProtoData && e.Protocol.ProtoData.seatID;
              if (seatID != null && !isSelfSeat(seatID)) return undefined;
            }
          } catch (_) {}
          return original.apply(this, arguments);
        };
        try {
          managerProto.onNotifyPlayDynamicSkinEffect = wrapped;
          managerState.original = original;
          managerState.wrapper = wrapped;
          runtime.skinPatched = true;
        } catch (_) {}
      }
    }
    if (managerState.original && managerState.wrapper) {
      const proxy = safe(() => mgr.proxy, null);
      let replaced = replaceBoundListener(proxy, managerState.original, managerState.wrapper, mgr) || replaceBoundListener(proxy, managerState.original, managerState.wrapper);
      if (!replaced) {
        for (const key of Object.keys(mgr)) {
          const candidate = safe(() => mgr[key], null);
          if (candidate && candidate._events && replaceBoundListener(candidate, managerState.original, managerState.wrapper, mgr)) {
            replaced = true;
            break;
          }
        }
      }
    }

    for (const seat of managerSeats(mgr)) {
      const seatProto = safe(() => seat.constructor && seat.constructor.prototype, null);
      patchSeatVoicePrototype(seatProto);
      const ui = safe(() => seat.SeatUI, null);
      const uiProto = safe(() => ui && ui.constructor && ui.constructor.prototype, null);
      patchSeatUiPrototype(uiProto);
      if (settings.blockOtherSkinEffects && ui && !isSelfPlayerSeat(seat)) {
        if (ui.skinEmojiEffect) {
          safe(() => ui.skinEmojiEffect.destroy());
          ui.skinEmojiEffect = null;
        }
        const specialEffect = ui.specialSkinSkillEffect;
        if (specialEffect && (specialEffect.IsPlaying || specialEffect.isPlaying)) {
          safe(() => specialEffect.clearLastEffect());
          safe(() => specialEffect.destroy());
          ui.specialSkinSkillEffect = null;
        }
      }
      const uiState = uiProto && runtime.seatUiState.get(uiProto);
      if (uiState) {
        if (uiState.origDynamic && uiState.dynamicWrapper) {
          replaceBoundListener(seat, uiState.origDynamic, uiState.dynamicWrapper, ui);
          replaceBoundListener(ui, uiState.origDynamic, uiState.dynamicWrapper, ui);
        }
        if (uiState.origUseSkill && uiState.useSkillWrapper) {
          replaceBoundListener(seat, uiState.origUseSkill, uiState.useSkillWrapper, ui);
          replaceBoundListener(ui, uiState.origUseSkill, uiState.useSkillWrapper, ui);
        }
        for (const pair of uiState.extra || []) {
          if (!pair.original || !pair.wrapper) continue;
          replaceBoundListener(seat, pair.original, pair.wrapper, ui);
          replaceBoundListener(ui, pair.original, pair.wrapper, ui);
        }
      }
    }
  }

  function applyVoicePolicy(force) {
    const J = window.__JND;
    if (!J || typeof J.setSkinPhraseHearOthersEnabled !== 'function') return;
    const policy = safe(() => J.SkinPhrasePolicy && J.SkinPhrasePolicy.get && J.SkinPhrasePolicy.get(), null);
    if (!settings.blockOtherVoice) {
      if (policy && policy.hearOthersEnabled === false) safe(() => J.setSkinPhraseHearOthersEnabled(true));
      return;
    }
    if (force || (policy && policy.hearOthersEnabled !== false)) {
      safe(() => J.setSkinPhraseHearOthersEnabled(false));
    }
  }

  function runtimeTick() {
    installLayaProbe();
    hookChatManager();
    hookSoundManager();
    hookSkinEffect();
    if (inGame()) applyVoicePolicy(false);
    enterGameProbe();
  }
  const sound = {
    rows: [],
    rowByKey: new Map(),
    loaded: false,
    loading: false,
    promise: null,
    catalogKey: '',
    catalog: null,
    generalHeadSkin: new Map(),
    searchCache: new Map(),
    error: '',
    query: '',
    statusEls: [],
  };

  const skillNameCache = new Map();
  const headUrlCache = new Map();

  function resolveSkillName(skillId) {
    const id = Number(skillId);
    if (!id) return '';
    if (skillNameCache.has(id)) return skillNameCache.get(id);
    let name = '';
    const J = window.__JND;
    if (J && typeof J.resolveSpellName === 'function') name = safe(() => J.resolveSpellName(id), '') || '';
    skillNameCache.set(id, name);
    return name;
  }

  function currentSelfGeneralId() {
    const mgr = findGameManager();
    const seat = mgr && safe(() => (typeof mgr.SelfSeat === 'function' ? mgr.SelfSeat() : mgr.seats && mgr.seats[mgr.selfSeatIndex]), null);
    if (!seat) return 0;
    const direct = safe(() => seat.GeneralId ?? seat.GeneralID ?? seat.generalId, null);
    if (direct != null && Number(direct)) return Number(direct);
    const general = safe(() => seat.General || seat.general, null);
    const id = safe(() => general && (general.ID ?? general.Id ?? general.id ?? general.GeneralID ?? general.GeneralId), null);
    return Number(id) || 0;
  }

  function currentSelfSkinId() {
    const mgr = findGameManager();
    const seat = mgr && safe(() => (typeof mgr.SelfSeat === 'function' ? mgr.SelfSeat() : mgr.seats && mgr.seats[mgr.selfSeatIndex]), null);
    if (!seat) return 0;
    return Number(seat.SkinID || seat.SkinItemID || seat.Skin2ID || 0) || 0;
  }

  function descriptorUrl(descriptor) {
    if (!descriptor) return '';
    if (typeof descriptor === 'string') return descriptor;
    const candidates = [
      descriptor.url,
      descriptor.headUrl,
      descriptor.headURL,
      descriptor.src,
      descriptor.path,
      descriptor.textureUrl,
      descriptor.texture && (descriptor.texture.url || descriptor.texture._url),
      descriptor.head && (descriptor.head.url || descriptor.head.src),
      descriptor.descriptor && (descriptor.descriptor.url || descriptor.descriptor.src),
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }

  function generalHeadUrls(generalId, skinId) {
    const id = Number(generalId);
    const sid = Number(skinId);
    if (!id && !sid) return [];
    const cacheKey = `${id}|${sid}`;
    if (headUrlCache.has(cacheKey)) return headUrlCache.get(cacheKey);
    const urls = [];
    const add = value => {
      if (value == null || value === '') return;
      let url = '';
      try {
        if (typeof value === 'string' && /^(https?:|res\/)/i.test(value)) {
          url = new URL(value, location.href).href;
        } else {
          const resource = String(value);
          if (!/^\d+$/.test(resource)) return;
          url = new URL(`res/assets/runtime/general/head/${resource}.png`, location.href).href;
        }
      } catch (_) {
        return;
      }
      if (url && !urls.includes(url)) urls.push(url);
    };

    const cat = sound.catalog;
    if (sid) {
      add(sid);
      const item = cat && cat.skinItem && cat.skinItem[sid];
      const relation = cat && cat.skinRelation;
      if (relation) {
        add(relation[sid]);
        if (item) add(relation[item]);
      }
      const reverse = cat && cat.reverseSkinRelation;
      if (reverse) {
        add(reverse[sid]);
        if (item) add(reverse[item]);
      }
    }

    const J = window.__JND;
    if (id && J && typeof J.getGeneralHeadDescriptor === 'function') {
      const descriptor = safe(() => J.getGeneralHeadDescriptor(id), null);
      add(descriptorUrl(descriptor));
    }
    if (id && cat && cat.defaultSkin && cat.defaultSkin[id]) add(cat.defaultSkin[id]);
    if (id && sound.generalHeadSkin.has(id)) add(sound.generalHeadSkin.get(id));

    headUrlCache.set(cacheKey, urls);
    return urls;
  }

  function resolveVoiceUrl(tag, soundKey) {
    const key = String(soundKey || '').trim();
    if (!key) return '';
    if (/^(https?:|res\/)/i.test(key)) {
      try { return new URL(key, location.href).href; } catch (_) { return key; }
    }
    const name = key.replace(/\.(mp3|wav|ogg)$/i, '');
    const tagValue = String(tag || '').trim();
    const dir = tagValue
      ? `res/assets/runtime/voice/skin/${tagValue}/`
      : 'res/assets/runtime/voice/spell/';
    try {
      return new URL(`${dir}${name}.mp3`, location.href).href;
    } catch (_) {
      return '';
    }
  }

  function findCatalogKey() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.indexOf('jnd:skin-config-catalog:v18:') === 0 && key.indexOf(':latest') === -1) return key;
    }
    return '';
  }

  async function gunzipBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  function prepareSoundRow(row) {
    if (!row) return row;
    row.generalLower = String(row.general || '').toLowerCase();
    row.skinLower = String(row.skin || '').toLowerCase();
    row.skillLower = String(row.skill || '').toLowerCase();
    row.textLower = String(row.text || '').toLowerCase();
    row.tagLower = String(row.tag || '').toLowerCase();
    row.hay = `${row.textLower} ${row.generalLower} ${row.skinLower} ${row.skillLower} ${row.tagLower}`;
    return row;
  }

  function scheduleSoundPrepare() {
    const rows = sound.rows;
    let index = 0;
    const step = () => {
      if (sound.rows !== rows) return;
      const end = Math.min(rows.length, index + 2000);
      for (; index < end; index++) {
        const row = rows[index];
        if (row && !row.hay) prepareSoundRow(row);
      }
      if (index < rows.length) setTimeout(step, 24);
    };
    setTimeout(step, 0);
  }

  function buildSoundIndex(cat) {
    const rows = [];
    const seen = new Set();
    const generalName = cat.generalName || {};
    const skinItem = cat.skinItem || {};
    const skinSearchKey = cat.skinSearchKey || {};
    const itemName = cat.itemName || {};
    const skinGenerals = cat.skinGenerals || {};
    const defaultSkin = cat.defaultSkin || {};
    const chatMap = cat.skinChatPhrase || {};
    const generalHeadSkin = new Map();

    sound.catalog = cat;
    sound.generalHeadSkin = generalHeadSkin;
    headUrlCache.clear();
    for (const skinId of Object.keys(skinGenerals)) {
      const gids = skinGenerals[skinId];
      if (!Array.isArray(gids)) continue;
      for (const gid of gids) {
        const generalId = Number(gid);
        if (generalId && !generalHeadSkin.has(generalId)) generalHeadSkin.set(generalId, Number(skinId));
      }
    }
    for (const gid of Object.keys(defaultSkin)) {
      const generalId = Number(gid);
      const skinId = Number(defaultSkin[gid]);
      if (generalId && skinId) generalHeadSkin.set(generalId, skinId);
    }

    const nameOf = id => generalName[id] || '';
    const skinOf = skinId => {
      const item = skinItem[skinId];
      const searchKey = skinSearchKey[item];
      if (searchKey) {
        const parts = String(searchKey).split('*');
        if (parts[0]) return parts[0];
      }
      return itemName[item] || '';
    };

    for (const skinId of Object.keys(chatMap)) {
      const entries = chatMap[skinId];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!Array.isArray(entry)) continue;
        const gids = Array.isArray(entry[0]) ? entry[0] : [];
        const resolvedGids = gids.length ? gids : (Array.isArray(skinGenerals[skinId]) ? skinGenerals[skinId] : []);
        const generalId = Number(resolvedGids[0]) || 0;
        const skillId = Number(entry[1]) || 0;
        const tag = String(entry[4] || '');
        const confId = Number(entry[3]) || 0;
        const texts = entry[5];
        if (!confId || !Array.isArray(texts)) continue;
        let general = resolvedGids.map(nameOf).filter(Boolean).join('、');
        const skin = skinOf(skinId);
        const skill = resolveSkillName(skillId);
        for (const item of texts) {
          if (!Array.isArray(item)) continue;
          const index = Number(item[0]);
          const phrase = String(item[1] || '').trim();
          const soundUrl = String(item[2] || '');
          if (!phrase) continue;
          const key = `${confId}_${index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(prepareSoundRow({
            key,
            text: phrase,
            general,
            generalId,
            skinId: Number(skinId),
            skin,
            skillId,
            skill,
            tag,
            sound: soundUrl,
            source: 'catalog',
          }));
        }
      }
    }

    sound.rows = rows;
    sound.rowByKey = new Map(rows.map(row => [row.key, row]));
    sound.searchCache.clear();
    sound.loaded = true;
    sound.loading = false;
    sound.error = '';
    sound.catalogKey = findCatalogKey();
    updateSoundStatus();
    return rows;
  }

  function buildRuntimeIndex() {
    const rows = [];
    const seen = new Set();
    const J = window.__JND;
    const mgr = findGameManager();
    const selfSeat = mgr && safe(() => (typeof mgr.SelfSeat === 'function' ? mgr.SelfSeat() : mgr.seats && mgr.seats[mgr.selfSeatIndex]), null);
    const general = selfSeat && safe(() => {
      const g = selfSeat.General || selfSeat.general;
      return g && (g.GeneralName || g.generalName || g.Name || g.name || g.ShortName) || '';
    }, '');
    const selfGeneralId = currentSelfGeneralId();
    const selfSkinId = currentSelfSkinId();

    const add = (key, text, extra) => {
      if (!key || !text) return;
      const k = String(key);
      if (seen.has(k)) return;
      seen.add(k);
      const row = Object.assign({ key: k, text: String(text), general: String(extra && extra.general || general || ''), skin: String(extra && extra.skin || ''), skill: String(extra && extra.skill || ''), skillId: Number(extra && extra.skillId) || 0, tag: '', sound: '', source: 'runtime' }, extra || {});
      row.generalId = Number(row.generalId) || selfGeneralId || 0;
      row.skinId = Number(row.skinId) || selfSkinId || 0;
      rows.push(prepareSoundRow(row));
    };

    const diag = J && typeof J.inspectInGameSkinPhrases === 'function' ? safe(() => J.inspectInGameSkinPhrases(), null) : null;
    if (diag) {
      const harvest = item => {
        if (!item || typeof item !== 'object') return;
        const key = item.skinChatPhraseKey || item.phraseKey || item.key || (item.phraseRow && (item.phraseRow.skinChatPhraseKey || item.phraseRow.key));
        const text = item.dialog || item.msg || item.message || item.text || item.Msg || (item.phraseRow && (item.phraseRow.dialog || item.phraseRow.msg || item.phraseRow.text));
        if (key && text) add(key, text, { general: item.generalName || item.general, generalId: item.generalId || item.generalID || (Array.isArray(item.generalIds) ? item.generalIds[0] : 0), skinId: item.skinId || item.skinItemId, skin: item.skinName, skill: item.skillName, skillId: item.skillId });
      };
      (diag.eligibleRows || []).forEach(harvest);
      (diag.slotCandidates || []).forEach(candidate => {
        if (!candidate || typeof candidate !== 'object') return;
        (candidate.rows || candidate.phrases || candidate.items || []).forEach(harvest);
        harvest(candidate);
      });
      (diag.view && diag.view.officialNodes || []).forEach(item => harvest(item));
    }

    const qcv = findNode(stage(), 'QuickChatTextView');
    if (qcv && Array.isArray(qcv.itemUIs)) {
      for (const item of qcv.itemUIs) {
        const data = item && item.data;
        if (!data || Number(data.ChatType) !== 52) continue;
        add(data.SkinChatPhraseKey, data.Msg, { general, generalId: selfGeneralId, skinId: selfSkinId, skillId: data.SkillID, skill: resolveSkillName(data.SkillID), sound: data.Sound });
      }
    }

    return rows;
  }

  function ensureSoundIndex() {
    if (sound.loaded) return Promise.resolve(sound.rows);
    if (sound.loading) return sound.promise || Promise.resolve(sound.rows);
    const key = findCatalogKey();
    if (key && sound.catalogKey === key && sound.rows.length) {
      sound.loaded = true;
      return Promise.resolve(sound.rows);
    }
    sound.loading = true;
    sound.error = '';
    updateSoundStatus();
    sound.promise = (async () => {
      try {
        if (!key) throw new Error('未找到锦囊袋台词目录');
        const record = JSON.parse(localStorage.getItem(key) || '{}');
        let json;
        if (record.encoding === 'gzip-base64-v1' && record.data) {
          json = await gunzipBase64(record.data);
        } else if (typeof record.data === 'string') {
          json = record.data;
        } else {
          throw new Error('台词目录格式未知');
        }
        const parsed = JSON.parse(json);
        const cat = parsed.catalog || parsed;
        if (!cat || !cat.skinChatPhrase) throw new Error('台词目录缺少字段');
        buildSoundIndex(cat);
      } catch (error) {
        sound.error = error && error.message ? error.message : String(error);
        const fallback = buildRuntimeIndex();
        if (fallback.length) {
          sound.rows = fallback;
          sound.rowByKey = new Map(fallback.map(row => [row.key, row]));
          sound.loaded = true;
          sound.error = '';
        }
      } finally {
        sound.loading = false;
        sound.promise = null;
        updateSoundStatus();
        if (sound.loaded) scheduleSoundPrepare();
        refreshSoundContainers();
      }
      return sound.rows;
    })();
    return sound.promise;
  }

  function refreshSoundContainers() {
    if (!sound.loaded) return;
    for (const el of document.querySelectorAll('.sgs-syn-results')) {
      if (el.__sgsSynQuery == null) continue;
      const kind = el.__sgsSynLimitKind || 'panel';
      renderSoundResults(el, el.__sgsSynQuery, getResultLimit(kind));
    }
  }

  function updateSoundStatus() {
    const text = sound.loading
      ? '台词库读取中…'
      : sound.loaded
        ? `台词库：${sound.rows.length} 条`
        : sound.error
          ? `台词库不可用：${sound.error}`
          : '台词库未载入';
    for (const el of sound.statusEls) {
      if (el) el.textContent = text;
    }
  }

  function searchSound(query, limit) {
    const raw = String(query || '').trim().toLowerCase();
    const tokens = raw.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];
    if (!tokens.length) {
      return { list: sound.rows.slice(0, limit), total: sound.rows.length };
    }
    const cached = sound.searchCache.get(raw);
    if (cached) {
      return { list: cached.rows.slice(0, limit), total: cached.total };
    }
    const scored = [];
    for (const row of sound.rows) {
      if (!row.hay) prepareSoundRow(row);
      if (!tokens.every(token => row.hay.indexOf(token) !== -1)) continue;
      const general = row.generalLower;
      const skin = row.skinLower;
      const skill = row.skillLower;
      const text = row.textLower;
      const tag = row.tagLower;
      let score = 0;
      for (const token of tokens) {
        if (general === token) score += 1400;
        else if (general.indexOf(token) !== -1) score += 1000;
        if (skin.indexOf(token) !== -1) score += 280;
        if (skill.indexOf(token) !== -1) score += 240;
        if (text.indexOf(token) !== -1) score += 60;
        if (tag.indexOf(token) !== -1) score += 20;
      }
      if (general && general.indexOf(raw) !== -1) score += 700;
      if (skin && skin.indexOf(raw) !== -1) score += 160;
      scored.push({ row, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ga = a.row.general || '';
      const gb = b.row.general || '';
      if (ga !== gb) return ga < gb ? -1 : 1;
      const ta = a.row.text || '';
      const tb = b.row.text || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return 0;
    });
    const top = scored.slice(0, Math.min(200, scored.length)).map(item => item.row);
    sound.searchCache.set(raw, { rows: top, total: scored.length });
    if (sound.searchCache.size > 12) {
      const oldest = sound.searchCache.keys().next().value;
      sound.searchCache.delete(oldest);
    }
    return { list: top.slice(0, limit), total: scored.length };
  }

  function renderSoundResults(container, query, limit) {
    if (!container) return;
    container.__sgsSynQuery = query;
    container.__sgsSynLimit = limit;
    if (!sound.loaded && !sound.loading) {
      ensureSoundIndex().then(() => renderSoundResults(container, query, limit));
      container.innerHTML = '<div class="sgs-syn-empty">正在读取锦囊袋台词目录…</div>';
      return;
    }
    if (sound.loading) {
      container.innerHTML = '<div class="sgs-syn-empty">正在读取锦囊袋台词目录…</div>';
      return;
    }
    if (!sound.rows.length) {
      container.innerHTML = `<div class="sgs-syn-empty">${escapeHtml(sound.error || '暂时没有可用的台词，请先进入牌局。')}</div>`;
      return;
    }
    const result = searchSound(query, limit);
    container.__sgsSynTotal = result.total;
    const totalEl = container.parentElement && container.parentElement.querySelector('[data-sgs-syn-limit-total]');
    if (totalEl) totalEl.textContent = String(result.total);
    if (!result.list.length) {
      container.innerHTML = '<div class="sgs-syn-empty">没有匹配的台词，换个武将名或台词关键词试试。</div>';
      return;
    }
    const html = result.list.map(row => {
      const general = row.general ? `<b>${escapeHtml(row.general)}</b>` : '';
      const skin = row.skin ? `<i>${escapeHtml(row.skin)}</i>` : '';
      const skill = row.skill ? `<em>[${escapeHtml(row.skill)}]</em>` : '';
      const heads = generalHeadUrls(row.generalId, row.skinId);
      const avatar = heads.length
        ? `<img class="sgs-syn-phrase-avatar" src="${escapeHtml(heads[0])}" alt="" loading="lazy" data-sgs-syn-head="${row.generalId || 0}" data-sgs-syn-head-index="0" data-sgs-syn-head-urls="${escapeHtml(JSON.stringify(heads))}">`
        : '';
      return `<div class="sgs-syn-phrase" data-sgs-syn-key="${escapeHtml(row.key)}" role="button" tabindex="0" title="点击发送这句台词，右侧 ▶ 试听">` +
        `<span class="sgs-syn-phrase-main"><span class="sgs-syn-phrase-text">${escapeHtml(row.text)}</span>` +
        `<span class="sgs-syn-phrase-meta">${general}${skin}${skill}</span></span>` +
        avatar +
        '<button type="button" class="sgs-syn-play" data-sgs-syn-play="1" title="试听这句台词的语音" aria-label="试听">▶</button>' +
        '</div>';
    }).join('');
    container.innerHTML = html;
    for (const img of container.querySelectorAll('img.sgs-syn-phrase-avatar')) {
      const onError = () => {
        let urls = [];
        try { urls = JSON.parse(img.getAttribute('data-sgs-syn-head-urls') || '[]'); } catch (_) {}
        const next = Number(img.getAttribute('data-sgs-syn-head-index') || 0) + 1;
        if (Array.isArray(urls) && next < urls.length) {
          img.setAttribute('data-sgs-syn-head-index', String(next));
          img.src = urls[next];
          return;
        }
        img.removeEventListener('error', onError);
        img.remove();
      };
      img.addEventListener('error', onError);
    }
  }

  function bindSoundResults(container, isPanel) {
    if (!container || container.__sgsSynBound) return;
    container.__sgsSynBound = true;
    container.__sgsSynLimitKind = container.closest && container.closest('.sgs-syn-modal') ? 'modal' : 'panel';
    const rowOf = node => {
      const item = node && node.closest ? node.closest('.sgs-syn-phrase') : null;
      const key = item && item.getAttribute('data-sgs-syn-key');
      return key ? sound.rowByKey.get(key) : null;
    };
    container.addEventListener('click', event => {
      const target = event.target;
      if (!target || !target.closest) return;
      const playButton = target.closest('.sgs-syn-play');
      if (playButton) {
        event.preventDefault();
        event.stopPropagation();
        playPhraseAudio(rowOf(playButton), false, playButton);
        return;
      }
      const button = target.closest('.sgs-syn-phrase');
      if (!button) return;
      event.preventDefault();
      sendSoundRow(rowOf(button), isPanel);
    });
    container.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      if (!target || !target.classList || !target.classList.contains('sgs-syn-phrase')) return;
      event.preventDefault();
      sendSoundRow(rowOf(target), isPanel);
    });
  }

  function showSendSuccess(row) {
    toast(`已发送：${row.text.slice(0, 24)}`);
  }

  function showSendFailure(row, error) {
    const detail = error && error.message ? `（${error.message}）` : '';
    toast(`没找到台词发送通道${detail}，已本地试听；面板里可查看通道状态`);
    playPhraseAudio(row, true, null);
  }

  const player = { url: '' };

  function phraseAudioUrl(row) {
    if (!row) return '';
    if (row.voiceUrl) return row.voiceUrl;
    return resolveVoiceUrl(row.tag, row.sound);
  }

  function flashPlayButton(button) {
    if (!button || !button.classList) return;
    for (const el of document.querySelectorAll('.sgs-syn-play.is-playing')) el.classList.remove('is-playing');
    button.classList.add('is-playing');
    clearTimeout(button.__sgsPlayTimer);
    button.__sgsPlayTimer = setTimeout(() => button.classList.remove('is-playing'), 1500);
  }

  function playPhraseAudio(row, quiet, button) {
    const url = phraseAudioUrl(row);
    if (!url) {
      if (!quiet) toast('这条台词没有可试听的音频');
      return false;
    }
    const Laya = window.Laya;
    if (!Laya || !Laya.SoundManager || typeof Laya.SoundManager.playSound !== 'function') {
      if (!quiet) toast('当前环境无法播放音频');
      return false;
    }
    try {
      if (player.url && player.url !== url && typeof Laya.SoundManager.stopSound === 'function') {
        safe(() => Laya.SoundManager.stopSound(player.url));
      }
      player.url = url;
      Laya.SoundManager.playSound(url, 1, null);
      flashPlayButton(button);
      if (!quiet) toast(`试听：${row.text.slice(0, 24)}`);
      return true;
    } catch (error) {
      if (!quiet) toast(`试听失败：${error && error.message || error}`);
      return false;
    }
  }

  const SHOT_SOUND_PRESETS = {
    save: { label: '保存音', data: 'data:audio/mpeg;base64,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VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU4Akc4AkdMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVV//ugZA+P8BgAgAOgAAgDABAAdAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' },
    alert: { label: '提示音', data: 'data:audio/mpeg;base64,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' },
    shot: { label: '截图音', data: 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAyAAAAAAAAAAAAAAD/+6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAsAABh9ACoqKioqKioqKj8/Pz8/Pz8/P1VVVVVVVVVVVWpqampqampqan9/f39/f39/f5WVlZWVlZWVlaqqqqqqqqqqqsDAwMDAwMDAwNXV1dXV1dXV1erq6urq6urq6v///////////wAAAABMYXZjNjMuMS4AAAAAAAAAAAAAAAAkBegAAAAAAAAYfQQxirAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+6BkAA/wAABpAAAACAAADSAAAAEAAAGkFAAAIAAANIKAAAQCgYDAYDAYDAYDAYDAXx3ChfAC+BffgMIBtv4bGJQ/Oihw5L/AOEAMHA+cZT/yKjnCPAkCAII//gbEmBxToGAXAbAUAOIAy4H//AxQIAogDe4DQMGCw2EAYn//+BjQoSHAZoEAE8AFGgSFgHFwFhQChT///wMYCBCXA0YcAKmBhBgXIAsRBs8BmAwGSEAVP/////gDHwGE4AgAUQNoD5zIZgmSDkuVSDjTHM/////kwCQPEkN+Dgl5Yb+cW/PEkN/4kCUGBL/8iXIM//5hIWDcSRn//BwJQYB2RLjT//8iXGgTAgDsWi8SP///dj2ecWJmv//yhkEgHQaT////4CAew2Ow2Gw2Gw2Gw2Gw2Bg8OhwmMJFcyTGPayYcBRh8GmKgaw696r3cMHgKGP+FsodFkP+yQwIMwoUEAWHKBf/hwMDDEwIEZdGoaXv//6l8ESAwhI0jIKhjFghUKYcsZk9///myIHLYmbHgY2b48RAAaXC4BAcfwWZYmXC1/02Xu+YIIYYMHAEQDCBA4ALCAaIDDySDTQoNGjv////oAwSBBwsxwBAIjgZEKW3Q3GApik4CciEAZkkZMRICoPSp//////QUQSFvDOjwELSTBQBOiAwUEQkAUkZ08aFYACplAZigYVDDIcz/+6Jk8wAFembT7k6ABFBp5SHDnAAmDXuDuc0AENOwbEMKUADRURnjPnv//////8t4aEeYcWEE0iTGkwg3JWv3LTAFqCQMvobd4FjJtFoQoMQJEAo0LIwxMGDGhqtTmVvMGUARr+gHwIGP/WRELPgP4h9v///87/6uQiCJPyPtD4qg7/5G7XKhX/75877gwoksb/853b+UXip2Zm///P//QSYeMgVVp3l1t1c0jSSiCJRCIcI9RgqDBbRU1hJ/o0e3pulF7DCABRANXOtM6SA4YWSIQAchEFhom4LDgUAhzQEhAMeDBtUDJlxHw1gtCIYRQsjkE+I7CwsL7i1jLRQ02sQIL6EQMxBAghHF4P+DgxkyJmKBRpjMEwOoiZ8Y0uJjmmpDS8TqJwvGZRYcsXORMZgcwiBMmSS0kjFZiicLjnTZMc8n5u83UgQ4gxspI4iYoqdaFJbmSkCLl96jQc8c8nymM3RRWiiiXS6pJJVSLKUtaC0UZEzxNm5mXzc0WmVFplwuGSLJUlpLPIzIxLv////oF8vpt///8uhXBoABCEEcAMiSiMCEAAAHr4mGi3I4vSefnOdxDVIwZztv/fRlBVetd0MYmO2gK/vy6vUbk/j7pq95/47t8sxSUxdMC5/44U2PNe3Gio5fLLs/lcinMIjlYi+OG6HsrmblJz7uVLjrO9n3/5vHHkxn//ugZLQAB9GC3v5mgAamqjr+zWQAnSGhSp3MAAJsq2r7sMABnX/t3+zlHU1ja1nU7Zu85u1hyxz+289Y2L+W8u7sS3mdS9vD/z1vDutX3EutZxP2yac9//gAz/+4AAi2wCIAmEBOZKP52QWBhWLclwWKOwxhzo09TBo1ZswH8riEQlsqjOdr8OSq9nqvVxppu/K6SrTT9PGpVhAsMshSFWQCqnVyZ2bWWrQFDs8pq2e7FZuVyZlY8Z9asTnewqK2aXVhrtDUlecspnhuxJ/YzJX5m4i90ahhrT/rwc6XSizEZ91Z9d1ybh532KU8QmYq+8Zna0qhutm/lqegd0HKjT+Q1ZrS7+RuNyuHIzDb6w3UhEAPc/EZo4EjUYiztSTKXRnGU6uV6TLCVX8NZ0uONX8srPMv/+1qbDLv83jdnbRuwKC8GrsAFc7qYRQADS1Ag5hfC+5UXdZSTBcOlmGbMseB2pC7wpDk8Kp+wVT+brHaW6c5f+KUUB8TWnFzEVJyNDH4PVpZre8TSA0kptXSEOivr83W6PnetX0k+7SlmK4hF34GHdjOq1R4viOPK9Ymch2lmJmm3ZRbmLawXca7r9CxPVtHdQvWe/Fzn+hOUtXEL897u8T0FPD35fT/4sAX4XAairqIWIgAAWIKVqoIUiSnnX0YHwlhSvlit5Kdw3At2xx9n2YDtMEz//uiZBSAA+Jb13sGG8J4C1sPPMOMD4ltW+egccnpr2u88w44bmXRqszhZRZrJox61lJSWD47gOlDEOJVebS+KLh5oSEO6uFj0ascLIIrLoMCDrEFdjGDZPYb537nKx00YzdSpaE5KRlkNyY4rMhXfQa/i/8dloFoFbczLlqmCQDYLd0LEBSAc8NHgFiIHe+RQ/nFTHXAohzYwGBHRKzUInlUbKXIllE5bFTNa2Jr2cioKRp/rF3dr+3OmJICvaR8PhFSCyk+Zmy5sctzUHg42/nqsrqSv9z82LU8EbBabuRFNZPL6TMZDC7ovyNzB8Xkkep24h8gAQBS3AwQxhYQzC9kiNIM8ZjOm1o5FwfahZM5ldHHSSgoKCGUPP5qatRTUvXqfvGjEWjXdhgciqLyMC7S/f8vDjjraqftG3MMstc6hssYxzUc9bA3C/14SVs6X/oWyHRNVPgClhtnp60iIzai4xYRf7FH3d4nBhF5y9uVpQKAOzjKVHVEEaydwzR9kgOor13BIMhcimVbunHJt5k/CHZGZlrsm0Tl/WmZPhuzOcOS3sk8gh2tTXjVAy37xed8Z66F5jmpOhKpiR1zCOe3kergr5cvDzMv8sVp7KVUlaa0le/5o0cE459oZBMJ0SYHa9ou1Wm87LhqoESDUAqg0RR9EZH5TsUHTOaOvKJSVQ2ggyNx69nLXf/7oGQSgAPEUFd7BhxgfCtavzzDnhAheVXsoHGBzyzrfYMN+eNS0tmdM1px6E56YwcB9JkY1rNHEfvxmMiPd3KKQxnr7hh+sd65Q7Ixl9IKGleo2uCseqRd/KWGpOWVh+X60jkOGvj0gqAmEyMshYJCU01BgA/Qk1JLnKpmhAAAF+TAJ2BkLiQBsGGGmnWEjJRRmDFFapn73Ft2AoOWq5x23HN2MQju0//uSnGemOA9JLmOYkdaO535lJ+fmtkzmPPyiTbBeONs28m/2K1HesPsZsSn47RfRs/pxQbbbFcEQ5bZC+Z61hOOgU3gcLAn49MPJIzorW1dQ+QAAAuV4CSHKmhbD7ApEYgMAqnXXGGwuPAcueuQzr8SkRzTCxRkcOhZ0p2inaxM9S3f3RIFw1xcxB73HjQWPVStS3CqAjI57PxurhDUcTUDsyyBBxPUr1bL9yJxmN1LP5D6SM1sWMObYk0PI75lygvIIikcwzkamrpc4J3SNm31Q8QJIJ9qMLHMq1Sxp+XkXoNSU2bHIX0moDlLSkl2myWz3YRLP+52z9K3fWt+/ZiW1jtTQRKuv+DG+dd5evHbCf62bZW3I+ORFma5FMu7KZEab22kd+/++bnt094KuvOz9jYf2GUArlijv5X3Yfvklag4nLu3OsgEAalfBpZzMLOV0XGX0mfAMBI2p4u85Y0FKP/7omQQgAPbWNT7CRtSdemqnzzDjE+JW03smHFJ4CdqPZSN+HiUFGmDD6/9xZZhSrMmaUVIVTkINumbA6fA0V2DMD8KCAHWGVpGmPICmzk2nFZYfARrYRcJIanCS3ioaP+FSlo0186kPyznpl+5T9Hw4pq0qKMwV1NuzLEURnCJNXdVTQoEAC1hJMC8nQ3QkRciGm4OYvRLTfkOqWVDdPk9ZI1cuWDGZ+0K7d0e5k5aJ8XgMDbTZjPFHIa+HnhH91Ntew22J4fJbbLFGcqKl1vPQyVsGVuE1d0ctjpF5Htrx6MiV2WmuO+eLmyru9N8/9z/N0KijdYvJdWSAABOVioWdgSFu1TT0Vo3WgxY6QyqzOZJKopuU+oyOlB+7ud+W1guHQUR+0+fxiwElUSBZ1K8eDFCwgv9qEUQ1Qj/yOPc7AznhqebKCUILRSpE3d1iObakvT+FCgWGgKNIMlG1LhXYyx6vDVNNzFwP993c3hl2LR5rcnGqIBAMxrAjMBgp+QyrcsKzxyV9uhxNNfcOxuyiIiY6yF0R2OjSxFb9xEllSacfZvY5CEZeS8f4P93qd+/Z3/5l+M/MoDIiYvnrNahahYXLlgmzKGkvyI0HLl7LS4UQELLKpjmeDhsqSOPiAIrBk1UV+h4xXZJq8+ZaJgEA7XuTkg4gQp58C5nkIufxxoUiSEFvKqNGvn/+6BkEQADyllT+egcsnoqKj5hiG4PRUlJ7CBxic6oaTmTDjBydvX7UKJDT/0rqcZow8tReaksHb+OCFDwWeJOAEW/8xyFAxBlttfI1AJQ2RZZdpJsvm3t+ZMet/jGRf8ZQiHaZ1SFvV3yzpY6VhY4JXo+iQ3+fL01CoVZTOIy3g4QAHW6UOKwOIuTpcUdW5I6zgsrIoTmtTpGxd4/Maz1G/nNZyDWbQTJ69FWBmCs1BFlZtnJ5eylW+PxCEELvVXtY0z4Kf/SLOjZ6tSJMIs6OTRpgsMPPlGXprmFLFR0qSQxW9RP7+nA+9A9Zj2NODR0IDeDUkyKtXdZKpAEAGc3SJ/C4gUycZeoA8S9Ybf+08lE/uT6Nen3wxccItK4syzHzBrPI6iNfhb1YRnjgsgbylLLhGMKmbNjJlvGqzM8rq08jQ7BO5QQUFFhh3MvyzQmNstTuV/sJKJp12DGMSCx2hD0cUyKOhCpLU8/j/y/EHdZq7uF8EB/9njOD0DHgnyiadMSZVADbM0o4nGbF2egl98MTHPewfj/0fnEhUHLO3e7V/oMPne9tVSdFamCLOI53+ynN0t/K7lScicTiKrqtqsUWmcjO2Z8exDhLYX83IUrqiugUnSCDxUwN1AQWJhOr/WqVyWbnalsQAQBufUOM1NWSsinJQrS0tIW0j6ApYVH1hCM2fWMuuv/+6JkEwAD311Rewwa0H/LWj9hA4xPgWVL7BhvwdAtKX2TDfi91I9vClTCkFBzro3bYRk6hiGYZBItmBhxAlJ9wgZA8tgkzpIR8YiV0MHhUZ4ZkeQ5IeRoe9cy15G/52qRPksMobkkPPIUeRDCgdARS6QfxAnJ5vakILCVW1d0kIBIA36UWMTECaceDVFDBYjIV3vM8liHYpFJykrRIWQPjKmcvqIgWmrU2ili2+61JIdbUhSmPmYzQHCYd8zFQf3EyeeRCiJzU8TVoGOTGTc2jFDIjJRQNTtN/M+Q+62rfNydKuimRDcLx2OCSUQJBDmooUtRyav5g7Sr0cXfdtRmmkE/zAQjAW1HIu5s8iqwl/XKVWh1hjDnmhkikB2mCy+sdDndrh5tbEWtJ2l89TwYcouEtOAyeIpNqQtF1Vn8FJMCQ1My1I2hUunnw+EUe+u2odR31po9aXVeQ/1I4fXB5sbBhTVmPdlyExDcIZYcTLvLZLUTQtts5uXT1JohH/sdKOLQiBa8mGJDuXSPdZf1w4Ig+nxPMMHEj4I4Ya+Y2Vqp85LNF3/7/gmNRkiic0upaq9gYZKv/7rax0+f/DzIpSm+vPNj7+2GA7tE0M027KufJnlb9znKWt5lPfJCBDkCJjxyktonhe9FRBh7u4lqSAABdYUoDMW+4TJumOolcZZql/NE8C3rBFSx//ugRBCAA9Ra0HnpG/BxqioPPQOMD2lvPeeYcUngJWe88yIplghURSg06CKMbhDzZZhT5oLjtf7ATOt2z/hhhVWPsuh3PtfLw2N7rcpTLaI9TBDqVygsPDzNntO3Ck4XWscZCzP8gTVuHPRwe5bFSX8y/oKhcUSCpnfcjeBgE1m8ynSogAAT9rKQelLCYujtNlTI8OQkJaIcjly8X22BkqbCtJR4+YonY05xjPmXFRMQDgsx2VVIMkiolRIMvv+6gGprKVyPtyjUKyMRisTTHRy6OTWNV7V1+5kcutLhErWkZJtUB08rVHCwEBGjZtSZGq1c1C5AAgDa+BHQZxvnIXo+n5eVKqTtaocdHHTtX5cCY3JyS1JIoOCdjHYoUzWVv/04F9x79LJjY/dkCxfuyhimyQiu5kbwgSg0Kxdkt81beqoma3OjQ2I3UpnLMVTzyOIIJgvWFlnn4lQysOy0Gwt1CLWvqOhYqxOmJ1V1ds8SJIAmswD6MAUoL4tEIVaDLhFMGVKsyVZkW+Z+6RNRh9ryvsl51yRxCyqSLqMOWDxEl66jioUcJIQDuodPLsqRSVuOpqMYVMUcRNzCp25VxdvVsnaxOvj4t6WauUT+7hjFBjnvQeRNb59cs0RZV3BX/9uqEzZ4iJY2SAABEZsBlEcu2lzRzcoup2XhyKIsIhZQUXmZtGov/4a6//uiZBOAA9VRTXgvMFJ8S1mvPYg8EDFHGSeFiQHXKeMgsSV5NiU2f7nzcBgJJbGlLbHAJHzM2gbE1VmJS6RE2qqXeXfK/NT5Fmf07tKrCWifrzNV6jUY3L9Rst6+/+E5p5qpO9Y5JPrML9/5OXRMkk//NFHJTkU4Iaw8zLJUAAAJ/KPUA9ltF4cQHVx/jDrzBwKyiiW+z0T3Zz0JujCGzUos45p56b4KBSJtYFpZSCynq1U51i1laNpiUva6JrUr/NzDxqbQprFFWIotbRaB9s19HWsm3FqzTXNfqsNF2sTaE0WzWjpbdTFT1NEnayPTWdWRNAAA3AAAQYCi2SITJa8HZCfzXFXtXdy1paOnZZdrQybMbMrXZ1lbU6PmXeajrlDo+mzyUBIBVXHT3susnK5ml1tesyuXXWus0XSck12sB8uesy7AuhMRJPdOj77Lv5q1a4us1Gtda9latdz62aJR9OWqttbF1jpUzVoGjxY8Sq9YCSAAI0AbmAeDoApGPO5qlkf1LmQCcpSs4UCMBClL4UTmWYKhQoY1rIqGg1KXwsGhCjJY5qqFxEkKkTVoUKFDKP8fGMZcBgKITKzSKErrcImqyUtjGMNWFSZKqhiIQzNChz/xyvGMbj7/k0q5rVZSjTQUSlYx/oLVACDdNAKB0cCeWFaJ52ubm5sEMMF6bmwQobF6bmzuzP/7oGQPj/ODUq2xhheQMuNmOQwDhgAAAaQAAAAgAAA0gAAABMzMzOTM/VpmCBtY/E8tav/fVcYlYgkIhEMqGZoqPTI5EmE0Nzf/8qTjSiyzLUlJxpxxZlw7PEX9FVF///+5iopihgoIMDCA4DgsKsrFG9v9QqQAEAfdmGoQWRlLZ/2Wxy8jVlBAxYHDQ8UJGlios3zQVFRZv1iot/9Yo3Ff//iwr/9QuxVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==' },
    shutter: { label: '快门音', data: 'data:audio/mpeg;base64,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Zn8gm8iw0Q4313f4PgBEMHq0HQaSkZ2XydHmVYW1vzNPTuRFOQ3A0rr3n5npLBc7R00SleE5LhKfDJIQ4DdAiVRwENKKJqlQJeySVDIJNBlaYiqbStiFZZ5jmKr+0b0tDLSvZNQc/N+nteqZmOSx7Qczg/vnAl3HUiIVHh8VC1OJl4LQm5iXSplL8L4fQf49XcR3VXvsy8kQRrMhMGz/+6BE+47jyGY8kywaYGtNF7JhIzwQFY7wTJhxyjAxnYGjDumBmzQX7SJeqJyh6nmnbbk0CxQOFQkRFHoljZreCo9tryRnsdtVppFq02lCiWOWLqyhhydgswzjNFalYKu1JmNdbDJswpKpATVYewql1Vq56k3tSZnAUVUFKoCGHqGssoIS0FBRjYcCtAUFZoAoYZyZmDH+a7LG1IMKoEKkbgFR7RTC1QFHZJAjBNibMlg1GgyaNMAj0jrI051tG5UnLa0prnXnzDt5sJfTrzw/VmqlDVTUTGqlC/sq+v9JtZS4a/Sb1nSMm+xeNS4bMwVD6SlGMtjZj4aiZ8oLkmGm/Nl4p8aKSW8l+gBAk1cQYdmQOGZAixwmDq8YGthVJWVfDO2mOe2q7mAr5Zg1t1CORR2EEOhUPZgrRRurmWWL9/f1s3Nn+syzBekcS45LxeO1itEfE0chSQSQWzRUemRJIRxGYey0qsmuw+MrrcjK6nmxktcJ5uSjdX/////7q6rc/r5so1OE2URCVKI2GzJMFRENEZIbPGhSFhk6gbc9lEqsku4CgyKkn/iugKigeNAyIzQVGCc8aJRUQjQeJjFokjTiz0EpZ42Zp4vEiJwo8xNS0SQkSYmgtFI04o8MgIFhcMu/8WZSEhcMmQELETNvrFmoAooJDRoKixrFP/1tx4oSNAUVFjUVFEz/+6Jk9gzEGGi8EyYbYGkKt6Ikw3xVHW6uTTExgViOF0CTGShBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' },
  };
  const SHOT_SOUND_LABEL = { none: '无（静音）', save: '保存音（内置）', alert: '提示音（内置）', shot: '截图音（内置）', shutter: '快门音（内置）', custom: '自定义音频' };
  const shot = {
    db: null,
    soundBlob: null,
    soundUrl: '',
    soundName: '',
    dirHandle: null,
    dirName: '',
    pickerOpen: false,
    loaded: false,
  };

  function shotDb() {
    if (shot.db) return Promise.resolve(shot.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sgs-synthesize-media', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
      };
      request.onsuccess = () => {
        shot.db = request.result;
        resolve(shot.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function shotStore(mode, action) {
    return shotDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const request = action(tx.objectStore('files'));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  const shotGet = key => shotStore('readonly', store => store.get(key));
  const shotSet = (key, value) => shotStore('readwrite', store => store.put(value, key));
  const shotDel = key => shotStore('readwrite', store => store.delete(key));

  function loadShotAssets() {
    if (shot.loaded) return;
    shot.loaded = true;
    shotGet('sound').then(record => {
      const blob = record && record.blob;
      if (blob instanceof Blob) {
        shot.soundBlob = blob;
        shot.soundName = String(record.name || '已选择的音效');
        if (!HAD_SHOT_PRESET) {
          settings.shotSoundPreset = 'custom';
          saveSettings();
        }
      }
      syncShotUi();
    }).catch(() => {});
    shotGet('dir').then(handle => {
      if (handle && typeof handle.getFileHandle === 'function') {
        shot.dirHandle = handle;
        shot.dirName = String(handle.name || '');
      }
      syncShotUi();
    }).catch(() => {});
  }

  function syncShotUi() {
      for (const button of document.querySelectorAll('[data-sgs-syn-shotkey]')) {
      button.textContent = uiState.capturingShotKey ? '按下按键…' : (settings.shotKey || '未设置');
      button.classList.toggle('is-capturing', uiState.capturingShotKey);
    }
    const preset = shotPreset();
    for (const el of document.querySelectorAll('[data-sgs-syn-shot-sound-label]')) {
      el.textContent = preset === 'custom' ? (shot.soundName || '自定义音频') : (SHOT_SOUND_LABEL[preset] || preset);
    }
    for (const toggle of document.querySelectorAll('[data-sgs-syn-shot-sound-drawer]')) {
      toggle.setAttribute('aria-expanded', uiState.soundDrawerOpen ? 'true' : 'false');
      toggle.classList.toggle('is-open', uiState.soundDrawerOpen);
    }
    for (const panel of document.querySelectorAll('[data-sgs-syn-shot-sound-drawer-panel]')) {
      panel.hidden = !uiState.soundDrawerOpen;
    }
    for (const button of document.querySelectorAll('[data-sgs-syn-shot-sound-preset]')) {
      const active = button.getAttribute('data-sgs-syn-shot-sound-preset') === preset;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const el of document.querySelectorAll('[data-sgs-syn-shot-dir-name]')) {
      el.innerHTML = shot.dirName
        ? `保存到：<b>${escapeHtml(shot.dirName)}</b>`
        : '默认：电脑截图文件夹（首次截图选择一次「图片\\屏幕截图」，之后不再弹窗）';
    }
  }

  function shotPreset() {
    const preset = settings.shotSoundPreset;
    if (preset === 'none' || preset === 'custom' || SHOT_SOUND_PRESETS[preset]) return preset;
    return 'save';
  }

  function shotSoundUrl() {
    const preset = shotPreset();
    if (preset === 'none') return '';
    if (preset === 'custom') {
      if (!shot.soundBlob) return '';
      if (!shot.soundUrl) shot.soundUrl = URL.createObjectURL(shot.soundBlob);
      return shot.soundUrl;
    }
    return SHOT_SOUND_PRESETS[preset].data;
  }

  const SHOT_AUDIO_POOL = [];
  const SHOT_AUDIO_MAX = 12;
  function playShotSound(forcePreset) {
    let url = '';
    if (forcePreset && forcePreset !== 'custom') {
      const entry = SHOT_SOUND_PRESETS[forcePreset];
      url = entry ? entry.data : '';
    } else {
      url = shotSoundUrl();
    }
    if (!url) return;
    try {
      const audio = new Audio(url);
      audio.volume = 0.9;
      SHOT_AUDIO_POOL.push(audio);
      const drop = () => {
        const index = SHOT_AUDIO_POOL.indexOf(audio);
        if (index !== -1) SHOT_AUDIO_POOL.splice(index, 1);
      };
      audio.addEventListener('ended', drop);
      audio.addEventListener('error', drop);
      while (SHOT_AUDIO_POOL.length > SHOT_AUDIO_MAX) {
        const old = SHOT_AUDIO_POOL.shift();
        if (old && old !== audio) {
          try { old.pause(); } catch (_) {}
        }
      }
      const played = audio.play();
      if (played && typeof played.catch === 'function') played.catch(drop);
    } catch (_) {}
  }

  function setShotSoundPreset(preset) {
    if (preset !== 'none' && preset !== 'save' && preset !== 'alert' && preset !== 'shot' && preset !== 'shutter' && preset !== 'custom') return;
    settings.shotSoundPreset = preset;
    saveSettings();
    if (preset === 'custom') {
      if (shot.soundBlob) {
        syncShotUi();
        playShotSound();
        toast(`截图音效：${shot.soundName || '自定义音频'}`);
      } else {
        syncShotUi();
        pickShotSound();
      }
      return;
    }
    syncShotUi();
    playShotSound();
    toast(`截图音效：${SHOT_SOUND_LABEL[preset]}`);
  }

  function applyShotSound(file) {
    if (!file) return;
    shot.soundBlob = file;
    shot.soundName = file.name || '已选择的音效';
    settings.shotSoundPreset = 'custom';
    saveSettings();
    if (shot.soundUrl) URL.revokeObjectURL(shot.soundUrl);
    shot.soundUrl = '';
    shotSet('sound', { blob: file, name: shot.soundName }).catch(() => toast('音效保存失败，重启后可能需要重新选择'));
    syncShotUi();
    playShotSound();
    toast(`截图音效已设置为自定义：${shot.soundName}`);
  }

  function pickShotSoundByInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      applyShotSound(file);
    }, { once: true });
    input.click();
  }

  function pickShotSound() {
    if (typeof window.showOpenFilePicker !== 'function') {
      pickShotSoundByInput();
      return;
    }
    try {
      window.showOpenFilePicker({
        id: 'sgs-syn-shot-sound',
        startIn: 'music',
        multiple: false,
        types: [{ description: '音频文件', accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'] } }],
      }).then(handles => handles[0].getFile()).then(applyShotSound).catch(error => {
        if (error && error.name === 'AbortError') return;
        pickShotSoundByInput();
      });
    } catch (_) {
      pickShotSoundByInput();
    }
  }

  function clearShotSound() {
    shot.soundBlob = null;
    shot.soundName = '';
    settings.shotSoundPreset = 'save';
    saveSettings();
    if (shot.soundUrl) URL.revokeObjectURL(shot.soundUrl);
    shot.soundUrl = '';
    shotDel('sound').catch(() => {});
    syncShotUi();
    toast('已恢复默认：保存音');
  }

  function pickShotDir() {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast('当前环境不支持固定保存目录，截图会保存到浏览器下载目录');
      return;
    }
    if (shot.pickerOpen) {
      downloadShotBlob(blob, name);
      toast(`截图已保存：${name}`);
      return;
    }
    shot.pickerOpen = true;
    try {
      window.showDirectoryPicker({ id: 'sgs-syn-shots', mode: 'readwrite', startIn: 'pictures' }).then(handle => {
        shot.dirHandle = handle;
        shot.dirName = String(handle.name || '已选择文件夹');
        shotSet('dir', handle).catch(() => toast('保存目录记忆失败，重启后可能需要重新选择'));
        syncShotUi();
        toast(`截图保存到：${shot.dirName}`);
      }).catch(error => {
        if (error && error.name === 'AbortError') return;
        toast(`选择文件夹失败：${error && error.message || error}`);
      });
    } catch (error) {
      toast(`当前环境不支持选择文件夹：${error && error.message || error}`);
    }
  }

  function resetShotDir() {
    shot.dirHandle = null;
    shot.dirName = '';
    shotDel('dir').catch(() => {});
    syncShotUi();
    toast('已恢复默认保存位置，下次截图会重新选择文件夹');
  }

  let shotNameSeq = 0;
  let shotNameLast = '';
  let shotRepeatAt = 0;
  function shotFileName() {
    const now = new Date();
    const pad = (value, width) => String(value).padStart(width || 2, '0');
    const base = `sgs_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`;
    let name = base;
    if (name === shotNameLast) {
      shotNameSeq += 1;
      name = `${base}_${shotNameSeq}`;
    } else {
      shotNameLast = base;
      shotNameSeq = 0;
    }
    return `${name}.png`;
  }

  function stageScreenshotBlob() {
    const Laya = window.Laya;
    const st = Laya && Laya.stage;
    if (!st || typeof st.drawToCanvas !== 'function') return null;
    const canvas = st.canvas || {};
    const width = Math.round(Number(st.width) || Number(canvas.width) || 0);
    const height = Math.round(Number(st.height) || Number(canvas.height) || 0);
    if (width <= 0 || height <= 0) return null;
    const texture = st.drawToCanvas(width, height, 0, 0);
    if (!texture || typeof texture.toBase64 !== 'function') return null;
    let data = String(texture.toBase64('image/png', 1) || '');
    if (!data) return null;
    if (data.indexOf('base64,') === -1) data = `data:image/png;base64,${data}`;
    const comma = data.indexOf(',');
    if (comma === -1) return null;
    const binary = atob(data.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }

  function downloadShotBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function dirWritable(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return Promise.resolve(false);
    return handle.queryPermission({ mode: 'readwrite' }).then(permission => {
      if (permission === 'granted') return true;
      if (typeof handle.requestPermission !== 'function') return false;
      return handle.requestPermission({ mode: 'readwrite' }).then(next => next === 'granted').catch(() => false);
    }).catch(() => false);
  }

  function saveShotBlob(blob, name) {
    const handle = shot.dirHandle;
    if (!handle) {
      downloadShotBlob(blob, name);
      toast(`截图已保存：${name}`);
      return Promise.resolve();
    }
    return dirWritable(handle).then(ok => {
      if (!ok) {
        downloadShotBlob(blob, name);
        toast('保存目录未授权，已改为下载，请在面板重新选择文件夹');
        return;
      }
      return handle.getFileHandle(name, { create: true })
        .then(fileHandle => fileHandle.createWritable())
        .then(writable => writable.write(blob).then(() => writable.close()))
        .then(() => toast(`截图已保存：${name}`))
        .catch(error => {
          downloadShotBlob(blob, name);
          toast(`写入目录失败，已改为下载：${error && error.message || error}`);
        });
    });
  }

  function takeScreenshot() {
    const blob = safe(stageScreenshotBlob, null);
    if (!blob) {
      toast('截图失败：请先进入牌局');
      return;
    }
    playShotSound();
    const name = shotFileName();
    if (shot.dirHandle || typeof window.showDirectoryPicker !== 'function') {
      saveShotBlob(blob, name).catch(error => {
        toast(`截图失败：${error && error.message || error}`);
      });
      return;
    }
    if (shot.pickerOpen) {
      downloadShotBlob(blob, name);
      toast(`截图已保存：${name}`);
      return;
    }
    shot.pickerOpen = true;
    try {
      window.showDirectoryPicker({ id: 'sgs-syn-shots', mode: 'readwrite', startIn: 'pictures' }).then(handle => {
        shot.dirHandle = handle;
        shot.dirName = String(handle.name || '已选择文件夹');
        shotSet('dir', handle).catch(() => {});
        syncShotUi();
        return saveShotBlob(blob, name);
      }).catch(error => {
        if (error && error.name === 'AbortError') toast('截图已取消：未选择保存文件夹');
        else toast(`保存截图失败：${error && error.message || error}`);
      }).then(() => { shot.pickerOpen = false; });
    } catch (error) {
      shot.pickerOpen = false;
      toast(`保存截图失败：${error && error.message || error}`);
    }
  }

  function tryPhraseCall(sender, row) {
    const fn = safe(() => sender.obj[sender.name], null);
    if (typeof fn !== 'function') return { stale: true };
    const parts = String(row.key || '').split('_');
    const confId = Number(parts[0]) || 0;
    const dialogIndex = Number(parts[1]) || 0;
    const payload = {
      key: row.key,
      skinChatPhraseKey: row.key,
      confId,
      dialogIndex,
      skinId: row.skinId,
      generalId: row.generalId,
      dialog: row.text,
    };
    const attempts = [[row.key], [row.key, row.text], [payload]];
    let threw = 0;
    for (const args of attempts) {
      try {
        const result = fn.apply(sender.obj, args);
        if (result && typeof result.then === 'function') return { ok: true, pending: result };
        if (result === false) continue;
        if (result && result.ok === false) continue;
        return { ok: true };
      } catch (_) {
        threw += 1;
      }
    }
    return { threw };
  }

  function sendViaGame(row, force) {
    const sender = resolvePhraseSender(!!force);
    if (!sender) return false;
    const outcome = tryPhraseCall(sender, row);
    if (outcome.stale) {
      runtime.phraseSender = null;
      return false;
    }
    if (!outcome.ok) {
      if (outcome.threw >= 3) {
        runtime.phraseSender = null;
        runtime.channelMethod = '';
        runtime.sendChannel = 'none';
      }
      return false;
    }
    if (outcome.pending) {
      outcome.pending.then(res => {
        if (res && res.ok === false) showSendFailure(row, null);
      }).catch(() => {});
    }
    runtime.sendChannel = 'game';
    showSendSuccess(row);
    return true;
  }

  function deliverViaJinnang(row) {
    const J = window.__JND;
    if (!J || !jinnangSoundAvailable()) return Promise.resolve(null);
    try {
      const result = J.sendOfficialSkinPhrase(row.key);
      if (result && typeof result.then === 'function') {
        return result.then(res => !!(res && res.ok)).catch(() => false);
      }
      return Promise.resolve(!!(result && result.ok));
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  async function deliverPhrase(row) {
    if (sendViaGame(row, false)) return true;
    if (sendViaGame(row, true)) return true;
    const jinnang = await deliverViaJinnang(row);
    if (jinnang) {
      runtime.sendChannel = 'jinnang';
      showSendSuccess(row);
      return true;
    }
    return false;
  }

  function sendSoundRow(row, fromPanel) {
    if (!row) return;
    if (!inGame()) {
      playPhraseAudio(row, false, null);
      return;
    }
    deliverPhrase(row).then(ok => {
      syncChannelStatus();
      if (!ok) showSendFailure(row, null);
    }).catch(() => {
      syncChannelStatus();
      showSendFailure(row, null);
    });
  }

  function ensureSoundModal() {
    if (document.getElementById(MODAL_ID) || !document.body) return;
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'sgs-syn-modal';
    modal.innerHTML = `
      <div class="sgs-syn-modal-backdrop" data-sgs-syn-close="1"></div>
      <div class="sgs-syn-modal-card" role="dialog" aria-modal="true" aria-label="台词搜索">
        <div class="sgs-syn-modal-head">
          <span class="sgs-syn-modal-title">台词搜索</span>
          <span class="sgs-syn-modal-sub">/sound</span>
          <span class="sgs-syn-count" id="sgs-syn-modal-status" style="margin-left:8px"></span>
          <button type="button" class="sgs-syn-modal-close" data-sgs-syn-close="1" aria-label="关闭">×</button>
        </div>
        <div class="sgs-syn-modal-body">
          <div class="sgs-syn-search-row">
            <input class="sgs-syn-input" id="sgs-syn-modal-input" type="text" spellcheck="false" autocomplete="off" placeholder="搜索台词或武将名，例如：仁德 刘备 / 画入我眸">
            <button type="button" class="sgs-syn-btn" id="sgs-syn-modal-search">搜索</button>
          </div>
          <div class="sgs-syn-hint">点击任意一句即可发送，右侧 ▶ 可以先试听；输入框内按 Enter 会发送第一条结果。</div>
          ${limitRowHtml('modal')}
          <div class="sgs-syn-results sgs-syn-modal-results" id="sgs-syn-modal-results"></div>
        </div>
        <div class="sgs-syn-modal-foot">数据来自锦囊袋皮肤台词目录 · 语音播放与发送由插件内置完成</div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('#sgs-syn-modal-input');
    const results = modal.querySelector('#sgs-syn-modal-results');
    const status = modal.querySelector('#sgs-syn-modal-status');
    sound.statusEls.push(status);
    bindSoundResults(results, false);
    bindLimitInput(modal);
    const stop = event => event.stopPropagation();
    for (const type of ['keydown', 'keypress', 'keyup', 'mousedown', 'pointerdown', 'input', 'compositionstart', 'compositionend']) {
      input.addEventListener(type, stop);
    }
    bindSoundSearchGuard(input, results, 'modal');
    input.addEventListener('input', () => {
      sound.query = input.value;
      scheduleSoundSearch(input, results, 'modal');
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (results.__sgsSynQuery !== input.value) runSoundSearch(input, results, 'modal');
      const first = results.querySelector('.sgs-syn-phrase');
      if (first) first.click();
    });
    modal.querySelector('#sgs-syn-modal-search').addEventListener('click', () => renderSoundResults(results, input.value, getResultLimit('modal')));
    modal.addEventListener('click', event => {
      const target = event.target;
      if (target && target.getAttribute && target.getAttribute('data-sgs-syn-close')) closeSoundModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) closeSoundModal();
    }, true);
    updateSoundStatus();
  }

  function openSoundModal(query) {
    ensureSoundModal();
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const input = modal.querySelector('#sgs-syn-modal-input');
    const results = modal.querySelector('#sgs-syn-modal-results');
    modal.classList.add('is-open');
    if (input) {
      input.value = query || '';
      sound.query = input.value;
      setTimeout(() => input.focus(), 30);
    }
    ensureSoundIndex().then(() => renderSoundResults(results, sound.query, getResultLimit('modal')));
    renderSoundResults(results, sound.query, getResultLimit('modal'));
  }

  function closeSoundModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('is-open');
  }
  const panelUi = {
    mounted: false,
    tab: null,
    pane: null,
    boundSidebar: null,
    startAt: Date.now(),
  };

  function toggleHtml(key, name, desc, checked) {
    return `<div class="jnd-block"><label class="jnd-opt jnd-opt-switch"><span class="jnd-opt-tx"><span class="jnd-opt-name">${name}</span><span class="jnd-opt-desc">${desc}</span></span><span class="jnd-cm-hit"><input type="checkbox" class="jnd-cm-input" data-sgs-syn="${key}"${checked ? ' checked' : ''} aria-label="${name}"><span class="jnd-cm-ctl" aria-hidden="true"><span class="jnd-cm-on jnd-cm-key">ON</span><span class="jnd-cm-off-label jnd-cm-key">OFF</span></span></span></label></div>`;
  }

  function controlsHtml() {
    const integrated = settings.panelMode !== 'standalone';
    return `
      <div class="sgs-syn-sec"><span>面板设置</span></div>
      <div class="sgs-syn-mode-label">面板形态</div>
      <div class="sgs-syn-seg">
        <button type="button" data-sgs-syn-mode="integrated" class="${integrated ? 'is-active' : ''}">并入锦囊袋</button>
        <button type="button" data-sgs-syn-mode="standalone" class="${integrated ? '' : 'is-active'}">独立面板</button>
      </div>
      <div class="sgs-syn-sec"><span>界面增强</span></div>
      ${toggleHtml('showcaseSearch', '设置展示搜索', '在「设置展示」窗口标题栏加搜索框，按武将名、皮肤名或拼音过滤。', settings.showcaseSearch)}
      ${toggleHtml('redDotCleaner', '立即去红点与新标', '更快隐藏红点与「新」角标；皮肤、武将界面的「新」会保留。', settings.redDotCleaner)}
      ${toggleHtml('jinnangDot', '锦囊袋圆点入口', '收起时只显示 26px 圆点，点击仍可正常展开锦囊袋。', settings.jinnangDot)}
      <div class="sgs-syn-sec"><span>牌局屏蔽</span></div>
      ${toggleHtml('blockOpponentChat', '屏蔽对手发言', '牌局中隐藏其他玩家发送的普通聊天、快捷短语与表情。', settings.blockOpponentChat)}
      ${toggleHtml('blockOtherSkinEffects', '屏蔽其他人皮肤特效', '其他座位触发皮肤技能特效时，本机不再播放。', settings.blockOtherSkinEffects)}
      ${toggleHtml('blockOtherVoice', '屏蔽其他人武将台词', '不再听到其他玩家的技能语音、死亡语音与武将台词快捷短语。', settings.blockOtherVoice)}
    `;
  }

  function getResultLimit(kind) {
    const key = kind === 'modal' ? 'modalLimit' : 'panelLimit';
    const fallback = kind === 'modal' ? 50 : 10;
    const value = Number(settings[key]);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.min(200, Math.max(1, Math.round(value)));
  }

  function limitRowHtml(kind) {
    return `<div class="sgs-syn-limit-row"><span>共 <b data-sgs-syn-limit-total>0</b> 条，显示前</span><input class="sgs-syn-limit-input" type="number" min="1" max="200" step="1" value="${getResultLimit(kind)}" data-sgs-syn-limit="1" data-sgs-syn-limit-kind="${kind}" aria-label="显示条数"><span>条</span></div>`;
  }

  function soundBlockHtml(prefix) {
    return `
      <div class="sgs-syn-sec"><span>/sound 台词搜索</span></div>
      <div class="sgs-syn-search-row">
        <input class="sgs-syn-input" id="sgs-syn-${prefix}-input" type="text" spellcheck="false" autocomplete="off" placeholder="搜索台词 / 武将名，例如：仁德 刘备">
        <button type="button" class="sgs-syn-btn" id="sgs-syn-${prefix}-open">打开</button>
      </div>
      <div class="sgs-syn-hint">点台词行发送，点右侧 ▶ 试听；在大厅里点行就是试听。</div>
      <div class="sgs-syn-channel" data-sgs-syn-channel>发送通道：等待进入牌局</div>
      ${limitRowHtml('panel')}
      <div class="sgs-syn-results" id="sgs-syn-${prefix}-results"></div>
    `;
  }

  function bindControlsScope(scope) {
    if (!scope || scope.__sgsSynControlsBound) return;
    scope.__sgsSynControlsBound = true;
    scope.addEventListener('change', event => {
      const input = event.target;
      const key = input && input.getAttribute && input.getAttribute('data-sgs-syn');
      if (!key || !(key in DEFAULTS)) return;
      settings[key] = !!input.checked;
      saveSettings();
      applySetting(key);
      syncToggleUi();
    });
    scope.addEventListener('click', event => {
      const target = event.target && event.target.closest ? event.target : null;
      if (!target) return;
      const modeButton = target.closest('[data-sgs-syn-mode]');
      if (modeButton) {
        event.preventDefault();
        const mode = modeButton.getAttribute('data-sgs-syn-mode');
        if (mode === 'integrated' || mode === 'standalone') {
          settings.panelMode = mode;
          saveSettings();
          applyPanelMode();
          syncToggleUi();
        }
        return;
      }
      const hotkeyButton = target.closest('[data-sgs-syn-hotkey]');
      if (hotkeyButton) {
        event.preventDefault();
        startHotkeyCapture();
        return;
      }
      const hotkeyClear = target.closest('[data-sgs-syn-hotkey-clear]');
      if (hotkeyClear) {
        event.preventDefault();
        settings.hotkey = '';
        saveSettings();
        syncToggleUi();
        toast('面板快捷键已清除');
        return;
      }
      const shotKeyButton = target.closest('[data-sgs-syn-shotkey]');
      if (shotKeyButton) {
        event.preventDefault();
        startShotKeyCapture();
        return;
      }
      const shotKeyClear = target.closest('[data-sgs-syn-shotkey-clear]');
      if (shotKeyClear) {
        event.preventDefault();
        settings.shotKey = '';
        saveSettings();
        syncToggleUi();
        toast('截图快捷键已清除');
        return;
      }
      const shotSoundDrawer = target.closest('[data-sgs-syn-shot-sound-drawer]');
      if (shotSoundDrawer) {
        event.preventDefault();
        uiState.soundDrawerOpen = !uiState.soundDrawerOpen;
        syncShotUi();
        return;
      }
      const shotSoundPreset = target.closest('[data-sgs-syn-shot-sound-preset]');
      if (shotSoundPreset) {
        event.preventDefault();
        setShotSoundPreset(shotSoundPreset.getAttribute('data-sgs-syn-shot-sound-preset'));
        return;
      }
      const shotSoundPick = target.closest('[data-sgs-syn-shot-sound-pick]');
      if (shotSoundPick) {
        event.preventDefault();
        pickShotSound();
        return;
      }
      const shotSoundClear = target.closest('[data-sgs-syn-shot-sound-clear]');
      if (shotSoundClear) {
        event.preventDefault();
        clearShotSound();
        return;
      }
      const shotDirPick = target.closest('[data-sgs-syn-shot-dir]');
      if (shotDirPick) {
        event.preventDefault();
        pickShotDir();
        return;
      }
      const shotDirReset = target.closest('[data-sgs-syn-shot-dir-reset]');
      if (shotDirReset) {
        event.preventDefault();
        resetShotDir();
        return;
      }
    });
    syncShotUi();
  }

  function syncLimitInputs() {
    for (const input of document.querySelectorAll('[data-sgs-syn-limit]')) {
      const kind = input.getAttribute('data-sgs-syn-limit-kind') === 'modal' ? 'modal' : 'panel';
      const value = String(getResultLimit(kind));
      if (input.value !== value) input.value = value;
    }
  }

  function bindLimitInput(scope) {
    const input = scope && scope.querySelector('[data-sgs-syn-limit]');
    if (!input || input.__sgsSynLimitBound) return;
    input.__sgsSynLimitBound = true;
    const kind = input.getAttribute('data-sgs-syn-limit-kind') === 'modal' ? 'modal' : 'panel';
    const key = kind === 'modal' ? 'modalLimit' : 'panelLimit';
    const fallback = kind === 'modal' ? 50 : 10;
    const stop = event => event.stopPropagation();
    for (const type of ['keydown', 'keypress', 'keyup', 'mousedown', 'pointerdown', 'input', 'change']) {
      input.addEventListener(type, stop);
    }
    let timer = 0;
    const apply = (syncAll) => {
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = fallback;
      value = Math.min(200, Math.max(1, Math.round(value)));
      settings[key] = value;
      saveSettings();
      if (syncAll) syncLimitInputs();
      refreshSoundContainers();
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => apply(false), 260);
    });
    input.addEventListener('change', () => {
      clearTimeout(timer);
      apply(true);
    });
    input.addEventListener('blur', () => {
      clearTimeout(timer);
      apply(true);
    });
  }

  const soundSearchJobs = new WeakMap();

  function soundSearchState(input) {
    let state = soundSearchJobs.get(input);
    if (!state) {
      state = { timer: 0, lastAt: 0, composing: false };
      soundSearchJobs.set(input, state);
    }
    return state;
  }

  function runSoundSearch(input, results, kind) {
    const state = soundSearchState(input);
    state.lastAt = Date.now();
    if (results.__sgsSynQuery === input.value) return;
    if (!sound.loaded) ensureSoundIndex();
    renderSoundResults(results, input.value, getResultLimit(kind));
  }

  function scheduleSoundSearch(input, results, kind, immediate) {
    const state = soundSearchState(input);
    if (state.composing) return;
    clearTimeout(state.timer);
    const wait = immediate ? 0 : Math.max(SEARCH_DEBOUNCE, state.lastAt + SEARCH_COOLDOWN - Date.now());
    state.timer = setTimeout(() => runSoundSearch(input, results, kind), wait);
  }

  function bindSoundSearchGuard(input, results, kind) {
    const state = soundSearchState(input);
    input.addEventListener('compositionstart', () => {
      state.composing = true;
      clearTimeout(state.timer);
    });
    input.addEventListener('compositionend', () => {
      state.composing = false;
      scheduleSoundSearch(input, results, kind);
    });
  }

  function bindSoundScope(scope, prefix, isPanel) {
    const input = scope.querySelector(`#sgs-syn-${prefix}-input`);
    const results = scope.querySelector(`#sgs-syn-${prefix}-results`);
    const open = scope.querySelector(`#sgs-syn-${prefix}-open`);
    if (!input || !results) return;
    if (!results.__sgsSynBound) bindSoundResults(results, isPanel);
    bindLimitInput(scope);
    if (input.__sgsSynSoundBound) return;
    input.__sgsSynSoundBound = true;
    const stop = event => event.stopPropagation();
    for (const type of ['keydown', 'keypress', 'keyup', 'mousedown', 'pointerdown', 'input', 'compositionstart', 'compositionend']) {
      input.addEventListener(type, stop);
    }
    bindSoundSearchGuard(input, results, 'panel');
    input.addEventListener('input', () => scheduleSoundSearch(input, results, 'panel'));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (results.__sgsSynQuery !== input.value) runSoundSearch(input, results, 'panel');
      const first = results.querySelector('.sgs-syn-phrase');
      if (first) first.click();
    });
    if (open) {
      open.addEventListener('click', () => openSoundModal(input.value || ''));
    }
  }

  function positionIntegratedTab(panel) {
    if (!panel) return;
    const sidebar = panel.querySelector('.jnd-sidebar');
    const tab = document.getElementById(TAB_ID);
    if (!sidebar || !tab) return;
    const channelTab = sidebar.querySelector('.jnd-tab-bottom') || sidebar.querySelector('.jnd-tab[data-pane="channel"]');
    const pluginsTab = sidebar.querySelector('.jnd-tab[data-pane="plugins"]');
    if (!channelTab || !pluginsTab) return;
    sidebar.style.position = 'relative';
    const tabHeight = tab.offsetHeight || 32;
    const pluginsBottom = pluginsTab.offsetTop + pluginsTab.offsetHeight;
    const channelTop = channelTab.offsetTop;
    const centerTop = (pluginsBottom + channelTop) / 2 - tabHeight / 2;
    const top = Math.max(pluginsBottom + 6, Math.min(channelTop - tabHeight - 6, centerTop));
    const left = pluginsTab.offsetLeft;
    const width = pluginsTab.offsetWidth || tab.offsetWidth;
    const style = tab.style;
    if (style.position !== 'absolute') {
      style.position = 'absolute';
      style.zIndex = '4';
    }
    const topPx = `${Math.round(top)}px`;
    const leftPx = `${Math.round(left)}px`;
    const widthPx = `${Math.round(width)}px`;
    if (style.top !== topPx) style.top = topPx;
    if (style.left !== leftPx) style.left = leftPx;
    if (style.width !== widthPx) style.width = widthPx;
  }

  function activateSynTab(panel) {
    const tab = document.getElementById(TAB_ID);
    const pane = document.getElementById(PANE_ID);
    if (!tab || !pane) return;
    positionIntegratedTab(panel);
    for (const item of panel.querySelectorAll('.jnd-tab')) item.classList.toggle('active', item === tab);
    for (const item of panel.querySelectorAll('.jnd-pane')) item.classList.toggle('active', item === pane);
    panel.classList.add('sgs-syn-credits-empty');
    const glider = panel.querySelector('.jnd-tab-glider');
    if (glider) {
      const top = tab.offsetTop + (tab.offsetHeight - glider.offsetHeight) / 2;
      glider.style.transform = `translate3d(0px, ${Math.max(0, Math.round(top))}px, 0px)`;
    }
    const main = pane.querySelector('.jnd-pane-main');
    if (main) main.scrollTop = 0;
    const results = pane.querySelector('#sgs-syn-panel-results');
    if (results) renderSoundResults(results, '', getResultLimit('panel'));
  }

  function ensurePanelNodes(panel) {
    if (!panel) return;
    const sidebar = panel.querySelector('.jnd-sidebar');
    const content = panel.querySelector('.jnd-content');
    if (!sidebar || !content) return;

    let tab = document.getElementById(TAB_ID);
    if (!tab || tab.parentElement !== sidebar) {
      if (tab) tab.remove();
      tab = document.createElement('button');
      tab.id = TAB_ID;
      tab.className = 'jnd-tab';
      tab.type = 'button';
      tab.dataset.pane = 'sgs-synthesize';
      tab.innerHTML = '<span class="jnd-tab-icon"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9.5" ry="5.5"></ellipse></svg></span><span>综合</span>';
      sidebar.appendChild(tab);
    }

    let pane = document.getElementById(PANE_ID);
    if (!pane || pane.parentElement !== content) {
      if (pane) pane.remove();
      pane = document.createElement('section');
      pane.id = PANE_ID;
      pane.className = 'jnd-pane';
      pane.dataset.pane = 'sgs-synthesize';
      pane.innerHTML = `
        <div class="jnd-pane-main jnd-settings-main">
          <div class="jnd-pane-head">
            <h3><span class="jnd-h-ic"><svg viewBox="1.1 1.1 21.8 21.8"><path d="M12 3.5c.9 4.6 2.9 6.6 7.5 7.5-4.6.9-6.6 2.9-7.5 7.5-.9-4.6-2.9-6.6-7.5-7.5 4.6-.9 6.6-2.9 7.5-7.5z"></path><path d="M18.5 16.5v4M16.5 18.5h4"></path></svg></span><span>综合插件</span></h3>
            <span class="sgs-syn-by">by ${AUTHOR} · v${VERSION}</span>
          </div>
          ${controlsHtml()}
          <div class="sgs-syn-hint" id="sgs-syn-panel-status" style="margin-top:10px"></div>
        </div>
      `;
      content.appendChild(pane);
    }

    panelUi.tab = tab;
    panelUi.pane = pane;
    bindControlsScope(pane);
    bindSoundScope(pane, 'panel', true);
    sound.statusEls = sound.statusEls.filter(el => el && el.isConnected);
    const panelStatus = pane.querySelector('#sgs-syn-panel-status');
    if (panelStatus && !sound.statusEls.includes(panelStatus)) sound.statusEls.push(panelStatus);
    updateSoundStatus();
    syncChannelStatus();
    positionIntegratedTab(panel);
    panel.classList.toggle('sgs-syn-credits-empty', pane.classList.contains('active'));

    if (panelUi.boundSidebar !== sidebar) {
      panelUi.boundSidebar = sidebar;
      sidebar.addEventListener('click', event => {
        const target = event.target && event.target.closest && event.target.closest('.jnd-tab');
        if (!target) return;
        if (target.dataset.pane === 'sgs-synthesize') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          activateSynTab(panel);
          if (!sound.loaded) ensureSoundIndex();
          return;
        }
        setTimeout(() => {
          const ourTab = document.getElementById(TAB_ID);
          if (ourTab) ourTab.classList.remove('active');
          panel.classList.remove('sgs-syn-credits-empty');
        }, 0);
      }, true);
    }
  }

  function removePanelNodes() {
    const tab = document.getElementById(TAB_ID);
    if (tab) tab.remove();
    const pane = document.getElementById(PANE_ID);
    if (pane) pane.remove();
    panelUi.tab = null;
    panelUi.pane = null;
  }

  function applyPanelMode() {
    if (settings.panelMode === 'standalone') {
      removePanelNodes();
      removeFallbackBall();
      ensureWhiteDot();
      ensureStandalonePanel();
      toggleStandalone(true);
    } else {
      toggleStandalone(false);
      removeWhiteDotAndPanel();
      panelTick();
    }
  }

  function panelTick() {
    if (settings.panelMode === 'standalone') {
      ensureWhiteDot();
      removePanelNodes();
      removeFallbackBall();
      return;
    }
    removeWhiteDotAndPanel();
    const panel = document.getElementById('jnd-panel');
    if (!panel) {
      ensureFallbackBall();
      return;
    }
    removeFallbackBall();
    ensurePanelNodes(panel);
  }

  function removeFallbackBall() {
    const ball = document.getElementById(BALL_ID);
    if (ball) ball.remove();
    const modal = document.getElementById(FLOAT_ID);
    if (modal) modal.remove();
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyStoredPosition(element, position, defaultLeft, defaultTop) {
    if (!element) return;
    const left = position && Number.isFinite(Number(position.left)) ? Number(position.left) : defaultLeft;
    const top = position && Number.isFinite(Number(position.top)) ? Number(position.top) : defaultTop;
    if (position) {
      element.style.left = `${clampNumber(left, 0, Math.max(0, window.innerWidth - element.offsetWidth))}px`;
      element.style.top = `${clampNumber(top, 0, Math.max(0, window.innerHeight - element.offsetHeight))}px`;
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }
  }

  function makeWindowDraggable(element, handle, positionKey, onClick, detectClick) {
    if (!element || !handle || handle.__sgsSynDragBound) return;
    handle.__sgsSynDragBound = true;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let pointerId = 0;
    const onMove = event => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        moved = true;
        element.classList.add('is-dragging');
      }
      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
      element.style.left = `${clampNumber(startLeft + dx, 0, maxLeft)}px`;
      element.style.top = `${clampNumber(startTop + dy, 0, maxTop)}px`;
      element.style.bottom = 'auto';
      element.style.right = 'auto';
      event.preventDefault();
    };
    const onUp = event => {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      element.classList.remove('is-dragging');
      safe(() => handle.releasePointerCapture(pointerId));
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (moved && positionKey) {
        settings[positionKey] = {
          left: Math.round(element.getBoundingClientRect().left),
          top: Math.round(element.getBoundingClientRect().top),
        };
        saveSettings();
      }
      if (detectClick && !moved && typeof onClick === 'function') onClick();
    };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      if (event.target && event.target.closest && event.target.closest('button[data-sgs-syn-standalone-close]')) return;
      dragging = true;
      moved = false;
      pointerId = event.pointerId;
      const rect = element.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.bottom = 'auto';
      element.style.right = 'auto';
      safe(() => handle.setPointerCapture(pointerId));
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
      event.preventDefault();
    });
  }

  function ensureWhiteDot() {
    if (!document.body) return;
    let dot = document.getElementById(WHITE_DOT_ID);
    if (!dot) {
      dot = document.createElement('button');
      dot.id = WHITE_DOT_ID;
      dot.type = 'button';
      dot.title = '展开 / 关闭综合面板（可拖动）';
      dot.setAttribute('aria-label', '展开 / 关闭综合面板');
      dot.addEventListener('click', event => {
        if (event.detail === 0) toggleStandalone();
      });
      document.body.appendChild(dot);
    }
    applyStoredPosition(dot, settings.dotPos, 18, window.innerHeight - 148);
    makeWindowDraggable(dot, dot, 'dotPos', () => toggleStandalone(), true);
    dot.style.display = 'block';
    dot.classList.toggle('is-open', uiState.standaloneOpen);
  }

  function removeWhiteDotAndPanel() {
    const dot = document.getElementById(WHITE_DOT_ID);
    if (dot) dot.remove();
    const panel = document.getElementById(STANDALONE_ID);
    if (panel) panel.remove();
    uiState.standaloneOpen = false;
  }

  function ensureStandalonePanel() {
    if (document.getElementById(STANDALONE_ID) || !document.body) return;
    const panel = document.createElement('div');
    panel.id = STANDALONE_ID;
    panel.innerHTML = `
      <div class="sgs-syn-standalone-head">
        <span class="sgs-syn-standalone-title">综合插件</span>
        <span class="sgs-syn-standalone-sub">by ${AUTHOR} · v${VERSION}</span>
        <button type="button" class="sgs-syn-standalone-close" data-sgs-syn-standalone-close="1" aria-label="关闭">×</button>
      </div>
      <div class="sgs-syn-standalone-body">
        ${controlsHtml()}
        <div class="sgs-syn-hint" id="sgs-syn-standalone-status" style="margin-top:10px"></div>
      </div>
    `;
    document.body.appendChild(panel);
    makeWindowDraggable(panel, panel.querySelector('.sgs-syn-standalone-head'), 'panelPos', null, false);
    bindControlsScope(panel);
    bindSoundScope(panel, 'standalone', false);
    const status = panel.querySelector('#sgs-syn-standalone-status');
    if (status) {
      sound.statusEls = sound.statusEls.filter(el => el && el.isConnected);
      if (!sound.statusEls.includes(status)) sound.statusEls.push(status);
      updateSoundStatus();
    }
    syncChannelStatus();
    panel.addEventListener('click', event => {
      const target = event.target && event.target.closest ? event.target : null;
      if (target && target.closest('[data-sgs-syn-standalone-close]')) toggleStandalone(false);
    });
  }

  function toggleStandalone(force) {
    ensureStandalonePanel();
    const panel = document.getElementById(STANDALONE_ID);
    if (!panel) return;
    const open = force == null ? !panel.classList.contains('is-open') : !!force;
    panel.classList.toggle('is-open', open);
    uiState.standaloneOpen = open;
    const dot = document.getElementById(WHITE_DOT_ID);
    if (dot) dot.classList.toggle('is-open', open);
    if (open) {
      applyStoredPosition(panel, settings.panelPos, 42, window.innerHeight - 148);
      if (!sound.loaded) ensureSoundIndex();
      const results = panel.querySelector('#sgs-syn-standalone-results');
      if (results) renderSoundResults(results, results.__sgsSynQuery || '', getResultLimit('panel'));
    }
  }

  function ensureFallbackBall() {
    if (!document.body || document.getElementById('jnd-panel')) return;
    if (Date.now() - panelUi.startAt < 6000) return;
    if (document.getElementById(BALL_ID)) return;
    const ball = document.createElement('button');
    ball.id = BALL_ID;
    ball.type = 'button';
    ball.title = `综合插件 by ${AUTHOR}`;
    ball.textContent = '综';
    ball.addEventListener('click', openFloatPanel);
    document.body.appendChild(ball);
    requestAnimationFrame(() => { ball.style.display = 'flex'; });
  }

  function ensureFloatModal() {
    if (document.getElementById(FLOAT_ID) || !document.body) return;
    const modal = document.createElement('div');
    modal.id = FLOAT_ID;
    modal.className = 'sgs-syn-modal';
    modal.innerHTML = `
      <div class="sgs-syn-modal-backdrop" data-sgs-syn-float-close="1"></div>
      <div class="sgs-syn-modal-card" role="dialog" aria-modal="true" aria-label="综合插件设置">
        <div class="sgs-syn-modal-head">
          <span class="sgs-syn-modal-title">综合插件</span>
          <span class="sgs-syn-modal-sub">by ${AUTHOR}</span>
          <button type="button" class="sgs-syn-modal-close" data-sgs-syn-float-close="1" aria-label="关闭">×</button>
        </div>
        <div class="sgs-syn-modal-body" style="overflow:auto">
          ${controlsHtml()}
          <div class="sgs-syn-hint" id="sgs-syn-float-status" style="margin-top:10px"></div>
        </div>
        <div class="sgs-syn-modal-foot">锦囊袋面板出现后会自动切换为侧栏「综合」页。</div>
      </div>
    `;
    document.body.appendChild(modal);
    bindControlsScope(modal);
    bindSoundScope(modal, 'float', false);
    const status = modal.querySelector('#sgs-syn-float-status');
    if (status) {
      sound.statusEls.push(status);
      updateSoundStatus();
    }
    syncChannelStatus();
    modal.addEventListener('click', event => {
      const target = event.target;
      if (target && target.getAttribute && target.getAttribute('data-sgs-syn-float-close')) modal.classList.remove('is-open');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) modal.classList.remove('is-open');
    }, true);
  }

  function openFloatPanel() {
    ensureFloatModal();
    const modal = document.getElementById(FLOAT_ID);
    if (modal) modal.classList.add('is-open');
    if (!sound.loaded) ensureSoundIndex();
  }

  function syncToggleUi() {
    for (const input of document.querySelectorAll('[data-sgs-syn]')) {
      const key = input.getAttribute('data-sgs-syn');
      if (key in DEFAULTS && input.checked !== !!settings[key]) input.checked = !!settings[key];
    }
    for (const button of document.querySelectorAll('[data-sgs-syn-mode]')) {
      button.classList.toggle('is-active', button.getAttribute('data-sgs-syn-mode') === settings.panelMode);
    }
    for (const button of document.querySelectorAll('[data-sgs-syn-hotkey]')) {
      button.textContent = uiState.capturingHotkey ? '按下快捷键…' : (settings.hotkey || '未设置');
      button.classList.toggle('is-capturing', uiState.capturingHotkey);
    }
    syncShotUi();
  }

  function isModifierKey(key) {
    return /^(Control|Shift|Alt|Meta|AltGraph)$/.test(String(key));
  }

  function normalizeHotkeyKey(key) {
    let value = String(key || '');
    if (value === ' ') return 'Space';
    if (value.length === 1) return value.toUpperCase();
    if (/^F\d{1,2}$/i.test(value)) return value.toUpperCase();
    return value;
  }

  function hotkeyComboFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    const key = normalizeHotkeyKey(event.key);
    if (!key || isModifierKey(key) || key === '+' || key === '=') return '';
    const isFunctionKey = /^F\d{1,2}$/.test(key);
    if (!parts.length && !isFunctionKey) return '';
    return parts.concat([key]).join('+');
  }

  function comboMatchesEvent(combo, event) {
    if (!combo) return false;
    const parts = String(combo).split('+');
    const key = parts[parts.length - 1];
    return !!event.ctrlKey === parts.includes('Ctrl')
      && !!event.altKey === parts.includes('Alt')
      && !!event.shiftKey === parts.includes('Shift')
      && !!event.metaKey === parts.includes('Meta')
      && normalizeHotkeyKey(event.key) === key;
  }

  function hotkeyMatchesEvent(event) {
    return comboMatchesEvent(settings.hotkey, event);
  }

  function isTypingTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], .sgs-syn-input, .sgs-syn-limit-input');
  }

  function startShotKeyCapture() {
    uiState.captureKeys.clear();
    uiState.capturingShotKey = true;
    syncToggleUi();
    toast('请按下一个按键（可单键），Esc 取消，Backspace 清除');
  }

  function shotKeyComboFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    const key = normalizeHotkeyKey(event.key);
    if (!key || isModifierKey(key)) return '';
    if (/^(Escape|Tab|Backspace|Delete|Dead|Unidentified|Process|CapsLock|NumLock|ScrollLock)$/.test(key)) return '';
    return parts.concat([key]).join('+');
  }

  function blockKeyEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handleShotKeyup(event) {
    const released = normalizeHotkeyKey(event.key);
    if (uiState.captureKeys.has(released)) {
      if (event.type === 'keyup') uiState.captureKeys.delete(released);
      blockKeyEvent(event);
      return;
    }
    if (uiState.capturingHotkey || uiState.capturingShotKey) {
      blockKeyEvent(event);
      return;
    }
    if (!settings.shotKey || isTypingTarget(event.target)) return;
    if (!comboMatchesEvent(settings.shotKey, event)) return;
    blockKeyEvent(event);
  }

  function startHotkeyCapture() {
    uiState.captureKeys.clear();
    uiState.capturingHotkey = true;
    syncToggleUi();
    toast('请按下快捷键组合，Esc 取消，Backspace 清除');
  }

  function togglePanelByHotkey() {
    if (settings.panelMode === 'standalone') {
      toggleStandalone();
      return;
    }
    const panel = document.getElementById('jnd-panel');
    if (!panel) return;
    const open = panel.classList.contains('open') || panel.getAttribute('data-entry-state') === 'expanded';
    if (open) {
      const collapse = panel.querySelector('.jnd-panel-collapse');
      if (collapse) collapse.click();
      return;
    }
    const pips = document.getElementById('sgs-syn-pips');
    if (pips) {
      pips.click();
      return;
    }
    const face = panel.querySelector('.jnd-face-front');
    if (face) face.click();
    else panel.click();
  }

  function handleHotkeyKeydown(event) {
    if (uiState.capturingHotkey || uiState.capturingShotKey) {
      uiState.captureKeys.add(normalizeHotkeyKey(event.key));
    }
    if (uiState.capturingHotkey) {
      blockKeyEvent(event);
      if (event.key === 'Escape') {
        uiState.capturingHotkey = false;
        syncToggleUi();
        toast('已取消设置快捷键');
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        settings.hotkey = '';
        saveSettings();
        uiState.capturingHotkey = false;
        syncToggleUi();
        toast('面板快捷键已清除');
        return;
      }
      if (isModifierKey(event.key)) return;
      const combo = hotkeyComboFromEvent(event);
      if (!combo) {
        toast('请使用 Ctrl/Alt/Shift + 字母，或 F1-F12');
        return;
      }
      settings.hotkey = combo;
      saveSettings();
      uiState.capturingHotkey = false;
      syncToggleUi();
      toast(`面板快捷键已设为 ${combo}`);
      return;
    }
    if (uiState.capturingShotKey) {
      blockKeyEvent(event);
      if (event.key === 'Escape') {
        uiState.capturingShotKey = false;
        syncToggleUi();
        toast('已取消设置截图快捷键');
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        settings.shotKey = '';
        saveSettings();
        uiState.capturingShotKey = false;
        syncToggleUi();
        toast('截图快捷键已清除');
        return;
      }
      if (isModifierKey(event.key)) return;
      const combo = shotKeyComboFromEvent(event);
      if (!combo) {
        toast('这个按键不能用作截图快捷键');
        return;
      }
      settings.shotKey = combo;
      saveSettings();
      uiState.capturingShotKey = false;
      syncToggleUi();
      toast(`截图快捷键已设为 ${combo}`);
      return;
    }
    if (settings.hotkey && !event.repeat && hotkeyMatchesEvent(event)) {
      blockKeyEvent(event);
      togglePanelByHotkey();
      return;
    }
    if (!settings.shotKey || isTypingTarget(event.target)) return;
    if (!comboMatchesEvent(settings.shotKey, event)) return;
    if (event.repeat) {
      blockKeyEvent(event);
      if (Date.now() - shotRepeatAt < 120) return;
      shotRepeatAt = Date.now();
      takeScreenshot();
      return;
    }
    blockKeyEvent(event);
    takeScreenshot();
  }

  function applySetting(key) {
    if (key === 'showcaseSearch') {
      if (!settings.showcaseSearch) restoreShowcase();
      else showcaseRefresh();
    } else if (key === 'redDotCleaner') {
      redDotSweep();
    } else if (key === 'jinnangDot') {
      dotTick();
    } else if (key === 'blockOtherVoice') {
      applyVoicePolicy(true);
    }
  }
  function boot() {
    installGlobalCss();
  }

  window.__SGS_SYN_DIAG__ = () => {
    installLayaProbe();
    const sender = resolvePhraseSender(true);
    return {
      version: VERSION,
      inGame: inGame(),
      channel: runtime.sendChannel,
      method: runtime.channelMethod,
      sender: sender ? { object: classOf(sender.obj), method: sender.name, score: sender.score } : null,
      chatManager: runtime.chatManager ? classOf(runtime.chatManager) : null,
      layaObjects: layaProbe.seen.length,
      shotSoundPreset: shotPreset(),
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  (() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installLayaProbe() || tries > 320) clearInterval(timer);
    }, 120);
  })();

  installGlobalCss();
  loadShotAssets();
  setInterval(() => {
    installGlobalCss();
    if (!document.body) return;
    showcaseTick();
  }, 250);
  setInterval(panelTick, 500);
  setInterval(dotTick, 300);
  setInterval(redDotTick, 400);
  setInterval(runtimeTick, 900);
  setInterval(() => {
    if (settings.blockOtherVoice && inGame()) applyVoicePolicy(false);
  }, 5000);
  setTimeout(() => ensureFallbackBall(), 6500);
})();
