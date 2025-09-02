// commands/clean.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("청소")
    .setNameLocalizations({ ko: "청소" })
    .setDescription("채널의 최근 메시지를 삭제합니다 (최대 100개).")
    .setDescriptionLocalizations({ ko: "채널의 최근 메시지를 삭제합니다 (최대 100개)." })
    .addIntegerOption(o =>
      o.setName("개수")
        .setNameLocalizations({ ko: "개수" })
        .setDescription("삭제할 메시지 개수 (1~100)")
        .setDescriptionLocalizations({ ko: "삭제할 메시지 개수 (1~100)" })
        .setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName("봇포함")
        .setNameLocalizations({ ko: "봇포함" })
        .setDescription("봇이 보낸 메시지도 같이 지울까요?")
        .setDescriptionLocalizations({ ko: "봇이 보낸 메시지도 같이 지울까요?" })
        .setRequired(false)
    )
    // 이 권한이 있어야 슬래시가 보이고 실행 가능
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // 앱 명령어 권한: 봇에게도 메시지 관리 권한이 필요
  requiredClientPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],

  async execute(interaction) {
    try {
      const channel = interaction.channel;
      const amount = interaction.options.getInteger("개수", true);
      const includeBots = interaction.options.getBoolean("봇포함") ?? true;

      // 봇 권한 체크
      const me = interaction.guild.members.me;
      if (!me.permissionsIn(channel).has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
        return interaction.reply({
          content: "❌ 제가 이 채널에서 **메시지 관리 / 메시지 기록 보기** 권한이 없어요. 역할 권한을 확인해줘!",
          ephemeral: true,
        });
      }

      if (amount < 1 || amount > 100) {
        return interaction.reply({ content: "1~100 사이로 입력해줘!", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // 최근 메시지 수집 (14일 제한 때문에 너무 오래된 건 어차피 안 지워짐)
      const fetched = await channel.messages.fetch({ limit: 100 });

      // 필터링 (필요 시 핀 고정 제외 등 커스텀 가능)
      const targets = fetched
        .filter(m => {
          if (m.pinned) return false;        // 핀 고정 제외
          if (!includeBots && m.author.bot) return false; // 봇 제외 옵션
          return true;
        })
        .first(amount);

      if (!targets || targets.length === 0) {
        return interaction.editReply("지울 메시지가 없거나, 조건에 맞는 메시지가 없어요.");
      }

      // bulkDelete: 14일 넘은 건 자동 스킵. true = 오류 덜 내고 가능한 것만 지움
      const deleted = await channel.bulkDelete(targets, true).catch(() => null);

      if (!deleted) {
        return interaction.editReply("❌ 메시지를 지우는 중 오류가 발생했어요. (14일 지난 메시지는 삭제 불가)");
      }

      return interaction.editReply(`🧹 **${deleted.size}개** 메시지 삭제 완료!${includeBots ? "" : " (봇 메시지 제외)"}`);
    } catch (e) {
      console.error("[/청소] error:", e);
      // 이미 reply/defer 했을 수 있으니 안전 처리
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("❌ 처리 중 오류가 발생했어요.");
      }
      return interaction.reply({ content: "❌ 처리 중 오류가 발생했어요.", ephemeral: true });
    }
  },
};
