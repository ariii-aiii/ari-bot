// server.js — keepAlive (Render/Replit 둘 다 OK)
const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("AriBot OK"));

const PORT = process.env.PORT || 3000; // 충돌 나면 .env에 포트 바꿔도 됨
app.listen(PORT, () => console.log("Keep-alive on", PORT));

module.exports = () => {};
