// server.js — 간단 keepAlive 서버 (Render/무료호스팅용)
const http = require("http");
const PORT = process.env.PORT || 3000;

function keepAlive() {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("AriBot alive\n");
  });
  server.listen(PORT, () => console.log(`[keepAlive] listening on ${PORT}`));
}

module.exports = keepAlive;
