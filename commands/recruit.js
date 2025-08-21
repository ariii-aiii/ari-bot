const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

let recruits = []; // 참가자 저장
let maxSeats = 16; // 기본 최대 인원

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("모집 관리 (참가/취소/리스트/마감)")
    .addSubcommand(sub =>
      sub.setName("시작").setDescription("모집 시작").addIntegerOption(opt =>
        opt.setName("인원").setDescription("최대 인원 (16,20,28,32,40,56,64)").setRequired(true)
      )
    )
    .addSubcommand(sub =>
      sub.setName("마감").setDescription("모집 마감")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "시작") {
      recruits = [];
      maxSeats = interaction.options.getInteger("인원");

      const embed = new EmbedBuilder()
        .setTitle("🚀 모집 시작!")
        .setDescription(`최대 인원: **${maxSeats}명**\n아래 버튼을 눌러 참가/취소하세요.`)
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join").setLabel("참가").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("leave").setLabel("취소").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("list").setLabel("리스트").setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (sub === "마감") {
      await interaction.reply(`✅ 모집이 마감되었습니다. 최종 참가자: ${recruits.join(", ") || "없음"}`);
      recruits = [];
    }
  }
};

// 버튼 이벤트 처리
module.exports.buttonHandler = async (interaction) => {
  if (interaction.customId === "join") {
    if (recruits.includes(interaction.user.username)) {
      return interaction.reply({ content: "❌ 이미 참가 중입니다!", ephemeral: true });
    }
    if (recruits.length >= maxSeats) {
      return interaction.reply({ content: "⚠️ 자리가 가득 찼습니다!", ephemeral: true });
    }
    recruits.push(interaction.user.username);
    return interaction.reply({ content: "✅ 참가 완료!", ephemeral: true });
  }

  if (interaction.customId === "leave") {
    recruits = recruits.filter(u => u !== interaction.user.username);
    return interaction.reply({ content: "🚪 참가 취소됨!", ephemeral: true });
  }

  if (interaction.customId === "list") {
    return interaction.reply({ content: `📋 현재 참가자 (${recruits.length}/${maxSeats}): ${recruits.join(", ") || "없음"}`, ephemeral: true });
  }
};
