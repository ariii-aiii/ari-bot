// src/index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 커맨드 로더
client.commands = new Collection();
const commandsPath = path.join(__dirname, '..', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;
  const command = client.commands.get(i.commandName);
  if (!command) return;
  try {
    await command.execute(i);
  } catch (err) {
    console.error(err);
    if (i.deferred || i.replied) i.editReply('에러가 났어요 ㅠㅠ');
    else i.reply({ content: '에러가 났어요 ㅠㅠ', ephemeral: true });
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`[AriBot] Ready as ${c.user.tag}`);
});

client.login(process.env.BOT_TOKEN);
