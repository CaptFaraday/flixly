// One-shot CDP client. Two modes:
//   node scripts/tv-nav.mjs <output.png> "<key sequence>"   — old screenshot mode
//   node scripts/tv-nav.mjs --eval "<js expression>"        — return JSON of evaluated expression
// Usage:
//   node scripts/tv-nav.mjs --eval "window.__flixly"
//   node scripts/tv-nav.mjs --eval "document.querySelector('[data-focused]')?.getAttribute('data-testid')"
import http from 'node:http';
import fs from 'node:fs';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const args = process.argv.slice(2);
const evalIdx = args.indexOf('--eval');
const EVAL_MODE = evalIdx >= 0;
const EVAL_EXPR = EVAL_MODE ? args[evalIdx + 1] : null;
const OUT = !EVAL_MODE ? args[0] : null;
const SEQ = !EVAL_MODE ? (args[1] || '').trim().split(/\s+/).filter(Boolean) : [];

if (!EVAL_MODE && !OUT) {
  console.error('usage:');
  console.error('  node scripts/tv-nav.mjs <output.png> "<key sequence>"');
  console.error('  node scripts/tv-nav.mjs --eval "<js expression>"');
  process.exit(1);
}

const KEYCODE = { right: 39, left: 37, up: 38, down: 40, enter: 13, back: 461 };

function fetchTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/json/list`, (res) => {
      let body = ''; res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const targets = await fetchTargets();
const t = targets[0];
if (!t) { console.error('No DevTools target'); process.exit(1); }

const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const _id = ++id;
  return new Promise((res) => { pending.set(_id, res); ws.send(JSON.stringify({ id: _id, method, params })); });
};

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});

async function dispatchKey(name) {
  const keyCode = KEYCODE[name];
  if (!keyCode) throw new Error(`unknown key ${name}`);
  const expr = `
    (function() {
      const ev = new KeyboardEvent('keydown', { keyCode: ${keyCode}, which: ${keyCode}, bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'keyCode', { get: () => ${keyCode} });
      Object.defineProperty(ev, 'which', { get: () => ${keyCode} });
      window.dispatchEvent(ev);
      return true;
    })()
  `;
  await send('Runtime.evaluate', { expression: expr });
}

ws.on('open', async () => {
  if (EVAL_MODE) {
    const r = await send('Runtime.evaluate', {
      expression: `JSON.stringify(${EVAL_EXPR})`,
      returnByValue: true,
    });
    const val = r.result?.result?.value;
    if (val == null) {
      console.log('null');
    } else {
      try { console.log(JSON.stringify(JSON.parse(val), null, 2)); }
      catch { console.log(val); }
    }
    process.exit(0);
  }

  console.log(`→ connected to ${t.title}`);
  for (const key of SEQ) {
    console.log(`  key: ${key}`);
    await dispatchKey(key);
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 1200));

  await send('Page.enable');
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) {
    fs.writeFileSync(OUT, Buffer.from(r.result.data, 'base64'));
    console.log(`Wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
    process.exit(0);
  } else {
    console.error('Page.captureScreenshot failed');
    process.exit(1);
  }
});

ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 20000);
