// Visible+audible codec playback test. Injects a <video> element on top of
// the running app for ~PLAY_SECONDS so a human can hear/see whether the
// codec decoded correctly. Cleans up automatically.
//
// Usage:
//   node scripts/tv-codec-play.mjs <url> [audioTrackIndex] [playSeconds]
import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const URL = process.argv[2];
const AUDIO_INDEX = process.argv[3] != null ? Number(process.argv[3]) : null;
const PLAY_SECONDS = process.argv[4] != null ? Number(process.argv[4]) : 7;
if (!URL) { console.error('usage: tv-codec-play.mjs <url> [audioTrackIndex] [playSeconds]'); process.exit(1); }

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
  const js = `
    (function() {
      window.__playTest = { events: [], done: false };
      // Remove any prior test element
      var existing = document.getElementById('__codec_test_video');
      if (existing) existing.remove();
      var v = document.createElement('video');
      v.id = '__codec_test_video';
      v.muted = false;
      v.volume = 1.0;
      v.controls = false;
      v.style.cssText = 'position:fixed;top:10%;left:10%;width:80%;height:80%;z-index:99999;background:#000;border:4px solid magenta;';
      var EVENTS = ['loadstart','loadedmetadata','canplay','playing','error','stalled','waiting','ended'];
      EVENTS.forEach(function(e) {
        v.addEventListener(e, function() {
          window.__playTest.events.push({ event: e, t: Date.now(), code: v.error ? v.error.code : null, msg: v.error ? v.error.message : null });
        });
      });
      v.addEventListener('canplay', function() {
        var tracks = [];
        if (v.audioTracks) {
          for (var i = 0; i < v.audioTracks.length; i++) {
            var a = v.audioTracks[i];
            tracks.push({ id: a.id, language: a.language, enabled: a.enabled });
          }
        }
        window.__playTest.audioTracksOnCanplay = tracks;
        ${AUDIO_INDEX != null ? `
        if (v.audioTracks && v.audioTracks.length > ${AUDIO_INDEX}) {
          for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = (j === ${AUDIO_INDEX});
          window.__playTest.selectedTrackIndex = ${AUDIO_INDEX};
        }
        ` : ''}
        v.play().catch(function(e){ window.__playTest.playRejected = String(e); });
      });
      setTimeout(function() {
        var finalTracks = [];
        if (v.audioTracks) {
          for (var i = 0; i < v.audioTracks.length; i++) {
            var a = v.audioTracks[i];
            finalTracks.push({ id: a.id, language: a.language, enabled: a.enabled });
          }
        }
        window.__playTest.finalSnapshot = {
          videoWidth: v.videoWidth, videoHeight: v.videoHeight,
          duration: isFinite(v.duration) ? v.duration : null,
          currentTime: v.currentTime,
          mediaId: v.mediaId || null,
          audioTracks: finalTracks,
          paused: v.paused,
        };
        try { v.pause(); v.src = ''; v.remove(); } catch(e) {}
        window.__playTest.done = true;
      }, ${(PLAY_SECONDS * 1000) + 2000});
      document.body.appendChild(v);
      v.src = ${JSON.stringify(URL)};
      return 'started';
    })()
  `;
  await send('Runtime.evaluate', { expression: js });
  console.log(`Playing for ~${PLAY_SECONDS}s — listen/watch the TV...`);
  for (let i = 0; i < (PLAY_SECONDS * 2) + 8; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__playTest)', returnByValue: true });
    const v = r.result?.result?.value;
    if (v) {
      try {
        const obj = JSON.parse(v);
        if (obj.done) {
          console.log('---');
          console.log(JSON.stringify(obj, null, 2));
          process.exit(0);
        }
      } catch {}
    }
  }
  console.error('timeout');
  process.exit(1);
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('overall timeout'); process.exit(1); }, 60000);
