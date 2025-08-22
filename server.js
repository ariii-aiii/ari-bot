// server.js  (루트)
const http = require('http');
const port = process.env.PORT || 3000;

http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}).listen(port, () => {
  console.log('[health] listening on', port);
});
