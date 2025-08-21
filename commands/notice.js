const {
  SlashCommandBuilder, EmbedBuilder, resolveColor, PermissionFlagsBits
} = require("discord.js");

const NAMED_COLORS = {
  pink: "#FF69B4", hotpink: "#FF1493", cherry: "#F01945", peach: "#FFB88C",
  sky: "#7EC8E3", aqua: "#00FFFF", lavender: "#C77DFF", lime: "#70FF70",
  navy: "#1B3B6F", black: "#111111", white: "#FFFFFF", yellow: "#FFE066",
  orange: "#FFA94D", blue: "#4DABF7", purple: "#9775FA", green: "#69DB7C"
};
function getDefaultColor() {
  const raw = (process.env.NOTICE_COLOR || "").trim();
  if (!raw) return resolveColor(NAMED_COLORS.hotpink);
  try { return resolveColor(raw); } catch { return resolveColor(NAMED_COLORS.hotpink); }
}
function parseColor(input) {
  if (!input) return getDefaultColor();
  const key = input.toLowerCase().trim();
  const hex = NAMED_COLORS[key] || input;
  try { return resolveColor(hex); } catch { return getDefaultColor(); }
}

// 채널별 마지막 공지 메시지ID 기억
const lastNoticeByChannel = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice")
    .setNameLocalizations({ ko: "공지" })
    .setDescription("Create/Edit/Delete/Sticky notices")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제/스티키" })

    // 등록
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "등록" })
        .setDescription("Create a notice").setDescriptionLocalizations({ ko: "공지 등록" })
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("공지 내용").setRequired(true))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("제목(선택)"))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("색상: 이름(pink, sky...) 또는 HEX(#FF69B4)"))
    )
    // 수정
    .addSubcommand(sub =>
      sub.setName("edit").setNameLocalizations({ ko: "수정" })
        .setDescription("Edit a notice").setDescriptionLocalizations({ ko: "공지 수정" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("수정할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("새 내용").setRequired(false))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("새 제목").setRequired(false))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("새 컬러: 이름 또는 HEX").setRequired(false))
    )
    // 삭제
    .addSubcommand(sub =>
      sub.setName("delete").setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete a notice").setDescriptionLocalizations({ ko: "공지 삭제" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("삭제할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
    )
    // 스티키(무한)
    .addSubcommand(sub =>
      sub.setName("sticky").setNameLocalizations({ ko: "스티키" })
        .setDescription("Enable/Disable infinite sticky").setDescriptionLocalizations({ ko: "무한 스티키 켜기/끄기" })
        .addBooleanOption(o => o.setName("on").setNameLocalizations({ ko: "켜기" })
          .setDescription("true=켜기 / false=끄기").setRequired(true))
        .addStringOption(o => o.setName("mode").setNameLocalizations({ ko: "모드" })
          .setDescription("follow: 따라붙기 / interval: 주기")
          .addChoices({ name: "follow", value: "follow" }, { name: "interval", value: "interval" })
          .setRequired(false))
        .addIntegerOption(o => o.setName("seconds").setNameLocalizations({ ko: "초" })
          .setDescription("interval 모드일 때 주기(초, 5~3600)").setRequired(false).setMinValue(5).setMaxValue(3600))
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("기존 공지 메시지ID (없으면 새로 생성)").setRequired(false))
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("새로 만들 경우 내용").setRequired(false))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("새로 만들 경우 제목").setRequired(false))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("새로 만들 경우 색상").setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const { stickyStore, refreshSticky } = interaction._ari;

    // 헬퍼: 대상 공지 메시지 가져오기
    const getTargetMessage = async () => {
      const id = interaction.options.getString("message_id") || lastNoticeByChannel.get(channel.id);
      if (!id) throw new Error("공지 메시지 ID가 없습니다.");
      return channel.messages.fetch(id);
    };

    if (sub === "create") {
      const content = interaction.options.getString("content", true);
      const title = interaction.options.getString("title") || "📢 공지";
      const colorStr = interaction.options.getString("color");

      const embed = new EmbedBuilder()
        .setTitle(title).setDescription(content)
        .setColor(parseColor(colorStr))
        .setFooter({ text: `by ${interaction.user.tag}` })
        .setTimestamp();

      const msg = await channel.send({ embeds: [embed] });
      lastNoticeByChannel.set(channel.id, msg.id);
      return interaction.reply({ content: `✅ 공지 등록! (messageId: ${msg.id})`, ephemeral: true });
    }

    if (sub === "edit") {
      const newContent = interaction.options.getString("content");
      const newTitle = interaction.options.getString("title");
      const newColor = interaction.options.getString("color");

      if (newContent == null && newTitle == null && newColor == null) {
        return interaction.reply({ content: "바꿀 항목이 없어요. (내용/제목/컬러 중 1개 이상)", ephemeral: true });
      }

      try {
        const msg = await getTargetMessage();
        const embed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
        if (newTitle != null) embed.setTitle(newTitle || null);
        if (newContent != null) embed.setDescription(newContent || null);
        if (newColor != null) embed.setColor(parseColor(newColor));
        await msg.edit({ embeds: [embed] });
        lastNoticeByChannel.set(channel.id, msg.id);
        return interaction.reply({ content: "✏️ 공지 수정 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }

    if (sub === "delete") {
      try {
        const msg = await getTargetMessage();
        await msg.delete();
        if (lastNoticeByChannel.get(channel.id) === msg.id) lastNoticeByChannel.delete(channel.id);
        return interaction.reply({ content: "🗑️ 공지 삭제 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }

    if (sub === "sticky") {
      const turnOn = interaction.options.getBoolean("on", true);
      const mode = interaction.options.getString("mode") || "follow";
      const seconds = interaction.options.getInteger("seconds") || 30; // interval 기본 30초
      let entry = stickyStore.get(channel.id);

      if (!turnOn) {
        if (entry?.timer) clearInterval(entry.timer);
        stickyStore.delete(channel.id);
        return interaction.reply({ content: "📎 스티키 끔!", ephemeral: true });
      }

      // 켜기: 기존 메시지 쓰거나 새로 생성
      let baseEmbed;
      const msgId = interaction.options.getString("message_id");
      if (msgId) {
        try {
          const msg = await channel.messages.fetch(msgId);
          baseEmbed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder().setDescription(msg.content || " "));
          lastNoticeByChannel.set(channel.id, msg.id);
        } catch {
          return interaction.reply({ content: "❌ 해당 메시지를 못 찾았어요.", ephemeral: true });
        }
      } else {
        const content = interaction.options.getString("content");
        const title = interaction.options.getString("title") || "📢 공지";
        const colorStr = interaction.options.getString("color");
        if (!content) return interaction.reply({ content: "내용이 없어요. content를 입력하거나 message_id를 주세요.", ephemeral: true });
        baseEmbed = new EmbedBuilder()
          .setTitle(title).setDescription(content)
          .setColor(parseColor(colorStr))
          .setFooter({ text: `by ${interaction.user.tag}` })
          .setTimestamp();
        const msg = await channel.send({ embeds: [baseEmbed] });
        lastNoticeByChannel.set(channel.id, msg.id);
      }

      // 기존 스티키 종료
      if (entry?.timer) clearInterval(entry.timer);

      // 새 스티키 설정
      entry = {
        enabled: true,
        mode,
        intervalMs: Math.max(5, seconds) * 1000,
        timer: null,
        embed: baseEmbed.toJSON(),
        messageId: lastNoticeByChannel.get(channel.id) || null
      };
      stickyStore.set(channel.id, entry);

      // 즉시 1회 최신화
      await refreshSticky(channel, entry);

      if (mode === "interval") {
        entry.timer = setInterval(async () => {
          try { await refreshSticky(channel, entry); } catch {}
        }, entry.intervalMs);
      }

      return interaction.reply({ content: `📌 스티키 켰어요! 모드: ${mode}${mode==="interval" ? `, ${seconds}s` : ""}`, ephemeral: true });
    }
  }
};
