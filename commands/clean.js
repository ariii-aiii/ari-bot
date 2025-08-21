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
    ),
    // ⬆️ 기본 권한 게이트 제거 → 누구나 명령어는 보이되, 실행 시 우리가 직접 체크

  async execute(interaction) {
    const count = interaction.options.getInteger("count", true);
    const needPerm = PermissionFlagsBits.ManageMessages;

    // 1) 호출자 권한 체크
    if (!interaction.memberPermissions?.has(needPerm)) {
      return interaction.reply({
        content: "이 명령은 **메시지 관리** 권한이 있는 멤버만 쓸 수 있어요.",
        ephemeral: true
      });
    }

    // 2) 봇 권한 체크 (해당 채널 기준)
    const me = interaction.guild?.members?.me;
    if (!me || !interaction.channel?.permissionsFor(me)?.has(needPerm)) {
      return interaction.reply({
        content: "제가 이 채널에서 **메시지 관리** 권한이 없어요. 권한을 주세요!",
        ephemeral: true
      });
    }

    // 3) 채널이 대량삭제 지원하는지
    if (typeof interaction.channel.bulkDelete !== "function") {
      return interaction.reply({ content: "이 채널 타입에선 대량 삭제를 지원하지 않아요.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      // 14일 넘은 메시지는 디스코드 정책상 삭제 불가 → true로 필터링
      const deleted = await interaction.channel.bulkDelete(count, true);
      const msg = deleted.size === count
        ? `🧹 ${deleted.size}개 삭제 완료!`
        : `🧹 ${deleted.size}개 삭제 완료! (14일 지난 메시지는 제외됨)`;
      await interaction.editReply(msg);
    } catch (err) {
      await interaction.editReply(`삭제 중 오류: ${err?.message ?? err}`);
    }
  }
};
