// commands/clean.js
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clean")
    .setNameLocalizations({ ko: "청소" })
    .setDescription("Bulk delete messages in this channel")
    .setDescriptionLocalizations({ ko: "현재 채널에서 메시지를 여러 개 한번에 삭제" })
    .addIntegerOption(o =>
      o.setName("count").setNameLocalizations({ ko: "개수" })
        .setDescription("지울 개수 (1~100)")
        .setRequired(true)
        .setMinValue(1).setMaxValue(100)
    )
    // 이 권한 있는 멤버만 명령 사용 가능
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const count = interaction.options.getInteger("count", true);

    // 텍스트 채널인지 체크 (스레드/DM 등은 불가)
    if (!interaction.channel?.bulkDelete) {
      return interaction.reply({ content: "여기는 대량 삭제를 지원하지 않아요.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      // 14일 넘은 메시지는 디스코드 정책상 삭제 불가 → true로 필터링
      const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.editReply(`🧹 ${deleted.size}개 삭제 완료! (14일 지난 메시지는 제외됨)`);
    } catch (err) {
      await interaction.editReply(`삭제 중 오류: ${err?.message ?? err}`);
    }
  }
};
