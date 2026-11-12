/* ===========================================================================
 * 锦囊袋入口屏蔽器（运行时）
 *
 * 原则：不改 jinnangdai.user.js（9.8MB 混淆脚本）与 sgs-synthesize 的任何字节，
 *      只在页面渲染后隐藏入口。插件本体、更新功能、插件市场全部保留原样。
 *
 * 屏蔽清单：
 *   1) 锦囊袋侧栏「频道」页签 + 频道页（反馈频道 / QQ 群号）
 *   2) 锦囊袋侧栏「版本」页签 + 版本页（更新交给手机助手的版本页统一管）
 *   3) 插件页底部「QQ 频道」跳转
 *   4) 妙计页「快捷指令」入口 + 其翻开后的整块面板（银两补购、副本扫荡等付费自动操作）
 *   5) 综合插件「面板形态」切换，并把形态锁死在「并入锦囊袋」
 *
 * 明确不动：插件市场的所有条目、其余妙计项。
 * ======================================================================== */
(function () {
  var STYLE_ID = 'jnd-shield-css';
  var META_KEY = 'sgs-synthesize:settings:v2';

  var CSS = [
    /* 1. 频道：侧栏页签与对应面板 */
    'nav.jnd-sidebar .jnd-tab[data-pane="channel"]',
    '.jnd-pane[data-pane="channel"]',
    /* 2. 版本：侧栏页签与对应面板（更新统一走手机助手版本页） */
    'nav.jnd-sidebar .jnd-tab[data-pane="version"]',
    '.jnd-pane[data-pane="version"]',
    /* 3. 插件页底部的 QQ 频道入口 */
    '.jnd-plugin-more',
    /* 4. 综合插件「面板形态」标签与切换按钮组（只命中紧跟标签的那一组） */
    '.sgs-syn-mode-label',
    '.sgs-syn-mode-label + .sgs-syn-seg',
    /* 5. 运行时逐个打标的节点 */
    '[data-jnd-shield]'
  ].join(',') + '{display:none !important;}';

  /* 侧栏修正：页签少了两个之后，「综合」容易被面板底边裁掉（横屏矮窗口尤甚）。
     允许侧栏滚动 + 把页签压扁一点，保证五个页签全部落在面板里。 */
  var CSS_SIDEBAR =
    'nav.jnd-sidebar{overflow-y:auto !important;scrollbar-width:none !important;}' +
    'nav.jnd-sidebar::-webkit-scrollbar{display:none !important;}' +
    'nav.jnd-sidebar .jnd-tab{padding-top:5px !important;padding-bottom:5px !important;min-height:0 !important;flex:0 0 auto !important;}';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS + CSS_SIDEBAR;
    (document.head || document.documentElement).appendChild(st);
  }

  function norm(s) {
    return (s == null ? '' : String(s)).replace(/[\s\u3000]+/g, '');
  }

  var modeLocked = false;

  /* 面板形态锁死「并入锦囊袋」：只改一次，之后不再碰 localStorage，
     避免用户手动切过又被反复拉回。 */
  function lockPanelMode() {
    if (modeLocked) return;
    try {
      var raw = localStorage.getItem(META_KEY);
      if (!raw) { modeLocked = true; return; }
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (o.panelMode && o.panelMode !== 'integrated') {
          o.panelMode = 'integrated';
          localStorage.setItem(META_KEY, JSON.stringify(o));
        }
      }
      modeLocked = true;
    } catch (e) { modeLocked = true; }
  }

  function hide(el) {
    if (el && !el.getAttribute('data-jnd-shield')) el.setAttribute('data-jnd-shield', '1');
  }

  /* 妙计页里的入口按钮（.jnd-collection > .jnd-collection-name） */
  function sweepCollections() {
    var list = document.querySelectorAll('.jnd-collection:not([data-jnd-shield])');
    for (var i = 0; i < list.length; i++) {
      var name = list[i].querySelector('.jnd-collection-name');
      if (norm(name ? name.textContent : list[i].textContent).indexOf('快捷指令') === 0) hide(list[i]);
    }
  }

  /* 翻开后的整块面板（.jnd-screen > .jnd-screen-head > .jnd-screen-title） */
  function sweepScreens() {
    var titles = document.querySelectorAll('.jnd-screen-title');
    for (var i = 0; i < titles.length; i++) {
      if (norm(titles[i].textContent) !== '快捷指令') continue;
      var sec = titles[i].closest ? titles[i].closest('.jnd-screen') : null;
      if (!sec) continue;
      var card = sec.closest ? sec.closest('.jnd-flip') : null;
      hide(card || sec);
    }
  }

  /* 综合插件里「面板设置」这行小标题也随之隐藏，避免只剩孤立标题 */
  function sweepSynSections() {
    var list = document.querySelectorAll('.sgs-syn-sec:not([data-jnd-shield])');
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].textContent) === '面板设置') hide(list[i]);
    }
  }

  /* 若刷新时停在已被隐藏的页（频道 / 版本），切回「显示」 */
  var HIDDEN_PANES = { channel: 1, version: 1 };
  function escapeHiddenPane() {
    var panel = document.getElementById('jnd-panel');
    var cur = panel ? panel.getAttribute('data-active-pane') : null;
    var stuck = !!(cur && HIDDEN_PANES[cur]);
    if (!stuck) {
      var act = document.querySelector('nav.jnd-sidebar .jnd-tab.active');
      var p = act && act.getAttribute('data-pane');
      stuck = !!(p && HIDDEN_PANES[p]);
    }
    if (!stuck) return;
    var disp = document.querySelector('nav.jnd-sidebar .jnd-tab[data-pane="display"]');
    if (disp) { try { disp.click(); } catch (e) {} }
  }

  function sweep() {
    ensureStyle();
    try {
      sweepCollections();
      sweepScreens();
      sweepSynSections();
      escapeHiddenPane();
      lockPanelMode();
    } catch (e) {}
  }

  var timer = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = 0; sweep(); }, 180);
  }

  sweep();

  var mo = new MutationObserver(schedule);
  var start = function () {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, true);
  } else {
    start();
  }
  window.addEventListener('load', schedule, true);

  window.__JND_SHIELD__ = { on: true, ver: '1.0', sweep: sweep };
})();
