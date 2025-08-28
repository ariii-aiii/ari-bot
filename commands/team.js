// commands/team.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀")
    .setDescription("팀원 모집 메시지를 생성합니다.")
    .addStringOption(option =>
      option.setName("설명")
        .setDescription("모집 내용을 입력하세요.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const 설명 = interaction.options.getString("설명");

    // 현재 채널명
    const channelName = interaction.channel.name;
    // 현재 채널 인원 (예시는 음성 채널 기준)
    const channel = interaction.channel;
    let memberCount = "알 수 없음";

    if (channel.isVoiceBased()) {
      memberCount = `${channel.members.size} / ${channel.userLimit || "제한 없음"}`;
    }

    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .addFields(
        { name: "채널명", value: `#${channelName}`, inline: true },
        { name: "멤버", value: memberCount, inline: true },
        { name: "설명", value: 설명 }
      )
      .setColor("Blue");

    await interaction.reply({ embeds: [embed] });
  }
};
