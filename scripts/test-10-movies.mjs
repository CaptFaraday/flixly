import http from 'node:http';
import { WebSocket } from 'ws';
import { shouldSkipFocusId } from './lib/nav-helpers.mjs';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const MAX_WAIT_MS = 35000;
const POLL_MS = 500;
const SUB_WAIT_MS = 8000;

const targets = await new Promise((res, rej) => http.get(`http://${HOST}:${PORT}/json/list`, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); }).on('error', rej));
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p={}) => { const i=++id; return new Promise(r => { pending.set(i,r); ws.send(JSON.stringify({id:i,method:m,params:p})); }); };
ws.on('message', d => { const m=JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KEY = { up:38, down:40, left:37, right:39, enter:13, back:461 };
const dispatchKey = kc => send('Runtime.evaluate', { expression: '(function(){var ev=new KeyboardEvent("keydown",{bubbles:true,cancelable:true});Object.defineProperty(ev,"keyCode",{get:function(){return ' + kc + '}});window.dispatchEvent(ev);return true})()' });
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

async function timedPlay(label) {
  await send('Runtime.evaluate', { expression: '(function(){window.__flixlyCurrentAttempt=null;window.__flixlyProbeResults=null;window.__flixlyStartupTimes=null;window.__flixlyLastSubs=null;return true})()' });

  await press('enter');
  await sleep(2500);

  const title = await getState('(document.querySelector(".detail__title")||{}).textContent');
  if (!title) return { label, ok: false, reason: 'detail did not load' };

  const tPlay = Date.now();
  await press('enter');

  let result = null;
  const tDeadline = tPlay + MAX_WAIT_MS;
  while (Date.now() < tDeadline) {
    await sleep(POLL_MS);
    const state = await getState('(function(){var v=document.querySelector("video");var route=(window.__flixly||{}).route;if(!v||route!=="player")return {route:route};return {route:route,rs:v.readyState,ct:v.currentTime,paused:v.paused}})()');
    if (state && state.route === 'player' && state.rs >= 3 && state.ct > 1 && !state.paused) {
      result = { ok: true, elapsedMs: Date.now() - tPlay, ct: state.ct };
      break;
    }
    const errTitle = await getState('(document.querySelector(".player__error-title")||{}).textContent');
    if (errTitle) { result = { ok: false, elapsedMs: Date.now() - tPlay, reason: 'player error: ' + errTitle }; break; }
  }
  if (!result) result = { ok: false, elapsedMs: Date.now() - tPlay, reason: 'timeout waiting for playback' };

  // Subtitle effect runs in parallel with playback start: awaitCanPlay → moviehash
  // (HEAD + 2 range GETs) → OpenSubtitles lookup. Often not done by ct>1.
  // Poll up to SUB_WAIT_MS for __flixlyLastSubs to settle so we can verify the match.
  let subs = null;
  if (result.ok) {
    const subDeadline = Date.now() + SUB_WAIT_MS;
    while (Date.now() < subDeadline) {
      subs = await getState('window.__flixlyLastSubs');
      if (subs && subs.subSource) break;
      await sleep(500);
    }
  } else {
    subs = await getState('window.__flixlyLastSubs');
  }

  const attempt = await getState('window.__flixlyCurrentAttempt');
  const probe = await getState('window.__flixlyProbeResults');
  const startup = await getState('window.__flixlyStartupTimes');

  await press('back');
  await sleep(400);
  await press('back');
  await sleep(400);
  if ((await route()) !== 'home') await ensureHome();

  return {
    label,
    title,
    ok: result.ok,
    elapsedMs: result.elapsedMs,
    reason: result.reason,
    filename: attempt && attempt.filename,
    attemptIdx: attempt && attempt.index,
    candidateCount: attempt && attempt.total,
    stage1Ms: startup && startup.stages && startup.stages.totalStage1,
    probeMs: startup && startup.stages && startup.stages.probeMs,
    probeSummary: probe && probe.map(p => (p.ok ? 'OK' : 'X')).join(''),
    subSource: subs && subs.subSource,
    subMatchedFilename: subs && (subs.matchedFilename || subs.matchedReleaseName),
  };
}

ws.on('open', async () => {
  console.log('--- 10-movie playback test ---');
  await ensureHome();

  const plan = [
    ['#1 Hero', 0, 0],
    ['#2 row1 col0', 1, 0],
    ['#3 row1 col1', 1, 1],
    ['#4 row1 col3', 1, 3],
    ['#5 row2 col0', 2, 0],
    ['#6 row2 col2', 2, 2],
    ['#7 row3 col0', 3, 0],
    ['#8 row3 col1', 3, 1],
    ['#9 row3 col4', 3, 4],
    ['#10 row1 col6', 1, 6],
  ];

  const results = [];
  for (const [label, r, c] of plan) {
    console.log('> ' + label + ' navigate row=' + r + ' col=' + c);
    await navigateToMovie(r, c);
    const result = await timedPlay(label);
    console.log('  ' + (result.ok ? 'OK' : 'FAIL') + '  ' + (result.title || '?') + '  ' + result.elapsedMs + 'ms  ' + (result.filename ? result.filename.slice(0,55) : '') + (result.reason ? '  REASON: ' + result.reason : ''));
    results.push(result);
    await sleep(1000);
  }

  console.log('\n--- Summary table ---');
  for (const r of results) {
    const title = (r.title || '?').padEnd(40).slice(0,40);
    const ms = r.ok ? (r.elapsedMs + 'ms').padEnd(8) : 'FAIL    ';
    const s1 = (r.stage1Ms != null ? r.stage1Ms + 'ms' : '?').padEnd(7);
    const prb = (r.probeSummary || '?').padEnd(6);
    const idx = (r.attemptIdx != null ? r.attemptIdx + '/' + r.candidateCount : '?').padEnd(7);
    const subs = (r.subSource || '?').padEnd(22);
    console.log(title + ' | ' + ms + ' | s1=' + s1 + ' | probe=' + prb + ' | pick=' + idx + ' | subs=' + subs);
  }

  console.log('\n--- Raw ---');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
});

ws.on('error', e => { console.error('WS ERROR', e.message); process.exit(1); });
