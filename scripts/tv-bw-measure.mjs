// Measure real bandwidth + latency from the TV. Runs the test entirely
// inside the TV's network context (so we measure what the streaming pipeline
// actually sees, not what the dev machine sees). Tests:
//  - Cloudflare control endpoint at multiple sizes
//  - TorBox CDN at multiple sizes (the actual streaming source)
//  - Latency probe (small Range request → headers-only timing)
//  - Sustained vs burst characteristics
//
// Usage:
//   node scripts/tv-bw-measure.mjs <torbox-cdn-url>
//
// Where <torbox-cdn-url> is any cached TorBox file URL (post-redirect). Get
// one by curl -ILq <torrentio-resolver-url> and using the final Location.
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const CDN_URL = process.argv[2];
if (!CDN_URL) {
  console.error('usage: tv-bw-measure.mjs <torbox-cdn-url>');
  process.exit(1);
}

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
  const CDN_URL = ${JSON.stringify(CDN_URL)};
  const out = { ts: Date.now(), userAgent: navigator.userAgent, runs: [] };

  async function timed(label, url, opts = {}) {
    const t0 = performance.now();
    let bytes = 0, status = 0, error = null;
    try {
      const r = await fetch(url, opts);
      status = r.status;
      const buf = await r.arrayBuffer();
      bytes = buf.byteLength;
    } catch (e) { error = String(e); }
    const ms = performance.now() - t0;
    const mbps = bytes > 0 ? (bytes * 8) / 1_000_000 / (ms / 1000) : 0;
    return { label, status, bytes, ms: Math.round(ms), mbps: Number(mbps.toFixed(2)), error };
  }

  // Latency probe: Range bytes=0-0, just measure round-trip
  async function latency(label, url) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      try {
        await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
        samples.push(performance.now() - t0);
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    samples.sort((a, b) => a - b);
    return {
      label,
      samples: samples.map((s) => Math.round(s)),
      median: Math.round(samples[Math.floor(samples.length / 2)] || 0),
      min: Math.round(samples[0] || 0),
      max: Math.round(samples[samples.length - 1] || 0),
    };
  }

  // Cloudflare bandwidth ladder
  out.runs.push(await timed('cf 1MB',  'https://speed.cloudflare.com/__down?bytes=1000000',  { cache: 'no-store' }));
  out.runs.push(await timed('cf 10MB', 'https://speed.cloudflare.com/__down?bytes=10000000', { cache: 'no-store' }));
  out.runs.push(await timed('cf 25MB', 'https://speed.cloudflare.com/__down?bytes=25000000', { cache: 'no-store' }));
  out.runs.push(await timed('cf 50MB', 'https://speed.cloudflare.com/__down?bytes=50000000', { cache: 'no-store' }));

  // TorBox CDN bandwidth ladder via Range requests on a real cached file
  out.runs.push(await timed('tb 1MB',  CDN_URL, { headers: { Range: 'bytes=0-999999' },     cache: 'no-store' }));
  out.runs.push(await timed('tb 10MB', CDN_URL, { headers: { Range: 'bytes=0-9999999' },    cache: 'no-store' }));
  out.runs.push(await timed('tb 25MB', CDN_URL, { headers: { Range: 'bytes=0-24999999' },   cache: 'no-store' }));
  out.runs.push(await timed('tb 50MB', CDN_URL, { headers: { Range: 'bytes=0-49999999' },   cache: 'no-store' }));

  // Latency
  out.latency = {
    cloudflare: await latency('cloudflare', 'https://speed.cloudflare.com/__down?bytes=1'),
    torbox: await latency('torbox', CDN_URL),
  };

  // Sustained: single 100MB pull on TorBox to measure steady state, not bursty
  out.runs.push(await timed('tb 100MB sustained', CDN_URL, { headers: { Range: 'bytes=0-99999999' }, cache: 'no-store' }));

  return out;
})()
`;

ws.on('open', async () => {
  console.log('Running bandwidth probes — takes ~60-90 sec...');
  const r = await send('Runtime.evaluate', {
    expression: probeJs,
    awaitPromise: true,
    returnByValue: true,
    timeout: 120000,
  });
  console.log(JSON.stringify(r.result?.result?.value ?? r, null, 2));
  process.exit(0);
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('overall timeout'); process.exit(1); }, 180000);
