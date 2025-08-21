require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];
const dir = path.join(__dirname, "..", "commands");
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
  const c = require(path.join(dir, f));
  commands.push(c.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 슬래시 명령어 등록 중...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ 슬래시 명령어 등록 완료!");
  } catch (e) {
    console.error(e);
  }
})();
