// commands/ari.js — 웹후크 없이, 모집글 생성만
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// 예전에 쓰던 숫자들 고정 (8, 12, 16, 20, 28, 32, 40, 56, 60)
const MAX_CHOICES = [8, 12, 16, 20, 28, 32, 40, 56, 60];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("아리만들기")
    .setDescription("모집글 생성")
    .addStringOption(o =>
      o.setName("content")
        .setDescription("모집글 내용")
        .setRequired(true)
    )
    .addIntegerOption(o => {
      const opt = o
        .setName("max")
        .setDescription("정원 선택")
        .setRequired(true);
      MAX_CHOICES.forEach(n => opt.addChoices({ name: `${n}명`, value: n }));
      return opt;
    }),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const content = interaction.options.getString("content", true);
      const max = interaction.options.getInteger("max", true);

      // 간단한 임베드로 출력 (웹후크 X)
      const embed = new EmbedBuilder()
        .setTitle("🎯 모집글")
        .setDescription(`내용: ${content}\n정원: **${max}명**`)
        .setColor(0x5865f2);

      await interaction.channel.send({ embeds: [embed] });

      await interaction.editReply("✅ 모집글을 보냈어요!");
    } catch (err) {
      console.error("아리만들기 오류:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("⚠️ 오류가 발생했어요.");
      } else {
        await interaction.reply({ content: "⚠️ 오류가 발생했어요.", ephemeral: true });
      }
    }
  }
};
