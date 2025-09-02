// commands/clean.js
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ✅ index.js의 자동 defer를 끈다
  autoDefer: false,

  requiredClientPermissions: [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ],

  async execute(interaction) {
    // 1) 타임아웃 방지 & 에페메럴 고정
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.channel;
      const amount = interaction.options.getInteger("개수", true);
      const includeBots = interaction.options.getBoolean("봇포함") ?? true;

      // 2) 권한 체크 (채널 오버라이드 포함)
      const me = interaction.guild.members.me;
      const need = [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory];
      if (!me?.permissionsIn(channel).has(need)) {
        return interaction.editReply("❌ 제가 이 채널에서 **메시지 관리/기록 보기** 권한이 없어요. 역할/채널 권한 확인해줘!");
      }

      if (amount < 1 || amount > 100) {
        return interaction.editReply("1~100 사이로 입력해줘!");
      }

      // 3) 최근 100개 가져와 필터 (핀 제외, 봇 제외 옵션)
      const fetched = await channel.messages.fetch({ limit: 100 });
      const targets = fetched
        .filter(m => {
          if (m.pinned) return false;
          if (!includeBots && m.author.bot) return false;
          return true;
        })
        .first(amount);

      if (!targets || targets.length === 0) {
        return interaction.editReply("지울 메시지가 없거나, 조건에 맞는 메시지가 없어요.");
      }

      // 4) 일괄 삭제: 14일 초과분은 자동 스킵
      const deleted = await channel.bulkDelete(targets, true).catch(() => null);
      if (!deleted) {
        return interaction.editReply("❌ 메시지를 지우는 중 오류가 발생했어요. (14일 지난 메시지는 삭제 불가)");
      }

      return interaction.editReply(`🧹 **${deleted.size}개** 메시지 삭제 완료!${includeBots ? "" : " (봇 메시지 제외)"}`);
    } catch (e) {
      console.error("[/청소] error:", e);
      return interaction.editReply("❌ 처리 중 오류가 발생했어요.");
    }
  },
};
