// Capture a screenshot of the running app via CDP. Saves to ./tv-screenshot.png.
import http from 'node:http';
import fs from 'node:fs';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const OUT = process.argv[2] || 'tv-screenshot.png';

function fetchTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/json/list`, (res) => {
      let data = ''; res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
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

ws.on('open', async () => {
  await send('Page.enable');
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) { console.error('No screenshot data', r); process.exit(1); }
  fs.writeFileSync(OUT, Buffer.from(r.result.data, 'base64'));
  console.log(`Wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
  process.exit(0);
});

ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
