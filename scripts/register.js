require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = (process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

if (!TOKEN) { console.error("❌ DISCORD_TOKEN 누락"); process.exit(1); }
if (!CLIENT_ID || !GUILD_ID) { console.error("❌ CLIENT_ID / GUILD_ID 누락"); process.exit(1); }

const commands = [];
const dir = path.join(__dirname, "..", "commands");
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
  const c = require(path.join(dir, f));
  commands.push(c.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🔄 슬래시 명령어 등록 중...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ 완료!");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
