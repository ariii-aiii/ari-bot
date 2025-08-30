// commands/recruit.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,            // ✅ 에페메럴 경고 제거용
} = require("discord.js");

const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: `${n}`, value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit")
    .setNameLocalizations({ ko: "아리모집" })
    .setDescription("Create/manage recruit posts with buttons")
    .setDescriptionLocalizations({ ko: "버튼 모집 등록/수정/마감" })

    // 등록
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "등록" })
        .setDescription("Create a recruitment card with buttons")
        .setDescriptionLocalizations({ ko: "모집 카드 만들기(버튼 포함)" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "내용" })
            .setDescription("모집 제목").setRequired(true))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "정원" })
            .setDescription("정원 선택").addChoices(...CAP_CHOICES).setRequired(true))
    )

    // 수정
    .addSubcommand(sub =>
      sub.setName("edit").setNameLocalizations({ ko: "수정" })
        .setDescription("Edit recruit title/capacity by message ID")
        .setDescriptionLocalizations({ ko: "메시지ID로 내용/정원 수정" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("대상 메시지ID").setRequired(true))
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "내용" })
            .setDescription("새 제목(선택)"))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "정원" })
            .setDescription("새 정원(선택)").addChoices(...CAP_CHOICES))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor, buildRecruitEmbed } = interaction._ari;

    // 등록
    if (sub === "create") {
      const title = interaction.options.getString("title", true);
      const cap = interaction.options.getInteger("cap", true);

      const st = {
        cap,
        hostId: interaction.user.id,
        members: new Set(),
        waitlist: new Set(),
        isClosed: false,
        title
      };

      // ⚠️ fetchReply: true (deprecated) → 안전한 2단계 방식
      await interaction.reply({
        embeds: [buildRecruitEmbed(st)],
        components: [rowFor("temp", false)]
      });
      const msg = await interaction.fetchReply();   // ✅ 실제 메시지 객체

      await msg.edit({ components: [rowFor(msg.id, false)] });
      recruitStates.set(msg.id, st);
      return;
    }

    // 수정
    if (sub === "edit") {
      const id = interaction.options.getString("message_id", true);
      const newTitle = interaction.options.getString("title");
      const newCap = interaction.options.getInteger("cap");

      if (newTitle == null && newCap == null) {
        return interaction.reply({
          content: "수정할 항목이 없어요. (내용/정원 중 1개 이상)",
          flags: MessageFlags.Ephemeral   // ✅ 에페메럴 최신 방식
        });
      }

      try {
        const msg = await interaction.channel.messages.fetch(id);
        let st = recruitStates.get(id);

        // 상태 없으면 메시지 임베드로부터 최소 복구
        if (!st) {
          const emb = msg.embeds?.[0];
          let cap = 16, isClosed = false, baseTitle = "모집";
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

        if (newTitle != null) st.title = newTitle;
        if (newCap != null) {
          // 정원 축소 시 초과분은 대기열로 이동
          const arr = [...st.members];
          st.cap = newCap;
          while (arr.length > st.cap) {
            const moved = arr.pop();
            st.members.delete(moved);
            st.waitlist.add(moved);
          }
        }

        await msg.edit({
          embeds: [buildRecruitEmbed(st)],
          components: [rowFor(id, st.isClosed)]
        });

        return interaction.reply({
          content: "✏️ 모집 수정 완료!",
          flags: MessageFlags.Ephemeral
        });
      } catch {
        return interaction.reply({
          content: "메시지ID를 못 찾았어요 ㅠㅠ",
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
