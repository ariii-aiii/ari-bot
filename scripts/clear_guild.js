// scripts/clear_guild.js — 특정 서버의 슬래시 커맨드 전부 삭제
require("dotenv").config();
const { REST, Routes } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error("BOT_TOKEN/CLIENT_ID/GUILD_ID 누락");
  process.exit(1);
}

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [] }
    );
    console.log(`🧹 Cleared ALL GUILD(${process.env.GUILD_ID}) commands.`);
  } catch (e) {
    console.error("❌ clear_guild fail:", e);
  }
})();
