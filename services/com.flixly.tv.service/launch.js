var http = require('http');
var urlmod = require('url');
var Service = require('webos-service');
var proxy = require('./proxy');
var probe = require('./probe');

var PORT = 11470;

var service = new Service('com.flixly.tv.service');
var ready = false;
var pending = [];

service.activityManager.create('keepAlive', function() {});
service.register('start', function(message) {
  if (ready) message.respond({ ready: true, port: PORT });
  else pending.push(message);
});
service.register('health', function(message) {
  message.respond({ ready: ready, port: PORT, probeCache: probe.cacheSize() });
});

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
    res.end(JSON.stringify({ ok: true, port: PORT, probeCache: probe.cacheSize() }));
    return;
  }
  if (parsed.pathname === '/probe') {
    if (!parsed.query.url) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'missing url' }));
      return;
    }
    probe.handleProbe(parsed.query.url, function(result) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }
  if (parsed.pathname === '/proxy' && parsed.query.url) {
    proxy.proxyRequest(parsed.query.url, req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(PORT, '127.0.0.1', function() {
  ready = true;
  pending.forEach(function(m) { m.respond({ ready: true, port: PORT }); });
  pending = [];
});
