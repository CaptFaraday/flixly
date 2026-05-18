var http = require('http');
var https = require('https');
var urlmod = require('url');

var MAX_REDIRECTS = 6;
var PROBE_TIMEOUT_MS = 5000;
var PROBE_RANGE_BYTES = 65535;
var PROBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
var UNSUPPORTED_CODEC_IDS = ['A_DTS', 'A_TRUEHD', 'A_MLP'];

var probeCache = new Map();

function libFor(parsed) { return parsed.protocol === 'https:' ? https : http; }

function extractInfohash(url) {
  var m = url.match(/\/resolve\/[^/]+\/[^/]+\/([a-f0-9]{40})\//i);
  return m ? m[1].toLowerCase() : null;
}
function getCached(infohash) {
  if (!infohash) return null;
  var e = probeCache.get(infohash);
  if (!e) return null;
  if (Date.now() - e.ts > PROBE_CACHE_TTL_MS) { probeCache.delete(infohash); return null; }
  return e.result;
}
function storeCached(infohash, result) {
  if (!infohash) return;
  probeCache.set(infohash, { ts: Date.now(), result: result });
}

function fetchPreamble(targetUrl, byteRange, redirects, cb) {
  redirects = redirects || 0;
  if (redirects > MAX_REDIRECTS) return cb(new Error('too many redirects'));
  var parsed;
  try { parsed = urlmod.parse(targetUrl); } catch (e) { return cb(new Error('invalid url')); }
  var opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path,
    method: 'GET',
    headers: {
      range: 'bytes=0-' + byteRange,
      'user-agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
    },
  };
  var r = libFor(parsed).request(opts, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      var nextUrl = urlmod.resolve(targetUrl, res.headers.location);
      return fetchPreamble(nextUrl, byteRange, redirects + 1, cb);
    }
    if (res.statusCode >= 400) { res.resume(); return cb(new Error('upstream ' + res.statusCode)); }
    var chunks = [];
    var total = 0;
    res.on('data', function(chunk) {
      chunks.push(chunk);
      total += chunk.length;
      if (total > byteRange + 1024) { res.destroy(); }
    });
    res.on('end', function() { cb(null, { body: Buffer.concat(chunks, total) }); });
    res.on('error', function(err) { cb(err); });
  });
  r.on('error', function(err) { cb(err); });
  r.end();
}

function scanForString(buf, needle) {
  var nb = Buffer.from(needle);
  if (buf.length < nb.length) return false;
  var max = buf.length - nb.length;
  outer:
  for (var i = 0; i < max; i++) {
    for (var j = 0; j < nb.length; j++) { if (buf[i + j] !== nb[j]) continue outer; }
    return true;
  }
  return false;
}

function detectContainer(buf) {
  if (buf.length < 16) return null;
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) {
    if (scanForString(buf, 'matroska')) return 'matroska';
    if (scanForString(buf, 'webm')) return 'webm';
    return 'ebml';
  }
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4';
  return null;
}

function findUnsupportedCodecs(buf) {
  var found = [];
  for (var i = 0; i < UNSUPPORTED_CODEC_IDS.length; i++) {
    if (scanForString(buf, UNSUPPORTED_CODEC_IDS[i])) found.push(UNSUPPORTED_CODEC_IDS[i]);
  }
  return found;
}

function withTimeout(fn, ms, timeoutMessage) {
  return new Promise(function(resolve) {
    var done = false;
    var timer = setTimeout(function() {
      if (done) return;
      done = true;
      resolve({ ok: false, reason: timeoutMessage });
    }, ms);
    fn(function(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) resolve({ ok: false, reason: err.message });
      else resolve({ ok: true, result: result });
    });
  });
}

function handleProbe(targetUrl, cb) {
  var infohash = extractInfohash(targetUrl);
  var cached = getCached(infohash);
  if (cached) {
    var out = { ok: cached.ok, cached: true };
    if (cached.container) out.container = cached.container;
    if (cached.reason) out.reason = cached.reason;
    if (cached.unsupportedCodecs) out.unsupportedCodecs = cached.unsupportedCodecs;
    return cb(out);
  }
  withTimeout(function(done) { fetchPreamble(targetUrl, PROBE_RANGE_BYTES, 0, done); }, PROBE_TIMEOUT_MS, 'probe timeout').then(function(wrapped) {
    if (!wrapped.ok) {
      storeCached(infohash, { ok: false, reason: wrapped.reason });
      return cb(wrapped);
    }
    var preamble = wrapped.result;
    var container = detectContainer(preamble.body);
    var unsupported = (container === 'matroska' || container === 'webm') ? findUnsupportedCodecs(preamble.body) : [];
    var result;
    if (!container) {
      result = { ok: false, reason: 'unrecognised container' };
    } else if (unsupported.length > 0) {
      result = { ok: false, reason: 'unsupported codecs: ' + unsupported.join(','), container: container, unsupportedCodecs: unsupported };
    } else {
      result = { ok: true, container: container };
    }
    storeCached(infohash, result);
    cb(result);
  });
}

module.exports = { handleProbe: handleProbe, cacheSize: function() { return probeCache.size; } };
