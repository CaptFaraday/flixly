// Probe HEAD + Range responses for a URL from the TV's network context.
// Useful when our moviehash gets the wrong size and we need to know whether
// HEAD doesn't follow redirects, content-length is hidden by CORS, etc.
//
// Usage: node scripts/tv-probe-fetch.mjs <url>
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const URL = process.argv[2];
if (!URL) { console.error('usage: tv-probe-fetch.mjs <url>'); process.exit(1); }

const targets = await new Promise((res, rej) =>
  http.get(`http://${HOST}:${PORT}/json/list`, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej));
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p = {}) => {
  const _id = ++id;
  return new Promise((res) => { pending.set(_id, res); ws.send(JSON.stringify({ id: _id, method: m, params: p })); });
};
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});

const probeJs = `
(async function() {
  const url = ${JSON.stringify(URL)};
  const out = { url, head: null, range: null };
  try {
    const h = await fetch(url, { method: 'HEAD' });
    const headers = {};
    h.headers.forEach((v, k) => { headers[k] = v; });
    out.head = { status: h.status, ok: h.ok, type: h.type, redirected: h.redirected, finalUrl: h.url, headers };
  } catch (e) { out.head = { error: String(e) }; }
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    out.range = { status: r.status, ok: r.ok, type: r.type, redirected: r.redirected, finalUrl: r.url, headers };
  } catch (e) { out.range = { error: String(e) }; }
  return out;
})()
`;

ws.on('open', async () => {
  const r = await send('Runtime.evaluate', {
    expression: probeJs,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(r.result?.result?.value ?? r, null, 2));
  process.exit(0);
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 30000);
