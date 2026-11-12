// 三国杀手机助手 v2.9.6 Beta —— 控制面板（七页）
// 载入并适配原版「三国杀打小抄一将成名」脚本，不修改其核心逻辑。
(() => {
  'use strict';

  const VERSION = '2.9.6 Beta';
  if (window.__JND_MOBILE__ === VERSION) return;
  window.__JND_MOBILE__ = VERSION;

  const bridge = window.SgsMobileBridge || null;
  const log = (...a) => { try { console.log('[JND]', ...a); } catch (_) {} };

  /* ---------------- 状态 ---------------- */
  const DEF = {
    dxcOpen: true,       // 小抄面板是否展开
    dxcRatio: 0.44,      // 小抄占屏宽比例（0 = 原始尺寸不缩放）
    dxcSide: 'free',     // 自由（跟原版自己拖的位置）/ 贴左 / 贴右
    dxcEdge: 'top',      // 贴顶还是贴底（手机竖屏时贴底避开状态栏）
    bigTouch: true,      // 固定开启：收起后的标题栏按触屏高度加厚（已去掉开关）
    chip: false,         // 顶部常驻条已移除，字段留作兼容旧配置
    daiOpen: true,       // 锦囊袋入口是否显示（关 = 藏起圆点与面板，功能照跑）
    viewW: 0,            // 屏幕宽度（px）：0 = 跟随设备
    zoom: 100,           // 浏览器缩放（%）
    redDot: false,       // （已迁移到综合插件，留键兼容旧配置）
    blockChat: false,
    blockVoice: false,
    blockFx: false,
    dxcX: -1,          // 收起后小砖的左上角（CSS px），-1 = 还没拖过
    dxcY: -1,
    ballX: -1, ballY: -1
  };
  let S = Object.assign({}, DEF);
  try {
    const raw = localStorage.getItem('jnd_mobile_cfg');
    if (raw) S = Object.assign(S, JSON.parse(raw));
  } catch (_) {}
  /* 锦囊袋改成「默认展开」：老配置里的 daiOpen 是旧版从面板收起态同步下来的，
     升级后要按新默认值重置一次，之后仍以用户自己开的开关为准。 */
  try {
    if (localStorage.getItem('jnd_cfg_v') !== '296') {
      S.daiOpen = true;
      localStorage.setItem('jnd_cfg_v', '296');
      localStorage.setItem('jnd_mobile_cfg', JSON.stringify(S));
    }
  } catch (_) {}
  const saveS = () => { try { localStorage.setItem('jnd_mobile_cfg', JSON.stringify(S)); } catch (_) {} };

  const vv = () => window.visualViewport || null;
  const VW = () => (vv() ? vv().width : window.innerWidth);
  const VH = () => (vv() ? vv().height : window.innerHeight);

  /* ---------------- 图标 ---------------- */
  const IC = {
    pouch: '<svg viewBox="0 0 24 24" fill="none"><path d="M7.6 4.2h8.8l-1 3.1c2.2 1.5 3.6 3.9 3.6 6.5 0 4.2-3.1 7-7 7s-7-2.8-7-7c0-2.6 1.4-5 3.6-6.5l-1-3.1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 4.2h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 12.4v4M10 14.4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    show: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18"/></svg>',
    game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="7" width="17.6" height="10" rx="4.4"/><path d="M7.6 12h2.2M8.7 10.9v2.2"/><circle cx="15.6" cy="11.4" r=".9" fill="currentColor" stroke="none"/><circle cx="17.6" cy="13.2" r=".9" fill="currentColor" stroke="none"/></svg>',
    trick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4l2.1 4.6 5 .6-3.7 3.5 1 5-4.4-2.5-4.4 2.5 1-5L4.9 8.6l5-.6L12 3.4Z"/></svg>',
    plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v5M16 3v5"/><path d="M6.5 8h11v3.2a5.5 5.5 0 0 1-11 0V8Z"/><path d="M12 16.7V21"/></svg>',
    misc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>',
    ver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h9.5L19 9v10.5H5z"/><path d="M9 9h4M9 13h6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 11.2 12 4l8.4 7.2"/><path d="M6 10v9.5h12V10"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 8.5h3l1.4-2h8.2l1.4 2h3v10.5h-17z"/><circle cx="12" cy="13.4" r="3.1"/></svg>',
    dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8.4v4.2l2.6 1.8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10H9l-5 4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16.5 9.5l4 5M20.5 9.5l-4 5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M19.8 4.6v4.2h-4.2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5.2h7v14H4z"/><path d="M13 5.2h7v14h-7z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="6.5" y="3.5" width="11" height="17" rx="2"/><path d="M10 8h4"/></svg>',
    arrowR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    ctl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h8M16 7h4M4 17h4M12 17h8"/><circle cx="14" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 0 1 0 10H8"/><path d="M7.5 6.5L4 10l3.5 3.5"/></svg>',
    kb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="2.8" y="6.4" width="18.4" height="11.2" rx="2"/><path d="M6.2 10h.01M9.2 10h.01M12.2 10h.01M15.2 10h.01M18.2 10h.01M8 13.6h8" stroke-linecap="round"/></svg>'
  };

  /* 牌局、妙计两页已下线：锦囊袋自带「牌局记录」与「妙计合集（武将技能提示 / 推荐用牌）」，
     两边同名的页签放在一起只会让人以为有两套设置。这里只保留手机端独有的能力。 */
  const TAB = [
    { k: 'show', n: '显示', ic: IC.show },
    { k: 'ctl', n: '控制', ic: IC.ctl },
    { k: 'plug', n: '插件', ic: IC.plug },
    { k: 'misc', n: '综合', ic: IC.misc },
    { k: 'ver', n: '版本', ic: IC.ver }
  ];

  /* ---------------- 样式 ---------------- */
  const CSS = `
@font-face{font-family:"DYZ";src:url("https://jinnang.local/__jnd/font") format("woff2");
  font-display:swap;font-weight:400}
:where(#jnd-root),:where(#jnd-root) *{box-sizing:border-box}
:where(#jnd-root) *{margin:0;padding:0;border:0;background:none;
  font-family:"DYZ",-apple-system,"PingFang SC","Noto Sans SC",sans-serif;
  -webkit-tap-highlight-color:transparent;line-height:1.45}

#jnd-root{position:fixed;left:0;top:0;z-index:2147480000;pointer-events:none;
  font-size:13px;color:#f3e6ca;display:none}
#jnd-root.on{display:block}
#jnd-mask{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 100%,rgba(0,0,0,.5),rgba(0,0,0,.72));
  opacity:0;transition:opacity .24s;pointer-events:none}
#jnd-root.open #jnd-mask{opacity:1;pointer-events:auto}

/* ===== 面板：仿游戏官方的金框窗口，居中弹出（原来是铺满底部的抽屉） ===== */
#jnd-sheet{position:absolute;left:50%;top:50%;width:min(94vw,900px);height:min(90vh,680px);
  transform:translate(-50%,-50%) scale(.94);opacity:0;pointer-events:none;overflow:hidden;
  transition:opacity .16s ease,transform .22s cubic-bezier(.22,.85,.3,1);
  display:flex;flex-direction:column;border-radius:8px;
  background:
    radial-gradient(130% 90% at 50% -10%,rgba(104,74,40,.55),transparent 62%),
    linear-gradient(172deg,#2a1f15 0%,#1b1410 44%,#120d09 100%);
  box-shadow:
    0 0 0 1px rgba(226,196,138,.62),
    0 0 0 3px rgba(48,33,20,.96) inset,
    0 0 0 4px rgba(226,196,138,.14) inset,
    0 22px 64px rgba(0,0,0,.82)}
#jnd-root.open #jnd-sheet{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}

/* 标题栏 */
#jnd-head{flex:0 0 auto;height:58px;display:flex;align-items:center;gap:11px;padding:0 12px 0 16px;
  background:linear-gradient(180deg,rgba(112,80,44,.42),rgba(34,24,16,.14));
  border-bottom:1px solid rgba(226,196,138,.26);position:relative}
#jnd-head::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(226,196,138,.5),transparent)}
#jnd-head .lg{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 34% 28%,#c8a45f,#6d4a1e 62%,#3a2610);
  color:#2a1c0a;flex:0 0 auto;
  box-shadow:0 0 0 1px rgba(255,232,180,.62),0 0 8px rgba(210,160,70,.34)}
#jnd-head .lg svg{width:19px;height:19px;stroke-width:1.7}
#jnd-head .tt{font-size:17px;font-weight:600;letter-spacing:2px;color:#f4e2b8;
  text-shadow:0 1px 0 rgba(0,0,0,.6);line-height:1.25;white-space:nowrap}
#jnd-head .tt .kk{font-size:10.5px;font-weight:400;letter-spacing:0;margin-left:5px;
  color:#c2a06a;text-shadow:none;vertical-align:1px}
#jnd-head .vv{font-size:10.5px;color:#93805f;letter-spacing:.8px;margin-top:3px}
#jnd-head .sp{flex:1}
#jnd-head .x{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#cbb487;flex:0 0 auto;box-shadow:0 0 0 1px rgba(226,196,138,.24) inset;transition:.15s}
#jnd-head .x:active{background:rgba(226,196,138,.16);color:#f6e3ba}
#jnd-head .x svg{width:19px;height:19px}

/* 主体：页签横排在上，内容在下（原来是左栏竖排） */
#jnd-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
#jnd-nav{flex:0 0 auto;display:flex;padding:0 6px;gap:0;
  background:linear-gradient(180deg,rgba(0,0,0,.26),transparent);
  border-bottom:1px solid rgba(226,196,138,.14)}
.jnd-tab{flex:1 1 0;min-width:0;height:66px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:5px;color:#8e7f65;transition:.16s;position:relative}
.jnd-tab svg{width:21px;height:21px}
.jnd-tab span{font-size:11.5px;letter-spacing:.6px;white-space:nowrap}
.jnd-tab.on{color:#f6dfa4;background:linear-gradient(180deg,rgba(226,196,138,.13),transparent 80%)}
.jnd-tab.on::before{content:"";position:absolute;left:8px;right:8px;bottom:0;height:3px;
  background:linear-gradient(90deg,transparent,#efd08a,transparent);box-shadow:0 0 6px rgba(240,200,130,.7)}
.jnd-tab.on::after{content:"";position:absolute;inset:auto 0 0;height:0}
.jnd-tab:active{color:#e8d3a3;background:rgba(226,196,138,.06)}

#jnd-main{flex:1 1 auto;min-width:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 16px 24px}
#jnd-main::-webkit-scrollbar{width:3px}
#jnd-main::-webkit-scrollbar-thumb{background:rgba(226,196,138,.22);border-radius:3px}

.jnd-h{display:flex;align-items:center;gap:8px;margin:2px 0 12px}
.jnd-h b{font-size:15px;color:#f0ddaa;letter-spacing:1.4px;font-weight:600}
.jnd-h s{flex:1;height:1px;background:linear-gradient(90deg,rgba(226,196,138,.28),transparent);text-decoration:none}

/* 行 */
.jnd-row{display:flex;align-items:center;gap:11px;padding:13px 12px;border-radius:12px;margin-bottom:9px;
  background:linear-gradient(140deg,rgba(255,246,225,.055),rgba(255,246,225,.02));
  box-shadow:0 0 0 1px rgba(226,196,138,.13) inset}
.jnd-row:active{background:linear-gradient(140deg,rgba(255,246,225,.09),rgba(255,246,225,.03))}
.jnd-row .ic{width:36px;height:36px;border-radius:10px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  background:rgba(226,196,138,.11);color:#e0c489}
.jnd-row .ic svg{width:18px;height:18px}
.jnd-row .tx{flex:1 1 auto;min-width:0}
.jnd-row .tx b{display:block;font-size:14.5px;color:#f0e5cd;font-weight:500;letter-spacing:.3px;line-height:1.35}
.jnd-row .tx i{display:block;font-style:normal;font-size:12px;color:#948a75;margin-top:3px;letter-spacing:.2px;line-height:1.4}
.jnd-row .rt{flex:0 0 auto}

/* 开关 */
.jnd-sw{width:52px;height:30px;border-radius:16px;position:relative;flex:0 0 auto;
  background:rgba(255,246,225,.1);box-shadow:0 0 0 1px rgba(226,196,138,.22) inset;transition:.2s}
.jnd-sw::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;
  background:#cfc3a8;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.jnd-sw.on{background:linear-gradient(160deg,#9c2a20,#6d1913);box-shadow:0 0 0 1px rgba(240,190,140,.32) inset}
.jnd-sw.on::after{left:25px;background:#f8e8bf}

/* 胶囊按钮组 */
.jnd-seg{display:flex;gap:4px;background:rgba(0,0,0,.26);padding:4px;border-radius:11px;flex:0 0 auto;
  box-shadow:0 0 0 1px rgba(226,196,138,.14) inset}
.jnd-seg b{min-width:46px;height:34px;padding:0 10px;white-space:nowrap;border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:12.5px;color:#a39880;font-weight:400;letter-spacing:.4px;transition:.15s}
.jnd-seg b.on{background:linear-gradient(180deg,rgba(226,196,138,.9),rgba(176,140,72,.9));color:#241a0a;font-weight:600}

/* 控制页：加减步进 */
.jnd-step{display:flex;align-items:center;gap:12px;flex:0 0 auto}
.jnd-step u{width:48px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;
  text-decoration:none;font-size:24px;line-height:1;color:#f0dfba;
  background:linear-gradient(180deg,rgba(226,196,138,.2),rgba(226,196,138,.07));
  box-shadow:0 0 0 1px rgba(226,196,138,.34) inset}
.jnd-step u:active{transform:translateY(1px);background:rgba(226,196,138,.3)}
.jnd-step em{min-width:62px;text-align:center;font-style:normal;font-size:15px;color:#f5cd8e;font-weight:600;letter-spacing:.5px}
.jnd-step em i{display:block;font-style:normal;font-size:10px;color:#8d8370;font-weight:400;margin-top:2px}

/* 控制页：大按钮网格 */
.jnd-acts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0 12px}
.jnd-acts>div{height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:7px;
  font-size:14px;color:#ecdcbc;letter-spacing:.6px;
  background:linear-gradient(170deg,rgba(226,196,138,.14),rgba(226,196,138,.045));
  box-shadow:0 0 0 1px rgba(226,196,138,.24) inset}
.jnd-acts>div:active{background:rgba(226,196,138,.22)}
.jnd-acts>div svg{width:17px;height:17px;opacity:.85}
.jnd-acts>div.pri{color:#241a08;font-weight:600;
  background:linear-gradient(170deg,#e8cf92,#b08e46);box-shadow:0 0 0 1px rgba(255,238,196,.6) inset,0 4px 14px rgba(0,0,0,.4)}

/* 控制页：整块卡片（标题在上，控件在下，窄屏也不挤） */
.jnd-block{padding:13px 12px;border-radius:12px;margin-bottom:9px;
  background:linear-gradient(140deg,rgba(255,246,225,.055),rgba(255,246,225,.02));
  box-shadow:0 0 0 1px rgba(226,196,138,.13) inset}
.jnd-block .t{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.jnd-block .t .ic{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  background:rgba(226,196,138,.11);color:#e0c489;flex:0 0 auto}
.jnd-block .t .ic svg{width:18px;height:18px}
.jnd-block .t b{display:block;font-size:14.5px;color:#f0e5cd;font-weight:500;letter-spacing:.3px}
.jnd-block .t i{display:block;font-style:normal;font-size:11.5px;color:#948a75;margin-top:3px;line-height:1.4}
.jnd-block .c{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.jnd-block .c.center{justify-content:center}
.jnd-block .c.col{flex-direction:column;align-items:stretch;gap:9px}
.jnd-line{display:flex;align-items:center;gap:11px}
.jnd-line>b{flex:0 0 34px;font-size:12px;color:#8f8571;letter-spacing:.5px;font-weight:400}
.jnd-block .c .jnd-seg{flex:1 1 auto}
.jnd-block .c .jnd-seg b{flex:1 1 0;min-width:0}
.jnd-block .c .jnd-cur{flex:0 0 auto;min-width:78px;text-align:center;font-style:normal;
  font-size:17px;font-weight:600;color:#f5cd8e;letter-spacing:.6px}

/* 出杀计数预览卡 */
.jnd-prev{display:flex;gap:12px;padding:11px;border-radius:12px;margin-bottom:10px;
  background:linear-gradient(140deg,rgba(226,196,138,.09),rgba(255,246,225,.02));
  box-shadow:0 0 0 1px rgba(226,196,138,.16) inset}
.jnd-prev .card{width:70px;height:92px;border-radius:8px;flex:0 0 auto;position:relative;overflow:hidden;
  background:linear-gradient(160deg,#3a2f22,#221a12);box-shadow:0 0 0 1px rgba(226,196,138,.3) inset,0 4px 12px rgba(0,0,0,.4);
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.jnd-prev .card .lb{position:absolute;left:0;right:0;bottom:5px;text-align:center;
  font-size:8px;color:#9a8d74;letter-spacing:.3px;line-height:1}
.jnd-prev .card .cn{position:absolute;top:5px;left:5px;width:15px;height:15px;border-radius:4px;
  background:linear-gradient(160deg,#8d1f18,#5a100d);color:#f6e4b8;font-size:9px;display:flex;
  align-items:center;justify-content:center;font-family:"Songti SC",serif}
.jnd-prev .card em{position:static;margin-top:2px;font-size:26px;line-height:1}


.jnd-prev .info{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:8px}
.jnd-prev .info .l{font-size:12.5px;color:#e8dcbe;letter-spacing:.4px}
.jnd-prev .info .l u{text-decoration:none;color:#f0c98c;font-weight:600}

.jnd-note{font-size:12px;color:#8b8272;line-height:1.8;padding:10px 12px;border-radius:10px;
  background:rgba(0,0,0,.2);box-shadow:0 0 0 1px rgba(226,196,138,.09) inset;margin-top:6px}
.jnd-note em{font-style:normal;color:#c8a86e}

/* 牌局：座次手牌 */
.jnd-seats{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.jnd-seat{flex:1 1 0;min-width:64px;padding:8px 6px;border-radius:10px;text-align:center;
  background:linear-gradient(150deg,rgba(226,196,138,.09),rgba(255,246,225,.02));
  box-shadow:0 0 0 1px rgba(226,196,138,.14) inset}
.jnd-seat b{display:block;font-size:9.5px;color:#97896f;letter-spacing:.6px}
.jnd-seat em{display:block;font-style:normal;font-size:17px;font-weight:600;color:#f2e0b2;margin-top:3px;
}
.jnd-seat.me{box-shadow:0 0 0 1px rgba(226,196,138,.44) inset}

.jnd-log{display:flex;flex-direction:column;gap:6px}
.jnd-ev{display:flex;gap:8px;font-size:11.5px;color:#c5bba4;padding:6px 9px;border-radius:8px;
  background:rgba(0,0,0,.18);box-shadow:0 0 0 1px rgba(226,196,138,.07) inset;align-items:flex-start}
.jnd-ev time{flex:0 0 auto;font-size:10px;color:#7d7460;letter-spacing:.3px;margin-top:1px}
.jnd-ev span{flex:1 1 auto;min-width:0;word-break:break-all}
.jnd-ev.hi span{color:#f0c98c}

.jnd-empty{text-align:center;color:#7b7261;font-size:13px;padding:30px 0;letter-spacing:.6px;line-height:1.8}
.jnd-kao{font-style:normal;color:#8a7f68;letter-spacing:1px;font-size:12px}
/* 强抬键盘用的隐形输入框：给 WebView 一个真实可编辑焦点，且落在可视区里，
   这样输入法算出来的弹起位置不会跑到屏幕外。视觉上完全透明、不挡点击。 */
#jnd-ime-host{position:fixed;left:50%;top:58%;width:60%;height:1px;padding:0;border:0;
  transform:translateX(-50%);opacity:.01;background:transparent;color:transparent;
  outline:none;pointer-events:none;z-index:0}

.jnd-btn{height:42px;min-width:58px;padding:0 15px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;
  gap:6px;font-size:13.5px;color:#f0e2c2;letter-spacing:.6px;
  background:linear-gradient(170deg,rgba(226,196,138,.2),rgba(226,196,138,.08));
  box-shadow:0 0 0 1px rgba(226,196,138,.32) inset}
.jnd-btn:active{transform:translateY(1px);background:rgba(226,196,138,.26)}
.jnd-btn svg{width:15px;height:15px}

/* 扫码浮层 */
#jnd-qr{position:absolute;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;
  pointer-events:auto;z-index:3}
#jnd-qr .box{width:min(330px,86%);padding:18px;border-radius:16px;text-align:center;
  background:linear-gradient(172deg,#221a13,#120d09);
  box-shadow:0 0 0 1px rgba(226,196,138,.26) inset,0 20px 60px rgba(0,0,0,.76)}
#jnd-qr .ttl{font-size:13.5px;color:#f0ddaa;letter-spacing:1.4px;margin-bottom:12px;
}
#jnd-qr .qr{width:186px;height:186px;margin:0 auto 10px;border-radius:10px;background:#fff;
  display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
#jnd-qr .qr img{width:100%;height:100%;object-fit:contain;display:none}
#jnd-qr .wait{font-size:11.5px;color:#6c6252}
#jnd-qr .sub{font-size:11.5px;color:#a99a80;min-height:17px;margin-bottom:6px}
#jnd-qr .st{font-size:11.5px;color:#b7a58d;min-height:16px;margin-bottom:12px}
#jnd-qr .ops{display:flex;gap:8px}
#jnd-qr .ops>div{flex:1;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;
  font-size:13.5px;color:#d9c3a1;background:rgba(255,244,225,.07);
  box-shadow:0 0 0 1px rgba(226,196,138,.22) inset}
#jnd-qr .ops>div:active{background:rgba(255,244,225,.14)}
#jnd-qr .ops>div.rt{color:#f0d79a;box-shadow:0 0 0 1px rgba(226,196,138,.44) inset;display:none}

/* 顶部常驻条 */
/* 数字步进：− [输入] + */
.jnd-numwrap{display:flex;align-items:center;gap:10px;justify-content:center;width:100%}
.jnd-numwrap u{width:46px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:22px;color:#f0ddaa;text-decoration:none;
  background:rgba(226,196,138,.1);box-shadow:0 0 0 1px rgba(226,196,138,.26) inset}
.jnd-numwrap u:active{background:rgba(226,196,138,.22)}
.jnd-num{width:96px;height:40px;border-radius:10px;text-align:center;font-size:16px;color:#f7d9a2;
  background:rgba(0,0,0,.32);box-shadow:0 0 0 1px rgba(226,196,138,.24) inset;outline:none;
  font-family:inherit;letter-spacing:.5px;-webkit-appearance:none;appearance:none}
.jnd-num::placeholder{color:#7e7767;font-size:12px}
.jnd-num::-webkit-outer-spin-button,.jnd-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.jnd-numtip{font-size:11px;color:#8f8571;text-align:center;margin-top:8px;letter-spacing:.3px}
.jnd-src{margin:6px 0 4px;padding:12px;border-radius:12px;background:rgba(22,16,11,.72);
  box-shadow:0 0 0 1px rgba(226,196,138,.18) inset}
.jnd-src p{font-size:11.5px;color:#918872;line-height:1.75;margin:0 0 8px;letter-spacing:.2px}
.jnd-src p:last-child{margin:8px 0 0;color:#7d7565;font-size:11px}
.jnd-url{width:100%;height:44px;border-radius:10px;padding:0 12px;font-size:12.5px;color:#f7d9a2;
  background:rgba(0,0,0,.45);box-shadow:0 0 0 1px rgba(226,196,138,.24) inset;outline:none;
  text-overflow:ellipsis}
.jnd-url::placeholder{color:#736c5c}
.jnd-srcops{display:flex;gap:10px;margin-top:10px}
.jnd-srcops b{flex:1;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:500;letter-spacing:.5px;color:#e6d3ac;background:rgba(226,196,138,.13);
  box-shadow:0 0 0 1px rgba(226,196,138,.28) inset}
.jnd-srcops b.pri{color:#241a08;font-weight:600;background:linear-gradient(165deg,#e8d29a,#b08f4c);
  box-shadow:0 3px 12px rgba(0,0,0,.4)}
.jnd-srcops b:active{opacity:.78}
.jnd-srcops b.off{opacity:.4}

/* 扫码页右下角：存图 / 投到电脑 */
#jnd-qr .vcamrow{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}
#jnd-qr .vcam{font-size:10.5px;color:#9fc4d8;letter-spacing:.4px;padding:5px 9px;border-radius:9px;
  box-shadow:0 0 0 1px rgba(159,196,216,.3) inset;background:rgba(159,196,216,.07)}
#jnd-qr .vcam:active{background:rgba(159,196,216,.16)}
#jnd-qr .vcam.off{color:#8b8478;box-shadow:0 0 0 1px rgba(200,190,170,.2) inset;background:rgba(200,190,170,.06)}
#jnd-qr .vcam.on{color:#a8d5a0;box-shadow:0 0 0 1px rgba(150,200,140,.42) inset;background:rgba(150,200,140,.1)}

/* 投到另一块屏幕：局域网地址 */
#jnd-qr .lanbox{display:none;margin-top:9px;padding:10px 11px;border-radius:11px;
  background:rgba(159,196,216,.07);box-shadow:0 0 0 1px rgba(159,196,216,.24) inset}
#jnd-qr .lanbox.on{display:block}
#jnd-qr .lanurl{font-size:13px;color:#c6e4f2;letter-spacing:.8px;word-break:break-all;
  line-height:1.5;font-weight:600}
#jnd-qr .lanhint{font-size:10.5px;color:#8b9a8d;line-height:1.65;margin-top:5px}
#jnd-qr .lanstop{display:inline-block;margin-top:7px;font-size:10.5px;color:#dda492;
  text-decoration:underline}

/* 画中画：整个窗口缩成一块码。底色必须不透明，缩窗后不留游戏画面 */
#jnd-pip{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;
  background:#0b0906;display:none;align-items:center;justify-content:center;flex-direction:column;
  pointer-events:auto}
#jnd-pip.on{display:flex}
#jnd-pip img{object-fit:contain;background:#fff;border-radius:12px;padding:8px;box-sizing:border-box}
#jnd-pip .t{margin-top:10px;font-size:11px;color:#9a8f79;letter-spacing:1px}

#jnd-chip{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147479000;
  display:none;align-items:center;gap:7px;padding:5px 13px;border-radius:20px;
  background:rgba(18,13,9,.82);box-shadow:0 0 0 1px rgba(226,196,138,.3) inset;
  font-size:12px;color:#e8d9b6;letter-spacing:.4px;pointer-events:none;white-space:nowrap}
#jnd-chip.on{display:flex}
#jnd-chip b{color:#f3c98d;font-weight:600}

/* ===== 通用确认框：版本更新用，盖在面板之上 ===== */
#jnd-dlg{position:absolute;inset:0;z-index:50;display:none;align-items:center;justify-content:center;
  background:rgba(6,4,2,.62)}
#jnd-dlg.on{display:flex}
#jnd-dlg .box{width:min(84vw,420px);max-height:82%;overflow:auto;padding:20px 20px 14px;border-radius:10px;
  background:linear-gradient(172deg,#2c2117,#17110c 62%,#100b07);
  box-shadow:0 0 0 1px rgba(226,196,138,.6),0 0 0 3px rgba(48,33,20,.9) inset,
    0 18px 48px rgba(0,0,0,.8)}
#jnd-dlg .ttl{font-size:15px;color:#f4e2b8;letter-spacing:1.2px;margin-bottom:4px}
#jnd-dlg .sub{font-size:11.5px;color:#9c8f76;line-height:1.7;margin-bottom:12px}
#jnd-dlg .item{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#e2d3b2;
  padding:9px 11px;border-radius:8px;background:rgba(226,196,138,.06);
  box-shadow:0 0 0 1px rgba(226,196,138,.16) inset;margin-bottom:7px}
#jnd-dlg .item b{color:#f3c98d;font-weight:600}
#jnd-dlg .item .arw{color:#8d7f68;font-size:11px}
#jnd-dlg .act{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}
#jnd-dlg .btn{font-size:12.5px;padding:8px 18px;border-radius:8px;letter-spacing:.6px;
  box-shadow:0 0 0 1px rgba(226,196,138,.34) inset;color:#d9c8a4;background:rgba(226,196,138,.07)}
#jnd-dlg .btn.main{color:#2a1c0a;background:linear-gradient(180deg,#e8c88a,#c39c56);
  box-shadow:0 0 0 1px rgba(255,236,190,.6) inset,0 3px 10px rgba(0,0,0,.4);font-weight:600}
#jnd-dlg .btn:active{transform:translateY(1px)}
`;

  /* ---------------- DOM ---------------- */
  let root = null, sheet = null, mask = null, nav = null, main = null, chip = null;
  let built = false, curTab = 'show', drawerOpen = false;

  const el = (t, cls, html) => {
    const d = document.createElement(t);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  };

  function installCss() {
    if (document.getElementById('jnd-css')) return;
    const s = document.createElement('style');
    s.id = 'jnd-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------- 构建 ---------------- */
  function build() {
    if (built && root && root.isConnected) return;
    built = true;
    installCss();

    // 页面重绘 / 重复注入时清掉残留层，避免多层遮罩叠在一起吃掉点击
    ['jnd-root', 'jnd-chip'].forEach(id => {
      const old = document.getElementById(id);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    });

    root = el('div');
    root.id = 'jnd-root';
    mask = el('div');
    mask.id = 'jnd-mask';
    sheet = el('div');
    sheet.id = 'jnd-sheet';

    const head = el('div');
    head.id = 'jnd-head';
    head.innerHTML =
      '<div class="lg">' + IC.pouch + '</div><div><div class="tt">三国杀手机助手<span class="kk">～(∠・ω&#160;)⌒☆</span></div>' +
      '<div class="vv">v' + VERSION + ' · 小抄控制</div></div>' +
      '<div class="sp"></div><div class="x" id="jnd-home">' + IC.home + '</div>' +
      '<div class="x" id="jnd-close">' + IC.close + '</div>';

    const body = el('div');
    body.id = 'jnd-body';
    nav = el('div');
    nav.id = 'jnd-nav';
    main = el('div');
    main.id = 'jnd-main';
    body.appendChild(nav);
    body.appendChild(main);

    sheet.appendChild(head);
    sheet.appendChild(body);
    root.appendChild(mask);
    root.appendChild(sheet);
    (document.body || document.documentElement).appendChild(root);

    // 顶部常驻条已按需求移除：不再创建 #jnd-chip，updateChip 里有 null 兜底
    chip = null;

    head.querySelector('#jnd-close').addEventListener('click', close);
    const homeBtn = head.querySelector('#jnd-home');
    if (homeBtn) homeBtn.addEventListener('click', () => {
      close();
      try { if (bridge && bridge.goHome) bridge.goHome(); } catch (_) {}
    });
    mask.addEventListener('click', close);

    renderNav();
    render();
    syncViewport();
    root.classList.add('on');
    log('panel ready v' + VERSION);
  }

  function renderNav() {
    nav.innerHTML = '';
    TAB.forEach(t => {
      const b = el('div', 'jnd-tab' + (t.k === curTab ? ' on' : ''), t.ic + '<span>' + t.n + '</span>');
      b.setAttribute('data-tab', t.k);
      b.addEventListener('click', () => { curTab = t.k; renderNav(); render(); });
      nav.appendChild(b);
    });
  }

  /* ---------------- 小抄适配层 ---------------- */
  const DXC_ID = 'createIframe';

  /**
   * 渠道服（4399/7K7K/百度/360/QQ）把牌局塞在 iframe 里，小抄长在子帧里。
   * 顶层这套面板碰不到那个 document，于是走 postMessage：
   *   · 下行：把「开/关、宽度比例、贴哪边」推给子帧代理
   *   · 上行：子帧代理回报容器矩形和牌局快照（阶段/可出杀/手牌数）
   */
  const kid = { alive: false, got: false, open: false, rect: null, vw: 0, vh: 0, game: null, at: 0 };

  function cfgMsg() {
    return {
      __jnd: 'dxc-cfg',
      cfg: {
        open: !!S.dxcOpen,
        ratio: Number(S.dxcRatio) || 0,
        side: S.dxcSide === 'left' ? 'left' : (S.dxcSide === 'right' ? 'right' : 'free'),
        edge: S.dxcEdge === 'bottom' ? 'bottom' : 'top',
        bigTouch: S.bigTouch !== false
      }
    };
  }

  function pushKidCfg() {
    const m = cfgMsg();
    const fs = document.querySelectorAll('iframe');
    for (let i = 0; i < fs.length; i++) {
      try { if (fs[i].contentWindow) fs[i].contentWindow.postMessage(m, '*'); } catch (_) {}
    }
  }

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || !d.__jnd) return;
    if (d.__jnd === 'dxc-need') {
      // 子帧可能嵌了好几层，只有它自己找上门来才回得去
      try { e.source.postMessage(cfgMsg(), '*'); } catch (_) {}
      return;
    }
    if (d.__jnd === 'ime') {
      // 子帧里的输入框被点：交给原生把键盘抬起来
      try { if (bridge && bridge.ime) bridge.ime(true); } catch (_) {}
      return;
    }
    if (d.__jnd === 'dxc-toggle') {
      // 子帧里的悬浮球被点：把总开关打开（配置随后推回子帧）
      if (!S.dxcOpen) setDxc(true);
      return;
    }
    if (d.__jnd !== 'dxc') return;
    const was = kid.alive && kid.got;
    kid.alive = !!d.alive;
    kid.got = !!d.got;
    kid.open = !!d.open;
    kid.rect = d.rect || null;
    kid.vw = d.vw || 0;
    kid.vh = d.vh || 0;
    kid.game = d.game || null;
    kid.at = Date.now();
    if (!kid.got) { pushKidCfg(); return; }
    if (kid.alive) {
      if (!was) {
        log('dxc-frame up ' + JSON.stringify(kid.rect));
        render();
      }
      if (!dxcEl()) {
        const k = 'f|' + kid.got + '|' + (kid.rect ? kid.rect.w : 0);
        if (kid.__k !== k) { kid.__k = k; render(); }
      }
    }
  });

  function dxcEl() { return document.getElementById(DXC_ID); }
  function dxcAlive() { return !!dxcEl() || (kid.alive && kid.got); }

  // 原版小抄收起时只留一条 34px 的标题栏（#title-collapsed）。以前无脑把容器
  // 高度写成整屏，收起来就变成一张空白半透明板盖在牌桌上，看着像「乱跳」。
  function dxcFolded() {
    const c = document.getElementById('title-collapsed');
    if (!c) return false;
    // 认原版自己写的内联 display：收起态是 flex、展开态是 none。
    // 不能用计算样式——方砖那张样式表用的是 !important，会把计算值一直顶成 flex，
    // 展开后还以为自己收着，就再也展不开了。
    const d = c.style.display;
    if (d === 'none') return false;
    if (d === 'flex' || d === 'block') return true;
    try { return getComputedStyle(c).display !== 'none' && c.offsetHeight > 0; } catch (_) { return false; }
  }

  /* ---------------- 收起态：保留原版自己的「小抄」条 ----------------
   * 原版收起后就是那条「小抄 + 展开箭头」横条（用户认的就是这个样子），
   * 我们不再另造球：只替它钉位置、顶成实底、管拖动。
   * 原版自己 #header 上的拖动手势是个「停靠侧栏」动作，收起条上不能放行，
   * 不然一拖就被它停靠到右边去。位置记在 S.dxcX/dxcY（translate px）。
   */
  /* 位置走样式表 !important：原版的拖拽/停靠逻辑会随时往行内写普通优先级的
   * transform（同一声明槽位会把我们的行内 !important 顶掉，位置就乱跳/错位）。
   * 作者样式表的 !important 压得过行内普通声明，行内只留我们和它都不打架的外观。 */
  let dxcPosStyle = null;
  function dxcPosCss(rule) {
    if (!dxcPosStyle || !dxcPosStyle.isConnected) {
      dxcPosStyle = document.getElementById('jnd-dxc-pos-css');
      if (!dxcPosStyle) {
        dxcPosStyle = document.createElement('style');
        dxcPosStyle.id = 'jnd-dxc-pos-css';
        (document.head || document.documentElement).appendChild(dxcPosStyle);
      }
    }
    if (dxcPosStyle.textContent !== rule) dxcPosStyle.textContent = rule;
  }
  function dxcPosRule(mode, x, y, w) {
    return '#createIframe{left:0!important;top:0!important;right:auto!important;bottom:auto!important;' +
      'transform-origin:0 0!important;transform:translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)!important;' +
      (mode === 'bar' ? 'touch-action:none!important;' : '') +
      (mode === 'exp' ? 'width:' + Math.round(w) + 'px!important;' : '') + '}';
  }

  function bindBarDrag(p) {
    if (p.__jndBarDrag) return;
    p.__jndBarDrag = 1;
    const mine = () => S.dxcOpen && dxcFolded();
    p.addEventListener('touchstart', e => {
      if (mine()) { try { e.stopPropagation(); } catch (_) {} }
    }, true);
    p.addEventListener('mousedown', e => {
      if (mine()) { try { e.stopPropagation(); } catch (_) {} }
    }, true);
    p.addEventListener('pointerdown', e => {
      if (!mine()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = p.getBoundingClientRect();
      barDrag = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        tx: p.__jndXY ? p.__jndXY.x : S.dxcX, ty: p.__jndXY ? p.__jndXY.y : S.dxcY,
        w: Math.max(60, r.width || 84), h: Math.max(28, r.height || 34),
        moved: 0, cap: 0
      };
    }, true);
    p.addEventListener('pointermove', e => {
      if (!barDrag || e.pointerId !== barDrag.id) return;
      const dx = e.clientX - barDrag.x, dy = e.clientY - barDrag.y;
      const mv = Math.abs(dx) + Math.abs(dy);
      if (mv > barDrag.moved) barDrag.moved = mv;
      if (barDrag.moved < 6) return;
      // 挪过了才算拖，这时候才捕获指针；捕获早了会把 click 一起吞掉，条就点不开了
      if (!barDrag.cap) { barDrag.cap = 1; try { p.setPointerCapture(e.pointerId); } catch (_) {} }
      try { e.preventDefault(); } catch (_) {}
      const vw = VW(), vh = VH();
      const nx = Math.max(0, Math.min(barDrag.tx + dx, Math.max(0, vw - barDrag.w)));
      const ny = Math.max(0, Math.min(barDrag.ty + dy, Math.max(0, vh - barDrag.h)));
      S.dxcX = Math.round(nx); S.dxcY = Math.round(ny);
      p.__jndXY = { x: nx, y: ny };
      dxcPosCss(dxcPosRule('bar', nx, ny, 0));
    }, true);
    const end = e => {
      if (!barDrag || (e && e.pointerId !== barDrag.id)) return;
      const d = barDrag; barDrag = null;
      if (d.cap) { try { p.releasePointerCapture(d.id); } catch (_) {} }
      if (d.moved < 6) {
        // 收起条上任意一点都算「展开」：原版只有右端的小箭头按钮可点，
        // 但按原版收起条的样子，用户会点整条。等 60ms 避开 toggle-me 自己的
        // click（点中箭头时它已经展开，这里就别再点一下把它收回去）。
        setTimeout(() => {
          if (!S.dxcOpen || !dxcFolded()) return;
          const tm = document.getElementById('toggle-me');
          if (tm) { try { tm.click(); } catch (_) {} }
        }, 60);
        return;
      }
      saveS();
      // 拖动结束时浏览器还会补一个 click，不吞掉的话松手就顺手把面板展开了
      const swallow = ev => { ev.preventDefault(); ev.stopPropagation(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 360);
      log('dxc bar ' + S.dxcX + ',' + S.dxcY);
    };
    p.addEventListener('pointerup', end, true);
    p.addEventListener('pointercancel', end, true);
  }
  let barDrag = null;

  /* 自由档展开态的自由拖动：原版 #header 的拖拽是个受限手势——横向最多挪
   * 155px（Math.min(155,…) 钳制），拖远一点就强制停靠成右侧栏，用户看到的
   * 就是「只能在线两边拖、跨不过红线、拖完还错位」。自由档把它的手势按死，
   * 位置整个归我们：left/top 0 + translate，指哪拖哪。位置与收起条共用。 */
  let expDrag = null;
  function bindExpandedDrag(p) {
    if (p.__jndExpDrag) return;
    p.__jndExpDrag = 1;
    const free = () => S.dxcOpen && !dxcFolded() &&
      S.dxcSide !== 'left' && S.dxcSide !== 'right';
    const block = e => { if (free()) { try { e.stopPropagation(); } catch (_) {} } };
    p.addEventListener('touchstart', block, true);
    p.addEventListener('mousedown', block, true);
    p.addEventListener('pointerdown', e => {
      if (!free()) return;
      const hd = document.getElementById('header');
      if (!hd || !hd.contains(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      expDrag = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        tx: p.__jndXY ? p.__jndXY.x : S.dxcX, ty: p.__jndXY ? p.__jndXY.y : S.dxcY,
        w: Math.max(120, p.getBoundingClientRect().width || NATIVE),
        moved: 0, cap: 0
      };
    }, true);
    p.addEventListener('pointermove', e => {
      if (!expDrag || e.pointerId !== expDrag.id) return;
      const dx = e.clientX - expDrag.x, dy = e.clientY - expDrag.y;
      const mv = Math.abs(dx) + Math.abs(dy);
      if (mv > expDrag.moved) expDrag.moved = mv;
      if (expDrag.moved < 6) return;
      if (!expDrag.cap) { expDrag.cap = 1; try { p.setPointerCapture(e.pointerId); } catch (_) {} }
      try { e.preventDefault(); } catch (_) {}
      const vw = VW(), vh = VH();
      const nx = Math.max(0, Math.min(expDrag.tx + dx, Math.max(0, vw - expDrag.w)));
      const ny = Math.max(0, Math.min(expDrag.ty + dy, Math.max(0, vh - 44)));
      S.dxcX = Math.round(nx); S.dxcY = Math.round(ny);
      p.__jndXY = { x: nx, y: ny };
      dxcPosCss(dxcPosRule('exp', nx, ny, expDrag.w));
    }, true);
    const end = e => {
      if (!expDrag || (e && e.pointerId !== expDrag.id)) return;
      const d = expDrag; expDrag = null;
      if (d.cap) { try { p.releasePointerCapture(d.id); } catch (_) {} }
      if (d.moved < 6) return;
      saveS();
      const swallow = ev => { ev.preventDefault(); ev.stopPropagation(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 360);
      log('dxc exp ' + S.dxcX + ',' + S.dxcY);
    };
    p.addEventListener('pointerup', end, true);
    p.addEventListener('pointercancel', end, true);
  }

  /** 原版每次收起/展开都会重写自己的内联样式，点完马上对两次表 */
  function bindDxcSync(p) {
    if (p.__jndSync) return;
    p.__jndSync = 1;
    p.addEventListener('click', () => {
      setTimeout(() => { if (dxcAlive()) applyDxcStyle(); }, 30);
      setTimeout(() => { if (dxcAlive()) applyDxcStyle(); }, 280);
    }, true);
  }

  /**
   * 游戏画布（laya）会在触摸序列里把 pointer 收走，浏览器合成的 click 落点变成
   * 画布，按钮的 onclick 就收不到 —— 展开态点「收起」就是这么失灵的（实测：
   * pointerdown 明明命中按钮，click 的 target 却是 layaCanvas）。
   * 给按钮兜一层：pointerup 之后 60ms 还没等到自己的 click，就手动补一次
   * （程序 click 不走命中测试，必达）。正常场景 click 会先到，不会重复触发。
   */
  function bindToggleFix(p) {
    const tm = document.getElementById('toggle-me');
    if (!tm || tm.__jndTap) return;
    tm.__jndTap = 1;
    let dx = 0, dy = 0, fired = false;
    tm.addEventListener('pointerdown', e => { dx = e.clientX; dy = e.clientY; fired = false; }, true);
    tm.addEventListener('click', () => { fired = true; }, true);
    tm.addEventListener('pointerup', e => {
      if (Math.abs(e.clientX - dx) > 14 || Math.abs(e.clientY - dy) > 14) return;
      setTimeout(() => { if (!fired) { try { tm.click(); } catch (_) {} } }, 60);
    }, true);
  }

  /* 锦囊袋开关：管「显示 / 隐藏」。开着入口都在（默认），关了入口藏起来、功能照跑。 */

  function daiReady() {
    return !!document.getElementById('jnd-panel');
  }

  /* 锦囊袋显隐：只动入口（圆点 + 面板）的显示，不碰脚本。
     打 class 而不是 style，锦囊袋自己写 style 也不会打架。 */
  let daiCssDone = false;
  function applyDaiVis() {
    if (!daiCssDone) {
      daiCssDone = true;
      try {
        const st = el('style');
        st.id = 'jnd-dai-vis';
        st.textContent = '#jnd-panel.jnd-dai-hidden,#jnd-panel.jnd-dai-hidden *{display:none !important;}';
        (document.head || document.documentElement).appendChild(st);
      } catch (_) { return; }
    }
    const p = document.getElementById('jnd-panel');
    if (!p) return;
    try {
      if (S.daiOpen) p.classList.remove('jnd-dai-hidden');
      else p.classList.add('jnd-dai-hidden');
    } catch (_) {}
  }

  /* 面板是锦囊袋脚本稍后才插进 DOM 的：盯着它出现，一出现就应用显隐。
     之后元素一直存在，改一次 class 即可。 */
  let daiVisObs = null;
  function watchDai() {
    if (daiVisObs) return;
    applyDaiVis();
    if (daiReady()) return;
    const mo = new MutationObserver(() => { if (applyDaiVis(), daiReady()) { try { mo.disconnect(); } catch (_) {} } });
    daiVisObs = mo;
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  }

  /* 锦囊袋别超出屏幕：按视口等比缩小（只缩不放）。
     用 zoom 而不是 transform —— 锦囊袋自己用 transform 做拖动定位，抢过来会拖不动。 */
  let daiZoom = 1;
  function fitDai() {
    const p = document.getElementById('jnd-panel');
    if (!p || p.classList.contains('jnd-dai-hidden')) return;
    if (daiZoom !== 1) { try { p.style.removeProperty('zoom'); } catch (_) {} }
    const w = p.offsetWidth, h = p.offsetHeight;
    if (!w || !h) return;
    const W = Math.max(240, VW()), H = Math.max(320, VH());
    const s = Math.min(1, (W - 8) / w, (H - 8) / h);
    daiZoom = Math.max(0.45, Math.round(s * 100) / 100);
    if (daiZoom < 0.995) {
      try { p.style.setProperty('zoom', String(daiZoom), 'important'); } catch (_) {}
    }
  }
  setInterval(fitDai, 1500);

  function applyDxcStyle() {
    const p = dxcEl();
    if (!p) {
      // 小抄长在子帧里：参数推过去，由帧内代理照自己的视口算缩放
      pushKidCfg();
      return !!(kid.alive && kid.got);
    }
    const vw = VW(), vh = VH();
    const side = S.dxcSide === 'left' ? 'left' : (S.dxcSide === 'right' ? 'right' : 'free');
    const edge = S.dxcEdge === 'bottom' ? 'bottom' : 'top';
    const ratio = Number(S.dxcRatio) || 0;
    const NATIVE = 230;
    const folded = dxcFolded();

    // ratio>0 按「短边」比例缩放（横屏时用高度，否则一条「小抄」能横到半屏）；
    // ratio=0 用原始 230px（字最清楚但最占屏）。
    const base = Math.min(vw, vh) || vw || 360;
    const z = ratio > 0.02 ? Math.max(150, Math.round(base * ratio)) / NATIVE : 1;
    p.__jndZ = z;

    const st = p.style;
    st.setProperty('position', 'fixed', 'important');
    st.setProperty('z-index', drawerOpen ? '2147479000' : '2147481000', 'important');
    st.setProperty('visibility', S.dxcOpen ? 'visible' : 'hidden', 'important');
    st.setProperty('pointer-events', S.dxcOpen ? 'auto' : 'none', 'important');
    bindDxcSync(p);
    bindToggleFix(p);

    /* 总开关关着：整个藏掉（原生悬浮球还在，想要时从那开） */
    if (!S.dxcOpen) {
      st.setProperty('visibility', 'hidden', 'important');
      st.setProperty('pointer-events', 'none', 'important');
      dxcPosCss('');
      return true;
    }

    /* ---------- 收起态：保留原版自己的「小抄」条，只钉位置、顶实底 ---------- */
    if (folded) {
      // 先清掉展开态写过、现在会碍事的行内属性（只清我们记过账的）
      (p.__jndWrote || []).forEach(k => st.removeProperty(k));
      p.__jndWrote = ['opacity', 'background', 'border-radius', 'box-shadow', 'overflow'];
      let bx = Number(S.dxcX), by = Number(S.dxcY);
      // 没拖过：默认挂在右缘中部（原版小抄以前也待在那一片）
      if (!(bx >= 0) || !(by >= 0)) { bx = Math.round(vw - 96); by = Math.round(vh * 0.52); }
      const r0 = p.getBoundingClientRect();
      const bw = Math.max(60, r0.width || 84), bh = Math.max(28, r0.height || 34);
      bx = Math.max(0, Math.min(bx, Math.max(0, vw - bw)));
      by = Math.max(0, Math.min(by, Math.max(0, vh - bh)));
      S.dxcX = Math.round(bx); S.dxcY = Math.round(by);
      p.__jndXY = { x: bx, y: by };
      st.setProperty('visibility', 'visible', 'important');
      st.setProperty('pointer-events', 'auto', 'important');
      // 原版收起是 0.6 半透明，浅色牌桌上像「一块东西」；顶成实心才干净
      st.setProperty('opacity', '1', 'important');
      st.setProperty('background', 'rgba(56,44,34,.97)', 'important');
      st.setProperty('border-radius', '9px', 'important');
      st.setProperty('box-shadow', '0 0 0 1px rgba(226,196,138,.5) inset,0 5px 14px rgba(0,0,0,.4)', 'important');
      st.setProperty('overflow', 'hidden', 'important');
      dxcPosCss(dxcPosRule('bar', bx, by, 0));
      bindBarDrag(p);
      return true;
    }

    /* ---------- 展开态：贴边或自由 ---------- */
    st.setProperty('border-radius', '0', 'important');
    st.setProperty('box-shadow', 'none', 'important');
    st.setProperty('overflow', 'visible', 'important');
    st.setProperty('opacity', '1', 'important');
    st.setProperty('background', 'transparent', 'important');
    if (p.classList.contains('jnd-blk')) p.classList.remove('jnd-blk');
    if (side === 'free') {
      // 「自由」：位置整个归我们（样式表 !important 钉住，见 dxcPosCss 的说明）。
      // 先清掉贴边/收起写过、现在会碍事的行内属性（只清记过账的）。
      (p.__jndWrote || []).forEach(k => st.removeProperty(k));
      p.__jndWrote = [];
      let ex = Number(S.dxcX), ey = Number(S.dxcY);
      if (!(ex >= 0) || !(ey >= 0)) { ex = 0; ey = Math.round(vh * 0.03); }
      const r0 = p.getBoundingClientRect();
      const ew = Math.max(120, r0.width || NATIVE);
      ex = Math.max(0, Math.min(ex, Math.max(0, vw - ew)));
      ey = Math.max(0, Math.min(ey, Math.max(0, vh - 44)));
      S.dxcX = Math.round(ex); S.dxcY = Math.round(ey);
      p.__jndXY = { x: ex, y: ey };
      dxcPosCss(dxcPosRule('exp', ex, ey, Math.round(NATIVE * z)));
      // 标题栏锁 touch-action：不锁的话浏览器接管手势去滚动，拖不到两下就断
      const hd0 = document.getElementById('header');
      if (hd0) hd0.style.setProperty('touch-action', 'none', 'important');
      bindExpandedDrag(p);
    } else {
      dxcPosCss('');   // 贴边档位置走行内，样式表让位
    // 留一点安全边距：贴死 0 的话，标题栏会被游戏自己的顶栏 / 底栏压住一半
    st.setProperty('top', edge === 'top' ? Math.round(vh * 0.055) + 'px' : 'auto', 'important');
    st.setProperty('bottom', edge === 'bottom' ? Math.round(vh * 0.075) + 'px' : 'auto', 'important');
    st.setProperty('left', side === 'left' ? '0' : 'auto', 'important');
    st.setProperty('right', side === 'right' ? '0' : 'auto', 'important');
    // 位置和缩放都由我们定：原版会用自己的 translate 把面板拖到屏幕中间或滑出屏幕，
    // 两边各写一次就变成「乱跳」。
    st.setProperty('transform-origin', edge + ' ' + side, 'important');
    st.setProperty('transform', 'scale(' + z.toFixed(4) + ')', 'important');
    st.setProperty('width', NATIVE + 'px', 'important');
    st.setProperty('height', Math.ceil(vh / z) + 'px', 'important');
    st.setProperty('max-height', 'none', 'important');
    // 记下这轮写了哪些行内属性，切回「自由」时只清这些，不伤原版自己的
    p.__jndWrote = ['top', 'bottom', 'left', 'right', 'transform', 'transform-origin', 'width', 'height', 'max-height'];
    }

    // 触屏友好尺寸固定开启（原「大按钮模式」开关已去掉，行为不变）
    {
      // 展开态只剩右上角那个收起按钮，给它一个按得中的尺寸
      const tm = document.getElementById('toggle-me');
      if (tm) tm.style.setProperty('min-height', Math.round(Math.min(72, 34 / z)) + 'px', 'important');
    }

    // 它把自己滑出屏幕后，总开关还开着就拉回来（不然点一下标题就再也找不到）。
    // 「自由」档不拉：拖到边上变侧边栏是用户自己的安排。
    if (S.dxcOpen && side !== 'free') {
      try {
        const r = p.getBoundingClientRect();
        if (r.bottom < 12 || r.right < 12) {
          st.setProperty('transform', 'scale(' + z.toFixed(4) + ')', 'important');
        }
      } catch (_) {}
    }

    // 尺寸变化后只做一次落位自检，别每次同步视口都跑（手机上会把主线程拖死）
    const key = side + '|' + edge + '|' + z.toFixed(3) + '|' + vw + 'x' + vh + '|e';
    if (side !== 'free' && p.__jndKey !== key) {
      p.__jndKey = key;
      requestAnimationFrame(() => {
        try {
          const p2 = dxcEl();
          if (!p2) return;
          const r = p2.getBoundingClientRect();
          const fit = side === 'right'
            ? r.right <= vw + 6 && r.right >= vw * 0.55
            : r.left >= -6 && r.left <= vw * 0.45;
          if (!fit || r.width < 80) {
            log('dxc fit warn', JSON.stringify({ side: side, r: [r.left, r.top, Math.round(r.width)] }));
          } else {
            log('dxc fit ok', JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), side: side }));
          }
        } catch (_) {}
      });
    }
    return true;
  }

  function setDxc(open) {
    S.dxcOpen = !!open;
    saveS();
    if (!applyDxcStyle()) {
      // 脚本还没就绪：等待出现
      waitDxc(6000);
    }
    render();
  }

  let dxcTimer = null;
  function waitDxc(ms) {
    if (dxcTimer) clearInterval(dxcTimer);
    const t0 = Date.now();
    dxcTimer = setInterval(() => {
      if (applyDxcStyle()) { clearInterval(dxcTimer); dxcTimer = null; render(); return; }
      if (Date.now() - t0 > ms) { clearInterval(dxcTimer); dxcTimer = null; }
    }, 400);
  }

  /* ---------------- 游戏数据观察 ---------------- */
  const obs = {
    seats: [], events: [], phrase: '', sha: '', ok: false
  };

  function readGame() {
    const ph = document.getElementById('phrase');
    const sh = document.getElementById('sha');
    if (!ph && !sh && kid.game) {
      // 渠道服：牌局数据在子帧里，代理已经算好回传了
      obs.ok = true;
      obs.phrase = kid.game.phrase || '';
      obs.sha = kid.game.sha || '';
      obs.seats = Array.isArray(kid.game.seats) ? kid.game.seats : [];
      return;
    }
    obs.ok = !!ph || !!sh;
    obs.phrase = ph ? (ph.textContent || '').trim() : '';
    obs.sha = sh ? (sh.textContent || '').trim() : '';

    const seats = [];
    for (let i = 1; i <= 8; i++) {
      const box = document.getElementById(String(i));
      if (!box) continue;
      const cards = box.querySelectorAll(':scope > .shoupai, :scope > .markedCard > .shoupai');
      const nameBox = box.style.getPropertyValue('--No-content') || '';
      seats.push({ i, n: cards.length, name: nameBox ? nameBox.replace(/\|/g, ' ') : '' });
    }
    obs.seats = seats;
  }

  function pushEvent(text, hi) {
    const d = new Date();
    const t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    obs.events.unshift({ t, text, hi: !!hi });
    if (obs.events.length > 60) obs.events.pop();
  }

  let lastPhase = '', lastSha = '', lastSeatSig = '';

  function tick() {
    readGame();
    if (obs.phrase && obs.phrase !== lastPhase) {
      if (lastPhase) pushEvent('阶段：' + obs.phrase, true);
      lastPhase = obs.phrase;
    }
    if (obs.sha && obs.sha !== lastSha) {
      if (lastSha) pushEvent('可出杀：' + lastSha, true);
      lastSha = obs.sha;
    }
    const sig = obs.seats.map(s => s.n).join(',');
    if (sig && sig !== lastSeatSig) {
      if (lastSeatSig) pushEvent('手牌变化：' + obs.seats.map(s => s.i + '号' + s.n).join(' / '), false);
      lastSeatSig = sig;
    }
    updateChip();
    // 小抄是游戏自己在大厅/牌局切换时重建的，只在启动那一下摆样式的话，
    // 重建后它就回到原版默认的窄条位置（看着像「跑到屏幕中间」）。这里顺带补一次，
    // 样式是幂等的，不会和它自己的拖动打架。
    if (dxcAlive()) applyDxcStyle();
    seatUiAutoFix();
    if (root && root.classList.contains('open') && (curTab === 'show' || curTab === 'game')) render();
  }

  function updateChip() {
    if (!chip) return;
    const on = S.chip && (obs.phrase || obs.sha);
    chip.classList.toggle('on', !!on);
    if (!on) return;
    const parts = [];
    if (obs.phrase) parts.push(obs.phrase);
    if (obs.sha) parts.push('可出 <b>' + obs.sha + '</b> 杀');
    chip.innerHTML = parts.join(' · ');
  }

  /* ---------------- 渲染各页 ---------------- */
  function sw(on, fn) {
    const d = el('div', 'jnd-sw' + (on ? ' on' : ''));
    d.addEventListener('click', e => {
      e.stopPropagation();
      d.classList.toggle('on');
      fn(d.classList.contains('on'));
    });
    return d;
  }

  function row(icon, title, desc, right, onTap) {
    const r = el('div', 'jnd-row');
    r.innerHTML = '<div class="ic">' + icon + '</div><div class="tx"><b>' + title +
      '</b><i>' + desc + '</i></div>';
    const rt = el('div', 'rt');
    if (right) rt.appendChild(right);
    r.appendChild(rt);
    if (onTap) r.addEventListener('click', onTap);
    return r;
  }

  function h(title) {
    return el('div', 'jnd-h', '<b>' + title + '</b><s></s>');
  }

  function render() {
    if (!main) return;
    main.innerHTML = '';
    // 旧版把页签记在本地，用户可能停在已下线的「牌局 / 妙计」上，回落到显示页
    const fn = { show: pageShow, ctl: pageCtl, plug: pagePlug, misc: pageMisc, ver: pageVer }[curTab] || pageShow;
    if (fn) fn();
  }

  /* 控制页：把「大小 / 贴边 / 返回」这些最常用的动作集中到一页，手机上不用来回翻 */
  function ratioPct() {
    const r = Number(S.dxcRatio) || 0;
    return r > 0.02 ? Math.round(r * 100) + '%' : '原图';
  }

  function setRatio(r) {
    const v = Math.max(0.2, Math.min(1, Math.round(r * 100) / 100));
    S.dxcRatio = v;
    saveS();
    applyDxcStyle();
    render();
  }

  function stepBtn(txt, dv) {
    const u = el('u', null, txt);
    u.addEventListener('click', e => {
      e.stopPropagation();
      setRatio((Number(S.dxcRatio) || 0.44) + dv);
    });
    return u;
  }

  /* ---------------- 画面：屏幕宽度（像素）+ 浏览器缩放 ---------------- */

  function viewW() { return Math.max(0, Math.round(Number(S.viewW) || 0)); }
  function viewZ() { return Math.max(50, Math.min(200, Math.round(Number(S.zoom) || 100))); }

  function applyView() {
    const w = viewW(), z = viewZ();
    S.viewW = w; S.zoom = z;
    saveS();
    if (bridge && bridge.view) { try { bridge.view(w, z); return; } catch (_) {} }
    // 浏览器里调试：直接缩画布
    let st = document.getElementById('jnd-view');
    if (!st) { st = document.createElement('style'); st.id = 'jnd-view'; (document.head || document.documentElement).appendChild(st); }
    const base = VW() || 360;
    const f = (w > 0 ? w / base : 1) * (z / 100);
    st.textContent = Math.abs(f - 1) < 0.003 ? '' :
      ('html{zoom:' + f.toFixed(4) + '!important}' +
       '#jnd-root,#jnd-chip,#jnd-qr{zoom:' + (1 / f).toFixed(4) + '!important}');
  }

  /**
   * − [数值] + 的步进器；输入框可直接键入。
   * 点输入框要显式抬键盘，WebView 在自定义触控页里不一定自己弹。
   */
  function numBox(val, step, min, max, onChange, opt) {
    const o = opt || {};
    const wrap = el('div', 'jnd-numwrap');
    const minus = el('u', null, '−');
    const inp = el('input', 'jnd-num');
    inp.type = 'number';
    inp.setAttribute('inputmode', 'numeric');
    inp.value = val > 0 ? String(Math.round(val)) : '';
    inp.placeholder = o.placeholder || '自动';
    const plus = el('u', null, '+');
    const unit = o.unit ? el('em', 'jnd-cur', o.unit) : null;

    let cur = Math.round(Number(val) || 0);
    const set = v => {
      let n = Math.round(Number(v) || 0);
      if (n < min) n = min;
      if (n > max) n = max;
      inp.value = n > 0 ? String(n) : '';
      // 值没变就别回调：回调会重排整页，输入框一失焦就把键盘顶掉
      if (n === cur) return;
      cur = n;
      onChange(n);
    };

    minus.addEventListener('click', e => { e.stopPropagation(); set((Number(inp.value) || 0) - step); });
    plus.addEventListener('click', e => { e.stopPropagation(); set((Number(inp.value) || 0) + step); });
    inp.addEventListener('focus', () => { try { if (bridge && bridge.ime) bridge.ime(true); } catch (_) {} });
    inp.addEventListener('change', () => set(inp.value));
    inp.addEventListener('blur', () => { if (String(cur) !== inp.value && inp.value !== '') set(inp.value); });

    wrap.appendChild(minus);
    wrap.appendChild(inp);
    if (unit) wrap.appendChild(unit);
    wrap.appendChild(plus);
    return wrap;
  }

  function pageCtl() {
    main.appendChild(h('小抄控制'));

    /* ① 快捷操作：返回类动作放最上面，一进来就能点 */
    const acts = el('div', 'jnd-acts');
    const act = (txt, ic, pri, fn) => {
      const d = el('div', pri ? 'pri' : '', (ic || '') + '<span>' + txt + '</span>');
      d.addEventListener('click', e => { e.stopPropagation(); fn(); });
      return d;
    };
    acts.appendChild(act(S.dxcOpen ? '收起小抄' : '展开小抄', IC.book, true,
      () => { setDxc(!S.dxcOpen); toast(S.dxcOpen ? '小抄已收起' : '小抄已展开'); }));
    acts.appendChild(act('回到游戏', IC.back, false, () => { close(); }));
    acts.appendChild(act('回首页', IC.home, false, () => {
      close();
      try { if (bridge && bridge.goHome) bridge.goHome(); } catch (_) {}
    }));
    acts.appendChild(act('恢复默认', IC.undo, false, () => {
      S.dxcRatio = DEF.dxcRatio; S.dxcSide = DEF.dxcSide;
      S.dxcEdge = DEF.dxcEdge; S.bigTouch = DEF.bigTouch; S.dxcOpen = DEF.dxcOpen;
      S.dxcX = -1; S.dxcY = -1;
      saveS(); applyDxcStyle(); render();
      toast('已恢复默认位置与大小');
    }));
    main.appendChild(acts);

    /* ② 大小 */
    const b1 = el('div', 'jnd-block');
    b1.appendChild(el('div', 't',
      '<div class="ic">' + IC.ctl + '</div><div><b>小抄大小</b><i>' +
      (S.dxcRatio > 0.02
        ? '占屏宽 ' + Math.round(S.dxcRatio * 100) + '% · 字随宽度等比缩放'
        : '原始 230px · 字最清楚，但最占屏') +
      '</i></div>'));
    const c1 = el('div', 'c center');
    c1.appendChild(stepBtn('−', -0.04));
    c1.appendChild(el('em', 'jnd-cur', ratioPct()));
    c1.appendChild(stepBtn('+', 0.04));
    b1.appendChild(c1);
    const c1b = el('div', 'c');
    c1b.style.marginTop = '10px';
    const segSz = el('div', 'jnd-seg');
    [[0.3, '条'], [0.38, '窄'], [0.46, '中'], [0.56, '宽'], [0, '原图']].forEach(([r, n]) => {
      const b = el('b', Math.abs((S.dxcRatio || 0) - r) < 0.02 ? 'on' : '', n);
      b.addEventListener('click', e => { e.stopPropagation(); S.dxcRatio = r; saveS(); applyDxcStyle(); render(); });
      segSz.appendChild(b);
    });
    c1b.appendChild(segSz);
    b1.appendChild(c1b);
    main.appendChild(b1);

    /* ③ 画面：屏幕宽度（像素）与浏览器缩放 */
    const b3 = el('div', 'jnd-block');
    b3.appendChild(el('div', 't',
      '<div class="ic">' + IC.hand + '</div><div><b>屏幕宽度</b><i>' +
      (viewW() > 0 ? '按 ' + viewW() + ' px 排版 · 界面更大或更小' : '跟随设备（' + Math.round(VW()) + ' px）') +
      '</i></div>'));
    const c3 = el('div', 'c');
    c3.appendChild(numBox(viewW(), 20, 0, 1920, v => { S.viewW = v; applyView(); render(); },
      { placeholder: '自动', unit: 'px' }));
    b3.appendChild(c3);
    b3.appendChild(el('div', 'jnd-numtip', '0 或留空 = 跟随设备；数值越小，画面越大'));

    const b4 = el('div', 'jnd-block');
    b4.appendChild(el('div', 't',
      '<div class="ic">' + IC.ctl + '</div><div><b>浏览器缩放</b><i>' + viewZ() + '% · 页面整体比例' + '</i></div>'));
    const c4 = el('div', 'c');
    c4.appendChild(numBox(viewZ(), 5, 50, 200, v => { S.zoom = v || 100; applyView(); render(); },
      { placeholder: '100', unit: '%' }));
    b4.appendChild(c4);
    b4.appendChild(el('div', 'jnd-numtip', '双指缩放之外的另一条通道，改完立即生效'));
    main.appendChild(b3);
    main.appendChild(b4);

    /* ④ 贴边：横向 + 纵向，分两行写清楚，避免四个按钮连成一片分不清 */
    const b2 = el('div', 'jnd-block');
    b2.appendChild(el('div', 't',
      '<div class="ic">' + IC.show + '</div><div><b>贴边位置</b><i>避开手牌与出牌按钮，按习惯放</i></div>'));
    const c2 = el('div', 'c col');
    const lineH = el('div', 'jnd-line');
    lineH.appendChild(el('b', null, '左右'));
    const segH = el('div', 'jnd-seg');
    [['left', '贴左'], ['right', '贴右']].forEach(([v, n]) => {
      const b = el('b', (S.dxcSide || 'right') === v ? 'on' : '', n);
      b.addEventListener('click', e => {
        e.stopPropagation();
        S.dxcSide = v; saveS(); applyDxcStyle(); render();
      });
      segH.appendChild(b);
    });
    lineH.appendChild(segH);
    c2.appendChild(lineH);
    const lineV = el('div', 'jnd-line');
    lineV.appendChild(el('b', null, '上下'));
    const segV = el('div', 'jnd-seg');
    [['top', '贴顶'], ['bottom', '贴底']].forEach(([v, n]) => {
      const b = el('b', (S.dxcEdge === 'bottom' ? 'bottom' : 'top') === v ? 'on' : '', n);
      b.addEventListener('click', e => {
        e.stopPropagation();
        S.dxcEdge = v; saveS(); applyDxcStyle(); render();
      });
      segV.appendChild(b);
    });
    lineV.appendChild(segV);
    c2.appendChild(lineV);
    b2.appendChild(c2);
    main.appendChild(b2);

    main.appendChild(el('div', 'jnd-note',
      '小抄由原版脚本渲染，本应用只调整<b>位置与大小</b>，不改其取数与判定逻辑。' +
      '<br>贴底适合竖屏、贴顶适合横屏；「条」档最省地方，只看阶段与出杀足够用。'));
  }

  function pageShow() {
    main.appendChild(h('显示'));

    main.appendChild(row(IC.book, '原版小抄',
      dxcAlive() ? (S.dxcOpen
        ? '已展开 · ' + (S.dxcSide === 'free' ? '自由位置' : '贴' + (S.dxcSide === 'left' ? '左' : '右') + '显示')
        : '已收起 · 点「小抄」条展开')
        : '未检测到小抄 · 等游戏页加载完成',
      sw(S.dxcOpen, v => setDxc(v)),
      () => setDxc(!S.dxcOpen)));

    // 和小抄展开放在一起：两者都是「桌面上留什么」的开关。
    // 锦囊袋这颗管的是「显示 / 隐藏」：开着圆点和面板都在（默认），
    // 关了整个入口藏起来，脚本功能（技能提示 / 推荐用牌）照常在后台跑。
    main.appendChild(row(IC.pouch, '锦囊袋',
      daiReady() ? (S.daiOpen
        ? '显示中 · 武将技能提示、推荐用牌都在里面'
        : '已隐藏 · 打开开关即重新显示')
        : '还没载入 · 等游戏页加载完',
      sw(!!S.daiOpen, v => { S.daiOpen = v; saveS(); applyDaiVis(); render(); }),
      () => { S.daiOpen = !S.daiOpen; saveS(); applyDaiVis(); render(); }));

    main.appendChild(row(IC.show, '小抄宽度',
      S.dxcRatio > 0.02
        ? '占屏 ' + Math.round(S.dxcRatio * 100) + '% · 字会等比缩放'
        : '原始尺寸 · 字最清楚，占屏最多',
      (() => {
        const seg = el('div', 'jnd-seg');
        [[0, '原图'], [0.3, '条'], [0.38, '窄'], [0.46, '中'], [0.56, '宽']].forEach(([r, n]) => {
          const b = el('b', Math.abs((S.dxcRatio || 0) - r) < 0.02 ? 'on' : '', n);
          b.addEventListener('click', e => {
            e.stopPropagation();
            S.dxcRatio = r; saveS(); applyDxcStyle(); render();
          });
          seg.appendChild(b);
        });
        return seg;
      })()));

    main.appendChild(row(IC.show, '小抄贴边',
      '避开手牌和出牌按钮，按习惯放',
      (() => {
        const seg = el('div', 'jnd-seg');
        [['free', '自由'], ['left', '贴左'], ['right', '贴右']].forEach(([v, n]) => {
          const cur = S.dxcSide === 'left' || S.dxcSide === 'right' ? S.dxcSide : 'free';
          const b = el('b', cur === v ? 'on' : '', n);
          b.addEventListener('click', e => {
            e.stopPropagation();
            S.dxcSide = v; saveS(); applyDxcStyle(); render();
          });
          seg.appendChild(b);
        });
        return seg;
      })()));

    // 预览卡
    const prev = el('div', 'jnd-prev');
    prev.innerHTML =
      '<div class="card"><div class="cn">杀</div><em>' + (obs.sha || '—') + '</em><div class="lb">可出杀</div></div>' +
      '<div class="info"><div class="l">出杀计数器</div>' +
      '<div class="l" style="font-size:11.5px;color:#a1957d">当前阶段：<u>' + (obs.phrase || '未进入牌局') +
      '</u></div>' +
      '<div class="l" style="font-size:11px;color:#7f7767">数值取自小抄实时读取，无需额外权限</div></div>';
    main.appendChild(prev);

    main.appendChild(el('div', 'jnd-note',
      '小抄面板由原版脚本 <em>三国杀打小抄一将成名 v1.19.5</em> 渲染，本应用只做缩放与位置适配，' +
      '不改动其取数与判定逻辑。<br>' +
      '小抄底部的 <em>ID / 昵称</em> 要等进入牌局、收到自己的玩家资料后才会填上，' +
      '在大厅或房间里是空的，属正常现象。'));
  }

  /* ---------------- 明牌层（原版小抄的「明牌框框」） ---------------- */
  /**
   * 明牌框框是原版脚本自己画的一层：把 Laya 里每个座位的坐标投影到页面上，
   * 再在 #seat-dom-portal 里摆牌。它只在脚本初始化那一下建层，开关按下去
   * 若层还没建好（没进牌局 / Laya 还没起），就什么都不会发生——看着像「开关没用」。
   * 这里做两件事：把当前状态摊开给人看，以及替它把开关重启一次逼它重建。
   */
  function seatUiState() {
    const cb = document.getElementById('seatUISwitch');
    const mode = document.getElementById('seatRenderModeSwitch');
    const laya = window.Laya || (window.top && window.top.Laya) || null;
    let seats = 0;
    try {
      seats = document.querySelectorAll('#seatUI .sorderContainer,[data-daxiaochao-seat-dom-portal] .sorderContainer').length;
    } catch (_) {}
    return {
      has: !!cb,
      on: !!(cb && cb.checked),
      portal: !!document.getElementById('seat-dom-portal'),
      seats: seats,
      laya: !!laya,
      stage: !!(laya && laya.stage),
      mode: mode ? (mode.checked ? 'laya' : 'dom') : ''
    };
  }

  function seatUiLine() {
    const s2 = seatUiState();
    if (!s2.has) return '未加载 · 进入牌局后自动检测';
    if (!s2.on) return '开关已关闭 · 打开「明牌框框」后才会绘制';
    if (s2.seats) return '已绘制 ' + s2.seats + ' 个座次 · ' + (s2.mode === 'laya' ? '画在游戏层' : '覆盖层');
    if (!s2.laya || !s2.stage) return '引擎未就绪 · 进入牌局后再点「重绘」';
    if (!s2.portal) return '明牌层未建立 · 点「重绘」重建一次';
    return '层已建立，暂无座次 → 这局还没有人明牌，或点「重绘」';
  }

  let seatFixTried = false;
  /**
   * 进了牌局、开关也开着，却一个座次都没画出来：多半是脚本建层那一下 Laya 还没起来，
   * 建了个空层就再也不建了。每页只自动替用户按一次「重绘」，不反复折腾。
   */
  function seatUiAutoFix() {
    if (seatFixTried) return;
    const s2 = seatUiState();
    if (!s2.has || !s2.on || s2.seats > 0) return;
    if (!s2.laya || !s2.stage) return;
    if (!obs.seats.length) return;
    seatFixTried = true;
    log('seat ui autofix');
    seatUiRepaint();
  }

  function seatUiRepaint() {
    const cb = document.getElementById('seatUISwitch');
    if (!cb) { toast('未进入牌局，无法重绘'); return; }
    // 关一次再开一次：原版的 change 处理器会重新建层（Jn(true)）
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      toast('已重绘明牌层');
      setTimeout(() => { try { render(); } catch (_) {} }, 1000);
    }, 420);
  }

  /* ---------------- 小抄脚本源（换新版脚本不用重装 App） ---------------- */
  let srcOpen = false;

  function dxcInfo() {
    try { if (bridge && bridge.dxcInfo) return JSON.parse(bridge.dxcInfo()); } catch (_) {}
    return null;
  }

  function dxcVer() {
    const i = dxcInfo();
    if (!i) return '1.19.5';
    return String(i.ver || i.builtin || '1.19.5');
  }

  function dxcSrcLine() {
    const i = dxcInfo();
    if (!i) return '内置 v1.19.5 · 可在线换新版';
    if (i.custom) return '自定义 v' + (i.ver || '?') + ' · ' + (i.kb || '?') + ' KB';
    return '内置 v' + (i.builtin || i.ver || '1.19.5') + ' · ' + (i.kb || '?') + ' KB';
  }

  function dxcSrcCard() {
    const i = dxcInfo() || {};
    const box = el('div', 'jnd-src');
    box.appendChild(el('p', null,
      i.custom
        ? '当前加载的是自定义脚本（v' + (i.ver || '?') + '，' + (i.kb || '?') + ' KB），地址：' + (i.src || '')
        : '当前为内置脚本 v' + (i.builtin || i.ver || '1.19.5') + '。填入 .user.js 直链即可更换，重启后仍然生效。'));

    const inp = el('input', 'jnd-url');
    inp.type = 'text';
    inp.spellcheck = false;
    inp.placeholder = 'https://…/daxiaochao.user.js';
    inp.value = i.src || '';
    inp.addEventListener('focus', () => { try { if (bridge && bridge.ime) bridge.ime(true); } catch (_) {} });
    box.appendChild(inp);

    const ops = el('div', 'jnd-srcops');
    const go = el('b', 'pri', '在线更新');
    go.addEventListener('click', () => {
      const u = (inp.value || '').trim();
      if (!/^https?:\/\//i.test(u)) { toast('只接受 http(s) 直链地址'); return; }
      if (!bridge || !bridge.dxcSetSrc) { toast('仅应用内可用'); return; }
      try { bridge.dxcSetSrc(u); toast('正在下载脚本…'); } catch (_) { toast('调用失败'); }
    });
    const back = el('b', null, '恢复内置');
    back.addEventListener('click', () => {
      if (!bridge || !bridge.dxcSetSrc) { toast('仅应用内可用'); return; }
      try { bridge.dxcSetSrc(''); inp.value = ''; toast('已恢复内置脚本'); } catch (_) {}
    });
    ops.appendChild(go);
    ops.appendChild(back);
    box.appendChild(ops);
    box.appendChild(el('p', null,
      '脚本取自「三国杀打小抄一将成名」作者发布源，原样载入、不做改写。更新成功后当前页面会自动重载。'));
    return box;
  }

  function pageGame() {
    main.appendChild(h('牌局'));

    if (!obs.seats.length) {
      main.appendChild(el('div', 'jnd-empty', '尚未进入牌局<br><span class="jnd-kao">(・ω・)</span><br>进入对局后这里会显示座次手牌'));
    } else {
      const seats = el('div', 'jnd-seats');
      obs.seats.forEach(s => {
        const d = el('div', 'jnd-seat' + (s.i === 1 ? ' me' : ''));
        d.innerHTML = '<b>' + (s.i === 1 ? '我' : s.i + '号') + '</b><em>' + s.n + '</em>';
        seats.appendChild(d);
      });
      main.appendChild(seats);
    }

    main.appendChild(row(IC.show, '明牌层',
      seatUiLine(),
      el('div', 'jnd-btn', '重绘'), () => seatUiRepaint()));

    const hh = el('div', 'jnd-h', '<b>本机观察记录</b><s></s>');
    main.appendChild(hh);

    if (!obs.events.length) {
      main.appendChild(el('div', 'jnd-empty', '暂无记录<br><span class="jnd-kao">(・_・)</span><br>阶段与出杀变化会实时记在这里'));
    } else {
      const list = el('div', 'jnd-log');
      obs.events.slice(0, 30).forEach(e => {
        list.appendChild(el('div', 'jnd-ev' + (e.hi ? ' hi' : ''),
          '<time>' + e.t + '</time><span>' + e.text + '</span>'));
      });
      main.appendChild(list);
    }

    main.appendChild(el('div', 'jnd-note',
      '记录仅保存在本机内存，退出即清空。内容全部来自页面已渲染的信息，不读取游戏进程。'));
  }

  function pageTrick() {
    main.appendChild(h('妙计'));

    main.appendChild(row(IC.hand, '武将手牌速查', '展开小抄，直接看各家手牌与明牌',
      el('div', 'jnd-btn', IC.arrowR), () => { setDxc(true); }));

    main.appendChild(row(IC.dot, '阶段 / 出杀常驻', '顶部细条常亮，随时可见',
      sw(S.chip, v => { S.chip = v; saveS(); updateChip(); })));

    main.appendChild(row(IC.refresh, '重新载入小抄', '小抄消失或数据不刷新时使用',
      el('div', 'jnd-btn', IC.arrowR), () => {
        if (bridge && bridge.reinject) { bridge.reinject(); toast('正在重新注入…'); }
        else toast('仅应用内可用');
      }));

    main.appendChild(el('div', 'jnd-note',
      '本版本<em>不提供</em>快捷指令与自动操作。所有「妙计」均为查看与本机显示，不会代打。'));
  }

  function pagePlug() {
    main.appendChild(h('插件'));

    const ul = window.__JND_UNIFIED_LOGIN;
    const di = dxcInfo() || {};
    main.appendChild(row(IC.book, '三国杀打小抄一将成名',
      dxcAlive() ? 'v' + (di.ver || '1.19.5') + ' · 运行中' : 'v' + (di.ver || '1.19.5') + ' · 未检测到面板',
      el('div', 'jnd-btn', dxcAlive() ? '已载入' : '等待')));

    main.appendChild(row(IC.plug, '体验优化综合插件',
      (synInfo().on ? 'v' + (synInfo().ver || '1.2.3') + ' · 运行中' : '未检测到 · 等游戏页加载'),
      el('div', 'jnd-btn', synInfo().on ? '已载入' : '等待')));

    const dai = daiInfo();
    main.appendChild(row(IC.book, '新三国杀 锦囊袋',
      dai.on ? ('v' + dai.ver + ' · 运行中') : '未检测到 · 等游戏页加载',
      el('div', 'jnd-btn', dai.on ? '已载入' : '等待')));

    main.appendChild(row(IC.plug, '统一登录器',
      ul ? 'v' + (ul.version || '1.x') + ' · 已就绪' : '未载入',
      el('div', 'jnd-btn', ul ? '已就绪' : '不可用')));

    main.appendChild(row(IC.show, 'GM 桥',
      bridge ? '原生 HTTP / 存储代理已连接' : '未连接（仅浏览器内有效）',
      el('div', 'jnd-btn', bridge ? '正常' : '断开')));

    main.appendChild(row(IC.refresh, '重新注入全部脚本',
      '面板、小抄、登录器一起重载',
      el('div', 'jnd-btn', IC.arrowR), () => {
        if (bridge && bridge.reinject) { bridge.reinject(); toast('正在重新注入…'); }
      }));

    main.appendChild(el('div', 'jnd-note',
      '小抄与登录器均以<em>原版脚本</em>载入，未做任何逻辑修改；本应用只负责注入与手机端适配。'));
  }

  function pageMisc() {
    main.appendChild(h('综合'));

    /* 键盘点不出来的应急入口：有的机器/页面点输入框不弹，这里强抬一次 */
    main.appendChild(row(IC.kb, '调出系统键盘',
      '输入框点不出键盘时，用这一下强制调起',
      el('div', 'jnd-btn', '调出'), () => popKeyboard()));

    main.appendChild(row(IC.refresh, '线路加速', accelLine(),
      sw((accelState() || {}).on !== false, v => {
        if (bridge && bridge.accelSet) { try { bridge.accelSet(v); } catch (_) {} }
        toast(v ? '加速已开启' : '加速已关闭');
        setTimeout(render, 400);
      })));

    main.appendChild(row(IC.plug, '体验优化综合插件',
      (synInfo().on ? 'v' + (synInfo().ver || '?') + ' · 运行中' : '未检测到 · 等游戏页加载'),
      el('div', 'jnd-btn', synInfo().on ? '运行中' : '等待')));

    main.appendChild(el('div', 'jnd-note',
      '红点清理、屏蔽对手发言、屏蔽皮肤特效、屏蔽武将台词都在<b>综合插件</b>里：' +
      '游戏内打开设置或锦囊袋悬浮球，找到「综合插件」面板即可开关。' +
      '这些开关只影响本机显示，不向服务器发送任何数据。'));

    main.appendChild(row(IC.sun, '保持屏幕常亮', '对局中不自动熄屏',
      sw(!!S.keepAwake, v => {
        S.keepAwake = v; saveS();
        if (bridge && bridge.setKeepAwake) { try { bridge.setKeepAwake(v); } catch (_) {} }
      })));

    main.appendChild(el('div', 'jnd-note',
      '这些开关只影响本机显示，不向服务器发送任何数据。'));
  }

  function accelState() {
    try {
      if (bridge && bridge.accelStatus) return JSON.parse(bridge.accelStatus());
    } catch (_) {}
    return null;
  }

  function accelLine() {
    const a = accelState();
    if (!a) return '状态不可用';
    if (!a.on) return '已关闭 · 全部直连';
    const px = a.vpn ? '系统 VPN 已接管'
      : (a.proxy ? ('代理 ' + a.proxy) : 'DoH 优选 · 未检测到本机代理');
    const ms = (typeof a.ms === 'number' && a.ms > 0) ? ('最快 ' + a.ms + ' ms') : '未测速';
    return px + ' · ' + ms;
  }

  /* ---------------- 检查更新 ----------------
   * 锦囊袋的「版本」页签在手机上被隐藏了（内容与这里重复），
   * 所以把手助本体与锦囊袋插件的更新检查都收到这一处：
   * 一次检查两处，有新版就弹确认，确认后下载。 */
  const UP_DAI = 'https://sh-sgs.net/script/jinnangdai.version.json';
  const UP_APP = 'https://raw.githubusercontent.com/user7050030/jinnang-mobile/main/version.json';
  // 小抄脚本走作者自己的发布源（脚本里的 @updateURL / @downloadURL）
  const UP_DXC_META = 'https://cdn.jsdelivr.net/gh/lkfun/lkfun.github.io@main/script/daxiaochao.meta.js';
  const UP_DXC_URL = 'https://cdn.jsdelivr.net/gh/lkfun/lkfun.github.io@main/script/daxiaochao.user.js';
  const DAI_BUILTIN = '1.7.3';
  let upBusy = false;

  function netText(url) {
    return new Promise(resolve => {
      if (typeof GM_xmlhttpRequest === 'function') {
        try {
          GM_xmlhttpRequest({
            method: 'GET', url, timeout: 15000, responseType: 'text',
            onload: r => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: String(r.responseText || '') }),
            onerror: r => resolve({ ok: false, status: 0, error: String((r && r.error) || 'network') })
          });
          return;
        } catch (_) {}
      }
      if (window.fetch) {
        window.fetch(url, { cache: 'no-store' })
          .then(r => r.text().then(t => resolve({ ok: r.ok, status: r.status, text: t })))
          .catch(e => resolve({ ok: false, status: 0, error: String(e) }));
        return;
      }
      resolve({ ok: false, status: 0, error: 'no-fetch' });
    });
  }

  /* 版本比较：1.7.10 > 1.7.9，返回 1 / 0 / -1 */
  function cmpVer(a, b) {
    const pa = String(a || '').match(/\d+/g) || [];
    const pb = String(b || '').match(/\d+/g) || [];
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function daiLocalVer() {
    try {
      const st = bridge && bridge.daiUpdateState ? JSON.parse(bridge.daiUpdateState()) : null;
      if (st && st.cached && st.version) return String(st.version);
    } catch (_) {}
    return DAI_BUILTIN;
  }

  /* 调原生异步任务：原生完成后回调 window.__gmResolve(id, json)，
     gm-shim 里给这类任务留了 __jndNative 兜底表。 */
  function nativeTask(name, args, timeoutMs) {
    return new Promise(resolve => {
      if (!bridge || typeof bridge[name] !== 'function') {
        resolve({ ok: false, error: '宿主不支持' });
        return;
      }
      const id = 'jndtask' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      window.__jndNative = window.__jndNative || {};
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        delete window.__jndNative[id];
        resolve({ ok: false, error: '超时' });
      }, timeoutMs || 180000);
      window.__jndNative[id] = v => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v || { ok: false, error: '空响应' });
      };
      try {
        bridge[name].apply(bridge, [id].concat(args || []));
      } catch (e) {
        done = true;
        clearTimeout(timer);
        delete window.__jndNative[id];
        resolve({ ok: false, error: String(e && e.message || e) });
      }
    });
  }

  function closeDlg() {
    const old = document.getElementById('jnd-dlg');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function showUpdateDialog(items, btnEl) {
    closeDlg();
    const dlg = el('div');
    dlg.id = 'jnd-dlg';
    const box = el('div', 'box');
    box.innerHTML =
      '<div class="ttl">发现新版本</div>' +
      '<div class="sub">确认后立即下载并替换，无需手动重装。</div>' +
      items.map(it => '<div class="item"><span>' +
        (it.kind === 'dai' ? '锦囊袋插件' : it.kind === 'dxc' ? '小抄脚本' : '三国杀手机助手') +
        '</span><span class="arw">v' + it.from + ' →</span><b>v' + it.to + '</b></div>').join('') +
      '<div class="act"><div class="btn" data-a="no">稍后</div>' +
      '<div class="btn main" data-a="go">立即更新</div></div>';
    dlg.appendChild(box);
    root.appendChild(dlg);
    dlg.classList.add('on');

    box.querySelector('[data-a=no]').addEventListener('click', () => {
      closeDlg();
      if (btnEl) btnEl.textContent = '检查';
    });
    box.querySelector('[data-a=go]').addEventListener('click', () => {
      const goBtn = box.querySelector('[data-a=go]');
      goBtn.textContent = '下载中…';
      goBtn.style.pointerEvents = 'none';
      box.querySelector('[data-a=no]').style.display = 'none';

      // 串行：先把锦囊袋下完，再装本体（装机会杀进程，放最后）
      let p = Promise.resolve();
      items.forEach(it => {
        p = p.then(() => {
          if (it.kind === 'dxc') {
            goBtn.textContent = '更新小抄…';
            try {
              if (bridge && bridge.dxcSetSrc) {
                bridge.dxcSetSrc(it.url);
                toast('小抄已更新到 v' + it.to + '，页面重载中');
              } else {
                toast('宿主不支持在线换脚本');
              }
            } catch (_) { toast('调用失败'); }
            return true;
          }
          if (it.kind === 'dai') {
            goBtn.textContent = '下载插件…';
            return nativeTask('daiUpdate', [it.url, it.sha, it.to], 300000).then(r => {
              if (r && r.ok) {
                toast('锦囊袋已更新到 v' + it.to + '，重开游戏生效');
                return true;
              }
              toast('插件更新失败：' + ((r && r.error) || '未知'));
              return false;
            });
          }
          goBtn.textContent = '下载本体…';
          return nativeTask('installApk', [it.url], 300000).then(r => {
            if (r && r.ok) toast('安装包已下载，请在系统弹窗里确认安装');
            else toast('本体更新失败：' + ((r && r.error) || '未知'));
            return false;
          });
        });
      });
      p.then(() => {
        closeDlg();
        if (btnEl) btnEl.textContent = '检查';
        render();
      });
    });
  }

  function checkUpdate(btnEl) {
    if (upBusy) return;
    upBusy = true;
    if (btnEl) btnEl.textContent = '检查中…';

    const daiFrom = daiLocalVer();
    const appFrom = (() => {
      // 清单里的连字符写法（2.9.6-beta）展示时统一成带空格的形式
      const norm = v => String(v).replace(/^v/i, '').trim()
        .replace(/-/g, ' ')
        .replace(/\b(alpha|beta|rc)\b/gi, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
      try { return bridge && bridge.appVersion ? norm(bridge.appVersion()) : VERSION; }
      catch (_) { return VERSION; }
    })();

    // 小抄脚本：读作者 meta.js 里的 @version
    let dxcFrom = '1.19.5';
    try { const di = dxcInfo(); if (di) dxcFrom = String(di.ver || di.builtin || dxcFrom); } catch (_) {}

    const dxcJob = netText(UP_DXC_META).then(r => {
      if (!r.ok) return null;
      const m = String(r.text).match(/@version\s+([0-9][0-9.]*)/);
      if (!m) return null;
      const to = m[1];
      if (cmpVer(to, dxcFrom) > 0) {
        return { kind: 'dxc', from: dxcFrom, to, url: UP_DXC_URL };
      }
      return null;
    }).catch(() => null);

    const daiJob = netText(UP_DAI).then(r => {
      if (!r.ok) return null;
      try {
        const j = JSON.parse(r.text);
        const to = String(j.version || '');
        const rt = j.runtime || {};
        if (to && cmpVer(to, daiFrom) > 0 && rt.url) {
          return { kind: 'dai', from: daiFrom, to, url: String(rt.url), sha: String(rt.sha256 || '') };
        }
      } catch (_) {}
      return null;
    }).catch(() => null);

    const appJob = netText(UP_APP).then(r => {
      if (!r.ok) return null;
      try {
        const j = JSON.parse(r.text);
        const to = String(j.version || '');
        const url = String(j.url || j.apk || '');
        if (to && cmpVer(to, appFrom) > 0 && url) {
          return { kind: 'app', from: appFrom, to, url };
        }
      } catch (_) {}
      return null;
    }).catch(() => null);

    Promise.all([daiJob, appJob, dxcJob]).then(list => {
      upBusy = false;
      const ups = list.filter(Boolean);
      if (btnEl) btnEl.textContent = '检查';
      if (!ups.length) {
        toast('已是最新：手机助手 v' + appFrom + '，锦囊袋 v' + daiFrom + '，小抄 v' + dxcFrom);
        return;
      }
      showUpdateDialog(ups, btnEl);
    });
  }

  function pageVer() {
    main.appendChild(h('版本'));
    const updBtn = el('div', 'jnd-btn', '检查');
    updBtn.addEventListener('click', e => { e.stopPropagation(); checkUpdate(updBtn); });
    main.appendChild(row(IC.refresh, '检查更新',
      '手机助手 v' + VERSION + ' · 锦囊袋 v' + daiLocalVer() + ' · 小抄 v' + dxcVer(), updBtn));

    main.appendChild(row(IC.ver, '三国杀手机助手', 'v' + VERSION + '　构建 2026-11',
      el('div', 'jnd-btn', '当前')));

    // 下过插件新版才出现：给一条回滚路，坏版不至于只能重装应用
    let daiSt = null;
    try { daiSt = bridge && bridge.daiUpdateState ? JSON.parse(bridge.daiUpdateState()) : null; } catch (_) {}
    if (daiSt && daiSt.cached) {
      main.appendChild(row(IC.undo, '锦囊袋更新包',
        'v' + (daiSt.version || '?') + '　' + Math.max(1, Math.round((daiSt.bytes || 0) / 1048576)) + ' MB　重开游戏生效',
        el('div', 'jnd-btn', '回滚'), () => {
          if (bridge && bridge.daiRevert) { try { bridge.daiRevert(); return; } catch (_) {} }
          toast('宿主不支持回滚');
        }));
    }

    main.appendChild(row(IC.refresh, '线路加速', accelLine(),
      el('div', 'jnd-btn', '测速'), () => {
        if (bridge && bridge.accelRefresh) { try { bridge.accelRefresh(); } catch (_) {} }
        toast('正在测速…');
        setTimeout(render, 2600);
        setTimeout(render, 5200);
      }));

    main.appendChild(row(IC.book, '原版小抄', '三国杀打小抄一将成名　作者 哈哈（lkfun）',
      el('div', 'jnd-btn', '致谢')));

    main.appendChild(row(IC.refresh, '小抄脚本源', dxcSrcLine(),
      el('div', 'jnd-btn', srcOpen ? '收起' : '更换'), () => { srcOpen = !srcOpen; render(); }));
    if (srcOpen) main.appendChild(dxcSrcCard());

    main.appendChild(row(IC.plug, '统一登录器', '作者 暗鹊',
      el('div', 'jnd-btn', '致谢')));

    main.appendChild(row(IC.person, '手机版维护', 'by Tihaon7050030',
      el('div', 'jnd-btn', IC.arrowR), () => {
        const u = 'https://github.com/user7050030';
        if (bridge && bridge.openUrl) { try { bridge.openUrl(u); return; } catch (_) {} }
        toast(u);
      }));

    main.appendChild(el('div', 'jnd-note',
      '<em>法律声明</em><br>本应用为非官方第三方工具，与游戏运营方及各渠道无隶属关系。' +
      '不含外挂、破解、自动出牌与充值代付；所有数据仅在本机呈现，不上传、不修改。' +
      '使用风险由使用者自行承担。'));
  }

  /* ---------------- 功能实现 ---------------- */
  function toast(m) {
    if (bridge && bridge.toast) { try { bridge.toast(m); return; } catch (_) {} }
    log(m);
  }

  /* 网页账密登录回执：原生弹层把登录完成后的回调地址交到这里，
     再喂给统一登录器的 webFinish 完成整条登录链路。 */
  window.__JND_WEB_LOGIN__ = (provider, href) => {
    const UL = window.__JND_UNIFIED_LOGIN;
    if (!UL || typeof UL.webFinish !== 'function') return;
    // 先给个即时反馈：回调已经拿到了，接下来是换取登录凭据，别让人以为没反应
    if (qrBox) {
      const st = qrBox.querySelector('#jnd-qr-state');
      if (st) { st.style.color = '#e8d09a'; st.textContent = '账号已登录，正在进入游戏…'; }
    }
    qrEntered = 0;
    const s = String(href || '');
    const result = { href: s };
    const pick = k => { const m = new RegExp('[?#&]' + k + '=([^&#]+)').exec(s); return m ? decodeURIComponent(m[1]) : ''; };
    try {
      if (provider === 'oppo') { const c = pick('code'); if (c) result.code = c; }
      if (provider === 'vivo') {
        const uid = pick('subOpenId') || pick('uid');
        const tk = pick('openToken') || pick('sessionToken');
        if (uid) result.subOpenId = uid;
        if (tk) result.openToken = tk;
      }
      UL.webFinish(provider, result);
    } catch (e) {
      toast('网页登录失败：' + ((e && e.message) || e));
    }
  };

  /* ---------------- 综合插件状态 ----------------
   * 红点清理 / 屏蔽对手发言 / 屏蔽皮肤特效 / 屏蔽武将台词这些功能
   * 全部由「三国杀·体验优化综合插件」提供（随包注入，游戏内自带设置面板，
   * 入口在锦囊袋的圆点/悬浮球），本面板不再各写一套。 */
  function synInfo() {
    const s = window.__SGS_SYNTHESIZE__;
    if (!s || s === true) return s ? { on: true, ver: '' } : { on: false, ver: '' };
    return { on: true, ver: String(s.version || '') };
  }

  /* 锦囊袋 1.7.3：武将技能提示 / 推荐用牌等由它提供，9.8MB 的原版脚本随包带着，
   * 游戏页 fetch 本地拦截地址后 eval。这里只是看它有没有起来。 */
  function daiInfo() {
    const w = window;
    if (!w.__JND_RUNTIME_STARTED && !w.__JND && !w.__JND_BOOTSTRAP) return { on: false, ver: '1.7.3' };
    let ver = '1.7.3';
    try {
      const b = w.__JND_BOOTSTRAP;
      if (b && typeof b === 'object') ver = String(b.version || b.runtimeVersion || ver);
    } catch (_) {}
    return { on: true, ver: ver };
  }

  /**
   * 强抬系统键盘。
   * WebView 里没有可编辑元素拿到焦点时，原生的 showSoftInput 基本会被系统吞掉，
   * 所以要先用一个隐形输入框把焦点要过来，再让原生抬键盘。
   * 这是「输入框点不出键盘」时的应急通道，正常点击输入框仍然走焦点自动抬键盘那条路。
   */
  function popKeyboard() {
    let host = document.getElementById('jnd-ime-host');
    if (!host) {
      host = el('input');
      host.id = 'jnd-ime-host';
      host.type = 'text';
      host.setAttribute('autocapitalize', 'off');
      host.setAttribute('autocomplete', 'off');
      host.setAttribute('autocorrect', 'off');
      host.setAttribute('spellcheck', 'false');
      (document.body || document.documentElement).appendChild(host);
    }
    try { host.value = ''; } catch (_) {}
    let focused = false;
    try { host.focus({ preventScroll: true }); focused = true; }
    catch (_) { try { host.focus(); focused = true; } catch (_) {} }
    if (bridge && bridge.ime) {
      try { bridge.ime(true); } catch (_) {}
      toast('已请求调出键盘');
      return;
    }
    // 浏览器里调试：焦点在输入框上，键盘会自己出来
    if (focused) toast('键盘已调出'); else toast('仅应用内可用');
  }

  /* ---------------- 点按代替悬浮 ---------------- */
  /**
   * 房间座位的操作菜单（坐下/添加AI/关闭/邀请）是鼠标悬浮（hover）才弹的，
   * 触屏没有 hover，等于点不出来。这里在按下游戏画布的瞬间先合成一次
   * 「鼠标挪到按下点」的 move 事件：hover 效果先出现，菜单弹出并保持；
   * 点别处时鼠标跟着挪走，菜单自然关闭。原生点击照常发，不影响别的操作。
   */
  function tapHover() {
    const cv = document.getElementById('layaCanvas') || document.querySelector('canvas');
    if (!cv || cv.__jndHover) return;
    cv.__jndHover = 1;
    cv.addEventListener('pointerdown', e => {
      try {
        const o = { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
          pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
        cv.dispatchEvent(new PointerEvent('pointermove', o));
        cv.dispatchEvent(new MouseEvent('mousemove',
          { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
        cv.dispatchEvent(new MouseEvent('mouseover',
          { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
      } catch (_) {}
    }, true);
  }
  setInterval(tapHover, 2000);

  /* ---------------- 视图同步 ---------------- */
  let syncPending = false;
  function syncViewport() {
    if (!root || syncPending) return;
    syncPending = true;
    requestAnimationFrame(() => {
      syncPending = false;
      if (!root) return;
      const w = VW(), h = VH();
      root.style.width = w + 'px';
      root.style.height = h + 'px';
      root.style.left = '0px';
      root.style.top = '0px';
      root.classList.add('on');
      applyDxcStyle();
      watchDai();
    });
  }

  /* ---------------- 显隐 ---------------- */
  function open() {
    build();
    drawerOpen = true;
    if (root) root.classList.add('open');
    applyDxcStyle();
    render();
    try { if (bridge && bridge.setPanelOpen) bridge.setPanelOpen(true); } catch (_) {}
  }
  function close() {
    if (root) root.classList.remove('open');
    drawerOpen = false;
    applyDxcStyle();
    try { if (bridge && bridge.setPanelOpen) bridge.setPanelOpen(false); } catch (_) {}
  }
  window.__JND_CLOSE__ = close;
  window.__JND_OPEN__ = open;

  /* ---------------- 扫码浮层 ---------------- */
  const PROVIDER_NAME = {
    qq: 'WEGAME QQ', wx: 'WEGAME 微信', bilibili: 'BILIBILI', steam: 'STEAM',
    oppo: 'OPPO', xiaomi: '小米', vivo: 'vivo', huawei: '华为', honor: '荣耀'
  };
  // 渠道名一律大写：STEAM / WEGAME 这类缩写跟界面上其它地方保持一致，
  // 免得同一个渠道在首页写 STEAM、到了扫码框变成 steam。
  const upperName = v => String(v || '').replace(/[a-z]+/g, m => m.toUpperCase());
  const QR_ERROR = {
    PROVIDER_UNAVAILABLE: '该渠道暂不可用',
    NETWORK_ERROR: '连不上 STEAM 认证服务',
    QR_EXPIRED: '二维码已过期，请重新获取',
    REDIRECT_TRANSPORT_UNAVAILABLE: '接口异常，请重试',
    // STEAM 这条链路的失败点很多，逐段给出人话，别一律「登录未完成」
    STEAM_REDIRECT_UNAVAILABLE: '连不上 STEAM 认证服务',
    STEAM_PREFLIGHT_SESSION_PRESENT: 'STEAM 会话冲突，先退出其它窗口的 Steam 登录',
    STEAM_RESULT_MISSING: 'STEAM 没有返回登录结果，重新获取',
    STEAM_TOKEN_SCHEMA_CHANGED: 'STEAM 改了登录接口，需要更新版本',
    STEAM_OAUTH_FORM_UNAVAILABLE: 'STEAM 授权页加载失败，重新获取',
    STEAM_OAUTH_FORM_SCHEMA_CHANGED: 'STEAM 改了授权页，需要更新版本',
    STEAM_GAME_CALLBACK_UNAVAILABLE: 'STEAM 登录成功，但游戏没接住凭据',
    STEAM_QR_ENCODING_FAILED: '二维码生成失败，重新获取',
    STEAM_SESSION_COOKIE_UNAVAILABLE: '拿不到 Steam 登录态，重新获取',
    // 403 基本不是 Steam 给的：多半是 DNS 被污染、请求打到了别人的服务器
    HTTP_403: '认证请求被打到了假地址（DNS 污染）'
  };

  // Steam 的认证域名在国内网络会被间歇性掐断，光说「网络失败」没用，要给下一步
  const QR_HINT = {
    NETWORK_ERROR: '当前网络拦截了 STEAM 认证服务。先开加速器（如 UU）或代理，再点「重新获取」',
    REQUEST_TIMEOUT: '请求超时，多半也是被网络拦截，开代理后再试',
    PROVIDER_UNAVAILABLE: '该渠道暂时拿不到登录态，可换一个渠道',
    STEAM_REDIRECT_UNAVAILABLE: '认证域名被拦截：先开加速器 / VPN 再点「重新获取」，国内直连基本拿不到二维码',
    STEAM_GAME_CALLBACK_UNAVAILABLE: '游戏页没加载完会导致这一步失败。确认牌局页能正常进入（不是卡在「准备加载中」）后，再点「立即进入」',
    HTTP_403: 'STEAM 认证域名被网络拦截，这次连的是污染地址。开加速器（需覆盖模拟器 / 本机）或代理后再点「重新获取」'
  };

  // 网络类失败会自己再试一次：Steam 的 TLS 断连是间歇性的，重试常常就好了
  const QR_NET_RETRY = /NETWORK|TIMEOUT|REDIRECT_UNAVAILABLE|^ERR_/;

  let qrBox = null, qrUnsub = null, qrProvider = '', qrStartedAt = 0, qrRetried = false, qrWatch = null;
  let qrEntered = 0, qrAuto = 0;
  let lanLast = '';        // 已经推到局域网页面上的那张码

  /**
   * 扫码成功之后，统一登录器不会自己跳转——它在登录框里摆了个「进入游戏」按钮，
   * 点下去才把凭据交给客户端并 location.assign 到牌局页。
   * 我们的二维码浮层正好压在它上面，玩家看不到也点不到，于是就卡在「正在进入游戏」。
   * 这里替玩家点一下；找不到按钮（比如登录框还没渲染完）就交给「立即进入」手动重试。
   */
  function qrEnterButton() {
    const list = ['#jnd-wg-game-choice .goto-btn', '.login-box .goto-btn', '#jnd-wg-game-choice input[type=button]', '.goto-btn'];
    for (const sel of list) {
      const b = document.querySelector(sel);
      if (b && !b.disabled && b.offsetParent !== null) return b;
    }
    return null;
  }

  function qrTryEnter() {
    // 优先走登录器自己的进入接口：卡片是它渲染的，切渠道/隐藏时点 DOM 会 miss
    const UL = window.__JND_UNIFIED_LOGIN;
    if (UL && typeof UL.enter === 'function') {
      try {
        if (UL.enter()) { log('qr enter api'); return true; }
      } catch (_) {}
    }
    const b = qrEnterButton();
    if (!b) { log('qr enter miss'); return false; }
    try { b.click(); } catch (_) { return false; }
    log('qr enter click');
    return true;
  }

  function destroyQrOverlay() {
    if (qrWatch) { clearTimeout(qrWatch); qrWatch = null; }
    if (qrUnsub) { try { qrUnsub(); } catch (_) {} qrUnsub = null; }
    if (qrBox && qrBox.parentNode) qrBox.parentNode.removeChild(qrBox);
    qrBox = null;
  }

  /* ---------------- 投到另一块屏幕：局域网只读页面 ---------------- */

  function lanInfo() {
    try { if (bridge && bridge.qrShareInfo) return JSON.parse(bridge.qrShareInfo()); } catch (_) {}
    return { on: false, url: '', port: 0, ip: '' };
  }

  /** 起服务并塞进这张码；返回给用户看的地址，失败返回空串 */
  function lanStart(src, box) {
    if (!src) return '';
    let title = '', sub = '';
    try {
      if (box) {
        const t = box.querySelector('#jnd-qr-title');
        const s2 = box.querySelector('#jnd-qr-sub');
        title = t ? t.textContent : '';
        sub = s2 ? s2.textContent : '';
      }
    } catch (_) {}
    let u = '';
    try { if (bridge && bridge.qrShare) u = bridge.qrShare(src, title, sub) || ''; } catch (_) {}
    return u;
  }

  function lanStop() {
    try { if (bridge && bridge.qrShareStop) bridge.qrShareStop(); } catch (_) {}
  }

  /** 扫码浮层里的地址块：只在投送时展开 */
  function lanPaint() {
    if (!qrBox) return;
    const box = qrBox.querySelector('#jnd-qr-lanbox');
    const url = qrBox.querySelector('#jnd-qr-lanurl');
    const btn = qrBox.querySelector('#jnd-qr-lan');
    if (!box || !url) return;
    const i = lanInfo();
    if (i.on && i.url) {
      box.classList.add('on');
      url.textContent = i.url;
      if (btn) { btn.classList.add('on'); btn.textContent = '停止投送'; }
    } else {
      box.classList.remove('on');
      url.textContent = '';
      if (btn) { btn.classList.remove('on'); btn.textContent = '投到电脑'; }
    }
  }

  // 画中画里只剩这块：底不透明，缩窗后才不会透出游戏画面
  window.__JND_PIP__ = function (src) {
    // 画中画里只看这块码：先把整页缩放临时摘掉。
    // 留着 html{zoom:f} 的话，vw/vh 会被再缩一次，遮罩只盖得住左上角一块。
    const de = document.documentElement;
    if (window.__JND_PIP_ZOOM__ == null) {
      window.__JND_PIP_ZOOM__ = de.style.getPropertyValue('zoom') || '';
      window.__JND_PIP_ZOOM_PRI__ = de.style.getPropertyPriority('zoom') || '';
    }
    try {
      de.style.setProperty('zoom', '1', 'important');
    } catch (_) {}

    let box = document.getElementById('jnd-pip');
    if (!box) {
      box = el('div');
      box.id = 'jnd-pip';
      (document.body || document.documentElement).appendChild(box);
    }
    box.innerHTML = '<img alt=""><div class="t">对着这块码扫</div>';
    const img = box.querySelector('img');
    if (img) {
      img.src = src;
      const W = Math.max(window.innerWidth || 0, 320);
      const H = Math.max(window.innerHeight || 0, 320);
      const side = Math.round(Math.min(W, H) * 0.62);
      img.style.width = side + 'px';
      img.style.height = side + 'px';
    }
    box.classList.add('on');
    log('pip show ' + (window.innerWidth | 0) + 'x' + (window.innerHeight | 0));
  };
  window.__JND_PIP_EXIT__ = function () {
    const box = document.getElementById('jnd-pip');
    if (box && box.parentNode) box.parentNode.removeChild(box);
    if (window.__JND_PIP_ZOOM__ != null) {
      try {
        const de = document.documentElement;
        if (window.__JND_PIP_ZOOM__) {
          de.style.setProperty('zoom', window.__JND_PIP_ZOOM__, window.__JND_PIP_ZOOM_PRI__ || '');
        } else {
          de.style.removeProperty('zoom');
        }
      } catch (_) {}
      window.__JND_PIP_ZOOM__ = null;
    }
    log('pip exit');
  };

  function buildQrOverlay() {
    const wrap = el('div');
    wrap.id = 'jnd-qr';
    wrap.innerHTML =
      '<div class="box">' +
      '<div class="ttl" id="jnd-qr-title">扫码登录</div>' +
      '<div class="qr"><div class="wait" id="jnd-qr-wait">正在获取二维码…</div><img id="jnd-qr-img" alt=""></div>' +
      '<div class="sub" id="jnd-qr-sub"></div>' +
      '<div class="st" id="jnd-qr-state"></div>' +
      '<div class="ops"><div id="jnd-qr-cancel">取消</div><div id="jnd-qr-retry" class="rt">重新获取</div></div>' +
      '<div class="vcamrow"><div class="vcam" id="jnd-qr-web">网页登入</div><div class="vcam" id="jnd-qr-save">存图</div><div class="vcam" id="jnd-qr-lan">投到电脑</div></div>' +
      '<div class="lanbox" id="jnd-qr-lanbox">' +
      '<div class="lanurl" id="jnd-qr-lanurl"></div>' +
      '<div class="lanhint">同一 WiFi 下用电脑或另一台手机打开上面地址，把扫码器对着那块屏幕</div>' +
      '<div class="lanstop" id="jnd-qr-lanstop">停止投送</div>' +
      '</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(wrap);
    qrBox = wrap;

    // 网页登入：应用内打开渠道的账号密码登录页（跟锦囊微端同一套网页协议，
    // 统一登录器 webURL 生成地址、原生弹层 WebView 展示）。登录完成后回调地址
    // 被原生拦下交给 __JND_WEB_LOGIN__ → webFinish，直接完成登录，不用扫码。
    wrap.querySelector('#jnd-qr-web').addEventListener('click', () => {
      const UL = window.__JND_UNIFIED_LOGIN;
      if (!UL || typeof UL.webURL !== 'function') { toast('统一登录器未就绪，稍后再试'); return; }
      // provider 以登录器快照为准：qrProvider 在个别入口（从面板直接开门）可能是空的
      let provider = qrProvider;
      try {
        const snap = typeof UL.get === 'function' ? UL.get() : null;
        if (snap && snap.provider) provider = snap.provider;
      } catch (_) {}
      const webList = (UL.webProviders || []).slice();
      if (!provider) { toast('请先选一个渠道再点网页登入'); return; }
      if (webList.length && webList.indexOf(provider) < 0) {
        toast((PROVIDER_NAME[provider] || provider) + ' 没有账号密码登录页，只能用扫码');
        return;
      }
      toast('正在打开' + (PROVIDER_NAME[provider] || provider) + '网页登录…');
      Promise.resolve(UL.webURL(provider)).then(u => {
        if (!u) { toast('该渠道暂不支持网页登录'); return; }
        if (bridge && bridge.webLogin) { try { bridge.webLogin(provider, u); return; } catch (_) {} }
        try { window.open(u, '_blank'); } catch (_) { toast('仅应用内可用'); }
      }).catch(e => toast('打开失败：' + ((e && e.message) || e)));
    });

    // 存成 PNG：可放进模拟器自带的摄像头图源，或者打印出来用
    wrap.querySelector('#jnd-qr-save').addEventListener('click', () => {
      const img = wrap.querySelector('#jnd-qr-img');
      const src = img && img.getAttribute('src');
      if (!src) { toast('二维码尚未生成'); return; }
      let r = '';
      try { if (bridge && bridge.qrSave) r = bridge.qrSave(src); } catch (_) {}
      toast(r ? '已存到「' + r + '」' : '保存失败');
    });

    // 投到另一块屏幕：手机自己扫不到自己，让电脑/平板上的浏览器显示这张码
    wrap.querySelector('#jnd-qr-lan').addEventListener('click', () => {
      const img = wrap.querySelector('#jnd-qr-img');
      const src = img && img.getAttribute('src');
      if (!src) { toast('二维码尚未生成'); return; }
      if (lanInfo().on) { lanStop(); lanPaint(); toast('已停止投送'); return; }
      const u = lanStart(src, wrap);
      if (!u) { toast('投送没起来 · 检查是否连了 WiFi'); return; }
      lanPaint();
      toast('用电脑浏览器打开 ' + u);
    });
    wrap.querySelector('#jnd-qr-lanstop').addEventListener('click', () => {
      lanStop();
      lanPaint();
      toast('已停止投送 · 那台设备刷新就失效');
    });
    lanPaint();

    wrap.querySelector('#jnd-qr-cancel').addEventListener('click', () => {
      const p = qrProvider;
      try { if (window.__JND_UNIFIED_LOGIN) window.__JND_UNIFIED_LOGIN.cancel(); } catch (_) {}
      window.__JND_LOGIN_CANCELED__ = p;
      destroyQrOverlay();
      log('qr cancel ' + p);
    });
    wrap.querySelector('#jnd-qr-retry').addEventListener('click', (ev) => {
      const self = ev.currentTarget;
      if (self.dataset && self.dataset.mode === 'enter') {
        // 扫码已完成，只差那一下「进入游戏」
        if (!qrTryEnter()) {
          const s = qrBox && qrBox.querySelector('#jnd-qr-sub');
          if (s) s.textContent = '未找到「进入游戏」按钮，请点「重新获取」';
        }
        return;
      }
      const p = qrProvider;
      if (!p) return;
      delete window.__JND_LOGIN_CANCELED__;
      qrRetried = true;
      window.__JND_START_LOGIN__(p, true);
    });
  }

  function paintQr(snap) {
    if (!qrBox) return;
    const img = qrBox.querySelector('#jnd-qr-img');
    const wait = qrBox.querySelector('#jnd-qr-wait');
    const sub = qrBox.querySelector('#jnd-qr-sub');
    const state = qrBox.querySelector('#jnd-qr-state');
    const retry = qrBox.querySelector('#jnd-qr-retry');
    const title = qrBox.querySelector('#jnd-qr-title');

    const name = upperName(PROVIDER_NAME[snap && snap.provider] || (snap && snap.provider) || qrProvider);
    title.textContent = (name ? name + ' ' : '') + '扫码登录';

    // 统一登录器的快照里图叫 qr（PNG data URL），老版本叫 image —— 两个都认，
    // 之前只认 image，于是二维码明明拿到了，框里却一直转「正在获取二维码…」。
    const qrSrc = snap && (snap.qr || snap.image);
    if (qrSrc) {
      if (img.getAttribute('src') !== qrSrc) img.src = qrSrc;
      img.style.display = 'block';
      wait.style.display = 'none';
      window.__JND_LAST_QR__ = qrSrc;
      // 投送中就把新码同步过去：这类登录码两分钟左右就换一张
      if (lanInfo().on && lanLast !== qrSrc) {
        lanLast = qrSrc;
        try { if (bridge && bridge.qrShare) bridge.qrShare(qrSrc, title.textContent, ''); } catch (_) {}
      }
    }
    sub.textContent = snap && snap.text ? snap.text : '请用对应渠道 App 扫码';

    if (snap && snap.error) {
      const code = snap.error.code || '';
      const known = QR_ERROR[code];
      state.style.color = '#e0755f';
      // 认不出来的错误码也照样摆出来（小字），否则只能回一句「登录未完成」，没法查
      state.textContent = known || snap.error.message || (/EXPIRED/.test(code) ? '二维码已过期' : '登录未完成');
      sub.textContent = QR_HINT[code] || (code ? '错误码：' + code : '');
      // 上一轮可能是「已扫码」状态，按钮文字得复位，不然点它会去点「进入游戏」
      retry.textContent = '重新获取';
      delete retry.dataset.mode;
      img.style.display = 'none';
      wait.style.display = 'flex';
      wait.textContent = '二维码不可用';
      retry.style.display = 'flex';
      log('qr error ' + qrProvider + ' ' + code);

      // 网络类失败自动再拉一次：Steam 的 TLS 是间歇性断的，重试往往就过了
      if (QR_NET_RETRY.test(code) && qrAuto < 1) {
        qrAuto++;
        log('qr auto retry ' + qrProvider);
        setTimeout(() => {
          if (qrBox) window.__JND_START_LOGIN__(qrProvider, true);
        }, 1500);
      }
    } else if (snap && snap.stage === 'ready') {
      state.style.color = '#8fc47a';
      state.textContent = '扫码成功，正在进入游戏';
      sub.textContent = '未自动跳转时，点下方「立即进入」';
      img.style.display = 'none';
      wait.style.display = 'flex';
      wait.textContent = '已扫码';
      retry.textContent = '立即进入';
      retry.dataset.mode = 'enter';
      retry.style.display = 'flex';
      if (!qrEntered) {
        qrEntered = 1;
        log('qr ready ' + qrProvider);
        // 登录框/凭据可能还在渲染，多点几次；调用成功后页面自己会跳走，
        // 浮层也顺手收掉——它盖在登录框上面，留着只会挡住「进入游戏」卡片。
        [300, 1200, 2600].forEach(ms => setTimeout(() => {
          if (!qrBox) return;
          if (qrTryEnter()) setTimeout(() => { if (qrBox) destroyQrOverlay(); }, 1200);
        }, ms));
        // 兜底：6 秒还没跳走，就把浮层收掉，让玩家自己点页面上的「进入游戏」，
        // 总比一直盖着一块「正在进入游戏」强。
        const at = location.href;
        setTimeout(() => {
          if (qrBox && location.href === at) { log('qr enter fallback'); destroyQrOverlay(); }
        }, 6000);
      }
    } else {
      state.style.color = '#b7a58d';
      state.textContent = '';
      retry.textContent = '重新获取';
      delete retry.dataset.mode;
      retry.style.display = 'none';
      if (qrSrc) log('qr image ' + qrProvider);
    }
  }

  window.__JND_START_LOGIN__ = function (provider, isRetry) {
    if (!isRetry && window.__JND_LOGIN_CANCELED__ === provider) return 'canceled';
    const ul = window.__JND_UNIFIED_LOGIN;
    // 统一登录器只挂在登录页。已经进牌局、或页面根本没有登录器时，
    // 别再造一块二维码浮层盖上去——那会让人以为「登录没成功，还在二维码界面」。
    if (!ul || typeof ul.start !== 'function') return 'pending';
    build();
    qrProvider = provider;
    if (!isRetry) { qrRetried = false; qrAuto = 0; }
    qrEntered = 0;
    qrStartedAt = Date.now();
    destroyQrOverlay();
    buildQrOverlay();
    paintQr({ provider: provider, text: '正在获取二维码…' });
    try {
      qrUnsub = ul.subscribe(paintQr);
      Promise.resolve(ul.start(provider)).catch(e => {
        paintQr({ provider: provider, error: { message: String((e && e.message) || e) } });
      });
    } catch (e) {
      paintQr({ provider: provider, error: { message: String(e) } });
    }
    log('qr start ' + provider + (isRetry ? ' (retry)' : ''));

    // 兜底：12 秒还是一片空白就别让人对着「正在获取二维码…」干等了，
    // 直接把最可能的原因（网络把 Steam 认证掐了）摆出来 + 给「重新获取」。
    clearTimeout(qrWatch);
    qrWatch = setTimeout(() => {
      if (!qrBox) return;
      const img = qrBox.querySelector('#jnd-qr-img');
      const st = qrBox.querySelector('#jnd-qr-state');
      if (img && img.style.display === 'block') return;
      if (st && st.textContent) return;
      paintQr({ provider: qrProvider, error: { code: 'REQUEST_TIMEOUT', message: '二维码一直没回来' } });
      log('qr watchdog ' + qrProvider);
    }, 12000);
    return 'started';
  };

  window.__JND_QR_CLOSE__ = destroyQrOverlay;

  /* ---------------- 对外接口 ---------------- */
  window.__JND_OPEN__ = () => open();
  window.__JND_CLOSE__ = () => close();
  window.__JND_TOGGLE__ = () => {
    try {
      build();
      if (root && root.classList.contains('open')) close(); else open();
      return !!(root && root.classList.contains('open'));
    } catch (e) { log('toggle err ' + e); return false; }
  };
  window.__JND_QC__ = () => { setDxc(!S.dxcOpen); return S.dxcOpen; };
  window.__JND_DXC_RECT__ = () => {
    const p = dxcEl();
    if (!p) {
      if (kid.rect) return JSON.stringify({ l: kid.rect.l, t: kid.rect.t, w: kid.rect.w, h: kid.rect.h, vw: kid.vw, vh: kid.vh, frame: 1 });
      return 'none';
    }
    const r = p.getBoundingClientRect();
    return JSON.stringify({ l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vw: Math.round(VW()), vh: Math.round(VH()) });
  };
  window.__JND_STATUS__ = () => JSON.stringify({
    dxc: dxcAlive(), open: S.dxcOpen, ratio: S.dxcRatio,
    ul: !!window.__JND_UNIFIED_LOGIN, inj: !!window.__JND_MOBILE__,
    sha: obs.sha, phrase: obs.phrase
  });

  /* ---------------- 启动 ---------------- */
  function boot() {
    try { build(); } catch (e) { log('build err ' + e); }
    if (S.dxcOpen) waitDxc(8000);
    applyView();

    // 点输入框就把键盘抬起来：游戏登录框在顶层或子帧里都可能出现。
    // 只对文本类输入抬键盘 —— 综合插件的 ON/OFF 开关是 checkbox，
    // 点它也会 focusin，若照样 ime(true) 就会「切个开关弹键盘」。
    const TEXTY = { text: 1, search: 1, password: 1, email: 1, number: 1, tel: 1, url: 1 };
    document.addEventListener('focusin', e => {
      const t = e.target;
      if (!t || !t.tagName) return;
      const tag = t.tagName.toUpperCase();
      if (tag === 'INPUT') {
        const ty = (t.type || '').toLowerCase();
        if (!TEXTY[ty]) {
          // 非文本输入（checkbox/radio/button…）不该持有焦点：点了就甩掉，顺手收键盘
          try { t.blur(); } catch (_) {}
          try { if (bridge && bridge.ime) bridge.ime(false); } catch (_) {}
          return;
        }
      } else if (tag !== 'TEXTAREA' && !t.isContentEditable) {
        return;
      }
      try { if (bridge && bridge.ime) bridge.ime(true); } catch (_) {}
    }, true);

    // 反过来：点非输入控件（开关、页签、按钮）时先主动 blur。
    // 安卓 WebView 按返回键只收起键盘、输入框仍保持焦点，此后任何一次点击
    // 都会让系统把键盘重新弹出来 —— 表现就是「切个开关也弹键盘」。
    document.addEventListener('mousedown', e => {
      const t = e.target;
      if (!t || !t.tagName) return;
      const tag = t.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) {
        // checkbox 等非文本输入：按下去不许抢焦点（click 照常切换，功能不变）
        if (tag === 'INPUT' && !TEXTY[(t.type || '').toLowerCase()]) {
          try { e.preventDefault(); } catch (_) {}
        } else {
          return;
        }
      }
      const a = document.activeElement;
      if (!a || a === document.body || !a.tagName) return;
      const at = a.tagName.toUpperCase();
      if (at !== 'INPUT' && at !== 'TEXTAREA' && !a.isContentEditable) return;
      try {
        a.blur();
        if (bridge && bridge.ime) bridge.ime(false);
      } catch (_) {}
    }, true);
    if (S.keepAwake && bridge && bridge.setKeepAwake) { try { bridge.setKeepAwake(true); } catch (_) {} }
    setInterval(tick, 1200);
    setTimeout(tick, 600);

    // 别的域打开过面板改了图源，这里载入时不主动拉，等扫码页取到码再同步

    // 小抄容器稍后出现，自动应用适配
    const mo = new MutationObserver(() => {
      if (dxcEl() && !dxcEl().__jndFit) {
        dxcEl().__jndFit = true;
        applyDxcStyle();
        log('dxc found, adapt applied');
        try { mo.disconnect(); } catch (_) {}   // 拿到就收，别一直监听整棵 DOM
      }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

    // 渠道服的牌局在子帧里：原生把脚本注进那个帧，这里只负责把显示参数推下去。
    // （以前那套「把 iframe 提升成顶层」会被 4399 判成异常会话直接弹回落地页，已废弃）
    pushKidCfg();
    setTimeout(pushKidCfg, 2500);

    // 只绑一次。原来每次 window resize 都会往 visualViewport 上再挂一个监听，
    // 手机上软键盘一弹就成倍触发 -> 主线程雪崩 -> 崩进程。
    ['resize', 'orientationchange'].forEach(k => window.addEventListener(k, syncViewport));
    if (vv()) {
      vv().addEventListener('resize', syncViewport);
      vv().addEventListener('scroll', syncViewport);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.__JND_REBUILD__ = () => {
    built = false;
    try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch (_) {}
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
    boot();
  };
})();
