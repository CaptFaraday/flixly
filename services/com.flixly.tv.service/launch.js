// Flixly localhost HTTP proxy. Runs as a webOS JS Service alongside the
// renderer; the <video> element points at http://127.0.0.1:11470/proxy?url=...
// instead of the remote TorBox CDN URL directly.
//
// Why this exists: webOS's native media pipeline silently drops idle TCP
// sockets when streaming from remote CDNs (well-documented; affects shaka,
// jellyfin, anyone going direct). By keeping the native pipeline talking
// to a localhost socket — which never gets reaped — playback is stable.
// This service is the same pattern Stremio for LG TV uses.
//
// Responsibilities:
//   - Walk HTTP redirect chains (TorBox does 302 → 307 → CDN)
//   - Forward Range headers (essential for seek)
//   - Retry transient 5xx with exponential backoff
//   - Stream bytes back; never buffer the whole response
//   - CORS for the file:// renderer

var http = require('http');
var https = require('https');
var urlmod = require('url');
var Service = require('webos-service');

var PORT = 11470;
var MAX_ATTEMPTS = 4;
var MAX_REDIRECTS = 6;

var service = new Service('com.flixly.tv.service');
var ready = false;
var pending = [];

// Keep the service alive after the renderer's start call returns.
service.activityManager.create('keepAlive', function() {});

service.register('start', function(message) {
    if (ready) message.respond({ ready: true, port: PORT });
    else pending.push(message);
});

service.register('health', function(message) {
    message.respond({ ready: ready, port: PORT });
});

function libFor(parsed) {
    return parsed.protocol === 'https:' ? https : http;
}

function backoff(attempt) {
    return Math.min(Math.pow(2, attempt) * 250, 5000);
}

function copyResponseHeaders(upRes) {
    var out = {};
    var passthrough = [
        'content-type', 'content-length', 'content-range', 'accept-ranges',
        'cache-control', 'last-modified', 'etag',
    ];
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
    if (redirects > MAX_REDIRECTS) {
        if (!res.headersSent) { res.writeHead(502); }
        res.end('too many redirects');
        return;
    }

    var parsed;
    try { parsed = urlmod.parse(targetUrl); }
    catch (e) {
        if (!res.headersSent) res.writeHead(400);
        res.end('invalid url');
        return;
    }

    var headers = {};
    // Forward only the headers the upstream cares about. Avoid sending the
    // file:// Origin header (some CDNs reject it) and avoid Accept-Encoding
    // (we don't want compression on a video stream).
    var forward = ['range', 'if-range', 'if-modified-since', 'if-none-match', 'user-agent'];
    for (var i = 0; i < forward.length; i++) {
        var k = forward[i];
        if (req.headers[k] != null) headers[k] = req.headers[k];
    }
    if (!headers['user-agent']) {
        headers['user-agent'] = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36';
    }

    var opts = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.path,
        method: req.method,
        headers: headers,
    };

    var upReq = libFor(parsed).request(opts, function(upRes) {
        var status = upRes.statusCode;
        if (status >= 300 && status < 400 && upRes.headers.location) {
            upRes.resume();
            var nextUrl = urlmod.resolve(targetUrl, upRes.headers.location);
            proxyRequest(nextUrl, req, res, attempt, redirects + 1);
            return;
        }
        if (status >= 500 && status < 600 && attempt < MAX_ATTEMPTS - 1) {
            upRes.resume();
            var delay = backoff(attempt);
            setTimeout(function() { proxyRequest(targetUrl, req, res, attempt + 1, redirects); }, delay);
            return;
        }
        if (res.headersSent) {
            upRes.resume();
            return;
        }
        res.writeHead(status, copyResponseHeaders(upRes));
        upRes.pipe(res);
        res.on('close', function() { try { upRes.destroy(); } catch (_) {} });
    });

    upReq.on('error', function(err) {
        if (attempt < MAX_ATTEMPTS - 1) {
            var delay = backoff(attempt);
            setTimeout(function() { proxyRequest(targetUrl, req, res, attempt + 1, redirects); }, delay);
            return;
        }
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
        }
        try { res.end('proxy: ' + err.message); } catch (_) {}
    });

    req.on('close', function() { try { upReq.destroy(); } catch (_) {} });

    if (req.method === 'GET' || req.method === 'HEAD') {
        upReq.end();
    } else {
        req.pipe(upReq);
    }
}

http.createServer(function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, HEAD',
            'Access-Control-Allow-Headers': 'Range, If-Range, If-Modified-Since, If-None-Match',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
    }

    var parsed = urlmod.parse(req.url, true);

    if (parsed.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, port: PORT }));
        return;
    }

    if (parsed.pathname === '/proxy' && parsed.query.url) {
        proxyRequest(parsed.query.url, req, res);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found; expected GET /proxy?url=<encoded>');
}).listen(PORT, '127.0.0.1', function() {
    ready = true;
    pending.forEach(function(m) { m.respond({ ready: true, port: PORT }); });
    pending = [];
});
