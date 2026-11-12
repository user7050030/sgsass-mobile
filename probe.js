// 通过 CDP 导航 / 注入脚本测试
// 用法：node probe.js --nav <url>
//       node probe.js --eval "<js>" [--ctx id] [--all]
//       node probe.js --inject <file> [--ctx id]
const http = require('http');
const fs = require('fs');

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
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

(async () => {
  const list = await getJSON('/json/list');
  const wantPage = arg('page', '');
  const pages = list.filter(p => p.type === 'page' && (!wantPage || (p.url || '').includes(wantPage)));
  if (!pages.length) { console.log('NO PAGE'); return; }
  const page = pages[0];
  console.log('PAGE ' + page.url.slice(0, 100));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiting = new Map(); const contexts = [];
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id; waiting.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id); waiting.delete(m.id);
      m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      return;
    }
    if (m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context);
    if (m.method === 'Runtime.consoleAPICalled') {
      const p = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      console.log('CONSOLE ' + p.slice(0, 300));
    }
  };
  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 500));

  if (args.includes('--nav')) {
    console.log('NAV ' + arg('nav'));
    await send('Page.navigate', { url: arg('nav') });
    await new Promise(r => setTimeout(r, 3000));
    console.log('after nav url=' + (await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result.value);
    ws.close(); return;
  }

  const evalIn = async (ctxId, expression) => {
    const r = await send('Runtime.evaluate', { expression, contextId: ctxId, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) : JSON.stringify(r.result.value);
  };

  if (args.includes('--inject')) {
    const src = fs.readFileSync(arg('inject'), 'utf8');
    const ctxId = Number(arg('ctx', '0')) || null;
    const targets = ctxId ? [ctxId] : contexts.map(c => c.id);
    for (const cid of targets) {
      const r = await send('Runtime.evaluate', { expression: src, contextId: cid, returnByValue: true });
      console.log(`inject ctx ${cid} -> ` + (r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 200) : JSON.stringify(r.result.value)));
    }
    ws.close(); return;
  }

  const expr = arg('eval', '1');
  if (args.includes('--all')) {
    for (const c of contexts) console.log(`[${c.id}] ` + await evalIn(c.id, expr));
  } else {
    const ctxId = Number(arg('ctx', '0')) || (contexts.find(c => (c.auxData || {}).isDefault) || contexts[0]).id;
    console.log('RES ' + await evalIn(ctxId, expr));
  }
  ws.close();
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
