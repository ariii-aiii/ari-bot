const { SlashCommandBuilder } = require("discord.js");
const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: `${n}`, value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit").setNameLocalizations({ ko: "모집" })
    .setDescription("Create/manage recruit posts with buttons")
    .setDescriptionLocalizations({ ko: "버튼 모집 등록/관리" })
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "시작" })
        .setDescription("Create a recruitment card with buttons")
        .setDescriptionLocalizations({ ko: "모집 카드 만들기(버튼 포함)" })
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" }).setDescription("모집 제목").setRequired(true))
        .addIntegerOption(o => o.setName("cap").setNameLocalizations({ ko: "인원" }).setDescription("정원 선택").addChoices(...CAP_CHOICES).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("refresh").setNameLocalizations({ ko: "리프레시" })
        .setDescription("Re-render recruit card in the new format")
        .setDescriptionLocalizations({ ko: "모집 카드를 새 포맷으로 다시 그리기" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" }).setDescription("대상 모집 메시지 ID").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor, buildRecruitEmbed } = interaction._ari;

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

    if (sub === "refresh") {
      const id = interaction.options.getString("message_id", true);
      try {
        const msg = await interaction.channel.messages.fetch(id);
        let st = recruitStates.get(id);

        if (!st) {
          const emb = msg.embeds?.[0];
          let cap = 16;
          let isClosed = false;
          let baseTitle = "모집";
          if (emb?.title) {
            const t = emb.title;
            isClosed = t.trim().startsWith("🔒");
            const mCap = t.match(/정원\s+(\d+)/);
            if (mCap) cap = parseInt(mCap[1], 10);
            baseTitle = t.replace(/^🔒\s*/, "").replace(/\s*-\s*정원.*$/, "").trim() || "모집";
          }
          const members = new Set();
          const desc = emb?.description || "";
          for (const m of desc.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)) members.add(m[1]);
          st = { cap, hostId: interaction.user.id, members, waitlist: new Set(), isClosed, title: baseTitle };
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
