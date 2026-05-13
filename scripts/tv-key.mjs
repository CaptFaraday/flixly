// Real key dispatch via CDP Input domain (NOT synthesized window.KeyboardEvent —
// those don't propagate to capture-phase window listeners on Chromium 79+WebOS).
//
// Usage:
//   node scripts/tv-key.mjs "up up right enter"
//   node scripts/tv-key.mjs --eval "window.__flixly"   # passthrough to tv-nav.mjs
//
// Codes follow Chromium's keyboard layout. windowsVirtualKeyCode is what the
// page-side keydown listener reads as e.keyCode.
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const SEQ = (process.argv[2] || '').trim().split(/\s+/).filter(Boolean);
if (!SEQ.length) {
  console.error('usage: node scripts/tv-key.mjs "<key> <key> ..."');
  console.error('keys: up down left right enter back');
  process.exit(1);
}

const KEYS = {
  up:    { code: 'ArrowUp',    key: 'ArrowUp',    vk: 38 },
  down:  { code: 'ArrowDown',  key: 'ArrowDown',  vk: 40 },
  left:  { code: 'ArrowLeft',  key: 'ArrowLeft',  vk: 37 },
  right: { code: 'ArrowRight', key: 'ArrowRight', vk: 39 },
  enter: { code: 'Enter',      key: 'Enter',      vk: 13 },
  back:  { code: 'Escape',     key: 'Escape',     vk: 27 },
};

const targets = await new Promise((res, rej) => {
  http.get(`http://${HOST}:${PORT}/json/list`, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});
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
  const m = JSON.parse(data.toString());
  if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});

ws.on('open', async () => {
  console.log(`connected to ${t.title}`);
  for (const name of SEQ) {
    const k = KEYS[name];
    if (!k) { console.error(`unknown key: ${name}`); process.exit(1); }
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      windowsVirtualKeyCode: k.vk,
      code: k.code,
      key: k.key,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: k.vk,
      code: k.code,
      key: k.key,
    });
    console.log(`  ${name}`);
    await new Promise((r) => setTimeout(r, 350));
  }
  // Settle, then dump state.
  await new Promise((r) => setTimeout(r, 500));
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__flixly)`,
    returnByValue: true,
  });
  console.log('state:', r.result?.result?.value ?? 'null');
  process.exit(0);
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 30000);
