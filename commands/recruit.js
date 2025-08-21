const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// 고정 인원 선택지
const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: String(n), value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit") // 디스코드 제한 때문에 base name은 영문 소문자여야 합니다
    .setNameLocalizations({ ko: "모집" }) // 한국어 클라에서는 /모집 으로 표시
    .setDescription("Create/manage recruit posts with buttons")
    .setDescriptionLocalizations({ ko: "버튼 모집 등록/수정/삭제" })

    // 등록(시작)
    .addSubcommand(sub =>
      sub.setName("create")
        .setNameLocalizations({ ko: "시작" })
        .setDescription("Create a recruitment message with buttons")
        .setDescriptionLocalizations({ ko: "버튼 포함 모집글 등록" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("Recruit title").setRequired(true))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "인원" })
            .setDescription("Capacity").addChoices(...CAP_CHOICES).setRequired(true))
    )
    // 제목 수정
    .addSubcommand(sub =>
      sub.setName("edit")
        .setNameLocalizations({ ko: "수정" })
        .setDescription("Edit title by message ID")
        .setDescriptionLocalizations({ ko: "메시지ID로 제목 수정" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("Target message ID").setRequired(true))
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("New title").setRequired(true))
    )
    // 정원 변경
    .addSubcommand(sub =>
      sub.setName("capacity")
        .setNameLocalizations({ ko: "정원" })
        .setDescription("Change capacity by message ID")
        .setDescriptionLocalizations({ ko: "메시지ID로 정원 변경" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("Target message ID").setRequired(true))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "인원" })
            .setDescription("New capacity").addChoices(...CAP_CHOICES).setRequired(true))
    )
    // 상태 보기
    .addSubcommand(sub =>
      sub.setName("status")
        .setNameLocalizations({ ko: "상태" })
        .setDescription("Show current status")
        .setDescriptionLocalizations({ ko: "현재 상태 보기" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("Target message ID").setRequired(true))
    )
    // 삭제
    .addSubcommand(sub =>
      sub.setName("delete")
        .setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete recruitment by message ID")
        .setDescriptionLocalizations({ ko: "메시지ID로 모집 삭제" })
        .addStringOption(o =>
          o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
            .setDescription("Target message ID").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor } = interaction._ari;

    // 등록(시작)
    if (sub === "create") {
      const title = interaction.options.getString("title", true);
      const cap = interaction.options.getInteger("cap", true);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription("버튼으로 참가/취소/목록/마감을 관리하세요.")
        .addFields({ name: "정원", value: String(cap), inline: true })
        .setFooter({ text: `Cap:${cap} • Host:${interaction.user.id}` })
        .setTimestamp();

      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.edit({ components: [rowFor(msg.id, false)] });

      recruitStates.set(msg.id, {
        cap,
        hostId: interaction.user.id,
        members: new Set(),
        waitlist: new Set(),
        isClosed: false,
        title
      });
      return;
    }

    // 제목 수정
    if (sub === "edit") {
      const messageId = interaction.options.getString("message_id", true);
      const newTitle = interaction.options.getString("title", true);

      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        const embed = EmbedBuilder.from(msg.embeds[0] ?? {});
        embed.setTitle(newTitle);
        await msg.edit({ embeds: [embed] });

        const st = recruitStates.get(messageId);
        if (st) st.title = newTitle;

        return interaction.reply({ content: "✏️ 제목 수정 완료", ephemeral: true });
      } catch {
        return interaction.reply({ content: "메시지ID를 못 찾았어요 ㅠㅠ", ephemeral: true });
      }
    }

    // 정원 변경 (고정 선택지)
    if (sub === "capacity") {
      const messageId = interaction.options.getString("message_id", true);
      const newCap = interaction.options.getInteger("cap", true);

      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        const embed = EmbedBuilder.from(msg.embeds[0] ?? {});
        const fields = embed.data.fields || [];
        const idx = fields.findIndex(f => f.name === "정원");
        if (idx >= 0) fields[idx].value = String(newCap);
        else fields.push({ name: "정원", value: String(newCap), inline: true });
        embed.setFields(fields);

        const footer = embed.data.footer?.text || "";
        const host = (footer.match(/Host:(\d+)/) || [null, ""])[1];
        embed.setFooter({ text: `Cap:${newCap}${host ? ` • Host:${host}` : ""}` });

        await msg.edit({ embeds: [embed] });

        const st = recruitStates.get(messageId);
        if (st) st.cap = newCap;

        return interaction.reply({ content: "📦 정원 변경 완료", ephemeral: true });
      } catch {
        return interaction.reply({ content: "메시지ID를 못 찾았어요 ㅠㅠ", ephemeral: true });
      }
    }

    // 상태
    if (sub === "status") {
      const messageId = interaction.options.getString("message_id", true);
      const st = recruitStates.get(messageId);
      if (!st) {
        return interaction.reply({ content: "상태를 못 찾았어요. 해당 메시지 버튼을 한번 눌러주면 복구될 수 있어요.", ephemeral: true });
      }
      const members = [...st.members].map((id, i) => `${i + 1}. <@${id}>`).join("\n") || "없음";
      const waiters = [...st.waitlist].map((id, i) => `${i + 1}. <@${id}>`).join("\n") || "없음";
      const embed = new EmbedBuilder()
        .setTitle(`${st.title} — 상태`)
        .addFields(
          { name: `참가자 (${st.members.size}/${st.cap})`, value: members },
          { name: "대기열", value: waiters }
        )
        .setFooter({ text: st.isClosed ? "🔒 마감됨" : "🔓 모집중" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 삭제
    if (sub === "delete") {
      const messageId = interaction.options.getString("message_id", true);
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.delete();
        recruitStates.delete(messageId);
        return interaction.reply({ content: "🗑️ 모집 삭제 완료", ephemeral: true });
      } catch {
        return interaction.reply({ content: "메시지ID를 못 찾았어요 ㅠㅠ", ephemeral: true });
      }
    }
  }
};
