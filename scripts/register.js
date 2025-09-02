// scripts/register.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');

// 환경변수
const TOKEN     = (process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const GUILD_ID  = (process.env.GUILD_ID  || '').trim();

if (!TOKEN)     { console.error('[REGISTER] ❌ BOT_TOKEN/DISCORD_TOKEN 누락'); process.exit(1); }
if (!CLIENT_ID) { console.error('[REGISTER] ❌ CLIENT_ID 누락'); process.exit(1); }
if (!GUILD_ID)  { console.error('[REGISTER] ❌ GUILD_ID 누락 (길드 등록이 제일 빠릅니다)'); process.exit(1); }

// 커맨드 수집
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
console.log(`[REGISTER] Found ${body.length} commands: ${body.map(c => c.name).join(', ')}`);

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    const me = await rest.get(Routes.user('@me'));
    console.log(`[TOKEN OK] Bot = ${me.username} (${me.id})`);

    // 1) 글로벌/길드 전부 wipe (구 스키마 제거)
    console.log('[WIPE] Clearing GLOBAL commands…');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    console.log(`[WIPE] Clearing GUILD(${GUILD_ID}) commands…`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

    // 2) 길드에 재배포 (즉시 반영)
    console.log(`[PUBLISH] Publishing to GUILD ${GUILD_ID} (instant)…`);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });

    console.log(`[DONE] Published ${res.length} commands:`);
    for (const c of res) {
      console.log(` • /${c.name}  (ko: ${c.name_localizations?.ko || '-'})  <- ${loaded.get(c.name) || '(unknown)'}`);
    }

    console.log('✅ All set! (디스코드 클라이언트 새로고침 Ctrl+R)')
  } catch (e) {
    console.error('[REGISTER ERROR]', e.status, e.code, e.message || e);
    process.exit(1);
  }
})();
