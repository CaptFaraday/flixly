// A/B test video startup pattern on the TV. Injects two hidden <video>
// elements with different attributes against fresh TorBox URLs and times
// loadedmetadata + canplay. Used to verify whether the
// preload=auto + manual play pattern actually outperforms autoplay on
// this specific WebOS Chromium build.
//
// Usage: node scripts/tv-ab-startup.mjs <url-A> <url-B> [<url-C-with-prewarm>]
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const URLS = process.argv.slice(2);
if (URLS.length < 2) { console.error('usage: tv-ab-startup.mjs <urlA> <urlB> [urlC]'); process.exit(1); }

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
  const URLS = ${JSON.stringify(URLS)};
  const out = [];

  function timeOne(label, url, opts) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.muted = true;
      v.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px';
      const t0 = performance.now();
      const result = { label, url: url.slice(0, 80) + '...', loadedMetadataMs: null, canPlayMs: null, error: null };
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        try { v.src = ''; v.remove(); } catch (e) {}
        out.push(result);
        resolve();
      };
      v.addEventListener('loadedmetadata', () => {
        result.loadedMetadataMs = Math.round(performance.now() - t0);
      });
      v.addEventListener('canplay', () => {
        result.canPlayMs = Math.round(performance.now() - t0);
        finish();
      });
      v.addEventListener('error', () => {
        result.error = 'MediaError ' + (v.error && v.error.code);
        finish();
      });
      setTimeout(() => { result.error = result.error || 'timeout'; finish(); }, 25000);
      // Apply options
      if (opts.preload) v.preload = opts.preload;
      if (opts.autoplay) v.autoplay = true;
      // For pattern with pre-warm, fire a small Range fetch first
      if (opts.preWarm) {
        fetch(url, { headers: { Range: 'bytes=0-262143' }, cache: 'no-store' })
          .then((r) => r.arrayBuffer())
          .catch(() => {});
        setTimeout(() => {
          document.body.appendChild(v);
          v.src = url;
        }, 800); // give pre-warm a moment to seed connection
      } else {
        document.body.appendChild(v);
        v.src = url;
      }
    });
  }

  // A: classic autoplay (old pattern)
  await timeOne('A: autoplay (old)', URLS[0], { autoplay: true });
  // B: preload=auto, no autoplay (new pattern)
  await timeOne('B: preload=auto (new)', URLS[1], { preload: 'auto' });
  // C: same as B + 256KB pre-warm with delay (full new flow incl. Detail prewarm)
  if (URLS[2]) {
    await timeOne('C: preload=auto + prewarm', URLS[2], { preload: 'auto', preWarm: true });
  }
  return out;
})()
`;

ws.on('open', async () => {
  console.log('Running A/B startup test (~60-90 sec)...');
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
