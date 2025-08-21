// server.js — keepAlive 미니 서버 (Replit/Render 등에서 슬립 방지)
const express = require("express");

let started = false;

module.exports = function keepAlive() {
  if (started) return;
  const app = express();

  app.get("/", (_req, res) => res.send("OK"));
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`[keepAlive] listening on :${port}`);
  });

  started = true;
};
