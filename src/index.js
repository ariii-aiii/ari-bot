// src/index.js
require('dotenv').config();
require('../server');
const TOKEN = (process.env.BOT_TOKEN || '').trim();
console.log('[CHECK] token length=', TOKEN.length, 'begins', TOKEN.slice(0,3), 'ends', TOKEN.slice(-3));

console.log('[BOOT] index.js started');

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} = require('discord.js');

// ===== 1) 클라이언트 생성 (최소 인텐트) =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// 5초마다 살아있음 표시
setInterval(() => console.log('[TICK] still running'), 5000);

// ===== 2) 게이트웨이 디버그/상태 =====
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

// ===== 3) READY 워치독 =====
let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] Logged in as ${c.user.tag} (${c.user.id})`);
});

// ===== 4) 토큰/REST 프리플라이트 =====
const TOKEN = (process.env.BOT_TOKEN || '').trim();
if (!TOKEN) {
  console.error('[FATAL] BOT_TOKEN empty');
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const me = await rest.get(Routes.user('@me'));
    console.log('[REST] Bot account =', `${me.username} (${me.id})`);
    // 필요하면 초대 링크 확인
    console.log(
      '[INVITE]',
      `https://discord.com/api/oauth2/authorize?client_id=${me.id}&permissions=8&scope=bot%20applications.commands`
    );
  } catch (e) {
    console.error('[REST] FAIL', e?.status || '', e?.code || '', e?.message || e);
    // REST가 아예 막히면 로그인도 실패 가능 → 종료
    // process.exit(1);
  }
})();

// ===== 5) 로그인 (단 한 번) =====
console.log('[BOOT] Trying login…');
client.login(TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
