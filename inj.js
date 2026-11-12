// 把本地文件注入指定 context 执行：node inj.js <file> [--ctx N] [--list]
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
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}

(async () => {
  const list = await getJSON('/json/list');
  const page = list.find(p => p.type === 'page');
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
  };
  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 600));

  if (args.includes('--list')) {
    for (const c of contexts) {
      console.log(`CTX ${c.id} default=${!!(c.auxData || {}).isDefault} origin=${c.origin}`);
    }
    ws.close(); return;
  }

  const file = args[0];
  const wantCtx = arg('ctx', '');
  const ctx = wantCtx ? contexts.find(c => String(c.id) === wantCtx)
    : contexts.find(c => (c.auxData || {}).isDefault) || contexts[0];
  if (!ctx) { console.log('NO CTX'); ws.close(); return; }

  const src = fs.readFileSync(file, 'utf8');
  const expr = '(function(){try{(0,eval)(window.__INJ__);}catch(e){return "ERR "+(e && e.message)}return "ok"})()';
  // 分块传，避免单条消息过大
  const CH = 60000;
  const n = Math.ceil(src.length / CH);
  for (let i = 0; i < n; i++) {
    const part = src.slice(i * CH, (i + 1) * CH);
    await send('Runtime.evaluate', {
      expression: '(window.__INJ__=(window.__INJ__||"")+' + JSON.stringify(part) + ')',
      contextId: ctx.id, returnByValue: true,
    });
    process.stdout.write('\r chunk ' + (i + 1) + '/' + n);
  }
  process.stdout.write('\n');
  const r = await send('Runtime.evaluate', {
    expression: expr, contextId: ctx.id, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) console.log('EXC ' + JSON.stringify(r.exceptionDetails));
  else console.log('RES ' + JSON.stringify(r.result.value));
  await send('Runtime.evaluate', { expression: 'delete window.__INJ__', contextId: ctx.id });
  ws.close();
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
