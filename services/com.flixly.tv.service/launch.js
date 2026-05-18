// Minimal feasibility spike: webOS JS Service that listens on localhost
// port 11470 and answers a tiny GET / with 200 OK. Confirms the service
// can run a TCP HTTP server alongside the renderer.
var http = require('http');
var Service = require('webos-service');

var service = new Service('com.flixly.tv.service');
var ready = false;
var pending = [];

// Keep the service alive after the start call returns.
service.activityManager.create('keepAlive', function() {});

service.register('start', function(message) {
    if (ready) message.respond({ ready: true, port: 11470 });
    else pending.push(message);
});

service.register('health', function(message) {
    message.respond({ ready: ready, port: 11470 });
});

http.createServer(function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, path: req.url, ua: 'flixly-spike' }));
}).listen(11470, '127.0.0.1', function() {
    ready = true;
    pending.forEach(function(m) { m.respond({ ready: true, port: 11470 }); });
    pending = [];
});
