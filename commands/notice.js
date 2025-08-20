// commands/notice.js — 웹후크 없이 노멀 텍스트 공지
const { SlashCommandBuilder } = require("discord.js");

// '\n', '\\n', '<br>' → 실제 줄바꿈 처리
function normalize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("아리공지")
    .setDescription("공지 보내기")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("공지 내용 (줄바꿈: \\n 또는 <br>)")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const raw = interaction.options.getString("message", true);
      const content = normalize(raw);

      await interaction.channel.send(content);

      await interaction.editReply("✅ 공지를 보냈어요!");
    } catch (err) {
      console.error("아리공지 오류:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("⚠️ 오류가 발생했어요.");
      } else {
        await interaction.reply({ content: "⚠️ 오류가 발생했어요.", ephemeral: true });
      }
    }
  }
};
