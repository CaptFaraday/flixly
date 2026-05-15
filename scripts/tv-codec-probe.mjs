// Empirical codec probe for the LG TV. Connects via CDP, injects a <video>
// element with a given URL, observes events + decoded dimensions, attempts
// audio track enumeration and selection, prints the result.
//
// Usage:
//   node scripts/tv-codec-probe.mjs <label> <url>
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const [, , LABEL, URL] = process.argv;
if (!LABEL || !URL) { console.error('usage: tv-codec-probe.mjs <label> <url>'); process.exit(1); }

const targets = await new Promise((res, rej) =>
  http.get(`http://${HOST}:${PORT}/json/list`, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej));
const t = targets[0];
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
  const probeJs = `
    (function() {
      window.__probe = { events: [], snapshots: [], done: false };
      var v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px';
      var EVENTS = ['loadstart','loadedmetadata','loadeddata','canplay','playing','error','stalled','suspend','waiting','ended','progress'];
      EVENTS.forEach(function(e) {
        v.addEventListener(e, function() {
          window.__probe.events.push({ event: e, t: Date.now(), code: v.error ? v.error.code : null, msg: v.error ? v.error.message : null });
        });
      });
      function snap(label) {
        var tracks = [];
        if (v.audioTracks) {
          for (var i = 0; i < v.audioTracks.length; i++) {
            var a = v.audioTracks[i];
            tracks.push({ id: a.id, kind: a.kind, label: a.label, language: a.language, enabled: a.enabled });
          }
        }
        return {
          when: label,
          videoWidth: v.videoWidth, videoHeight: v.videoHeight,
          duration: isFinite(v.duration) ? v.duration : null,
          currentTime: v.currentTime,
          mediaId: v.mediaId || null,
          audioTrackCount: tracks.length,
          audioTracks: tracks,
          readyState: v.readyState, networkState: v.networkState,
          paused: v.paused,
        };
      }
      v.addEventListener('canplay', function() {
        v.play().catch(function() {});
        setTimeout(function() {
          window.__probe.snapshots.push(snap('t+1500ms'));
          if (v.audioTracks && v.audioTracks.length > 1) {
            try {
              for (var i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = (i === 1);
              window.__probe.selectTrackAttempted = true;
            } catch (e) {
              window.__probe.selectTrackError = String(e);
            }
            setTimeout(function() {
              window.__probe.snapshots.push(snap('t+3000ms after select track 1'));
              try { v.src = ''; v.remove(); } catch(e) {}
              window.__probe.done = true;
            }, 1500);
          } else {
            try { v.src = ''; v.remove(); } catch(e) {}
            window.__probe.done = true;
          }
        }, 1500);
      });
      v.addEventListener('error', function() {
        window.__probe.snapshots.push(snap('on-error'));
        try { v.src = ''; v.remove(); } catch(e) {}
        window.__probe.done = true;
      });
      setTimeout(function() {
        if (!window.__probe.done) {
          window.__probe.timeout = true;
          window.__probe.snapshots.push(snap('on-timeout'));
          try { v.src = ''; v.remove(); } catch(e) {}
          window.__probe.done = true;
        }
      }, 14000);
      document.body.appendChild(v);
      v.src = ${JSON.stringify(URL)};
      return 'started';
    })()
  `;
  await send('Runtime.evaluate', { expression: probeJs });
  // Poll for done
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__probe)', returnByValue: true });
    const v = r.result?.result?.value;
    if (v) {
      try {
        const obj = JSON.parse(v);
        if (obj.done) {
          console.log(`=== ${LABEL} ===`);
          console.log(JSON.stringify(obj, null, 2));
          process.exit(0);
        }
      } catch {}
    }
  }
  console.error('timeout reading probe state'); process.exit(1);
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('overall timeout'); process.exit(1); }, 30000);
