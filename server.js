// server.js
const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("OK"));
const PORT = process.env.PORT || 3000;

function keepAlive() {
  app.listen(PORT, () => {
    console.log(`[keepAlive] server running on :${PORT}`);
  });
}

module.exports = keepAlive; // ✅ 함수 하나만 export
