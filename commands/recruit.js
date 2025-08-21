// commands/recruit.js
const { SlashCommandBuilder } = require("discord.js");

// 고정 인원 선택지
const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: `${n}`, value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit") // 베이스는 영문, 한글 표시는 로컬라이즈
    .setNameLocalizations({ ko: "모집" })
    .setDescription("Create/manage recruit posts with buttons")
    .setDescriptionLocalizations({ ko: "버튼 모집 등록/관리" })

    // 모집 시작
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "시작" })
        .setDescription("Create a recruitment card with buttons")
        .setDescriptionLocalizations({ ko: "모집 카드 만들기(버튼 포함)" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("모집 제목").setRequired(true))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "인원" })
            .setDescription("정원 선택").addChoices(...CAP_CHOICES).setRequired(true))
    )

    // (기존 카드) 새 포맷으로 다시 그리기
    .addSubcommand(sub =>
      sub.setName("refresh").setNameLocalizations({ ko: "리프레시" })
        .setDescription("Re-render recruit card in the new format")
        .setDescriptionLocalizations({ ko: "모집 카드를 새 포맷으로 다시 그리기" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("대상 모집 메시지 ID").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor, buildRecruitEmbed } = interaction._ari;

    // 모집 시작
    if (sub === "create") {
      const title = interaction.options.getString("title", true);
      const cap = interaction.options.getInteger("cap", true);

      const st = { cap, hostId: interaction.user.id, members: new Set(), waitlist: new Set(), isClosed: false, title };
      const msg = await interaction.reply({
        embeds: [buildRecruitEmbed(st)],
        components: [rowFor("temp", false)],
        fetchReply: true
      });
      await msg.edit({ components: [rowFor(msg.id, false)] });
      recruitStates.set(msg.id, st);
      return;
    }

    // 리프레시: 기존 카드를 새 포맷으로
    if (sub === "refresh") {
      const id = interaction.options.getString("message_id", true);
      try {
        const msg = await interaction.channel.messages.fetch(id);

        // 상태 복구(없으면 임베드에서 최소 복구)
        let st = recruitStates.get(id);
        if (!st) {
          const emb = msg.embeds?.[0];
          const titleRaw = emb?.title || "";
          const cap = parseInt((titleRaw.match(/정원\s+(\d+)/)?.[1] || "16"), 10);
          const isClosed = titleRaw.trim().startsWith("🔒");
          const cleanTitle = titleRaw.replace(/^🔒\s*/, "").replace(/\s*-\s*정원.*$/, "") || "모집";
          st = { cap, hostId: interaction.user.id, members: new Set(), waitlist: new Set(), isClosed, title: cleanTitle };

          const desc = emb?.description || "";
          const ids = [...desc.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)].map(m => m[1]);
          ids.forEach(uid => st.members.add(uid));
          recruitStates.set(id, st);
        }

        await msg.edit({ embeds: [buildRecruitEmbed(st)], components: [rowFor(id, st.isClosed)] });
        return interaction.reply({ content: "🔄 카드 갱신 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "메시지ID를 못 찾았어요 ㅠㅠ", ephemeral: true });
      }
    }
  }
};
