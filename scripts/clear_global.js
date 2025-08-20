// scripts/clear_global.js — 모든 글로벌 슬래시 커맨드 삭제
require("dotenv").config();
const { REST, Routes } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("BOT_TOKEN/CLIENT_ID 누락");
  process.exit(1);
}

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log("🧹 Cleared ALL GLOBAL commands.");
  } catch (e) {
    console.error("❌ clear_global fail:", e);
  }
})();
