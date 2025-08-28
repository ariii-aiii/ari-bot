// server.js — 헬스 서버 (중복 실행 방지)
const http = require('http');

if (!globalThis.__HEALTH_SERVER_STARTED__) {
  globalThis.__HEALTH_SERVER_STARTED__ = true;

  const PORT = Number(process.env.PORT) || 3001;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  server.listen(PORT);
  server.on('listening', () => {
    console.log(`[health] listening on ${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[health] port ${PORT} already in use, skipping health server.`);
    } else {
      console.error('[health] unexpected error:', err);
    }
  });

  // 종료 시 정리
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

// require만 해도 위에서 실행되므로 export는 의미 없음
module.exports = () => {};
