// ==UserScript==
// @name         锦囊妙计·手机端锦囊袋
// @namespace    https://github.com/user7050030/jinnang-mobile
// @version      2.1.0
// @description  手机端游戏内面板：小抄速查、一键去红点、屏蔽对手发言与台词、整屏截图。不含快捷指令。
// @author       Tihaon7050030
// @match        *://*.sanguosha.com/10/*
// @match        *://*.sanguosha.com/x/*
// @match        *://*.sanguosha.com/10th/*
// @match        *://web.sanguosha.com/login/*
// @match        *://game.4399iw2.com/yxxsgs/*
// @match        *://my.4399.com/yxsgs/*
// @match        *://h5.7k7k.com/*
// @match        *://qqgame.qq.com/webappframe/*
// @match        *://*.qqopenapp.com/*
// @match        *://sgsszn.wan.360.cn/*
// @match        *://wan.baidu.com/*
// @exclude      *://*.sanguosha.com/220/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  if (window.__JND_MOBILE__) {
    // 上下文还在但面板被页面刷掉了（SPA 重建 / 整页重绘）→ 直接重挂
    try {
      if (!document.getElementById('jnd-root') && window.__JND_REBUILD__) window.__JND_REBUILD__();
    } catch (_) {}
    return;
  }
  window.__JND_MOBILE__ = true;

  const VERSION = '2.1.0';
  const KEY = 'jnd-mobile:v2';
  const bridge = window.SgsMobileBridge || null;

  const S = Object.assign({
    grayscale: false,
    blockChat: false,
    blockVoice: false,
    keepAwake: false,
    ballX: -1,
    ballY: -1,
  }, readStore());

  function readStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
  }

  /* ============================ 小抄数据 ============================ */
  // 速查表：键为分类，每条 {n 名称, t 一句话效果, k 关键词}
  const CHEAT = {
    basic: [
      { n: '杀', t: '出牌阶段对攻击范围内一名角色使用。目标不出闪则受 1 点伤害。每回合限一次（有连弩除外）', k: 'sha 攻击 伤害' },
      { n: '闪', t: '响应杀（或万箭齐发）时使用，抵消该杀的效果', k: 'shan 防御 抵消' },
      { n: '桃', t: '出牌阶段回复 1 点体力；或自己/他人濒死时使用，回复 1 点体力', k: 'tao 回血 濒死 救援' },
      { n: '酒', t: '出牌阶段使用，本回合下一张杀伤害 +1；或濒死时当桃用（每回合限一次）', k: 'jiu 增伤 濒死' },
      { n: '火杀', t: '属性杀。造成火焰伤害，可触发铁索连环传导与藤甲加伤', k: 'huosha 火 属性' },
      { n: '雷杀', t: '属性杀。造成雷电伤害，可触发铁索连环传导', k: 'leisha 雷 属性' },
    ],
    trick: [
      { n: '无懈可击', t: '抵消一张锦囊牌的效果，或抵消另一张无懈可击。可在任意时机连锁使用', k: 'wuxie 反制 抵消' },
      { n: '过河拆桥', t: '弃置一名其他角色区域里（手牌/装备/判定区）的一张牌', k: 'guohe 拆牌 弃置' },
      { n: '顺手牵羊', t: '获得距离 1 以内一名其他角色区域里的一张牌', k: 'shunshou 偷牌 获得' },
      { n: '无中生有', t: '摸两张牌', k: 'wuzhong 摸牌 过牌' },
      { n: '决斗', t: '与一名其他角色轮流打出杀，先不出杀的一方受 1 点伤害（由目标先出）', k: 'juedou 拼杀' },
      { n: '借刀杀人', t: '令一名有武器的角色对其攻击范围内你指定的角色使用杀；不出则把武器交给你', k: 'jiedao 逼杀 武器' },
      { n: '桃园结义', t: '所有存活角色各回复 1 点体力', k: 'taoyuan 群体回血' },
      { n: '五谷丰登', t: '亮出等同存活角色数的牌，从你开始每人依次选一张获得', k: 'wugu 群体摸牌' },
      { n: '南蛮入侵', t: '所有其他角色依次需打出杀，否则受 1 点伤害', k: 'nanman 群体 南蛮' },
      { n: '万箭齐发', t: '所有其他角色依次需打出闪，否则受 1 点伤害', k: 'wanjian 群体 万箭' },
      { n: '铁索连环', t: '横置或重置一至两名角色；也可重铸（弃置此牌摸一张）', k: 'tiesuo 横置 重铸 传导' },
      { n: '火攻', t: '目标展示一张手牌，你可弃一张同花色手牌，对其造成 1 点火焰伤害', k: 'huogong 火 弃牌' },
      { n: '兵粮寸断', t: '延时锦囊，置于目标判定区。判定非梅花则跳过其摸牌阶段', k: 'bingliang 延时 判定 摸牌' },
      { n: '乐不思蜀', t: '延时锦囊，置于目标判定区。判定非红桃则跳过其出牌阶段', k: 'lebu 延时 判定 出牌' },
      { n: '闪电', t: '延时锦囊。判定为黑桃 2~9 则受 3 点雷电伤害，否则移到下家判定区', k: 'shandian 延时 判定 雷' },
      { n: '水淹七军', t: '令一名角色弃置装备区里的所有牌，或受到 1 点伤害（由其选择）', k: 'shuiyan 军争' },
      { n: '兵临城下', t: '令一名角色选择：弃置两张手牌，或受到 1 点伤害', k: 'binglin 军争' },
    ],
    equip: [
      { n: '诸葛连弩', t: '武器 范围 1：出牌阶段使用杀无次数限制', k: 'lianu 连弩 无限杀' },
      { n: '青釭剑', t: '武器 范围 2：杀无视目标防具', k: 'qinggang 破防' },
      { n: '雌雄双股剑', t: '武器 范围 2：杀指定异性目标时，其需弃一张手牌，否则你摸一张', k: 'cixiong 性别' },
      { n: '寒冰剑', t: '武器 范围 2：杀造成伤害时可防止此伤害，改为弃置目标两张牌', k: 'hanbing 弃牌' },
      { n: '古锭刀', t: '武器 范围 2：杀造成伤害时，若目标无手牌则伤害 +1', k: 'guding 加伤' },
      { n: '青龙偃月刀', t: '武器 范围 3：杀被闪抵消后，可再对其使用一张杀', k: 'qinglong 追击' },
      { n: '丈八蛇矛', t: '武器 范围 3：可将两张手牌当杀使用或打出', k: 'zhangba 两张牌 当杀' },
      { n: '贯石斧', t: '武器 范围 3：杀被闪抵消时，可弃两张牌令此杀依然造成伤害', k: 'guanshi 强命' },
      { n: '方天画戟', t: '武器 范围 4：使用最后一张手牌杀时，可额外指定至多两个目标', k: 'fangtian 多目标' },
      { n: '麒麟弓', t: '武器 范围 5：杀造成伤害时，可弃置目标装备区的一匹马', k: 'qilin 拆马' },
      { n: '朱雀羽扇', t: '武器 范围 4：可将普通杀当火杀使用', k: 'zhuque 火杀 转化' },
      { n: '八卦阵', t: '防具：需要使用闪时可先判定，若为红色则视为使用了闪', k: 'bagua 防具 判定 闪' },
      { n: '仁王盾', t: '防具：锁定技，黑色的杀对你无效', k: 'renwang 防具 黑杀' },
      { n: '藤甲', t: '防具：锁定技，南蛮入侵/万箭齐发/普通杀对你无效；受到火焰伤害 +1', k: 'tengjia 防具 火 加伤' },
      { n: '白银狮子', t: '防具：锁定技，防止大于 1 点的伤害；失去此装备时回复 1 点体力', k: 'baiyin 防具 减伤 回血' },
      { n: '+1 马（防御马）', t: '坐骑：其他角色计算与你的距离 +1（绝影/的卢/爪黄飞电等）', k: 'jia ma 防御 距离' },
      { n: '-1 马（进攻马）', t: '坐骑：你计算与其他角色的距离 -1（赤兔/大宛/紫骍等）', k: 'jian ma 进攻 距离' },
    ],
    rule: [
      { n: '距离计算', t: '座位间距取顺时针与逆时针的较小值；加算双方坐骑修正，武器范围用于判断杀能否指定目标', k: 'juli 距离 范围' },
      { n: '判定流程', t: '亮出牌堆顶一张牌作为判定牌，结算后置入弃牌堆；司马懿鬼才/张角鬼道可改判', k: 'panding 判定 改判' },
      { n: '濒死结算', t: '体力 ≤ 0 时进入濒死，从当前回合角色开始依次询问是否使用桃，无人救援则死亡', k: 'binsi 濒死 求桃' },
      { n: '铁索连环传导', t: '横置角色受到属性伤害时，伤害在横置角色间传导并重置；传导伤害可继续触发', k: 'tiesuo 属性 传导' },
      { n: '无懈可击时机', t: '在锦囊牌生效前使用；无懈本身也可被无懈，形成连锁。延时锦囊在判定区时可被无懈', k: 'wuxie 时机' },
      { n: '翻面', t: '武将牌翻面：翻到背面则跳过你的下一个回合，之后翻回正面', k: 'fanmian 翻面 跳过' },
      { n: '摸牌阶段', t: '默认摸两张；受兵粮寸断、武将技能影响', k: 'mopai 摸牌 阶段' },
      { n: '回合阶段顺序', t: '准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束', k: 'huige 阶段 流程' },
      { n: '弃牌阶段', t: '手牌数超过当前体力值时，弃至等于体力值', k: 'qipai 弃牌 手牌上限' },
      { n: '酒的使用限制', t: '每回合限用一次；用于濒死自救时不限次数（部分规则版本）', k: 'jiu 限制' },
    ],
    hero: [
      { n: '刘备', t: '仁德：出牌阶段将手牌交给其他角色，累计两张后回复 1 点体力｜激将：主公技，需使用杀时令蜀势力角色代打', k: 'liubei 仁德 激将' },
      { n: '关羽', t: '武圣：可将红色牌当杀使用或打出', k: 'guanyu 武圣 红牌' },
      { n: '张飞', t: '咆哮：锁定技，出牌阶段使用杀无次数限制', k: 'zhangfei 咆哮 无限杀' },
      { n: '赵云', t: '龙胆：可将杀当闪、闪当杀使用或打出', k: 'zhaoyun 龙胆 互换' },
      { n: '马超', t: '马术：锁定技，你计算与其他角色距离 -1｜铁骑：使用杀指定目标后可判定，红色则其不能使用闪', k: 'machao 马术 铁骑' },
      { n: '黄忠', t: '烈弓：使用杀指定目标后，若其手牌数不小于你或不大于你的攻击范围，则此杀不可被闪避', k: 'huangzhong 烈弓 强命' },
      { n: '诸葛亮', t: '观星：准备阶段观看牌堆顶 X 张牌（X 为存活角色数且至多 5）并重新排序｜空城：锁定技，无手牌时不能成为杀或决斗的目标', k: 'zhugeliang 观星 空城' },
      { n: '黄月英', t: '集智：使用非延时锦囊牌时可摸一张｜奇才：锁定技，使用锦囊无距离限制', k: 'huangyueying 集智 奇才' },
      { n: '曹操', t: '奸雄：受到伤害后可获得造成伤害的牌｜护驾：主公技，需使用闪时可令魏势力角色代打', k: 'caocao 奸雄 护驾' },
      { n: '司马懿', t: '反馈：受到伤害后可获得伤害来源一张牌｜鬼才：判定牌生效前可打出一张手牌代替', k: 'simayi 反馈 鬼才 改判' },
      { n: '夏侯惇', t: '刚烈：受到伤害后可判定，非红桃则伤害来源选择弃两张手牌或受到 1 点伤害', k: 'xiahoudun 刚烈 反伤' },
      { n: '张辽', t: '突袭：摸牌阶段可放弃摸牌，改为获得至多两名其他角色各一张手牌', k: 'zhangliao 突袭 偷牌' },
      { n: '许褚', t: '裸衣：摸牌阶段可少摸一张，本回合杀或决斗造成的伤害 +1', k: 'xuchu 裸衣 加伤' },
      { n: '郭嘉', t: '天妒：判定牌生效后可获得之｜遗计：受到 1 点伤害后可摸两张牌并分配给任意角色', k: 'guojia 天妒 遗计' },
      { n: '甄姬', t: '倾国：可将黑色手牌当闪使用或打出｜洛神：准备阶段可判定，黑色则获得此牌并可重复', k: 'zhenji 倾国 洛神' },
      { n: '孙权', t: '制衡：出牌阶段限一次，弃置任意张牌并摸等量的牌｜救援：主公技，吴势力角色使用桃时你额外回复 1 点', k: 'sunquan 制衡 救援' },
      { n: '周瑜', t: '英姿：摸牌阶段多摸一张｜反间：出牌阶段限一次，令一名角色选择花色后获得你一张手牌，花色不符则受 1 点伤害', k: 'zhouyu 英姿 反间' },
      { n: '黄盖', t: '苦肉：出牌阶段可失去 1 点体力并摸两张牌（可多次）', k: 'huanggai 苦肉 卖血' },
      { n: '甘宁', t: '奇袭：可将黑色牌当过河拆桥使用', k: 'ganning 奇袭 拆牌' },
      { n: '吕蒙', t: '克己：若出牌阶段未使用或打出杀，可跳过弃牌阶段', k: 'lvmeng 克己 囤牌' },
      { n: '陆逊', t: '谦逊：锁定技，不能成为顺手牵羊与乐不思蜀的目标｜连营：失去最后一张手牌时可摸一张', k: 'luxun 谦逊 连营' },
      { n: '大乔', t: '国色：可将方块牌当乐不思蜀使用｜流离：成为杀的目标时可弃一张牌，将此杀转移给攻击范围内的其他角色', k: 'daqiao 国色 流离' },
      { n: '孙尚香', t: '结姻：出牌阶段限一次，弃两张手牌令一名受伤男性角色与你各回复 1 点体力｜枭姬：失去装备区一张牌时可摸两张', k: 'sunshangxiang 结姻 枭姬' },
      { n: '貂蝉', t: '离间：出牌阶段限一次，弃一张牌令两名男性角色决斗｜闭月：结束阶段可摸一张牌', k: 'diaochan 离间 闭月' },
      { n: '吕布', t: '无双：锁定技，你使用杀时目标需连续使用两张闪；你使用决斗时对方需连续打出两张杀', k: 'lvbu 无双 强命' },
      { n: '华佗', t: '急救：回合外可将红色牌当桃使用｜青囊：出牌阶段限一次，弃一张手牌令一名角色回复 1 点体力', k: 'huatuo 急救 青囊 回血' },
      { n: '张角', t: '雷击：使用或打出闪后可令一名角色判定，黑色则受 2 点雷电伤害｜鬼道：可打出黑色牌代替判定牌｜黄天：主公技，群势力角色可给你闪或闪电', k: 'zhangjiao 雷击 鬼道 黄天' },
    ],
  };

  const CATS = [
    { id: 'basic', label: '基本牌' },
    { id: 'trick', label: '锦囊' },
    { id: 'equip', label: '装备' },
    { id: 'rule', label: '规则' },
    { id: 'hero', label: '武将' },
  ];

  /* ============================ 样式 ============================ */
  const CSS = `
/* 用 :where() 把重置压到零特异性，页面全局样式进不来，也不会盖掉下面各元素自己的间距 */
:where(#jnd-root),:where(#jnd-root) * {box-sizing:border-box;margin:0;padding:0;border:0}
#jnd-root,#jnd-root *{font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif!important;-webkit-tap-highlight-color:transparent;line-height:1.45}
#jnd-root{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;
  width:100vw!important;height:100vh!important;z-index:2147483000!important;pointer-events:none;font-size:14px;color:#f3e3c8}

/* 悬浮球 */
#jnd-ball{position:fixed;width:52px;height:52px;border-radius:50%;pointer-events:auto;
  background:radial-gradient(circle at 34% 28%,#c2452f,#6d1a12 62%,#3d0d08);
  box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 0 1.5px rgba(227,187,122,.45) inset,0 0 14px rgba(227,187,122,.18);
  display:flex;align-items:center;justify-content:center;touch-action:none;
  transition:transform .16s ease,opacity .2s ease;z-index:2}
#jnd-ball:active{transform:scale(.9)}
#jnd-ball svg{width:26px;height:26px;display:block}
#jnd-ball .badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;border-radius:9px;background:#e3bb7a;
  color:#4a1208;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 3px}

/* 抽屉 */
#jnd-mask{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1;
  background:rgba(0,0,0,.55);opacity:0;transition:opacity .22s}
#jnd-sheet{position:absolute;left:0;right:0;bottom:0;max-height:88vh;transform:translateY(102%);z-index:2;
  visibility:hidden;
  transition:transform .28s cubic-bezier(.22,.8,.3,1),visibility 0s .28s;
  background:linear-gradient(178deg,#1a100c 0%,#120b08 55%,#0c0705 100%);
  border-top:1px solid rgba(227,187,122,.28);border-radius:22px 22px 0 0;
  box-shadow:0 -10px 40px rgba(0,0,0,.65);display:flex;flex-direction:column;
  padding-bottom:calc(env(safe-area-inset-bottom) + 10px);pointer-events:auto;overflow:hidden}
#jnd-root.open #jnd-sheet{transform:translateY(0);visibility:visible;
  transition:transform .28s cubic-bezier(.22,.8,.3,1),visibility 0s 0s}
#jnd-root.open #jnd-mask{opacity:1}
/* 横屏时内容不拉满整行，居中限宽；背景仍是整屏 */
.jnd-hd,.jnd-tabs,.jnd-body{width:100%;max-width:760px;margin-left:auto;margin-right:auto}

.jnd-hd{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
.jnd-hd .ttl{font-size:16px;font-weight:600;letter-spacing:2px;color:#f0d7a8}
.jnd-hd .ver{font-size:10px;color:#7b6a55;letter-spacing:.5px;margin-top:3px}
.jnd-hd .sp{flex:1}
.jnd-x{width:34px;height:34px;border-radius:11px;background:rgba(255,244,225,.06);display:flex;align-items:center;justify-content:center;
  color:#c9b393;font-size:17px;pointer-events:auto}
.jnd-x:active{background:rgba(255,244,225,.12)}

/* Tab */
.jnd-tabs{display:flex;gap:6px;padding:0 14px 10px}
.jnd-tab{flex:1;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;
  font-size:14px;color:#9c8a72;background:rgba(255,244,225,.045);letter-spacing:1px;transition:.18s}
.jnd-tab.on{background:linear-gradient(160deg,rgba(227,187,122,.22),rgba(227,187,122,.10));
  color:#f5e2bb;box-shadow:0 0 0 1px rgba(227,187,122,.35) inset;font-weight:600}

/* 内容区 */
.jnd-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 14px 8px;min-height:0}
.jnd-body::-webkit-scrollbar{width:0}

/* 搜索 */
.jnd-search{display:flex;align-items:center;gap:8px;height:42px;border-radius:12px;padding:0 12px;margin-bottom:10px;
  background:rgba(255,244,225,.06);border:1px solid rgba(227,187,122,.14)}
.jnd-search input{flex:1;background:transparent;color:#f3e3c8;font-size:15px;outline:none;min-width:0}
.jnd-search input::placeholder{color:#6e6153}
.jnd-search .ic{color:#8b7a63;font-size:15px}

/* 分类 chips */
.jnd-chips{display:flex;gap:7px;overflow-x:auto;padding-bottom:9px;margin-bottom:4px}
.jnd-chips::-webkit-scrollbar{height:0}
.jnd-chip{flex:0 0 auto;height:34px;padding:0 13px;border-radius:16px;display:flex;align-items:center;
  font-size:12.5px;color:#a8957d;background:rgba(255,244,225,.05);border:1px solid transparent;transition:.16s}
.jnd-chip.on{color:#f0d7a8;background:rgba(227,187,122,.14);border-color:rgba(227,187,122,.36)}

/* 条目卡 */
.jnd-item{padding:11px 13px;border-radius:13px;margin-bottom:8px;background:linear-gradient(168deg,rgba(255,244,225,.055),rgba(0,0,0,.18));
  border:1px solid rgba(255,244,225,.06)}
.jnd-item .nm{font-size:15.5px;font-weight:600;color:#f2e0bd;letter-spacing:.5px;margin-bottom:5px}
.jnd-item .tx{font-size:13.8px;color:#b7a58d;line-height:1.6}
.jnd-item .tx b{color:#e3bb7a;font-weight:600}
.jnd-empty{text-align:center;color:#6e6153;font-size:13px;padding:34px 0;letter-spacing:1px}

/* 功能行 */
.jnd-row{display:flex;align-items:center;gap:12px;padding:14px 13px;border-radius:13px;margin-bottom:8px;
  background:rgba(255,244,225,.045);border:1px solid rgba(255,244,225,.055)}
.jnd-row .ic{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:16px;background:rgba(227,187,122,.12);color:#e3bb7a;flex:0 0 auto}
.jnd-row .ic svg{width:19px;height:19px;display:block}
.jnd-row .tx{flex:1;min-width:0}
.jnd-row .tx .a{font-size:14.5px;color:#ecdbc0;letter-spacing:.4px}
.jnd-row .tx .b{font-size:12px;color:#7f7059;margin-top:3px;line-height:1.5}
.jnd-sw{width:46px;height:27px;border-radius:14px;background:rgba(255,255,255,.12);position:relative;flex:0 0 auto;transition:.2s}
.jnd-sw::after{content:"";position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:.2s;
  box-shadow:0 1px 4px rgba(0,0,0,.35)}
.jnd-sw.on{background:linear-gradient(120deg,#c2452f,#e3bb7a)}
.jnd-sw.on::after{transform:translateX(19px)}
.jnd-btn{height:38px;padding:0 16px;border-radius:11px;display:flex;align-items:center;justify-content:center;
  font-size:13px;color:#3d0d08;background:linear-gradient(160deg,#efcf95,#d3a45e);font-weight:600;letter-spacing:.5px}
.jnd-btn:active{opacity:.8}
.jnd-btn.ghost{background:rgba(255,244,225,.07);color:#d9c3a1;box-shadow:0 0 0 1px rgba(227,187,122,.2) inset}
.jnd-note{font-size:11px;color:#6e6153;line-height:1.8;padding:6px 4px 14px;letter-spacing:.3px}
.jnd-toast{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);background:rgba(20,12,8,.95);
  color:#f0d7a8;font-size:13px;padding:10px 18px;border-radius:12px;border:1px solid rgba(227,187,122,.3);
  z-index:2147483002;pointer-events:none;opacity:0;transition:opacity .2s;max-width:76vw;text-align:center}
.jnd-toast.on{opacity:1}
`;

  function installCss() {
    if (document.getElementById('jnd-css')) return;
    const st = document.createElement('style');
    st.id = 'jnd-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ============================ 工具 ============================ */
  function toast(msg) {
    let el = document.getElementById('jnd-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'jnd-toast';
      el.className = 'jnd-toast';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 1600);
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ============================ 功能实现 ============================ */

  // 去红点 / 新标：把游戏里的小红点、NEW 标记统一压掉
  function clearRedDots() {
    const SEL = [
      '.red-dot', '.reddot', '.dot-red', '.new-tag', '.newdot', '.badge-dot',
      '[class*="reddot"]', '[class*="red-dot"]', '[class*="newtips"]', '[class*="new-tips"]',
    ];
    let n = 0;
    SEL.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        const cs = getComputedStyle(node);
        if (cs.position === 'absolute' || cs.position === 'fixed' || node.offsetWidth < 24) {
          node.style.setProperty('display', 'none', 'important');
          n++;
        }
      });
    });
    // 数值角标：文本是纯数字或 NEW 且面积很小
    document.querySelectorAll('span,div,i,b,em').forEach(node => {
      if (node.__jndDot) return;
      const t = (node.textContent || '').trim();
      if (!/^([1-9]\d?|NEW|新)$/.test(t)) return;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.width <= 26 && r.height <= 26
        && getComputedStyle(node).position === 'absolute') {
        node.style.setProperty('display', 'none', 'important');
        node.__jndDot = 1;
        n++;
      }
    });
    toast(n ? `已清理 ${n} 处红点` : '没有找到红点');
  }

  // 屏蔽对手发言：隐藏聊天/弹幕区
  const CHAT_SEL = [
    '#chat', '.chat', '.chat-box', '.chatbox', '.chatList', '.chat-list',
    '.speak-box', '.message-list', '.msg-list', '[class*="chatPanel"]', '[class*="chat-panel"]'
  ].join(',');

  function applyChatBlock(on) {
    let st = document.getElementById('jnd-hide-chat');
    if (on) {
      if (!st) {
        st = document.createElement('style');
        st.id = 'jnd-hide-chat';
        st.textContent = `${CHAT_SEL}{display:none!important}`;
        (document.head || document.documentElement).appendChild(st);
      }
    } else if (st) st.remove();
  }

  // 屏蔽他人台词：把非本方的语音播放静音（按音量元素与音频对象）
  function applyVoiceBlock(on) {
    if (!window.__jndVoicePatched) {
      window.__jndVoicePatched = true;
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (S.blockVoice && !this.__jndSelf) {
          try { this.muted = true; } catch (_) {}
        }
        return origPlay.apply(this, arguments);
      };
    }
    document.querySelectorAll('audio,video').forEach(a => {
      if (on) { a.muted = true; } else { a.muted = false; }
    });
  }

  // 屏幕常亮（WebView 层由原生处理，这里只做唤醒锁兜底）
  async function applyAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        window.__jndLock = await navigator.wakeLock.request('screen');
      } else if (window.__jndLock) {
        await window.__jndLock.release();
        window.__jndLock = null;
      }
    } catch (_) {}
  }

  // 整屏截图：走原生桥自绘快照
  function screenshot() {
    if (!bridge || !bridge.snapshot) { toast('截图需要 App 环境'); return; }
    const name = 'sgs-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.png';
    toast('正在截图…');
    setTimeout(() => {
      try {
        const p = bridge.snapshot(name);
        if (!p || String(p).indexOf('err') === 0) { toast('截图失败'); return; }
        toast('已保存到相册');
      } catch (e) { toast('截图失败：' + e); }
    }, 260);
  }

  /* ============================ UI ============================ */
  let root, sheet, body, searchInput, activeCat = 'all', built = false;

  const ICON_POUCH = '<svg viewBox="0 0 24 24" fill="none"><path d="M7.5 4.2h9l-1 3.1c2.2 1.5 3.5 3.9 3.5 6.5 0 4.2-3.1 7-7 7s-7-2.8-7-7c0-2.6 1.3-5 3.5-6.5l-1-3.1Z" stroke="#f2dcae" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 4.2h6" stroke="#f2dcae" stroke-width="1.5" stroke-linecap="round"/><path d="M12 12.4v4M10 14.4h4" stroke="#e3bb7a" stroke-width="1.4" stroke-linecap="round"/></svg>';

  // 功能页图标：统一线条风格，颜色跟随父级
  const svg = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round">${d}${extra || ''}</svg>`;
  const IC = {
    dot: svg('<circle cx="12" cy="12" r="4.2"/><path d="M5 19 19 5"/>'),
    chat: svg('<path d="M20 13.5a3 3 0 0 1-3 3H9.5L6 19.5V16.5H7a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6Z"/>',
      '<path d="M5 19 19 5"/>'),
    sound: svg('<path d="M4 9.2v5.6h2.8L11 18V6L6.8 9.2H4Z"/>', '<path d="M16.4 9.2c1.3 1.4 1.3 4.2 0 5.6"/><path d="M5 19 19 5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>'),
    cam: svg('<path d="M4 8.4h3l1.8-2h6.4l1.8 2h3V19H4V8.4Z"/><circle cx="12" cy="13.4" r="3"/>'),
    reload: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.2v4h-4"/>'),
  };

  function build() {
    if (built && root && !root.isConnected) { built = false; root = null; }
    if (built) {
      if (root && !root.isConnected) document.documentElement.appendChild(root);
      return;
    }
    built = true;
    installCss();

    root = el('div');
    root.id = 'jnd-root';

    const ball = el('div');
    ball.id = 'jnd-ball';
    ball.innerHTML = ICON_POUCH + '<i class="badge"></i>';
    // App 环境由原生悬浮球接管（WebView 的 fixed 定位在 overview 缩放下会被挤到可视区外）
    if (bridge) ball.style.display = 'none';
    // 位置：默认右下角上方，避开手势条
    const bx = S.ballX >= 0 ? S.ballX : (window.innerWidth - 68);
    const by = S.ballY >= 0 ? S.ballY : (window.innerHeight - 150);
    ball.style.left = bx + 'px';
    ball.style.top = by + 'px';

    root.appendChild(ball);

    const mask = el('div');
    mask.id = 'jnd-mask';
    sheet = el('div');
    sheet.id = 'jnd-sheet';

    const hd = el('div', 'jnd-hd');
    hd.innerHTML = `<div><div class="ttl">锦囊袋</div><div class="ver">v${VERSION} · 对局速查</div></div><div class="sp"></div>`;
    const x = el('div', 'jnd-x', '✕');
    x.addEventListener('click', close);
    hd.appendChild(x);

    const tabs = el('div', 'jnd-tabs');
    [['cheat', '小抄'], ['tools', '功能'], ['about', '关于']].forEach(([id, label], i) => {
      const t = el('div', 'jnd-tab' + (i === 0 ? ' on' : ''), label);
      t.dataset.tab = id;
      t.addEventListener('click', () => switchTab(id));
      tabs.appendChild(t);
    });

    body = el('div', 'jnd-body');
    sheet.appendChild(hd);
    sheet.appendChild(tabs);
    sheet.appendChild(body);
    root.appendChild(mask);
    root.appendChild(sheet);
    (document.body || document.documentElement).appendChild(root);
    syncViewport();
    try {
      window.addEventListener('resize', syncViewport);
      window.addEventListener('orientationchange', () => setTimeout(syncViewport, 260));
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewport);
        window.visualViewport.addEventListener('scroll', syncViewport);
      }
    } catch (_) {}

    // 各个游戏页自带的 viewport 缩放不一致：100vw/100vh 未必等于可视区，
    // 这里按 visualViewport 的真实像素把根容器钉到可视区上。
    function viewInfo() {
      const vv = window.visualViewport;
      return {
        iw: window.innerWidth, ih: window.innerHeight, dpr: window.devicePixelRatio,
        vw: vv ? Math.round(vv.width) : 0, vh: vv ? Math.round(vv.height) : 0,
        vs: vv ? Number(vv.scale.toFixed(3)) : 0,
        ox: vv ? Math.round(vv.offsetLeft) : 0, oy: vv ? Math.round(vv.offsetTop) : 0
      };
    }
    function rectOf(e) {
      const r = e.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    }
    function syncViewport() {
      if (!root) return;
      const vv = window.visualViewport;
      const w = Math.round(vv && vv.width ? vv.width : window.innerWidth);
      const h = Math.round(vv && vv.height ? vv.height : window.innerHeight);
      if (!w || !h) return;
      root.style.setProperty('width', w + 'px', 'important');
      root.style.setProperty('height', h + 'px', 'important');
      root.style.setProperty('left', (vv ? Math.round(vv.offsetLeft) : 0) + 'px', 'important');
      root.style.setProperty('top', (vv ? Math.round(vv.offsetTop) : 0) + 'px', 'important');
    }

    // 诊断：面板不可见时能直接从 logcat 看出原因
    setTimeout(() => {
      try {
        const b = document.getElementById('jnd-ball');
        const rt = document.getElementById('jnd-root');
        if (!b || !rt) { console.log('[JND] diag missing ball=' + !!b + ' root=' + !!rt); return; }
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        const rs = getComputedStyle(rt);
        console.log('[JND] diag ball=' + JSON.stringify([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])
          + ' disp=' + cs.display + ' op=' + cs.opacity + ' vis=' + cs.visibility + ' z=' + cs.zIndex
          + ' rootDisp=' + rs.display + ' rootZ=' + rs.zIndex
          + ' iw=' + window.innerWidth + ' ih=' + window.innerHeight
          + ' htmlTf=' + getComputedStyle(document.documentElement).transform
          + ' bodyTf=' + (document.body ? getComputedStyle(document.body).transform : '-')
          + ' vp=' + JSON.stringify(viewInfo())
          + ' rootRect=' + JSON.stringify(rectOf(rt)));
      } catch (_) {}
    }, 700);

    mask.addEventListener('click', close);

    // 拖动悬浮球
    bindDrag(ball);
    // 单击打开（拖动后不触发）
    ball.addEventListener('click', () => { if (!ball._moved) open(); });

    switchTab('cheat');
  }

  function bindDrag(ball) {
    let sx = 0, sy = 0, ox = 0, oy = 0, down = false, t0 = 0;
    const start = e => {
      const p = e.touches ? e.touches[0] : e;
      down = true; ball._moved = false;
      sx = p.clientX; sy = p.clientY;
      ox = parseFloat(ball.style.left) || 0;
      oy = parseFloat(ball.style.top) || 0;
      t0 = Date.now();
      ball.style.transition = 'none';
    };
    const move = e => {
      if (!down) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) ball._moved = true;
      const nx = Math.min(Math.max(ox + dx, 4), window.innerWidth - 58);
      const ny = Math.min(Math.max(oy + dy, 8), window.innerHeight - 60);
      ball.style.left = nx + 'px';
      ball.style.top = ny + 'px';
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!down) return;
      down = false;
      ball.style.transition = '';
      S.ballX = parseFloat(ball.style.left) || 0;
      S.ballY = parseFloat(ball.style.top) || 0;
      saveStore();
      // 轻点（无拖动 + 短时）也算点击：某些 WebView 不派发 click
      if (!ball._moved && Date.now() - t0 < 380) open();
    };
    ball.addEventListener('touchstart', start, { passive: true });
    ball.addEventListener('touchmove', move, { passive: false });
    ball.addEventListener('touchend', end);
    ball.addEventListener('touchcancel', end);
    ball.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }

  function open() {
    build();
    root.classList.add('open');
    try { if (bridge && bridge.setPanelState) bridge.setPanelState(true); } catch (_) {}
  }
  function close() {
    if (root) root.classList.remove('open');
    try { if (bridge && bridge.setPanelState) bridge.setPanelState(false); } catch (_) {}
  }

  function switchTab(id) {
    document.querySelectorAll('#jnd-root .jnd-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    if (id === 'cheat') renderCheat();
    else if (id === 'tools') renderTools();
    else renderAbout();
  }

  /* ---------------- 小抄 ---------------- */
  function renderCheat() {
    body.innerHTML = '';
    const box = el('div', 'jnd-search', '<span class="ic">⌕</span>');
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = '搜牌名 / 武将 / 关键词，如 无懈、连弩、司马';
    searchInput.addEventListener('input', paintList);
    box.appendChild(searchInput);

    const chips = el('div', 'jnd-chips');
    const all = el('div', 'jnd-chip on', '全部');
    all.dataset.cat = 'all';
    chips.appendChild(all);
    CATS.forEach(c => {
      const ch = el('div', 'jnd-chip', c.label);
      ch.dataset.cat = c.id;
      chips.appendChild(ch);
    });
    chips.addEventListener('click', e => {
      const t = e.target.closest('.jnd-chip');
      if (!t) return;
      activeCat = t.dataset.cat;
      chips.querySelectorAll('.jnd-chip').forEach(c => c.classList.toggle('on', c === t));
      paintList();
    });

    const list = el('div');
    list.id = 'jnd-list';
    body.appendChild(box);
    body.appendChild(chips);
    body.appendChild(list);
    body.appendChild(el('div', 'jnd-note',
      '速查内容为标准＋军争常见牌与经典武将要点，仅供快速回忆。<br>实际结算以游戏内卡牌描述与最新规则为准。'));
    paintList();
  }

  function paintList() {
    const list = document.getElementById('jnd-list');
    if (!list) return;
    const q = (searchInput && searchInput.value || '').trim().toLowerCase();
    const groups = activeCat === 'all' ? CATS.map(c => c.id) : [activeCat];
    let html = '', count = 0;
    groups.forEach(cid => {
      const items = (CHEAT[cid] || []).filter(it => {
        if (!q) return true;
        return (it.n + it.t + (it.k || '')).toLowerCase().indexOf(q) >= 0;
      });
      if (!items.length) return;
      count += items.length;
      items.forEach(it => {
        html += `<div class="jnd-item"><div class="nm">${esc(it.n)}</div><div class="tx">${esc(it.t)}</div></div>`;
      });
    });
    list.innerHTML = count ? html : '<div class="jnd-empty">没找到，换个关键词试试</div>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 功能 ---------------- */
  function renderTools() {
    body.innerHTML = '';

    body.appendChild(row(IC.dot, '一键去红点', '清掉界面上的小红点与 NEW 标记', null, () => clearRedDots()));

    body.appendChild(toggleRow(IC.chat, '屏蔽对手发言', '隐藏牌局里的聊天、表情与快捷发言', S.blockChat, v => {
      S.blockChat = v; saveStore(); applyChatBlock(v); toast(v ? '已屏蔽对手发言' : '已恢复');
    }));

    body.appendChild(toggleRow(IC.sound, '屏蔽他人台词', '不再播放其他角色的技能与死亡语音', S.blockVoice, v => {
      S.blockVoice = v; saveStore(); applyVoiceBlock(v); toast(v ? '已屏蔽他人台词' : '已恢复');
    }));

    body.appendChild(toggleRow(IC.sun, '保持屏幕常亮', '对局中不自动熄屏', S.keepAwake, v => {
      S.keepAwake = v; saveStore(); applyAwake(v);
      if (bridge && bridge.setKeepAwake) { try { bridge.setKeepAwake(v); } catch (_) {} }
      toast(v ? '已开启常亮' : '已关闭常亮');
    }));

    body.appendChild(row(IC.cam, '整屏截图', '保存当前画面到手机相册', null, () => screenshot()));

    body.appendChild(row(IC.reload, '重新注入面板', '面板异常消失时点这里', null, () => {
      if (bridge && bridge.reinject) { try { bridge.reinject(); toast('正在重新注入…'); } catch (_) {} }
      else toast('仅 App 内可用');
    }));

    body.appendChild(el('div', 'jnd-note',
      '这些开关只影响本机显示，不会向服务器发送任何数据。<br>手机端不提供快捷键与快捷指令功能。'));
  }

  function row(icon, title, desc, right, onclick) {
    const r = el('div', 'jnd-row');
    r.innerHTML = `<div class="ic">${icon}</div><div class="tx"><div class="a">${esc(title)}</div><div class="b">${esc(desc)}</div></div>`;
    if (right === null) {
      const b = el('div', 'jnd-btn', '执行');
      b.addEventListener('click', onclick);
      r.appendChild(b);
    }
    return r;
  }

  function toggleRow(icon, title, desc, value, onchange) {
    const r = el('div', 'jnd-row');
    r.innerHTML = `<div class="ic">${icon}</div><div class="tx"><div class="a">${esc(title)}</div><div class="b">${esc(desc)}</div></div>`;
    const sw = el('div', 'jnd-sw' + (value ? ' on' : ''));
    sw.addEventListener('click', () => {
      const nv = !sw.classList.contains('on');
      sw.classList.toggle('on', nv);
      onchange(nv);
    });
    r.appendChild(sw);
    return r;
  }

  /* ---------------- 关于 ---------------- */
  function renderAbout() {
    body.innerHTML = '';
    body.appendChild(el('div', 'jnd-item', `<div class="nm">锦囊妙计 · 手机端</div><div class="tx">
      版本 <b>${VERSION}</b><br>
      免 root 的 WebView 壳＋游戏内面板：渠道入口、小抄速查、界面净化、整屏截图。<br>
      面板通过原生桥与 App 通信，不走任何第三方服务器。</div>`));
    body.appendChild(el('div', 'jnd-item', `<div class="nm">小抄怎么用</div><div class="tx">
      对局中点悬浮球 → 小抄 → 输入牌名或武将名。搜索会同时匹配名称、效果与关键词（支持拼音首字母提示词，如 <b>wuxie</b>、<b>lianu</b>）。</div>`));
    body.appendChild(el('div', 'jnd-item', `<div class="nm">悬浮球</div><div class="tx">
      拖动可换位置，位置会记住。轻点打开面板；面板打开时球变成「✕」，再点一次收起。</div>`));
    body.appendChild(el('div', 'jnd-note',
      '本面板为本地辅助工具，不修改游戏数据、不代替操作。<br>请遵守游戏服务条款，账号风险自负。'));
  }

  /* ============================ 启动 ============================ */
  function boot() {
    // 游戏页才挂面板：登录页也挂，方便在登录页截图
    build();
    applyChatBlock(S.blockChat);
    applyVoiceBlock(S.blockVoice);
    if (S.keepAwake) applyAwake(true);
    let n = 0;
    const timer = setInterval(() => {
      n++;
      if (document.body) {
        installCss();
        if (root && !root.isConnected) document.documentElement.appendChild(root);
        if (!document.getElementById('jnd-root')) build();
        clearInterval(timer);
      }
      if (n > 40) clearInterval(timer);
    }, 250);
    // 页面在加载过程中反复重绘时也兜住
    setInterval(() => {
      try {
        if (document.body && !document.getElementById('jnd-root')) build();
      } catch (_) {}
    }, 4000);
    window.__JND_REBUILD__ = () => { try { built = false; root = null; build(); } catch (_) {} };
    console.log('[JND] panel ready v' + VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // 暴露给原生自测 / 原生悬浮球
  window.__JND_OPEN__ = () => { open(); };
  window.__JND_CLOSE__ = () => { close(); };
  window.__JND_TOGGLE__ = () => {
    try {
      build();
      if (root && root.classList.contains('open')) close(); else open();
      return !!(root && root.classList.contains('open'));
    } catch (e) { console.log('[JND] toggle err ' + e); return false; }
  };
  window.__JND_CLEAR__ = () => { clearRedDots(); };

  /* ============================ 渠道服扫码 ============================ */
  // 统一登录器在 __JND_HOST.kind==='micro' 时把二维码投影出来，这里负责画。
  const PROVIDER_NAME = {
    qq: 'WEGAME QQ', wx: 'WEGAME 微信', bilibili: 'BILIBILI', steam: 'STEAM',
    oppo: 'OPPO', xiaomi: '小米', vivo: 'vivo', huawei: '华为', honor: '荣耀',
  };
  const QR_ERROR = {
    NETWORK_ERROR: '网络连接失败，请重试',
    REQUEST_TIMEOUT: '连接超时，请重试',
    LOGIN_CANCELLED: '已取消',
    QR_EXPIRED: '二维码已过期，请重新发起',
    PROVIDER_UNAVAILABLE: '该渠道当前不可用',
    ACCOUNT_MISMATCH: '扫码账号与当前账号不一致',
    WEB_LOCKS_UNAVAILABLE: '当前环境不支持扫码登录',
    OPPO_TE_UNAVAILABLE: '登录环境校验失败，请重试',
    OPPO_IDENTIFY_TIMEOUT: '安全验证超时，请重试',
    OPPO_IDENTIFY_CLOSED: '已取消安全验证',
  };

  let qrBox = null, qrUnsub = null, qrProvider = '', lastQrLog = '', qrStartedAt = 0, qrAutoRetry = false;

  function buildQrOverlay() {
    if (qrBox) return qrBox;
    const wrap = el('div');
    wrap.id = 'jnd-qr';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483001;'
      + 'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72)';
    wrap.innerHTML = `
      <div style="width:min(86vw,380px);border-radius:20px;padding:22px 20px 18px;text-align:center;
        background:linear-gradient(178deg,#1d120d,#100907);border:1px solid rgba(227,187,122,.34);
        box-shadow:0 18px 50px rgba(0,0,0,.7)">
        <div id="jnd-qr-title" style="font-size:16px;color:#f0d7a8;letter-spacing:1px;margin-bottom:4px">扫码登录</div>
        <div id="jnd-qr-sub" style="font-size:11.5px;color:#8b7a63;margin-bottom:14px">正在获取二维码…</div>
        <div id="jnd-qr-frame" style="width:200px;height:200px;margin:0 auto 14px;border-radius:14px;
          background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img id="jnd-qr-img" style="width:100%;height:100%;object-fit:contain;display:none" alt="">
          <div id="jnd-qr-wait" style="color:#9a9a9a;font-size:12px">获取中…</div>
        </div>
        <div id="jnd-qr-state" style="font-size:12.5px;color:#b7a58d;min-height:18px;margin-bottom:14px"></div>
        <div style="display:flex;gap:10px">
          <div id="jnd-qr-cancel" style="flex:1;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;
            font-size:13.5px;color:#d9c3a1;background:rgba(255,244,225,.07);
            box-shadow:0 0 0 1px rgba(227,187,122,.22) inset">取消</div>
          <div id="jnd-qr-retry" style="flex:1;height:40px;border-radius:12px;display:none;align-items:center;justify-content:center;
            font-size:13.5px;color:#f7e6c4;background:rgba(227,187,122,.18);
            box-shadow:0 0 0 1px rgba(227,187,122,.38) inset">重新获取</div>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(wrap);
    wrap.querySelector('#jnd-qr-cancel').addEventListener('click', () => {
      const p = qrProvider;
      try { if (window.__JND_UNIFIED_LOGIN) window.__JND_UNIFIED_LOGIN.cancel(); } catch (_) {}
      // 用户主动取消：记下来，别让原生的重试链又把码弹回来
      window.__JND_LOGIN_CANCELED__ = p;
      destroyQrOverlay();
    });
    wrap.querySelector('#jnd-qr-retry').addEventListener('click', () => {
      const p = qrProvider;
      if (!p) return;
      try { if (window.__JND_UNIFIED_LOGIN) window.__JND_UNIFIED_LOGIN.cancel(); } catch (_) {}
      delete window.__JND_LOGIN_CANCELED__;
      qrAutoRetry = true;   // 手动重试后不再自动重试，避免连环弹
      window.__JND_START_LOGIN__(p, true);
    });
    qrBox = wrap;
    return wrap;
  }

  function destroyQrOverlay() {
    if (qrUnsub) { try { qrUnsub(); } catch (_) {} qrUnsub = null; }
    if (qrBox && qrBox.parentNode) qrBox.parentNode.removeChild(qrBox);
    qrBox = null;
    lastQrLog = '';
  }

  function paintQr(snap) {
    if (!qrBox) return;
    const img = qrBox.querySelector('#jnd-qr-img');
    const wait = qrBox.querySelector('#jnd-qr-wait');
    const state = qrBox.querySelector('#jnd-qr-state');
    const sub = qrBox.querySelector('#jnd-qr-sub');
    const title = qrBox.querySelector('#jnd-qr-title');
    if (snap && snap.provider) {
      const nm = String(PROVIDER_NAME[snap.provider] || snap.provider).replace(/[a-z]+/g, m => m.toUpperCase());
      title.textContent = nm + ' 扫码登录';
    }
    if (snap && snap.qr) {
      img.src = snap.qr;
      img.style.display = 'block';
      wait.style.display = 'none';
    }
    sub.textContent = snap && snap.text ? snap.text : '正在获取二维码…';
    const retryBtn = qrBox.querySelector('#jnd-qr-retry');
    if (snap && snap.error) {
      const code = snap.error.code || '';
      state.style.color = '#e0755f';
      state.textContent = snap.error.message || QR_ERROR[code] || (/EXPIRED/.test(code) ? '二维码已过期' : '登录未完成，请重试');
      img.style.display = 'none';
      wait.style.display = 'flex';
      wait.textContent = '二维码不可用';
      if (retryBtn) retryBtn.style.display = 'flex';
      // 个别渠道（如荣耀）服务端会把刚发的码立刻判过期，自动再要一次
      if (/QR_EXPIRED/.test(code) && !qrAutoRetry && Date.now() - qrStartedAt < 5000) {
        qrAutoRetry = true;
        const p = qrProvider;
        setTimeout(() => { if (qrProvider === p) window.__JND_START_LOGIN__(p, true); }, 700);
      }
    } else {
      state.style.color = '#b7a58d';
      state.textContent = snap && snap.stage === 'ready' ? '扫码成功，正在进入游戏' : '';
      if (retryBtn) retryBtn.style.display = 'none';
    }

    // 渠道自检：状态有变化时记一条，方便 logcat 一次性看全所有渠道的发码结果
    try {
      const line = '[JND-QR] ' + ((snap && snap.provider) || '?')
        + ' stage=' + ((snap && snap.stage) || '-')
        + ' qr=' + (snap && snap.qr ? snap.qr.length : 0)
        + ' err=' + (snap && snap.error ? (snap.error.code || snap.error.message || '?') : '-')
        + ' state=' + (state.textContent || '-');
      if (line !== lastQrLog) { lastQrLog = line; console.log(line); }
    } catch (_) {}
  }

  window.__JND_START_LOGIN__ = function (provider, isRetry) {
    build();
    if (window.__JND_LOGIN_CANCELED__ === provider) return 'canceled';
    const ul = window.__JND_UNIFIED_LOGIN;
    if (!ul || typeof ul.start !== 'function') return 'pending';
    qrProvider = provider;
    // 只有用户新发起才重置「已自动重试」标记，否则会无限重试
    if (!isRetry) { qrStartedAt = Date.now(); qrAutoRetry = false; }
    destroyQrOverlay();
    buildQrOverlay();
    paintQr({ provider, text: '正在获取二维码…' });
    try {
      qrUnsub = ul.subscribe(paintQr);
      Promise.resolve(ul.start(provider)).catch(e => {
        paintQr({ provider, error: { message: String(e && e.message || e) } });
      });
    } catch (e) {
      paintQr({ provider, error: { message: String(e) } });
    }
    return 'started';
  };
})();
