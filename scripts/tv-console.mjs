// One-shot CDP client: dump console + runtime errors + body innerHTML from the running app.
// Usage: node scripts/tv-console.mjs [--watch]
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const watch = process.argv.includes('--watch');

function fetchTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/json/list`, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const targets = await fetchTargets();
const target = targets[0];
if (!target) { console.error('No DevTools targets'); process.exit(1); }
console.log(`→ connected to "${target.title}" at ${target.url}`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  const _id = ++id;
  return new Promise((res) => {
    pending.set(_id, res);
    ws.send(JSON.stringify({ id: _id, method, params }));
  });
}

ws.on('open', async () => {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');

  // Snapshot current state
  console.log('\n--- DOM snapshot (#app innerHTML, first 800 chars) ---');
  const snap = await send('Runtime.evaluate', {
    expression: 'document.getElementById("app")?.innerHTML?.slice(0, 800) ?? "(no #app)"',
    returnByValue: true,
  });
  console.log(snap.result?.result?.value);

  console.log('\n--- document.body.innerText ---');
  const body = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.slice(0, 400)',
    returnByValue: true,
  });
  console.log(body.result?.result?.value);

  console.log('\n--- console history (replay last 50 messages via override) ---');
  // No replay API; just print whatever streams in.

  if (!watch) {
    setTimeout(() => process.exit(0), 1500);
  }
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id != null && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  // Streamed events
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
    console.log(`[console.${msg.params.type}]`, args);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const e = msg.params.exceptionDetails;
    console.log(`[uncaught] ${e.text} ${e.exception?.description ?? ''}`);
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    console.log(`[${e.source}.${e.level}]`, e.text);
  } else if (msg.method === 'Network.loadingFailed') {
    console.log(`[net.fail]`, msg.params.errorText, msg.params.requestId);
  } else if (msg.method === 'Network.requestWillBeSent') {
    if (watch) console.log(`[net.req]`, msg.params.request.method, msg.params.request.url);
  }
});

ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
