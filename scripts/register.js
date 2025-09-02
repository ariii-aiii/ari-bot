// scripts/register.js  (wipe + guild publish + 안전검증)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');

// ==== env ====
const TOKEN     = (process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();   // Discord Application ID
const GUILD_ID  = (process.env.GUILD_ID  || '').trim();   // 서버 ID

if (!TOKEN)     { console.error('❌ BOT_TOKEN/DISCORD_TOKEN 누락'); process.exit(1); }
if (!CLIENT_ID) { console.error('❌ CLIENT_ID 누락'); process.exit(1); }
if (!GUILD_ID)  { console.error('❌ GUILD_ID 누락(길드 등록이 가장 빨라요)'); process.exit(1); }

// ==== 커맨드 수집 ====
const commandsPath = path.join(__dirname, '..', 'commands');
const body = [];
const loaded = new Collection();
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd?.data) {
    body.push(cmd.data.toJSON());
    loaded.set(cmd.data.name, file);
  }
}
console.log(`[REGISTER] ${body.length} commands: ${body.map(c => c.name).join(', ')}`);

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    // 0) 토큰-앱ID 일치 확인(다른 앱에 퍼블리시하는 사고 방지)
    const me = await rest.get(Routes.user('@me'));
    console.log(`[TOKEN OK] Bot = ${me.username} (${me.id})`);
    if (me.id !== CLIENT_ID) {
      console.error(`❌ CLIENT_ID(${CLIENT_ID}) ≠ BOT_ID(${me.id}) — 다른 앱에 등록하려고 함. 환경변수 확인해줘!`);
      process.exit(1);
    }

    // 1) 글로벌/길드 싹 wipe (옛 '/ari create max' 같은 구스키마 제거)
    console.log('[WIPE] Clear GLOBAL commands…');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    console.log(`[WIPE] Clear GUILD(${GUILD_ID}) commands…`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

    // 2) 길드에 즉시 재등록
    console.log(`[PUBLISH] Publish to GUILD ${GUILD_ID} (instant)…`);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });

    console.log(`[DONE] Published ${res.length} commands:`);
    for (const c of res) {
      console.log(` • /${c.name}  (ko: ${c.name_localizations?.ko || '-'})  <- ${loaded.get(c.name) || '(unknown)'}`);
    }
    console.log('✅ 끝! (디스코드 클라 Ctrl+R 로 새로고침)')
  } catch (e) {
    console.error('[REGISTER ERROR]', e.status ?? '', e.code ?? '', e.message || e);
    process.exit(1);
  }
})();
