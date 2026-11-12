// 通过 CDP 在本机调试 WebView：列帧 / 在指定帧里执行 JS
// 用法：node cdp.js --list
//       node cdp.js --eval "1+1" [--frame web.sanguosha.com] [--page 4399iw2]
const http = require('http');

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, r => {
      let b = '';
      r.on('data', d => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}

(async () => {
  const list = await getJSON('/json/list');
  const wantPage = arg('page', '');
  const pages = list.filter(p => p.type === 'page' && (!wantPage || (p.url || '').includes(wantPage)));
  if (!pages.length) { console.log('NO PAGE, have: ' + list.map(p => p.url).join(' | ')); return; }
  const page = pages[0];
  console.log('PAGE ' + page.url.slice(0, 120));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const waiting = new Map();
  const contexts = [];

  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    waiting.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      return;
    }
    if (m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context);
    if (m.method === 'Page.frameNavigated') contexts.length = 0;
  };

  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 600));

  if (args.includes('--list')) {
    for (const c of contexts) {
      const f = c.auxData || {};
      console.log(`CTX ${c.id} frame=${f.frameId} default=${!!f.isDefault} origin=${c.origin}\n    name=${c.name || ''}`);
    }
    ws.close();
    return;
  }

  const expr = args[args.indexOf('--eval') + 1];
  const wantFrame = arg('frame', '');
  const wantCtx = arg('ctx', '');
  let ctx = null;
  if (wantCtx) ctx = contexts.find(c => String(c.id) === wantCtx);
  else if (wantFrame) ctx = contexts.find(c => (c.origin || '').includes(wantFrame) || (c.name || '').includes(wantFrame));
  else ctx = contexts.find(c => (c.auxData || {}).isDefault) || contexts[0];
  if (!ctx) { console.log('NO CTX for frame ' + wantFrame + ' ctx ' + wantCtx); ws.close(); return; }

  if (args.includes('--all')) {
    for (const c of contexts) {
      try {
        const rr = await send('Runtime.evaluate', {
          expression: expr, contextId: c.id, returnByValue: true, awaitPromise: true,
        });
        const v = rr.exceptionDetails ? 'EXC ' + rr.exceptionDetails.text : JSON.stringify(rr.result.value);
        console.log(`[${c.id}] ${v}`);
      } catch (e) { console.log(`[${c.id}] ERR ${e.message}`); }
    }
    ws.close();
    return;
  }

  const r = await send('Runtime.evaluate', {
    expression: expr, contextId: ctx.id, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) console.log('EXC ' + JSON.stringify(r.exceptionDetails.text) + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  else console.log('RES ' + JSON.stringify(r.result.value));
  ws.close();
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
