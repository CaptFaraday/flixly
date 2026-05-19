// Regression smoke for movies that historically broke playback. Each entry
// names the IMDb ID, the original bug, and the budget within which it must
// reach ct>1. Add new entries here when a bug is found and fixed; future
// regressions surface the next time this runs.
//
// Why IMDb-ID-indexed (not row/col like test-10-movies.mjs): rows.json
// reshuffles weekly and Hamilton/Remarkably could move. We find each entry
// by its data-testid (poster-<row>-<imdb_id>) and click it directly.

import http from 'node:http';
import { WebSocket } from 'ws';
import { shouldSkipFocusId } from './lib/nav-helpers.mjs';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';
const POLL_MS = 500;

const FIXTURES = [
  {
    imdb_id: 'tt8503618',
    title: 'Hamilton',
    max_ms: 20000,
    bug: 'TMDB primary_release_date pointed at 2025 re-release; title-year filter rejected all 2020 sources',
    fix_commit: 'fix(backend): derive year from earliest TMDb release date',
  },
  {
    imdb_id: 'tt33100314',
    title: 'Remarkably Bright Creatures',
    max_ms: 20000,
    bug: 'preflightSubtitles only queried v3 mirror; when v3 returned [] but REST had subs, picker rejected as no_subtitles',
    fix_commit: 'fix(subtitles): preflight falls back to REST when v3 mirror is empty',
  },
];

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

async function ensureHome() {
  for (let i = 0; i < 6; i++) {
    const r = await route();
    if (r === 'home') return true;
    await press('back');
    await sleep(200);
  }
  return (await route()) === 'home';
}

async function focused() {
  return getState('(document.querySelector("[data-focused]")||{}).getAttribute && document.querySelector("[data-focused]").getAttribute("data-testid")');
}

async function focusHeroPlay() {
  for (let i = 0; i < 8; i++) {
    const f = await focused();
    if (f === 'hero-play') return;
    await press('up');
  }
}

/** Returns { row, col } where the imdb_id appears in the on-device rows.
 *  row is 1-indexed (row 0 = hero); only poster rows count.
 *  Returns null if not present. */
async function findPosition(imdbId) {
  const cached = await getState(`(function(){var raw=localStorage.getItem('rows-cache-v1')||'';if(!raw)return null;try{return JSON.parse(raw);}catch(e){return null;}})()`);
  if (!cached || !cached.shelves) return null;
  const posterRows = cached.shelves.filter((s) => s.display === 'row');
  for (let r = 0; r < posterRows.length; r++) {
    const items = posterRows[r].items || [];
    for (let c = 0; c < items.length; c++) {
      if (items[c].imdb_id === imdbId) return { row: r + 1, col: c };
    }
  }
  return null;
}

async function navigateToRowCol(row, col) {
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

async function timedPlay(fx) {
  await send('Runtime.evaluate', { expression: '(function(){window.__flixlyCurrentAttempt=null;window.__flixlyProbeResults=null;window.__flixlyStartupTimes=null;window.__flixlyLastSubs=null;window.__flixlyLastError=null;return true})()' });
  const pos = await findPosition(fx.imdb_id);
  if (!pos) return { ok: false, reason: 'not in rows.json (fixture data issue, not an app bug)' };
  await navigateToRowCol(pos.row, pos.col);
  await press('enter');
  await sleep(2000);

  let detailLoaded = false;
  for (let i = 0; i < 10; i++) {
    const r = await route();
    if (r === 'detail') { detailLoaded = true; break; }
    await sleep(POLL_MS);
  }
  if (!detailLoaded) return { ok: false, reason: 'detail did not load after navigating to row=' + pos.row + ' col=' + pos.col };
  await sleep(500);

  const tPlay = Date.now();
  await press('enter');
  const deadline = tPlay + fx.max_ms;
  let playing = false;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const s = await getState('(function(){var v=document.querySelector("video");var route=(window.__flixly||{}).route;if(!v||route!=="player")return {route:route};return {route:route,rs:v.readyState,ct:v.currentTime,paused:v.paused}})()');
    if (s && s.route === 'player' && s.rs >= 3 && s.ct > 1 && !s.paused) { playing = true; break; }
    const errTitle = await getState('(document.querySelector(".player__error-title")||{}).textContent');
    if (errTitle) {
      const errBody = await getState('(document.querySelector(".player__error-body")||{}).textContent');
      return { ok: false, elapsedMs: Date.now() - tPlay, reason: 'player error: ' + errBody };
    }
  }

  const attempt = await getState('window.__flixlyCurrentAttempt');
  const startup = await getState('window.__flixlyStartupTimes');

  await press('back'); await sleep(400);
  await press('back'); await sleep(400);
  if ((await route()) !== 'home') await ensureHome();

  if (!playing) return { ok: false, elapsedMs: Date.now() - tPlay, reason: 'timeout waiting for ct>1' };
  return {
    ok: true,
    elapsedMs: Date.now() - tPlay,
    filename: attempt && attempt.filename,
    stage1Ms: startup && startup.stages && startup.stages.totalStage1,
  };
}

ws.on('open', async () => {
  console.log('--- Regression smoke (', FIXTURES.length, 'fixtures) ---');
  await ensureHome();
  let failures = 0;
  const results = [];
  for (const fx of FIXTURES) {
    console.log('> ' + fx.title + ' (' + fx.imdb_id + ')');
    const r = await timedPlay(fx);
    results.push({ fx, r });
    if (r.ok) {
      console.log('  PASS  ' + r.elapsedMs + 'ms  ' + (r.filename || ''));
    } else {
      console.log('  FAIL  ' + (r.elapsedMs || '?') + 'ms  ' + r.reason);
      console.log('  bug: ' + fx.bug);
      console.log('  fix: ' + fx.fix_commit);
      failures++;
    }
    await sleep(1000);
  }
  console.log('\n--- Result: ' + (FIXTURES.length - failures) + '/' + FIXTURES.length + ' fixtures passing ---');
  process.exit(failures > 0 ? 1 : 0);
});

ws.on('error', (e) => { console.error('WS ERROR', e.message); process.exit(2); });
