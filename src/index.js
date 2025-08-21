require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

// 클라이언트 생성
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// 봇 준비 완료 시 실행
client.once(Events.ClientReady, (c) => {
  console.log(`[BOT] 로그인 성공: ${c.user.tag}`);
});

// 메시지 테스트 명령어
client.on(Events.MessageCreate, (msg) => {
  if (msg.content === "핑") {
    msg.reply("퐁!");
  }
});

// 로그인
client.login(process.env.BOT_TOKEN);
