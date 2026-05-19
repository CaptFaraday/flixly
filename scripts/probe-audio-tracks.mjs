// One-shot: navigate to a specific Home row/col, press play, wait for
// playback, then dump audioTracks so we can see what's available and
// which one ended up enabled. Used to verify the "DUAL" picks (Avatar
// "Fogo e Cinzas") actually output English audio at runtime.

import http from 'node:http';
import { WebSocket } from 'ws';
import { shouldSkipFocusId } from './lib/nav-helpers.mjs';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const ROW = parseInt(process.env.ROW || '1', 10);
const COL = parseInt(process.env.COL || '3', 10);
const MAX_WAIT_MS = 40000;
const POLL_MS = 500;

const targets = await new Promise((res, rej) =>
  http.get(`http://${HOST}:${PORT}/json/list`, (r) => {
    let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej),
);
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => { const i = ++id; return new Promise((r) => { pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEY = { up: 38, down: 40, left: 37, right: 39, enter: 13, back: 461 };
const dispatchKey = (kc) => send('Runtime.evaluate', { expression: '(function(){var ev=new KeyboardEvent("keydown",{bubbles:true,cancelable:true});Object.defineProperty(ev,"keyCode",{get:function(){return ' + kc + '}});window.dispatchEvent(ev);return true})()' });
async function press(...ns) { for (const n of ns) { await dispatchKey(KEY[n]); await sleep(150); } }
async function getState(expr) { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(' + expr + ')', returnByValue: true }); return r.result && r.result.result && r.result.result.value && JSON.parse(r.result.result.value); }
const route = () => getState('(window.__flixly||{}).route');
const focused = () => getState('(document.querySelector("[data-focused]")||{}).getAttribute && document.querySelector("[data-focused]").getAttribute("data-testid")');

async function ensureHome() {
  for (let i = 0; i < 6; i++) {
    const r = await route();
    if (r === 'home') return true;
    await press('back');
    await sleep(200);
  }
  return (await route()) === 'home';
}

async function focusHeroPlay() {
  for (let i = 0; i < 8; i++) {
    const f = await focused();
    if (f === 'hero-play') return;
    await press('up');
  }
}

async function navigateToMovie(row, col) {
  await focusHeroPlay();
  if (row === 0) return;
  let posterRowsPassed = 0;
  let safety = 12;
  while (posterRowsPassed < row && safety-- > 0) {
    await press('down');
    const f = await focused();
    if (!shouldSkipFocusId(f) && f) posterRowsPassed++;
  }
  for (let i = 0; i < col; i++) { await press('right'); }
}

ws.on('open', async () => {
  console.log(`--- probe audioTracks for row=${ROW} col=${COL} ---`);
  await ensureHome();
  await navigateToMovie(ROW, COL);

  await press('enter');
  await sleep(2500);
  const title = await getState('(document.querySelector(".detail__title")||{}).textContent');
  console.log('detail title:', title);
  if (!title) { console.log('FAIL: detail did not load'); process.exit(1); }

  const tPlay = Date.now();
  await press('enter');

  let playing = false;
  while (Date.now() - tPlay < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const s = await getState('(function(){var v=document.querySelector("video");if(!v)return null;return {rs:v.readyState,ct:v.currentTime,paused:v.paused}})()');
    if (s && s.rs >= 3 && s.ct > 1 && !s.paused) { playing = true; break; }
  }
  if (!playing) { console.log('FAIL: playback never reached ct>1'); process.exit(1); }
  console.log('playback started at', Date.now() - tPlay, 'ms');

  // Give the loadedmetadata handlers a moment to attach + run track selection.
  await sleep(1500);

  const dump = await getState(`(function(){
    var v=document.querySelector('video');
    var t=v.audioTracks;
    var out={filename:(window.__flixlyCurrentAttempt||{}).filename, attemptIdx:(window.__flixlyCurrentAttempt||{}).index, attemptTotal:(window.__flixlyCurrentAttempt||{}).total};
    out.startupTimes=window.__flixlyStartupTimes;
    out.probeResults=window.__flixlyProbeResults;
    if(!t) { out.audioTracksSupported=false; return out; }
    var tracks=[];
    for (var i=0;i<t.length;i++) tracks.push({index:i, language:t[i].language||'', label:t[i].label||'', enabled:!!t[i].enabled, kind:t[i].kind||''});
    out.audioTracksSupported=true;
    out.audioTracks={length:t.length, tracks:tracks};
    return out;
  })()`);
  console.log('dump:', JSON.stringify(dump, null, 2));

  await press('back');
  await sleep(400);
  await press('back');
  await sleep(400);
  process.exit(0);
});

ws.on('error', (e) => { console.error('WS ERROR', e.message); process.exit(1); });
