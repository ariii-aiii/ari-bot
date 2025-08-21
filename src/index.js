require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 마감 가능한 역할 ID
const CLOSE_ROLE_IDS = ["123456789012345678"];

client.once("ready", () => {
  console.log(`✅ 로그인 성공: ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // 📌 모집
  if (interaction.commandName === "recruit") {
    const embed = new EmbedBuilder()
      .setTitle("모집 글")
      .setDescription("아래 버튼으로 참가/취소하세요!");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("join").setLabel("참가").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("취소").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("list").setLabel("목록").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("close").setLabel("마감").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  // 📌 공지
  if (interaction.commandName === "notice") {
    const action = interaction.options.getString("action");
    const content = interaction.options.getString("content");

    if (action === "create") {
      await interaction.reply(`📢 새 공지: ${content}`);
    } else if (action === "update") {
      await interaction.reply(`✏️ 공지 수정: ${content}`);
    } else if (action === "delete") {
      await interaction.reply("🗑️ 공지가 삭제되었습니다.");
    }
  }

  // 📌 버튼 처리
  if (interaction.isButton()) {
    if (interaction.customId === "join") {
      await interaction.reply({ content: "✅ 참가했습니다!", ephemeral: true });
    } else if (interaction.customId === "cancel") {
      await interaction.reply({ content: "❌ 취소했습니다!", ephemeral: true });
    } else if (interaction.customId === "list") {
      await interaction.reply({ content: "📋 현재 참가자: (추가 구현 필요)", ephemeral: true });
    } else if (interaction.customId === "close") {
      if (interaction.member.roles.cache.some(r => CLOSE_ROLE_IDS.includes(r.id))) {
        await interaction.reply("🚪 모집이 마감되었습니다.");
      } else {
        await interaction.reply({ content: "⛔ 마감 권한이 없습니다.", ephemeral: true });
      }
    }
  }
});

client.login(process.env.BOT_TOKEN);
