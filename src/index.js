// src/index.js
require('dotenv').config();
require('../server');

console.log('[BOOT:A] index.js started');

const { Client, GatewayIntentBits, Events } = require('discord.js');

console.log('[BOOT:B] discord.js imported');

// 5초마다 살아있음 표시(엔트리/파일 교체 여부 확인용)
setInterval(() => console.log('[TICK] still running'), 5000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds], // 최소 Intent만
});

client.on('debug', (m) => {
  const s = String(m);
  if (
    s.includes('HELLO') ||
    s.includes('IDENTIFY') ||
    s.includes('READY') ||
    s.includes('Heartbeat') ||
    s.includes('session')
  ) {
    console.log('[GW-DEBUG]', s);
  }
});
client.on('shardReady', (id, unavailable) => {
  console.log(`[GW] shardReady #${id} (unavailable=${!!unavailable})`);
});
client.on('shardDisconnect', (event, id) => {
  console.warn(`[GW] shardDisconnect #${id} code=${event?.code} clean=${event?.wasClean}`);
});
client.on('shardError', (err, id) => {
  console.error(`[GW] shardError #${id}:`, err?.message || err);
});
client.on('invalidated', () => {
  console.error('[GW] session invalidated — exit for restart');
  process.exit(1);
});
client.on('rateLimit', (info) => {
  console.warn('[GW] rateLimit', info);
});

let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] Logged in as ${c.user.tag} (${c.user.id})`);
});

const { REST, Routes } = require('discord.js');
const token = (process.env.BOT_TOKEN || '').trim();

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    const me = await rest.get(Routes.user('@me'));
    console.log('[REST] Bot account =', me.username, me.id);
  } catch (e) {
    console.error('[REST] FAIL', e);
  }
})();


// 로그인
const token = (process.env.BOT_TOKEN || '').trim();
if (!token) {
  console.error('[FATAL] BOT_TOKEN empty');
  process.exit(1);
}
console.log('[BOOT:C] trying login…');
client.login(token).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
