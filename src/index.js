// src/index.js
require('dotenv').config();

// ---- 아주 작은 헬스 서버 (Render가 프로세스 살아있다고 인식)
require('../server');

// ----- 디스코드 로그인만 확인 -----
const { Client, GatewayIntentBits, Events } = require('discord.js');

// 꼭 필요한 최소 Intent만
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // 최소
});

// 디버그(게이트웨이 상태 보려고 전부 출력)
client.on('debug', (m) => {
  const s = String(m);
  if (
    s.includes('Heartbeat') ||
    s.includes('session') ||
    s.includes('READY') ||
    s.includes('IDENTIFY') ||
    s.includes('HELLO')
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

// READY 찍히는지만 본다
let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] Logged in as ${c.user.tag} (${c.user.id})`);
});

// 로그인
const token = (process.env.BOT_TOKEN || '').trim();
if (!token) {
  console.error('[FATAL] BOT_TOKEN empty');
  process.exit(1);
}
client.login(token).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
