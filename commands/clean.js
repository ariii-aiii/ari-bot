// commands/clean.js
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clean")  // ✅ 영문 소문자
    .setNameLocalizations({ ko: "청소" }) // ✅ 한글 표시는 여기
    .setDescription("Delete recent messages in this channel (max 100).")
    .setDescriptionLocalizations({ ko: "채널의 최근 메시지를 삭제합니다 (최대 100개)." })
    .addIntegerOption(o =>
      o.setName("count") // ✅ 옵션도 영문 권장
        .setNameLocalizations({ ko: "개수" })
        .setDescription("1~100")
        .setDescriptionLocalizations({ ko: "삭제할 메시지 개수 (1~100)" })
        .setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName("include_bots")
        .setNameLocalizations({ ko: "봇포함" })
        .setDescription("Also delete bot messages?")
        .setDescriptionLocalizations({ ko: "봇 메시지도 같이 지울까요?" })
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  autoDefer: false, // ✅ index.js의 자동 defer 끔

  requiredClientPermissions: [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ],

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.channel;
      const amount = interaction.options.getInteger("count", true);
      const includeBots = interaction.options.getBoolean("include_bots") ?? true;

      const me = interaction.guild.members.me;
      const need = [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory];
      if (!me?.permissionsIn(channel).has(need)) {
        return interaction.editReply("❌ 이 채널에서 **메시지 관리/기록 보기** 권한이 없어요. 역할/채널 권한 확인해줘!");
      }

      if (amount < 1 || amount > 100) {
        return interaction.editReply("1~100 사이로 입력해줘!");
      }

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

      const deleted = await channel.bulkDelete(targets, true).catch(() => null);
      if (!deleted) {
        return interaction.editReply("❌ 삭제 중 오류. (14일 지난 메시지는 삭제 불가)");
      }

      return interaction.editReply(`🧹 **${deleted.size}개** 삭제 완료!${includeBots ? "" : " (봇 제외)"}`);
    } catch (e) {
      console.error("[/clean] error:", e);
      return interaction.editReply("❌ 처리 중 오류가 발생했어요.");
    }
  },
};
