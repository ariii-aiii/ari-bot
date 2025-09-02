// server.js — 헬스 서버
const http = require('http');

if (!globalThis.__HEALTH_SERVER_STARTED__) {
  globalThis.__HEALTH_SERVER_STARTED__ = true;

  const PORT = Number(process.env.PORT);

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('OK');
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AriBot alive');
  });

  server.listen(PORT, () => {
    console.log(`[health] listening on ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[health] port ${PORT} already in use, skipping health server.`);
    } else {
      console.error('[health] unexpected error:', err);
    }
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

module.exports = () => {};
