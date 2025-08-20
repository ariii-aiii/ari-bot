// server.js
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => res.send('OK'));

module.exports = function keepAlive() {
  app.listen(PORT, () => {
    console.log(`[keepAlive] listening on ${PORT}`);
  });
};
