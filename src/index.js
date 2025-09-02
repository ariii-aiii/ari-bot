// src/index.js
require('dotenv').config();
require('../server');

console.log('[BOOT] index.js started');

const {
  Client, GatewayIntentBits, Events,
  REST, Routes
} = require('discord.js');

// === 1) 토큰: 단 한 번만 선언 ===
const TOKEN = (process.env.BOT_TOKEN || '').trim();
if (!TOKEN) {
  console.error('[FATAL] BOT_TOKEN is empty');
  process.exit(1);
}
console.log('[CHECK] token length =', TOKEN.length);

// === 2) REST로 토큰 유효성/봇 계정 확인 ===
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const me = await rest.get(Routes.user('@me'));
    console.log('[REST OK] Bot =', `${me.username} (${me.id})`);
  } catch (e) {
    console.error('[REST FAIL]', e?.status || '', e?.code || '', e?.message || e);
    // 여기서 실패면 토큰 자체가 잘못된 것. 바로 종료.
    process.exit(1);
  }
})();

// === 3) 클라이언트: 최소 Intent ===
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 게이트웨이 디버그: 헬로/아이덴티파이/레디/심장박동
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
client.on('error', (e) => console.error('[CLIENT ERROR]', e?.message || e));
client.on('warn',  (w) => console.warn('[CLIENT WARN]',  w));

// 60초 워치독
let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] Logged in as ${c.user.tag} (${c.user.id})`);
});

// 로그인
client.login(TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});

// 생존 핑
setInterval(() => console.log('[TICK] still running'), 5000);
