// On-device smoke suite for Flixly. Runs three tests against the live TV at 10.0.0.238
// using CDP + state assertions on window.__flixly.
//
// Usage: node scripts/tv-smoke.mjs
//
// Exit code: 0 if all tests passed, 1 if any failed.

import http from 'node:http';
import { WebSocket } from 'ws';

const HOST = process.env.TV_HOST || '10.0.0.238';
const PORT = process.env.TV_DEVTOOLS_PORT || '9998';

const KEYCODE = { right: 39, left: 37, up: 38, down: 40, enter: 13, back: 461 };

// ---- CDP connection ----

function fetchTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/json/list`, (res) => {
      let body = ''; res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function connect() {
  const targets = await fetchTargets();
  const t = targets[0];
  if (!t) throw new Error('No DevTools target. Is the app launched?');

  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });

  const send = (method, params = {}) => {
    const _id = ++id;
    return new Promise((resolve) => {
      pending.set(_id, resolve);
      ws.send(JSON.stringify({ id: _id, method, params }));
    });
  };

  return { ws, send };
}

// ---- Helpers ----

async function evalExpr(send, expr) {
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify(${expr})`,
    returnByValue: true,
  });
  const val = r.result?.result?.value;
  if (val == null) return null;
  try { return JSON.parse(val); } catch { return val; }
}

async function dispatchKey(send, name) {
  const keyCode = KEYCODE[name];
  if (!keyCode) throw new Error(`unknown key ${name}`);
  const expr = `
    (function() {
      const ev = new KeyboardEvent('keydown', { keyCode: ${keyCode}, which: ${keyCode}, bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'keyCode', { get: () => ${keyCode} });
      Object.defineProperty(ev, 'which', { get: () => ${keyCode} });
      window.dispatchEvent(ev);
      return true;
    })()
  `;
  await send('Runtime.evaluate', { expression: expr });
}

async function dispatchKeys(send, keys, delayMs = 350) {
  for (const k of keys) {
    await dispatchKey(send, k);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

/**
 * Wait until `predicateExpr` (a JS expression evaluated on the TV) returns truthy.
 * Returns the value when met, throws on timeout.
 */
async function waitFor(send, predicateExpr, { timeoutMs = 8000, intervalMs = 300, label = predicateExpr } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await evalExpr(send, predicateExpr);
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timeout: ${label}`);
}

/**
 * Return to Home if the app isn't already there. Pops the back stack up to 5 times.
 */
async function returnHome(send) {
  for (let i = 0; i < 5; i++) {
    const state = await evalExpr(send, 'window.__flixly');
    if (state?.route === 'home') return;
    await dispatchKey(send, 'back');
    await new Promise((r) => setTimeout(r, 350));
  }
  const final = await evalExpr(send, 'window.__flixly');
  if (final?.route !== 'home') throw new Error(`could not reach home (currently on ${final?.route})`);
}

// ---- Tests ----

async function testColdLoadHome(send) {
  await returnHome(send);
  const state = await waitFor(send,
    'window.__flixly && window.__flixly.route === "home" && window.__flixly.focusedId',
    { label: 'home loaded with focus' },
  );
  return { name: 'cold-load Home', status: 'pass', detail: `route=home focusedId=${state?.focusedId ?? state}` };
}

async function testSearchReturnsResults(send) {
  await returnHome(send);
  // Navigate: Home nav (initial) -> right -> Search nav -> enter
  await dispatchKeys(send, ['right', 'enter']);
  await waitFor(send, 'window.__flixly.route === "search"', { label: 'on search screen' });
  // Focus moves to first keyboard letter (Q). Move to D: right right (Q→W→E... actually let's just use the first letter)
  // Q W E R T Y U I O P  — D is on the second row (A S D), so it's faster to just press a letter we know works.
  // From Q (initial Search focus), down to A then right right to D.
  await dispatchKeys(send, ['down', 'right', 'right', 'enter']);
  // Debounced search fires 250ms after query change. Wait up to 6s for results.
  await waitFor(send,
    'document.querySelectorAll(\'[data-testid^="poster-search-"]\').length > 0',
    { timeoutMs: 6000, label: 'search results rendered' },
  );
  const count = await evalExpr(send, 'document.querySelectorAll(\'[data-testid^="poster-search-"]\').length');
  return { name: 'search returns results', status: 'pass', detail: `results=${count}` };
}

async function testClickIntoMovie(send) {
  await returnHome(send);
  // Move focus from Home nav down into the rows below the hero. The exact sequence
  // depends on what the spatial nav picks — we don't hardcode it. Instead, send `down`
  // repeatedly until focusedId starts with `poster-`. Cap at 8 attempts.
  for (let i = 0; i < 8; i++) {
    const state = await evalExpr(send, 'window.__flixly');
    if (state?.focusedId?.startsWith('poster-')) break;
    await dispatchKey(send, 'down');
    await new Promise((r) => setTimeout(r, 300));
  }
  const finalState = await evalExpr(send, 'window.__flixly');
  if (!finalState?.focusedId?.startsWith('poster-')) {
    return { name: 'click into a movie', status: 'fail', detail: `couldn't reach a poster (last focus: ${finalState?.focusedId})` };
  }
  await dispatchKey(send, 'enter');
  try {
    await waitFor(send, 'window.__flixly.route === "detail"', { timeoutMs: 5000, label: 'detail screen loaded' });
  } catch (e) {
    return { name: 'click into a movie', status: 'fail', detail: String(e instanceof Error ? e.message : e) };
  }
  return { name: 'click into a movie', status: 'pass', detail: 'route=detail' };
}

// ---- Main ----

async function main() {
  const { ws, send } = await connect();
  console.log(`→ connected to ${HOST}:${PORT}`);

  const tests = [
    testColdLoadHome,
    testSearchReturnsResults,
    testClickIntoMovie,
  ];

  const results = [];
  for (const t of tests) {
    process.stdout.write(`  ${t.name}... `);
    let result;
    try {
      result = await t(send);
    } catch (e) {
      result = { name: t.name, status: 'fail', detail: String(e instanceof Error ? e.message : e) };
    }
    const icon = result.status === 'pass' ? '✓' : '✗';
    console.log(`${icon} ${result.detail || ''}`);
    results.push(result);
  }

  ws.close();

  const failed = results.filter((r) => r.status !== 'pass').length;
  console.log('');
  console.log(`${results.length - failed}/${results.length} passed${failed ? `, ${failed} failed` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
