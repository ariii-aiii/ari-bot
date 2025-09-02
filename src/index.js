// src/index.js
require('dotenv').config();
require('../server');

console.log('[BOOT] index.js started');

const {
  Client, GatewayIntentBits, Events,
  REST, Routes
} = require('discord.js');

// === (1) 토큰: 단 한 번만 선언! ===
const TOKEN = (process.env.BOT_TOKEN || '').trim();
if (!TOKEN) {
  console.error('[FATAL] BOT_TOKEN is empty');
  process.exit(1);
}
console.log('[CHECK] token length =', TOKEN.length);

// === (2) REST로 토큰/봇 계정 확인(선택) ===
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const me = await rest.get(Routes.user('@me'));
    console.log('[REST] Bot =', me.username, me.id);
  } catch (e) {
    console.error('[REST] FAIL', e.status || e.code || e.message || e);
  }
})();

// === (3) 클라이언트/로그인 ===
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] Logged in as ${c.user.tag} (${c.user.id})`);
});

client.login(TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});

// 살아있음 핑(옵션)
setInterval(() => console.log('[TICK] still running'), 5000);
