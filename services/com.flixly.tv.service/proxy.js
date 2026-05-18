var http = require('http');
var https = require('https');
var urlmod = require('url');

var MAX_PROXY_ATTEMPTS = 4;
var MAX_REDIRECTS = 6;

function libFor(parsed) { return parsed.protocol === 'https:' ? https : http; }
function backoff(attempt) { return Math.min(Math.pow(2, attempt) * 250, 5000); }

function copyResponseHeaders(upRes) {
  var out = {};
  var passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag'];
  for (var i = 0; i < passthrough.length; i++) {
    var k = passthrough[i];
    if (upRes.headers[k] != null) out[k] = upRes.headers[k];
  }
  out['Access-Control-Allow-Origin'] = '*';
  out['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length, Accept-Ranges';
  return out;
}

function proxyRequest(targetUrl, req, res, attempt, redirects) {
  attempt = attempt || 0;
  redirects = redirects || 0;
  if (redirects > MAX_REDIRECTS) { if (!res.headersSent) res.writeHead(502); res.end('too many redirects'); return; }
  var parsed;
  try { parsed = urlmod.parse(targetUrl); } catch (e) { if (!res.headersSent) res.writeHead(400); res.end('invalid url'); return; }
  var headers = {};
  var forward = ['range', 'if-range', 'if-modified-since', 'if-none-match', 'user-agent'];
  for (var i = 0; i < forward.length; i++) { var k = forward[i]; if (req.headers[k] != null) headers[k] = req.headers[k]; }
  if (!headers['user-agent']) headers['user-agent'] = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36';
  var opts = { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.path, method: req.method, headers: headers };
  var upReq = libFor(parsed).request(opts, function(upRes) {
    var status = upRes.statusCode;
    if (status >= 300 && status < 400 && upRes.headers.location) {
      upRes.resume();
      var nextUrl = urlmod.resolve(targetUrl, upRes.headers.location);
      proxyRequest(nextUrl, req, res, attempt, redirects + 1);
      return;
    }
    if (status >= 500 && status < 600 && attempt < MAX_PROXY_ATTEMPTS - 1) {
      upRes.resume();
      setTimeout(function() { proxyRequest(targetUrl, req, res, attempt + 1, redirects); }, backoff(attempt));
      return;
    }
    if (res.headersSent) { upRes.resume(); return; }
    res.writeHead(status, copyResponseHeaders(upRes));
    upRes.pipe(res);
    res.on('close', function() { try { upRes.destroy(); } catch (_) {} });
  });
  upReq.on('error', function(err) {
    if (attempt < MAX_PROXY_ATTEMPTS - 1) { setTimeout(function() { proxyRequest(targetUrl, req, res, attempt + 1, redirects); }, backoff(attempt)); return; }
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    try { res.end('proxy: ' + err.message); } catch (_) {}
  });
  req.on('close', function() { try { upReq.destroy(); } catch (_) {} });
  if (req.method === 'GET' || req.method === 'HEAD') upReq.end(); else req.pipe(upReq);
}

module.exports = { proxyRequest: proxyRequest };
