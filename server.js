// server.js
const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("OK")); // 업타임로봇/헬스체크용

const PORT = process.env.PORT || 3000;

// 이미 리스닝 중이면 또 켜지지 않도록 가드
if (!global.__keepAliveServer) {
  global.__keepAliveServer = app.listen(PORT, () => {
    console.log("[keepAlive] listening on", PORT);
  });
}

module.exports = app; // (원하면 내보내기)
